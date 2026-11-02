# Veri izolasyonu — cihazda güvenli test planı

Bu plan, otomatik testlerin (413 test) **doğrulamadığı** davranışları gerçek bir Android/iOS cihazında denemek içindir.
Otomatik testler gerçek `store/index.ts` kodunu **sahte AsyncStorage + sahte Supabase** ile çalıştırır; gerçek AsyncStorage,
gerçek Supabase/RLS, React bileşenleri ve ekranlar bu planla cihazda denenmelidir.

## Kurallar (önce oku)

- **Gerçek kullanıcı hesabı kullanma.** Yalnızca bu test için açılmış iki sentetik hesap: `wortly.test.a@example.invalid`
  ve `wortly.test.b@example.invalid` (ya da ekibin ayrı test hesapları). Hesaplar yalnızca test için oluşturulur.
- **Production verisini değiştirme / silme.** Mümkünse ayrı bir *staging* Supabase projesi kullan. Production'a bağlanılacaksa
  yalnızca bu iki sentetik hesabın kendi satırlarına dokunulur; başka hesabın verisine hiçbir koşulda dokunulmaz.
- Uygulamada test için veri **silen** bir "test modu" YOKTUR ve eklenmemelidir. Temizlik yalnızca normal çıkış akışıyla
  (kullanıcının onayladığı uyarıyla) veya cihazın uygulama verisi temizleme ayarıyla yapılır.
- `EXPO_PUBLIC_LEARNING_SYNC` kapalı kalır. Migration çalıştırılmaz.
- Her adımdan sonra "Beklenen sonuç" satırını işaretle; sapma varsa **cihazı/veriyi temizlemeden** ekran görüntüsü ve kısa not al.

## Test cihazı hazırlığı

1. Temiz bir test cihazı veya emülatör/simülatör kullan (gerçek kişisel uygulamalar/hesaplar olmayan).
2. Test sürümünü kur (APK/TestFlight — bu plan sürümü oluşturmaz).
3. Uygulama verisi temizlenmiş olsun (Android: Ayarlar > Uygulamalar > Wortly > Depolama > Verileri temizle).
4. Test başlamadan **Wi-Fi'nin açık** olduğunu doğrula.

## Senaryo 1 — Temel A→B→A (normal çıkış)

| # | Adım | Beklenen sonuç |
|---|---|---|
| 1 | A hesabıyla kayıt/giriş yap, onboarding'i tamamla. | Ana Sayfa açılır. |
| 2 | Kelimelerim > Ekle: `A-Haus` ekle. Bir konuda birkaç kelime çalış (tekrar durumu oluşsun). Bir alıştırma ve bir senaryo tamamla. | Kelime listede; Analiz'de sonuçlar görünür. |
| 3 | Profil > Çıkış Yap. | Uyarı çıkar (varsa konu ilerlemesi silinecek yazar); onayla. Giriş ekranı açılır. |
| 4 | B hesabıyla giriş yap. | A'nın kelimesi, ilerlemesi, oturumları, senaryo sonuçları, rozetleri **görünmez**. |
| 5 | B: `B-Wort` ekle, bir alıştırma tamamla. Çıkış yap (onayla). | — |
| 6 | A ile tekrar giriş yap. | `A-Haus` bulut verisinden geri gelir; `B-Wort` **görünmez**. Senaryo sonuçları ve rozetler A'da korunmuş. |

## Senaryo 2 — Çevrimdışı açılış

