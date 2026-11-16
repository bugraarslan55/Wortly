# Hesabımı Sil (Apple 5.1.1(v))

Durum: **kod hazır, hiçbiri canlıya uygulanmadı.** Edge Function dağıtılmadı, migration uygulanmadı, cihazda/simülatörde denenmedi.
Dağıtılmadan uygulama "Hesap silme hizmetine şu an ulaşılamıyor" mesajı gösterir (HTTP 404 → `unavailable`); hesap ve veri olduğu gibi kalır.

## Akış
1. Profil → **Hesabımı Sil** → `app/hesabi-sil.tsx`: açık uyarı + onay kutusu + son onay penceresi.
2. `store/auth.ts → deleteAccount()` → `utils/account-deletion.ts → runAccountDeletion`:
   - Çevrimdışıysa (Supabase sağlık ucuna ulaşılamıyorsa) **hiçbir şey başlamaz**.
   - Bildirim sahipliği senkron geri alınır, sonra sunucu çağrılır: `supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE_MY_ACCOUNT' } })`.
   - Sunucu başarısızsa (ağ/401/404/5xx): yerel veri ve oturum **dokunulmaz**, bildirim sahipliği geri yüklenir, kullanıcıya Türkçe neden gösterilir.
   - Sunucu başarılıysa: **yalnızca o hesabın** yerel verisi temizlenir (aşağıda), yerel oturum ağ çağrısı olmadan kapatılır (`signOut({ scope: 'local' })`), `/auth` açılır.
3. Sunucu (`supabase/functions/delete-account`): `handler.ts` (saf, testli) + `index.ts` (Deno girişi).
   - Silinecek hesap **istemciden alınmaz**; yalnızca isteğin `Authorization: Bearer <JWT>` başlığı sunucuda `auth.getUser(jwt)` ile doğrulanır.
   - Gövde yalnızca bilinçli onay değeri taşır; POST dışı yöntem 405, onay yoksa 400, belirteç geçersiz/hesap yok 401, doğrulama servisi hatası 503 (silme yok), silme hatası 500.
   - `auth.admin.deleteUser(id, false)` (kalıcı). Tüm kullanıcı tabloları `auth.users`'a `ON DELETE CASCADE` bağlıdır → tek veritabanı işleminde temizlenir; yarım kalma yoktur.
   - `service_role` yalnızca Edge Function ortamında (`SUPABASE_SERVICE_ROLE_KEY`, Supabase tarafından enjekte edilir) bulunur. Uygulamaya, `EXPO_PUBLIC_*` değişkenlerine ve kaynağa girmez (testle denetlenir).

## Silinen bulut verisi (cascade)
`profiles`, `user_words`, `study_sessions`, `user_word_tombstones`, `user_word_progress`, `scenario_results`, `auth.users` (e-posta/kimlik).
**Migration gerekmez:** hepsi zaten `ON DELETE CASCADE`; `supabase/tests/account_deletion.test.js` (yerel PGlite) bunu tüm migration'larla doğrular.

## Silinen yerel veri (yalnızca o hesap)
- Bellek: kelime/profil/oturum store'ları (`resetLocal`), rozetler, ifade defteri.
- Telaffuz kayıt dosyaları (harita okunabilirse) ve haritası.
- Bildirimler (planlı ve gösterilmiş Wortly bildirimleri iptal).
- `purgeAccountStorage(userId)` (`store/index.ts`): kimliği **tam parça** olarak içeren `@wortly:*` anahtarları
  (`phrasebook`, `achievements`, `scenario-results`, `review-reminder`, `pronunciations(:kept/:corrupt)`, `parked:<id>:*`, `corrupt:*:<id>:*`),
  bekleyen eşitleme kuyruğundaki **yalnızca o kullanıcının** kayıtları, `device-accounts` listesinden o kimlik.
  Başka hesapların anahtarlarına, cihaz geneli ayarlara (tema, işlenmiş bildirim dokunuşları) ve Supabase oturum anahtarına dokunmaz; UUID olmayan kimlikle hiçbir anahtar seçilmez.
