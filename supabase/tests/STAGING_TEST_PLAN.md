# Supabase test ortamında tombstone migration testi (hazırlık)

Durum: HAZIRLIK. Hiçbir veritabanına bağlanılmadı, migration uygulanmadı.

## Kural
Üretim projesine (uygulamanın `.env` dosyasındaki proje) migration uygulanmaz, test kullanıcısı
oluşturulmaz, test çalıştırılmaz. Üretim kullanıcıları, şifreleri ve kelimeleri test ortamına kopyalanmaz.

## Test ortamı seçenekleri
| Seçenek | Üretimden bağımsız | Maliyet / koşul |
|---|---|---|
| **Ayrı ücretsiz Supabase projesi (önerilen)** | Evet, tamamen ayrı proje, URL ve anahtarlar | Ücretsiz plan; kimin organizasyonunda açılacağına karar ver. Migration'lar `supabase/migrations` içinden sırayla uygulanır. |
| Supabase Branching (kalıcı dal) | Evet, veri üretimden kopyalanmaz (varsayılan boş) | Dal başına saatlik ücret (Micro için ~0,01344 USD/saat); organizasyonda kullanılabilir olmalı; ücretli kaynak olduğu için onay gerekir. |
| Yerel Supabase (`supabase start`) | Evet | Docker uyumlu bir konteyner çalışma zamanı gerekir; bu makinede yok. |

Ayrı proje en güvenlisi: yanlışlıkla üretime bağlanma riski yalnızca iki URL'yi karıştırmaktır, ve test script'i üretim URL'sini reddeder.

## Adımlar (test projesi hazır olduğunda)
1. Yeni (boş) Supabase projesi aç; Project Settings > API'den URL, publishable key ve service_role key'i al. service_role key yalnızca bu testte, ortam değişkeni olarak kullanılır; mobil uygulamaya veya repoya konmaz.
2. Mevcut migration'ları SQL Editor'de ya da `supabase db push` ile sırayla uygula, **tombstone migration hariç**: `20261021153000`, `20261021160000`, `20261021170000`, `20261023210000`.
3. **Taban çizgisi:** `PHASE=before` ile testi çalıştır (dirilme BEKLENİR).
4. Tombstone migration'ını uygula: `20261101090000_user_word_tombstones.sql`.
5. `PHASE=after` ile testi çalıştır (dirilme ENGELLENMELİ).
6. Uygulamayı test projesine bağla (aşağıda) ve cihaz senaryolarını çalıştır.

## Komutlar
```powershell
# PowerShell, proje kökünde. Değerleri TEST projesinden al; üretim anahtarlarını kullanma.
$env:STAGING_URL = "https://<test-proje-ref>.supabase.co"
$env:STAGING_PROJECT_REF = "<test-proje-ref>"   # URL ile eşleşmeli (açık tanımlama zorunlu)
$env:STAGING_ANON_KEY = "<test publishable key>"
$env:STAGING_SERVICE_ROLE_KEY = "<test service_role key>"
$env:STAGING_CONFIRM = "EVET-BU-URETIM-DEGIL"

$env:PHASE = "before"; node supabase/tests/staging.integration.test.js   # migration öncesi
# -> migration'ı uygula
$env:PHASE = "after";  node supabase/tests/staging.integration.test.js    # migration sonrası

# Oturumu temizle
Remove-Item Env:STAGING_SERVICE_ROLE_KEY, Env:STAGING_ANON_KEY, Env:STAGING_URL, Env:STAGING_PROJECT_REF, Env:STAGING_CONFIRM
```
Yerel (PGlite) testler: bkz. `user_word_tombstones.test.js` başlığı.

## Uygulamayı test projesine bağlama (cihaz testleri)
`.env.local` dosyası `.env`'den önceliklidir ve git tarafından yok sayılır:
```
EXPO_PUBLIC_SUPABASE_URL=https://<test-proje-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<test publishable key>
```
Sonra `npx expo start --clear`. Test bitince `.env.local` dosyasını sil ve yeniden `--clear` ile başlat. Cihaz testlerinde yalnızca test hesabı ve sentetik kelimeler kullan.

