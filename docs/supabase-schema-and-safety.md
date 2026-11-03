# Supabase şeması, erişim haritası ve bağlantı güvenliği

Bu belge **yalnızca koddan** çıkarıldı (istemci kaynakları + `supabase/migrations`). Hiçbir veritabanına bağlanılmadı;
production'da hangi migration'ların uygulandığı **bilinmiyor** ve bu belgeden çıkarılamaz. Android ve iOS aynı kod tabanını ve
aynı backend'i kullanır.

## 1. Şema (migration'lardan)
| Tablo | Anahtar | Önemli kolonlar / kısıtlar | RLS | İstemci yetkisi |
|---|---|---|---|---|
| `profiles` | `id` → `auth.users` (cascade) | `name`, `level` ∈ A1/A2/B1, `onboarding_completed`, `streak ≥ 0`, `last_study_date`, `total_words_learned ≥ 0`, `daily_goal > 0` | `auth.uid() = id` (select/insert/update) | select, insert, update |
| `user_words` | `id` (text) | `user_id`, `german`, `article` ∈ der/die/das/'', `turkish`, `mastery_level` 0–3, `is_custom`, `topic_id` … | `auth.uid() = user_id` (4 işlem) | select, insert, update, delete |
| `study_sessions` | `id` (text) | `user_id`, `type` ∈ 7 egzersiz türü, `word_ids` jsonb, `score ≥ 0`, `total ≥ 0`, `session_date`, `topic_id` | `auth.uid() = user_id` (select/insert/update) | select, insert, update (upsert için) |
| `user_word_tombstones` | `(user_id, word_id)` | `deleted_at`; **istemci yazamaz**, `user_words` silme tetikleyicisi yazar | select (sahibi) | yalnızca select |
| `user_word_progress` | `(user_id, word_id)` | `mastery_level` 0–3, `last_reviewed`; eski kayıt yeniyi ezmez (tetikleyici) | `auth.uid() = user_id` | select, insert, update (silme yok) |
| `scenario_results` | `(user_id, id)` | `scenario_id`, `score ≤ total`, `total ≥ 1`, `completed_at`; eklenir, değiştirilemez | `auth.uid() = user_id` | select, insert (append-only) |

Tetikleyiciler: yeni kullanıcı → boş `profiles` satırı (`SECURITY DEFINER`, `search_path=public`); `updated_at` güncelleyicileri;
`user_words` silinince tombstone yazılır, tombstone'lu kimlikle INSERT sessizce atlanır (silinen kelime dirilmez); progress/senaryo
için "gelecek tarih şimdiye çekilir" ve "eski kayıt yeniyi ezemez" korumaları. Tüm kullanıcı tabloları `auth.users`'a `ON DELETE CASCADE` bağlı.

## 2. Hangi özellik hangi tabloya erişir?
| Özellik / ekran | Tablo | Not |
|---|---|---|
| Kayıt, giriş, şifre sıfırlama (`store/auth.ts`, `app/auth*`) | `auth` (GoTrue) | `wortly://auth/callback`, `auth/reset` yönlendirmeleri |
| Onboarding, Profil (seviye, günlük hedef), seri (`updateStreak`) | `profiles` | yerel öncelikli, bekleyen değişiklik kuyruğu |
| Kelimelerim, Yeni kelime, Kelime detayı/düzenle/sil, kelime çalış | `user_words` (+ tombstone dolaylı) | yalnızca kişisel (`is_custom`) kelimeler buluta gider |
| Alıştırmalar ve flashcard sonucu (`saveSession`) | `study_sessions` | yerelde son 100; sayım bulutta |
| Konu kelimesi ilerlemesi (alıştırma, flashcard, mini quiz) | `user_word_progress` | **yalnızca `EXPO_PUBLIC_LEARNING_SYNC=true`** (varsayılan kapalı) |
| Senaryo sonuçları | `scenario_results` | **yalnızca bayrak açıkken** |
| Mini quiz | (oturum kaydetmez) kelime ilerlemesi yolu | yeni tablo/tür gerektirmez |
| Başarılar, günlük görevler, analiz, arşiv, bildirimler, telaffuz kayıtları, tema | yok (yalnızca cihaz) | kullanıcıya özel yerel anahtarlar |

## 3. Uygulama ↔ şema uyumu (çevrimdışı sözleşme testleri: `tests/schema-contract.test.js`)
Doğrulanan: kodun kullandığı tüm tablo ve kolonlar migration'larda var; upsert'ler tüm zorunlu kolonları gönderiyor; oturum türü,
seviye ve artikel kısıtları TypeScript türleriyle birebir aynı; her tabloda RLS açık ve politikalar yalnızca sahibine izin veriyor;
istemciye gereksiz yetki (silme/güncelleme) verilmemiş; `SECURITY DEFINER` işlevleri tetikleyici ve sabit `search_path` ile.

