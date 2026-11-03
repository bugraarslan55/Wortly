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
  EXPO_PUBLIC_LEARNING_SYNC=true   # yalnızca test projesinde ve tablolar oluşturulduktan sonra
  ```
- `service_role` / secret anahtar hiçbir `.env*` dosyasına ve uygulamaya konmaz.
- `EXPO_PUBLIC_APP_ENV` yalnızca bir **işarettir** (`staging`, `local`, `production`): bağlantıyı doğrulamaz. İşaretsiz ya da
  `production` bir geliştirme çalıştırması konsola (adres/anahtar yazmadan) uyarı verir (`utils/env-safety.ts`).
- Staging test betikleri ayrıca production adresini reddeder (`supabase/tests/staging-guard.js`).

## Hangi değişkenler gerekir?
| Değişken | Zorunlu | Not |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | evet | yoksa uygulama açılışta hata verir |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | evet | yalnızca publishable (anon) |
| `EXPO_PUBLIC_APP_ENV` | önerilir | `staging` / `local` / `production` işareti |
| `EXPO_PUBLIC_LEARNING_SYNC` | hayır | varsayılan kapalı; yalnızca test projesinde `true` |