| # | Adım | Beklenen sonuç |
|---|---|---|
| 1 | A ile giriş yap; eşitlemenin bitmesini bekle. | — |
| 2 | Uçak modunu aç. `A-Offline` kelimesini ekle. | Kelime listede; hata yok. |
| 3 | Uygulamayı tamamen kapat ve yeniden aç (hâlâ uçak modunda). | Birkaç saniye içinde (en fazla ~12 sn) açılır; `A-Offline` ve diğer A verileri görünür. Hata ekranı çıkmaz. |
| 4 | Uçak modunu kapat, uygulamayı öne getir. | Bekleyen kelime buluta gider (Kelimelerim'de kalır). |

## Senaryo 3 — Yarım kalan çıkış (park etme)

Bu senaryo "çıkış sırasında uygulama kapandı / yerel temizlik yapılmadı" durumunu taklit eder. **Veri silmeden** yapılır.

| # | Adım | Beklenen sonuç |
|---|---|---|
| 1 | A ile giriş yap, `A-Wort` ekle. | — |
| 2 | Uçak modunu aç, `A-Offline` ekle. | — |
| 3 | Uygulamayı zorla durdur (çıkış yapmadan). Uçak modunu kapat. | — |
| 4 | Not: oturumu B'ye çevirmek için normalde çıkış gerekir. Bu adımı yalnızca geliştirici yapısında (oturum belleğini değiştirerek) uygula; üretim sürümünde bu senaryo otomatik testlerle kapsanır. | — |
| 5 | B oturumu açıkken uygulamayı aç. | A'nın verisi **görünmez**. Eşitleme başarısızsa "Verilerin doğrulanamadı" ekranı çıkar (veri silinmedi yazar). |
| 6 | "Tekrar dene"ye dokun. | Bağlantı varsa ekran kapanır ve B'nin boş/kendi verisi açılır. Bağlantı yoksa ekran kalır ve "Son deneme tamamlanamadı" yazar. |
| 7 | A ile giriş yap. | A'nın yerel verisi (çevrimdışı eklenen kelime dahil) geri gelir ve buluta gider. |

## Senaryo 4 — Sahibi bilinmeyen eski kayıt (tek hesap: teklif)

Eski sürümde (sahip anahtarı yazılmadan önce) oluşturulmuş kayıtları taklit eder. Gerçek bir eski sürüm kurulumu gerekir.
**Önemli:** kayıtların kime ait olduğu teknik olarak doğrulanamaz; "Bana ait" onayı kullanıcı beyanıdır, sahiplik kanıtı değildir.
Bu yüzden teklif yalnızca bu cihazda (güncellemeden beri) **tek hesap** kullanıldıysa yapılır.

1. Eski sürümü test cihazına kur, **sentetik** A hesabıyla giriş yapıp kelime ve alıştırma oluştur (eşitleme kapalı veya çevrimdışı olabilir).
2. Uygulamayı yeni sürümle **güncelle** (verileri temizleme).
3. Aynı sentetik A hesabıyla aç.
   - Beklenen: kelimeler ve çalışma geçmişi ilk açılışta **görünmez**; bulut verisi gelir.
   - Profil > "Sahibi doğrulanamayan eski kayıtlar" kartı çıkar: hesap e-postası, kayıt türleri ve **sayılar** görünür (içerik görünmez) ve
     "kime ait olduğu doğrulanamıyor" uyarısı vardır.
4. "İncele ve hesabıma ekle" > uyarıdaki hesabı ve sayıları kontrol et > "Bana ait, ekle".
   - Beklenen: yalnızca ekleme tamamlanınca mesaj çıkar; kayıtlar listede görünür; buluta sonraki eşitlemede gider.
5. Kartı bir daha ekle: "Eklenecek yeni kayıt kalmadı" benzeri bilgi; kayıtlar çoğalmaz.

## Senaryo 4b — Birden fazla hesap kullanıldı (bekletme)

1. Senaryo 4'ün 1–2. adımlarından sonra önce sentetik A, çıkış yapıp sonra sentetik B ile giriş yap.
2. Beklenen: her iki hesapta da kart yalnızca "birden fazla hesap kullanıldığı için doğrulanamıyor; kayıtlar silinmedi, hiçbir
   hesaba aktarılmadan bekletiliyor" der. **Ekleme düğmesi yoktur.** Hiçbir kayıt A'ya veya B'ye eklenmez.

## Senaryo 5 — Kısmi kurtarma ve salt okunur arşiv (kayıt sınırı)

Cihazdaki çalışma kaydı listesi **100** kayıtla sınırlıdır (bilinçli; artırılmaz).

1. Senaryo 4'ü, 100'den fazla (örn. 250) eski çalışma kaydı olan bir cihazla uygula.
2. Karttaki açıklama, eklenebilir kayıt sayısını ve sınır nedeniyle bekleyenleri ayrı göstermelidir.
3. Ekle: sonuç mesajı **"X kayıt eklendi. Kalan Y kayıt … henüz eklenemedi"** demelidir; tam başarı mesajı çıkmamalıdır.
4. Sığmayan kayıtlar bu hesabın **salt okunur arşivine** alınır: "Arşivdeki kayıtları gör" > tarih, tür ve skor görünür;
   "Daha fazla göster" ile sayfa sayfa açılır.
5. Beklenen: arşivdeki kayıtlar istatistiklere, günlük görevlere, rozetlere ve buluta **sayılmaz/gitmez**; mevcut yerel
   kayıtlar listeden çıkmaz.
6. Tekrar ekle: "Yeni kayıt eklenmedi…"; arşiv çoğalmaz. Başka (sentetik B) hesaba geç: B arşivi **görmez**.

## Gerçek AsyncStorage'ı doğrulama planı

Otomatik testler gerçek AsyncStorage'ı kullanmaz. Cihazda şunlar doğrulanmalıdır (geliştirici yapısı, yalnızca test cihazı):

1. **Anahtarların varlığı:** `@wortly:words-owner`, `@wortly:review-owner`, `@wortly:profile-owner`, `@wortly:sessions-owner`
   yeni veri oluşturulduktan hemen sonra (çevrimdışıyken bile) kullanıcı kimliğiyle yazılmış mı?
   - Android: AsyncStorage SQLite (`RKStorage`) kullanır. Geliştirici yapısında `adb shell run-as com.wortly.app` ile
     `databases/RKStorage` incelenir (yalnızca debuggable test yapısında).
   - iOS: simülatörde uygulama konteynerindeki `RCTAsyncLocalStorage_V1` klasörü incelenir.
2. **Park kayıtları:** Senaryo 3/4 sonrası `@wortly:parked:<sahip>:<küme>:<zaman>` anahtarları oluşmuş, geri yüklenenler
   kaldırılmış mı? Hiçbir park kaydı kullanıcı onayı olmadan silinmemeli.
3. **Büyük değerler:** 3000 kelimelik / 250 oturumlu verinin park edilmesi ve geri yüklenmesi cihazda hata vermiyor mu
   (Android'de tek değer boyutu sınırı olabilir)?
4. **Yazma zaman aşımı:** yavaş cihazda 5 sn'lik depolama zaman aşımı yanlışlıkla "başarısız" sayıp kapıyı kapatıyor mu?
5. **Çıkış sırasında yazma:** kelime eklerken hemen çıkış yap; çıkıştan sonra kelime listesi yeniden belirmemeli.

Her bulguyu `anahtar adı` + `kullanıcı kimliğinin son 4 karakteri` ile not et; **kullanıcı e-postasını ve içeriklerini rapora koyma**.

## Başarısızlık durumunda

- Veri görünmüyorsa **silmeyi denemeden** önce park anahtarlarının varlığını kontrol et: veri büyük olasılıkla parkta güvendedir.
- Uygulama verisini temizlemeden önce (kayıp riski) cihaz yedeği/ekran görüntüsü al.
- Sorunu, hangi senaryo adımında olduğuyla birlikte bildir.
