# Geliştirme ortamı — production'a yanlışlıkla bağlanmamak

Uygulama `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` değişkenleriyle tek bir Supabase projesine bağlanır.
Kök `.env` dosyası **production** projeyi gösterir ve git'e girmez. Bu klasörde (ek worktree) `.env` OTOMATİK kopyalanmaz.

## Kurallar
- Geliştirmede gerçek kullanıcı hesabıyla giriş yapma. Yalnızca sentetik test hesapları kullan.
- Test projesi için **`.env.local`** oluştur (git'e girmez; `.env`'i geçersiz kılar):
  ```
  EXPO_PUBLIC_SUPABASE_URL=https://<test-proje-ref>.supabase.co
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<test publishable anahtar>
  EXPO_PUBLIC_APP_ENV=staging
  EXPO_PUBLIC_PRODUCTION_PROJECT_REFS=<production-proje-ref>   # kök .env'de zaten varsa tekrar yazma
  EXPO_PUBLIC_LEARNING_SYNC=true   # yalnızca test projesinde ve tablolar oluşturulduktan sonra
  ```
- `service_role` / secret anahtar hiçbir `.env*` dosyasına ve uygulamaya konmaz.
- **Bağlantı koruması (fail-closed):** geliştirme (Expo Go / development client) ve preview derlemeleri production Supabase projesine BAĞLANMAZ.
  Karar `utils/env-safety.ts` içindedir ve üç şeye bakar: bağlı projenin kimliği `EXPO_PUBLIC_PRODUCTION_PROJECT_REFS` içinde mi, `EXPO_PUBLIC_APP_ENV`
  staging/local mi ve adres geçerli mi. Engelliyse uygulama yapılandırma hata ekranı gösterir ve hiçbir veriye erişmez. Güvenliği kapatan bir ayar yoktur.
  Yayın (production) sürümü etkilenmez.
- Staging test betikleri ayrıca production adresini reddeder (`supabase/tests/staging-guard.js`).

## Hangi değişkenler gerekir?
| Değişken | Zorunlu | Not |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | evet | yoksa uygulama açılışta hata verir |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | evet | yalnızca publishable (anon) |
| `EXPO_PUBLIC_PRODUCTION_PROJECT_REFS` | geliştirme/preview için zorunlu | production proje kimlikleri (sır değil); yoksa bağlantı kurulmaz |
| `EXPO_PUBLIC_APP_ENV` | geliştirme/preview için zorunlu | `staging` / `local` (test); `production` işareti geliştirmede engeller |
| `EXPO_PUBLIC_BUILD_PROFILE` | otomatik | `eas.json` development/preview profillerinde verilir; elle ayarlama |
| `EXPO_PUBLIC_LEARNING_SYNC` | hayır | varsayılan kapalı; yalnızca test projesinde `true` |
