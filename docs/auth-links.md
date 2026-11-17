# Kimlik doğrulama derin bağlantıları (PKCE)

İstemci `flowType: 'pkce'` ile çalışır (`utils/supabase.ts`). `signUp` ve `resetPasswordForEmail`, istek anında cihazda bir **kod
doğrulayıcı** üretir (AsyncStorage) ve yalnızca onun SHA-256 özetini (`code_challenge`) sunucuya gönderir. E-postadaki bağlantı
ham belirteç değil, tek kullanımlık bir **kod** taşır; kod, o doğrulayıcıyla `exchangeCodeForSession` ile değiştirilir.
Doğrulayıcı cihazdan hiç çıkmaz: başka bir uygulama veya site, kullanıcıya kendi (saldırganın) kodunu açtırsa da bu cihazda
oturum kurulamaz.

`store/auth.ts → handleAuthUrl` tek geçittir: URL önce `utils/auth-link.ts → parseAuthLink` ile süzülür; yalnızca geçerli
bağlantıda `exchangeCodeForSession` çağrılır. Uygulamada `setSession` kullanılmaz (`tests/auth-link.test.js` denetler).

## Kabul edilen bağlantılar
| Yol | İçerik | Üreten akış |
|---|---|---|
| `wortly://auth/callback?code=<kod>` | tek kullanımlık PKCE kodu | `signUp` → `emailRedirectTo` |
| `wortly://auth/reset?code=<kod>` | tek kullanımlık PKCE kodu | `resetPasswordForEmail` → `redirectTo` |

- Şema `app.json` içindeki `scheme` ile aynıdır (`APP_SCHEME`). `exp://`/`exps://` yalnızca `__DEV__`; web'de yalnızca
  uygulamanın kendi `window.location.origin` kökeni.
- **`access_token` / `refresh_token` taşıyan hiçbir bağlantı kabul edilmez** (yol ve tür ne olursa olsun, parça ya da sorgu).
  Belirteçle birlikte gelen kod da bağlantıyı geçersiz kılar. Yanlış yol, yüzde-kodlu/`..`/boşluklu yol, tekrarlanan anahtar,
  biçimi bozuk kod ve başka şema reddedilir; hiçbir oturum işlemi yapılmaz ve açık oturum değişmez.
- Şifre sıfırlamada yönlendirme, URL'ye değil kütüphanenin döndürdüğü `redirectType === 'recovery'` değerine bağlıdır
  (`resetPasswordForEmail` doğrulayıcıyı bu işaretle saklar).
- Aynı kod bir oturumda yalnızca bir kez gönderilir (layout ve `auth/callback` ekranı aynı bağlantıyı işleyebilir).

