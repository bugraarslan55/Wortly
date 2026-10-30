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
$env:STAGING_ANON_KEY = "<test publishable key>"
$env:STAGING_SERVICE_ROLE_KEY = "<test service_role key>"
$env:STAGING_CONFIRM = "EVET-BU-URETIM-DEGIL"

$env:PHASE = "before"; node supabase/tests/staging.integration.test.js   # migration öncesi
# -> migration'ı uygula
$env:PHASE = "after";  node supabase/tests/staging.integration.test.js    # migration sonrası

# Oturumu temizle
Remove-Item Env:STAGING_SERVICE_ROLE_KEY, Env:STAGING_ANON_KEY, Env:STAGING_URL, Env:STAGING_CONFIRM
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
