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

## 5. Production bağlantı güvenliği (uygulandı: `utils/env-safety.ts` + `utils/supabase.ts`)
Amaç production'a erişimi yasaklamak değil, **yanlış ortamdan** (geliştirme/preview) production'a bağlanmayı önlemektir.

**Ortam ayrımı (iki bağımsız sinyal):** `__DEV__` (Metro: Expo Go, development client) ve derleme profili
`EXPO_PUBLIC_BUILD_PROFILE` (`eas.json` `development` ve `preview` profillerinde `env` ile verilir). Preview derlemeleri release
modundadır; onları yalnızca profil işareti ayırt eder. KORUMALI = `__DEV__` veya profil development/preview/tanınmayan.

**Korumalı derlemede bağlantı yalnızca şu koşulların HEPSİ varsa kurulur (fail-closed):** adres ve anahtar tanımlı ve adres geçerli;
`EXPO_PUBLIC_PRODUCTION_PROJECT_REFS` tanımlı; bağlı proje kimliği bunlardan biri **değil**; `EXPO_PUBLIC_APP_ENV` staging/local.
Ortam işareti tek başına kanıt değildir (production adresi + `staging` işareti yine engellenir). Yerel yığın izinlidir.
Güvenliği kapatan bir ortam değişkeni **yoktur** (eski `ALLOW_PRODUCTION_IN_DEV` kaldırıldı). Üretim kimliği kaynağa gömülü değildir.

**Yayın sürümü hiçbir koşulda engellenmez:** `__DEV__` kapalı ve profil `production` ya da hiç verilmemişse (mevcut/eski/yerel yayın
derlemeleri dahil) bağlantı değerlendirilmeden izinlidir; özel alan adı ve eksik üretim kimliği de engellemez. Yalnızca bilgi için
`verified` bayrağı (bağlı proje üretim kimliklerinden biri ve işaret production) hesaplanır. Tek istisna: adres/anahtar hiç yoksa istemci
zaten kurulamaz; çökme yerine anlaşılır hata ekranı gösterilir. Değerlendirme beklenmedik hata verirse korumalı derlemede engellenir,
yayında engellenmez.

**Engel akışı:** `utils/supabase.ts` kararı istemciden ÖNCE verir; engelliyse gerçek istemci oluşturulmaz (oturum depolaması okunmaz),
yerine ağ yapmayan boş istemci (`utils/blocked-client.ts`) konur. Kök yerleşim (`app/_layout.tsx`) yalnızca `ConnectionBlockedScreen`
gösterir; oturum başlatma, veri yükleme, bildirim abonelikleri ve senkronizasyon (`AppRoot`) hiç başlamaz. Ekran adres/anahtar/kimlik göstermez.

**Kalan riskler:** (1) EAS `env` değerinin gerçek derlemede paketlendiği henüz bir EAS derlemesiyle doğrulanmadı; verilmezse preview
derlemesi "profil yok + release" sayılıp korumasız kalır (kilitlenmez). (2) `expo start --no-dev` ve yerel release derlemeleri korunmaz.
(3) `EXPO_PUBLIC_PRODUCTION_PROJECT_REFS` boşsa geliştirme/preview bağlanmaz (bilinçli fail-closed). (4) `EXPO_PUBLIC_*` değerleri pakete
gömülür; kimlikler gizli değildir, anahtarlar yine yalnızca publishable olmalıdır.

## 6. Gerçek veritabanında değişiklik yapmadan önce gerekenler
1. Production şemasının **yalnızca okuma** ile çıkarılması (dashboard → Table Editor / Database → Migrations; SQL Editor'da yazma yok) ve 7 migration ile karşılaştırılması.
2. Ayrı boş bir Supabase test projesi (yeni uygulama değil; yalnızca production verisini korumak için) ve sentetik hesaplar.
3. 7 migration'ın sırayla test projesinde uygulanması, `supabase/tests/*` betiklerinin ve cihaz senaryolarının orada geçmesi.
4. Production'da eksik migration varsa: yedek/PITR doğrulaması, ayrı onay, bakım penceresi; hiçbiri otomatik uygulanmaz.
5. Hesap silme akışı kararı; anon `REVOKE` ve `search_path` tutarlılığı için ayrı, geri alınabilir migration önerisi.
6. Bayrak (`EXPO_PUBLIC_LEARNING_SYNC`) yalnızca ilgili tabloların bulunduğu projede açılır.