## E-postayı başka cihazda açmanın etkisi (PKCE'nin bilinçli bedeli)
Doğrulayıcı yalnızca isteği başlatan cihazda olduğundan:
- **Kayıt doğrulaması:** bağlantı başka cihazda/tarayıcıda açılırsa uygulama oturum açmaz. Supabase e-postayı sunucuda
  doğrular (bağlantıya dokunulduğunda); kullanıcı e-posta + parolasıyla giriş yapar. *(Staging'de uçtan uca denenmedi.)*
- **Şifre sıfırlama:** bağlantı başka cihazda açılırsa şifre belirlenemez; kullanıcı sıfırlamayı Wortly'nin kurulu olduğu
  cihazdan yeniden başlatmalıdır. Özel şema (`wortly://`) zaten yalnızca uygulamanın kurulu olduğu cihazda açılır; masaüstü
  e-posta istemcisinde bu bağlantı eskiden de çalışmıyordu. Önceden "başka cihazda uygulama kuruluysa oturum açılırdı"; artık
  açılmaz (güvenlik kazanımının karşılığı).
- **Yeni istek, eskisini geçersiz kılar:** cihazda en son başlatılan akışın doğrulayıcısı kullanılır. Kayıt isteğinden sonra
  şifre sıfırlama istenirse eski kayıt bağlantısı çalışmaz (e-posta yine de doğrulanmıştır).
- Oturum kapatma ve hesap silme (`signOut({ scope: 'local' })`) bekleyen tüm doğrulayıcıları temizler.
- **Geçiş dönemi:** eski bir sürümden (implicit akış) istenmiş e-postalardaki bağlantılar ham belirteç taşır ve artık
  reddedilir. Kayıt: e-posta sunucuda doğrulanır, kullanıcı parolasıyla girer. Sıfırlama: yeniden istenmelidir.

## Bilinen sınır (hizmet engelleme; veri sızıntısı/oturum ele geçirme değil)
Kullanıcı bekleyen bir akışı varken saldırganın kodunu içeren bir bağlantıya dokunursa sunucu kodu reddeder ve bekleyen
doğrulayıcı tüketilir (kütüphane akış kimliği olmadan "son doğrulayıcıyı" kullanır). Kullanıcı e-posta bağlantısını yeniden
istemelidir (`tests/auth-pkce-flow.test.js`, "BİLİNEN SINIR"). Akış kimliğini bağlantıya ekleyen
`experimental.appendPkceFlowIdToRedirects` bilerek AÇILMADI: kütüphane, Redirect URL listesinin sorgu dizisini de
karşılaştırdığını ve ek parametrenin tam eşleşen girdileri bozabileceğini belirtiyor; liste bu depodan doğrulanamıyor.

## Elle doğrulama (e-posta gönderen adımlar otomatik testle yapılamaz)
Supabase Dashboard (Auth) → her ortam (Staging, Production) için:
1. **Redirect URLs** listesinde tam olarak `wortly://auth/callback` ve `wortly://auth/reset` kayıtlı olmalı.
2. **E-posta şablonları** (Confirm signup, Reset password) `{{ .ConfirmationURL }}` kullanmalı; özel bağlantı/`token_hash`
   şablonu kullanılıyorsa bağlantı `?code=` ile dönmeyebilir.
3. Cihazda: kayıt → e-postadaki bağlantı → oturum açılır; şifre sıfırla → bağlantı → "Yeni şifreni belirle" ekranı → şifre
   değişir; aynı bağlantıyı ikinci kez açmak oturum kurmaz.

Staging'in herkese açık Auth ayarlarından okunabilenler (2026-11-16): e-posta doğrulaması AÇIK (`mailer_autoconfirm=false`),
kayıt açık. Şablonlar ve Redirect URL listesi herkese açık uçtan okunamaz; Dashboard erişimi gerekir.

## Şifre sıfırlama kapısı (yanlış hesaba şifre yazılmasını önler)
`supabase.auth.updateUser({ password })` her zaman **o anda açık olan oturumun** hesabını günceller. Sıfırlama bağlantısı bu
cihazda doğrulanmadıysa (kod bir tarayıcıda harcandı, doğrulayıcı başka cihazda, süre doldu) açık oturum başka bir hesabınki
olabilir ve yeni şifre YANLIŞ hesaba uygulanır. Staging'de 2026-11-16/17'de tam olarak bu oldu: sıfırlama e-postası hotmail test
hesabına gitti, kod değiştirilemedi, açık gmail oturumu kaldı ve yeni şifre gmail hesabında geçerli oldu.

Düzeltme (`utils/recovery-gate.ts`, `store/auth.ts`, `app/auth/reset.tsx`, `app/_layout.tsx`):
- Store `recoveryStatus` / `recoveryUserId` tutar. Yetki yalnızca, bu cihazda başarıyla değiştirilen bir **recovery** kodunun
  (`redirectType === 'recovery'` / `PASSWORD_RECOVERY` olayı) kurduğu oturumun hesabına verilir.
- Şifre formu yalnızca yetki varsa ve oturum == sıfırlama hesabı ise açılır. Aksi halde "Bağlantı doğrulanamadı. Hiçbir hesabın
  şifresi değiştirilmedi." gösterilir. Form, şifresi belirlenecek hesabı maskeli gösterir (`bu***@hotmail.com`).
- Oturum başka hesaba geçerse, çıkış yapılırsa veya parolayla giriş yapılırsa yetki düşer; şifre güncellenince tüketilir.
- `auth/reset` yalnızca oturum varken açılır (`Stack.Protected`). Oturum kurulur kurulmaz yapılan anlık `router.replace`,
  koruma güncellenmediği için ana ekrana düşerdi; yönlendirme bu yüzden `app/_layout.tsx` efektinde, oturum ve koruma
  güncellendikten sonra yapılır.
- Testler: `tests/password-reset-gate.test.js` (olayın kopyası dahil) ve `tests/auth-pkce-flow.test.js` ("KÖK NEDEN KANITI").