## 4. Bilinen riskler ve eksikler
1. **Production'da hangi migration'ların uygulandığı doğrulanmadı.** Tombstone migration'ı depoda "uygulanmadı" olarak işaretli; uygulanmamışsa uygulama çalışır ama silinen kelimelerin eski cihazdan dirilmesine karşı koruma yoktur. Yeni progress/senaryo tabloları yoksa bayrak kapalı kalmalıdır.
2. **Eski üç tabloda (`profiles`, `user_words`, `study_sessions`) `anon` için açık `REVOKE` yok**; yalnızca RLS koruyor (yeni tablolar anon'u açıkça kapatıyor). RLS doğru olduğu sürece erişim yok, ama derinlemesine savunma için ileride ayrı bir migration ile `REVOKE ... FROM anon` önerilir (**uygulanmadı**).
3. **Hesap silme akışı yok** (uygulama içinde ve sunucuda). Hesap oluşturulabilen uygulamalarda App Store 5.1.1(v) uygulama içi silme ister; `ON DELETE CASCADE` verileri temizler ama tetikleyecek güvenli bir uç (ör. kullanıcıyı silen Edge Function) tasarlanmadı. Yayın öncesi karar gerekir.
4. `study_sessions.total >= 0` (0 mümkün); istemci tarafında geçersiz kayıtlar sayılmaz, ama şemada `total >= 1` değil.
5. `handle_new_user_profile` `search_path = public`; diğer tetikleyiciler `''` kullanıyor. Tutarlılık için `''` önerilir (uygulanmadı).
6. Staging projesi olmadığından RLS/tetikleyici davranışı yalnızca yerel PGlite ve sahte bulutla denendi.

## 5. Production bağlantı güvenliği
Mevcut durum: `.env` production'u gösterir; `EXPO_PUBLIC_APP_ENV` yalnızca geliştirme konsolunda **uyarı** üretir (kanıt değildir);
staging test betikleri production adresini reddeder (`supabase/tests/staging-guard.js`).

### Önerilen fail-closed koruma (TASARIM; `utils/env-safety.ts` içinde `evaluateConnection`, testli, **uygulamaya bağlı DEĞİL**)
- **Yalnızca geliştirme (`__DEV__`) çalıştırmalarında** devreye girer. **Yayın sürümünde her zaman izin verir** → production uygulaması ve mevcut hesaplar kilitlenemez.
- Production kimliği kaynak koda gömülmez: `.env` içindeki `EXPO_PUBLIC_PRODUCTION_PROJECT_REFS` (virgülle ayrılmış proje kimlikleri; sır değildir) ile bağlı URL'nin kimliği karşılaştırılır.
- Engellenir: geçersiz/eksik URL; production kimliği tanımlı değil (karşılaştırma yapılamaz); URL production kimliğiyle aynı (işaret `staging` yazsa bile); işaret `production`; işaret yok. Yerel yığın (`127.0.0.1`/`localhost`) izinli. `EXPO_PUBLIC_ALLOW_PRODUCTION_IN_DEV=yes-i-understand` açık geçersiz kılmadır.
- Mesajlar anlaşılırdır ve adres/anahtar/kimlik içermez.

**Bağlama planı ve riskler (henüz yapılmadı, onay gerekir):**
1. `utils/supabase.ts` içinde istemciyi oluşturmadan önce `evaluateConnection` çağrılır; engel varsa istemci yerine "ağ yok" davranışlı bir kapı döner ve kök yerleşimde açıklayıcı bir ekran gösterilir (kırmızı hata kutusu yerine).
2. **Risk:** `__DEV__` Expo Go ve development client'ta `true`; `expo start --no-dev`, EAS `preview`/`production` derlemelerinde `false` → bu derlemeler korunmaz (ama kilitlenmez).
3. **Risk:** geliştirici bilinçli olarak production'da test edecekse açık geçersiz kılma gerekir; yanlış yapılandırılmış `.env.local` geliştiriciyi geçici olarak engeller (yayını etkilemez).
4. **Risk:** `EXPO_PUBLIC_*` değerleri pakete gömülür; proje kimlikleri gizli değildir ama anahtarlar yine yalnızca publishable olmalıdır.
5. Üretim derlemesinde koruma kodu çalışmaz; yine de birim testlerle "yayın asla engellenmez" sabitlenmiştir.

## 6. Gerçek veritabanında değişiklik yapmadan önce gerekenler
1. Production şemasının **yalnızca okuma** ile çıkarılması (dashboard → Table Editor / Database → Migrations; SQL Editor'da yazma yok) ve 7 migration ile karşılaştırılması.
2. Ayrı boş bir Supabase test projesi (yeni uygulama değil; yalnızca production verisini korumak için) ve sentetik hesaplar.
3. 7 migration'ın sırayla test projesinde uygulanması, `supabase/tests/*` betiklerinin ve cihaz senaryolarının orada geçmesi.
4. Production'da eksik migration varsa: yedek/PITR doğrulaması, ayrı onay, bakım penceresi; hiçbiri otomatik uygulanmaz.
5. Hesap silme akışı kararı; anon `REVOKE` ve `search_path` tutarlılığı için ayrı, geri alınabilir migration önerisi.
6. Bayrak (`EXPO_PUBLIC_LEARNING_SYNC`) yalnızca ilgili tabloların bulunduğu projede açılır.