- Bekleyen profil kaydı yalnızca silinen kullanıcınınkidir; başka hesabın ve sahibi bilinmeyen (`userId: null`) kayıtlar kuyrukta kalır.
- Yerel temizlik eksik kalırsa oturum yine kapanır ve kullanıcıya "yerel verilerin tamamı silinemedi, uygulamayı kaldır" denir (`localCleanupFailed`). Eksik sayılanlar: depolama silme hatası, telaffuz dosyası silinememesi, bildirimlerin iptal/kaldırılamaması. Telaffuz dosyası başka bir kullanıcının haritasında da geçiyorsa, başka bir harita okunamıyor/bozuksa ya da kendi haritası bozuksa dosya **silinmez** ve temizlik eksik bildirilir.
- Haritası hiçbir kullanıcıda olmayan (sahibi bilinmeyen) eski telaffuz dosyaları bu akışta aranmaz ve silinmez.

## Bilinen sınırlar
- **Belirsiz sonuç:** istek zaman aşımına uğrar/bağlantı koparsa sunucunun silmeyi bitirip bitirmediği bilinemez. Uygulama yerel veriyi silmez ve "sonuç doğrulanamadı; hesap silinmişse giriş yapılamaz" der. Hesap gerçekten silinmişse o cihazda yerel kayıtlar kalır (başka hesaba görünmez; uygulama kaldırılınca gider).
- Telaffuz haritası okunamazsa kayıt dosyaları silinmez (mevcut `clearPronunciationRecordings` davranışı).
- Sahibi bilinmeyen (`userId: null`) bekleyen kayıtlar ve sahibi bilinmeyen park verisi başka hesaba ait olabileceğinden silinmez.
- Yeniden kimlik doğrulaması istenmez (oturum zaten geçerli ve sunucu belirteci doğrular). İstenirse parola ile yeniden giriş eklenebilir.
- Apple ile Giriş kullanılmadığı için Apple belirteç iptali gerekmez (e-posta/parola).

## Dağıtım (ELLE, sizin onayınızla; bu depoda çalıştırılmadı)
```
supabase functions deploy delete-account --project-ref <staging-ref>   # önce staging
```
- Varsayılan `verify_jwt=true` kalır. Proje yeni asimetrik JWT imzalama anahtarları kullanıyorsa ve platform doğrulaması kullanıcı belirtecini reddederse `--no-verify-jwt` güvenlidir: işlev belirteci kendisi `auth.getUser` ile doğrular.
- Ek gizli anahtar tanımlanmaz (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` otomatik gelir).

## Dağıtımdan sonra staging'de elle doğrulama
1. Test hesabı oluştur; kelime, senaryo sonucu, ifade, telaffuz kaydı, bildirim aç.
2. Uçak modunda **Hesabımı Sil**: "İnternet bağlantısı yok" gelmeli; hiçbir şey silinmemeli.
3. Bağlantı açıkken sil: `/auth` açılmalı; aynı bilgilerle giriş **başarısız** olmalı; Supabase panelinde `auth.users` ve 6 tabloda satır kalmamalı.
4. İkinci bir test hesabının verisi (cihazda ve bulutta) etkilenmemiş olmalı.
5. İşlev kapalıyken/404'te: hata mesajı gelmeli, hesap ve yerel veri durmalı.
6. Çıkış yapmış ikinci hesabın yerel verisinin (aynı cihaz) silinmediğini doğrula.

## App Store Connect (doğrulanmadı)
Hesap silme için ek bir mağaza ayarı gerekmez, ancak şunlar **bu oturumda doğrulanmadı** (App Store Connect erişimi yok): gizlilik ayrıntıları ("Veri silme" beyanı, toplanan veri türleri), gizlilik politikası adresinde hesap silme açıklaması, inceleme notlarında silme adımları (Profil → Hesabımı Sil) ve test hesabı.