## Senaryolar
- Otomatik (`staging.integration.test.js`): ekleme, düzenleme, silme, tombstone, eski kopya upsert, toplu upsert, iki kullanıcı izolasyonu, doğrudan tombstone yazımı, çevrimdışı ekleme sonrası senkron, 20 turluk silme/upsert yarışı (ölçüm), hesap silme.
- Cihazda (Android + iOS veya eski iOS sürümü): çevrimdışı ekle/düzenle → internet gelince senkron; bir cihazda sil, diğeri çevrimdışı düzenlesin; çıkış uyarısı; hesap değiştirme.

## Bilinen sınırlar
- Eşzamanlı silme/upsert yarışı gerçek ortamda ölçülür; 0 olmayan sonuç tasarımın gözden geçirilmesi demektir.
- Migration öncesi silinmiş kelimeler için tombstone yoktur.
- Test script'i, service_role anahtarıyla sentetik kullanıcı oluşturur ve siler; yalnızca test projesinde çalıştırılmalıdır.

## Öğrenme senkronizasyonu tabloları (user_word_progress, scenario_results)

Durum: HAZIRLIK. Gerçek bir test projesi olmadan bu testler çalıştırılmaz ve başarılı sayılmaz.

### Ek güvenlik kuralları (tüm staging betikleri için, supabase/tests/staging-guard.js)
- Test projesi AÇIKÇA tanımlanır: STAGING_URL ve STAGING_PROJECT_REF birlikte verilmelidir ve eşleşmelidir.
- FAIL-CLOSED üretim denetimi (çalışma klasöründen BAĞIMSIZ): üretim adresi şu kaynaklardan toplanır: PRODUCTION_SUPABASE_URL /
  PRODUCTION_PROJECT_REF, bu deponun .env / .env.local / .env.production dosyaları ve git ortak dizininden bulunan ANA çalışma
  klasörünün aynı dosyaları (ek worktree'lerde .env yoktur). Üretim adresi HİÇBİR kaynaktan belirlenemezse ya da .env bozuksa
  test BAŞLAMAZ (çıkış kodu 2); staging URL'si/referansı üretimle aynıysa da başlamaz. Ek worktree'den çalıştırırken
  PRODUCTION_SUPABASE_URL vermek güvenli ve önerilir. Doğrulama ağ/kullanıcı/derleme işlemlerinden ÖNCE ve tek merkezden
  (staging-guard.js) yapılır; anahtar türü doğrulanamazsa (tanınmayan biçim) da reddedilir.
- STAGING_ANON_KEY publishable, STAGING_SERVICE_ROLE_KEY secret/service_role türünde olmalıdır; karışırsa durulur.
- Ağ denetimi: projede @wortly-test.invalid dışında kullanıcı varsa durulur (gerçek kullanıcılı proje test
  projesi sayılmaz). Yalnızca bilinçli olarak, boş olmayan bir TEST projesinde STAGING_ALLOW_OTHER_USERS=EVET.
- Çıktıdaki anahtarlar maskelenir. service_role yalnızca test kullanıcısı oluşturma/silme ve doğrulama
  sayımları içindir; veri testleri oturum açmış sentetik kullanıcılarla (RLS altında) yapılır.
- Gerçek kullanıcı hesabıyla test yapılmaz; mobil uygulamaya service_role konmaz.

### Sıra
1. Test projesinde migration'ları sırayla uygula: 20261021153000, 20261021160000, 20261021170000,
   20261023210000, 20261101090000 (tombstone), 20261102090000 (user_word_progress), 20261102091000 (scenario_results).
2. PowerShell (proje kökünde; değerler yalnızca TEST projesinden):
```powershell
$env:STAGING_URL = "https://<test-proje-ref>.supabase.co"
$env:STAGING_PROJECT_REF = "<test-proje-ref>"
$env:STAGING_ANON_KEY = "<test publishable key>"
$env:STAGING_SERVICE_ROLE_KEY = "<test secret / service_role key>"
$env:STAGING_CONFIRM = "EVET-BU-URETIM-DEGIL"
# Ek worktree'den çalıştırıyorsan üretim adresini de ver (yalnızca karşılaştırma için; hiçbir istek atılmaz):
# $env:PRODUCTION_SUPABASE_URL = "https://<uretim-ref>.supabase.co"
node supabase/tests/learning-sync.staging.test.js
Remove-Item Env:STAGING_SERVICE_ROLE_KEY, Env:STAGING_ANON_KEY, Env:STAGING_URL, Env:STAGING_PROJECT_REF, Env:STAGING_CONFIRM
```
   Tablolar yoksa betik "migration uygulanmamış olabilir" mesajıyla çıkış kodu 3 verir (başarısız sayılır).
3. Kapsam (19 test): INSERT/SELECT/UPDATE, izolasyon, geç gelen eski kayıt, aynı kaydın tekrarı, gelecek damga,
   DELETE engeli, senaryo tekrarsızlığı, UPDATE/DELETE engeli, 1000+ kayıt sayfalama (ilerleme ve senaryo),
   çevrimdışı kuyruk, iki cihaz, çıkış-yeniden giriş, hesap silme cascade. Testler uygulamanın kullandığı
   taşıyıcı kodunu (utils/learning-transports.ts, utils/learning-sync.ts) derleyip çalıştırır.
4. Uygulamayı test projesine bağlayıp cihaz testi: .env.local içinde test URL/anahtarı ve
   EXPO_PUBLIC_LEARNING_SYNC=true; test bitince .env.local dosyasını sil ve --clear ile yeniden başlat.


### Entegrasyon sonrası ek staging/cihaz senaryoları (veri izolasyonu + öğrenme senkronu)

Yalnızca TEST projesi ve sentetik hesaplar (`wortly.test.a@example.invalid`, `wortly.test.b@example.invalid` veya
`@wortly-test.invalid`). Otomatik testler (`tests/learning-sync-integration.test.js`) gerçek mağaza kodunu SAHTE bulutla çalıştırır;
gerçek Supabase/RLS/tetikleyici, gerçek AsyncStorage ve ekranlar aşağıdaki adımlarla ayrıca doğrulanmalıdır.

1. **Bayrak kapalı (varsayılan) regresyonu:** `.env.local` olmadan/`EXPO_PUBLIC_LEARNING_SYNC=false` ile uygulamayı aç; kelime
   çalış, senaryo oyna, çıkış yap. Supabase günlüklerinde `user_word_progress` / `scenario_results` isteği OLMAMALI.
2. **Bayrak açık, tek cihaz:** A ile konu kelimesi çalış + senaryo tamamla → tablolarda yalnızca A'nın satırları; ikinci eşitlemede
   yeni yazma yok (kayıt tekrarı yok).
3. **A→B→A:** A çalışır, çıkış; B girer → A'nın ilerleme/senaryosu görünmez, B adına satır oluşmaz; A tekrar girer → verisi bulutan gelir.
4. **Çevrimdışı:** uçak modunda ilerleme/senaryo üret; uygulamayı kapat/aç; bağlantı gelince tek sefer gönderilir.
5. **Sahibi bilinmeyen eski ilerleme (eski sürümden güncelleme):** bayrak açıkken bile bulut tablosunda satır OLUŞMAMALI; yalnızca
   Profil'deki "Bana ait, ekle" onayından sonra (ve cihazda tek hesap kullanıldıysa) kuyruğa alınıp gönderilir.
6. **Çıkış sırasında eşitleme:** eşitleme sürerken çıkış yap → çıkıştan sonra eski hesabın verisi cihazda yeniden belirmemeli.
7. **Oturum arşivi:** 100'den fazla eski oturum olan hesapta arşivdeki kayıtlar `study_sessions` tablosuna GİTMEMELİ.
8. **Bayrak geri alma:** bayrağı kapatınca kuyruktaki ilerleme/senaryo girdileri çıkış uyarısını tetiklememeli ve silinmemeli.
