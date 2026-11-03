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
| `EXPO_PUBLIC_BUILD_PROFILE` | otomatik | `eas.json` development/preview profillerinde verilir; elle ayarlama. Ayrıca `app.config.js` EAS'ın `EAS_BUILD_PROFILE` değerini yapılandırmaya yazar (ikinci, bağımsız işaret) |
| `EXPO_PUBLIC_LEARNING_SYNC` | hayır | varsayılan kapalı; yalnızca test projesinde `true` |

## Ortak backend TEST MODU (Expo Go ile mevcut Supabase projesinde geliştirme)

Buğra ile aynı uygulamayı aynı backend üzerinde sırayla geliştirdiğimiz için, geliştirme sürümünün mevcut (ortak/production) Supabase
projesine bağlanması **bilinçli ve açıkça** etkinleştirilebilir. Varsayılan KAPALIDIR; korumayı sessizce kaldırmaz.

### Ne zaman çalışır?
Yalnızca **hepsi** doğruysa: `__DEV__` açık (Expo Go ya da development client); profil preview/production **değil**; bağlı proje kimliği
`EXPO_PUBLIC_PRODUCTION_PROJECT_REFS` listesinde (tam eşleşme); `EXPO_PUBLIC_APP_ENV=production` (dürüst işaret — `staging` yazarak production
bağlantısı **gizlenemez**); `EXPO_PUBLIC_DEV_SHARED_BACKEND` tam metni `I-UNDERSTAND-THIS-IS-PRODUCTION-DATA`; en az bir izinli kullanıcı kimliği.
Eksik/yanlış her durumda bağlantı **kurulmaz** (hata ekranı). EAS preview ve production sürümlerinde anahtar yok sayılır.

### Davranış
- Her ekranın üstünde sade bir şerit: **TEST MODU — ORTAK VERİTABANI**.
- Giriş yapılınca uygulamanın veri akışları (yerel veri yükleme, yazma, bildirim, senkron) **başlamadan önce** hesap kapısı çalışır:
  `supabase.auth.getUser()` ile **sunucunun doğruladığı** kullanıcı kimliği `EXPO_PUBLIC_DEV_ALLOWED_USER_IDS` listesinde değilse oturum
  kapatılır (yerel veri silinmez) ve açıklayıcı ekran gösterilir. Doğrulanamazsa (ağ yok) veri akışı başlatılmaz (fail-closed).
- Hesap değiştirme/gecikmiş yanıtlar: yalnızca en son isteğin sonucu geçerlidir.
- Bu modda **yeni hesap oluşturma (sign-up) ve şifre sıfırlama e-postası engellenir**; Supabase'e istek gitmez.
- Öğrenme senkronu bayrağı bu modla açılmaz (`EXPO_PUBLIC_LEARNING_SYNC` kapalı kalmalı; production'da o tablolar olmayabilir).
- **Bu hesap kapısı istemci taraflı bir emniyet önlemidir.** Gerçek güvenlik sınırı Supabase Auth ve RLS'tir (bir hesap yalnızca kendi
  satırlarına erişir). Amaç, yanlışlıkla gerçek bir kullanıcı hesabıyla deneysel kod çalıştırmayı önlemektir; e-posta tek başına
  güvenlik sayılmaz, izin auth kullanıcı kimliğiyle verilir.

### Yapılandırma (hiçbiri otomatik kopyalanmaz/değiştirilmez — elle yapılır)
Kök `.env` (git'e girmez; production URL + publishable anahtar):
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```
`.env.local` (git'e girmez; yalnızca bu geliştirme makinesi):
```
EXPO_PUBLIC_PRODUCTION_PROJECT_REFS=<production proje kimliği>
EXPO_PUBLIC_APP_ENV=production
EXPO_PUBLIC_DEV_SHARED_BACKEND=I-UNDERSTAND-THIS-IS-PRODUCTION-DATA
EXPO_PUBLIC_DEV_ALLOWED_USER_IDS=<test-hesabı-1-uuid>,<test-hesabı-2-uuid>
```
Test hesabı kimliği: Supabase paneli → Authentication → Users (yalnızca görüntüleme). Gerçek kullanıcı hesaplarını listeye KOYMA.

### Başlatma
```
cd C:\Users\ASUS\Wortly-main-sync
npx expo start -c        # -c: ortam değişkenleri değiştiğinde önbelleği temizler
```
Telefonda SDK 57 uyumlu Expo Go ile QR kodu okut. Android'de bildirimler Expo Go'da zaten devre dışıdır.
