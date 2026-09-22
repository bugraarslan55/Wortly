# Wortly — Scrum Backlog

## Ürün hedefi

Türkçe konuşan bir kullanıcının kendi eklediği Almanca kelimeleri A1–A2 düzeyinde flashcard, doğru/yanlış, yazarak tekrar ve cümle kurma alıştırmalarıyla çevrimdışı çalışabildiği, basit ama tekrar kullanmaya teşvik eden bir iPhone uygulaması.

## MVP kapsamı

- Yalnızca Türkçe ve Almanca
- Yalnızca A1 ve A2
- Kullanıcı kaydı ve sunucu yok
- Veriler cihazda saklanır
- iPhone odaklıdır
- TestFlight ile bir arkadaşla test edilir
- B1, B2, C1, sesli telaffuz ve yapay zekâ ile dilbilgisi puanlama bu sürümün dışındadır

## Definition of Done

Bir backlog maddesi ancak şu koşullarda tamamlanmış sayılır:

- Kabul kriterleri karşılanıyor.
- Mevcut Stitch tasarım dili korunuyor.
- Boş veri ve hatalı giriş durumları uygulamayı çökertmiyor.
- `npm run typecheck` başarılı.
- `npx expo export --platform ios` başarılı.
- Değişen akış iPhone simülatöründe elle kontrol edildi.
- Kullanıcıya ait mevcut değişiklikler silinmedi veya geri alınmadı.

## Sprint 0 — Kurulum ve inceleme (Tamamlandı)

- [x] Antigravity IDE kuruldu.
- [x] Resmî Anthropic Claude Code eklentisi kuruldu.
- [x] TurDeu projesi IDE içinde açıldı.
- [x] TypeScript kontrolü yapıldı.
- [x] iOS Expo paketi başarıyla oluşturuldu.
- [x] Mevcut ekranlar ve veri akışı incelendi.

## Sprint 1 — Kişisel kelime öğrenme döngüsü (Tamamlandı)

Sprint hedefi: Kullanıcının yazdığı kelimelerle bütün temel alıştırmaların gerçekten çalışması ve ilerlemenin cihazda kaydedilmesi.

- [x] Arayüzü ve onboarding metinlerini A1–A2 ile sınırla; B1'i kullanıcıdan gizle.
- [x] Eski B1 profil verisini A2'ye taşıyan güvenli migrasyonu ekle.
- [x] “Kelimelerimle Çalış” için alıştırma seçim ekranı oluştur veya mevcut ekranı doğru veriyle yeniden kullan.
- [x] Kişisel kelimeleri Flashcard moduna bağla.
- [x] Kişisel kelimeleri Doğru/Yanlış moduna bağla.
- [x] Kişisel kelimeleri Yazarak Tekrar moduna bağla.
- [x] Hedef kelimeyle Almanca cümle yazma ve öz değerlendirme akışı ekle.
- [x] Örnek cümlesi bulunmayan sette cümle özelliğini açıklamalı biçimde pasifleştir.
- [x] Her cevaptan sonra `masteryLevel` ve `lastReviewed` alanlarını güncelle.
- [x] Quiz oturumlarını skor, tür ve kelime kimlikleriyle kaydet.
- [x] Uygulama açılışında oturum geçmişini yükle.
- [x] Günlük hedefi bugün çalışılan benzersiz kelimelere göre hesapla.
- [x] Hazır kelimelerde kararlı kimlikler kullan.
- [x] İlerleme göstergelerini ilk sorudan son soruya doğru hesapla.
- [x] Boş liste, tek kelime, hızlı çift dokunma ve örnek cümlesiz liste durumlarını güvenli hale getir.
- [x] TypeScript ve iOS export kontrollerini çalıştır.
- [x] Xcode 26.6 ve iOS 26.5 üzerinde iPhone 17 Pro simülatör kabul testini tamamla.

Tahmin: 3–5 saat geliştirme + 1 saat kontrol.

## Sprint 2 — İçerik ve kullanım kolaylığı

Sprint hedefi: Uygulamayı içerik olarak yeterli ve günlük kullanımda rahat hale getirmek.

- [ ] A1 ve A2 konu listesini sadeleştir; çok büyük Goethe listesini kullanıcıyı boğmayacak gruplara ayır.
- [ ] A1–A2 kelimelerinin artikel ve Türkçe anlamlarını örneklem yoluyla kontrol et.
- [ ] Temel konu kelimelerine kısa Almanca ve Türkçe örnek cümleler ekle.
- [x] Kelime ekleme ve düzenleme formlarında doğrulama mesajlarını iyileştir.
- [x] Aynı Almanca kelimenin yanlışlıkla iki kez eklenmesini önle veya kullanıcıyı uyar.
- [ ] Arama ve öğrenme seviyesi filtrelerini kontrol et.
- [ ] Ana sayfada net bir “Bugünkü çalışmaya başla” akışı sun.
- [ ] Buton, dokunma alanı, klavye ve küçük iPhone ekranı kontrollerini yap.
- [x] Karşılama ekranındaki büyük marka işaretini kaldır.
- [x] Ana gezinme, konu ve alıştırma ekranlarındaki dekoratif emojileri sade iOS sembolleriyle değiştir.
- [x] Konu satırlarındaki iç içe butonları kaldır; tüm satırı tek ve anlaşılır dokunma alanı yap.
- [x] Arama temizleme, silme ve seviye kontrollerinin dokunma alanlarını ve erişilebilirlik etiketlerini iyileştir.
- [x] Kart gölgelerini güncel React Native `boxShadow` biçimine geçir.

Tahmin: 3–5 saat.

## iPhone testinden önce kısa hazırlık listesi

- [x] Expo şablon ikonlarını kaldır; düz geometrik Wortly uygulama ikonuyla değiştir.
- [x] Splash ekranını yeni ikon ve lacivert arka planla yapılandır.
- [ ] Uygulamanın son adının “Wortly” olarak kalacağını doğrula.
- [x] Aynı Almanca kelimenin ikinci kez eklenmesini engelle veya açıkça uyar.
- [x] Kelime ekleme formundaki zorunlu alanları ve Almanca karakter girişini son kez kontrol et.
- [ ] Arkadaşın için başlangıçta eklenecek en az 20–30 örnek kelimeyi ve örnek cümleleri hazırla.
- [ ] Ayarlar ekranına seviye değiştirme, günlük hedef ve deneme verilerini sıfırlama seçeneklerini ekle.
- [ ] Geliştirme ortamında görünen mavi dişli yardımcısının gerçek iPhone/TestFlight sürümünde görünmediğini doğrula.

## Sprint 3 — Stabilite ve iPhone testi

Sprint hedefi: Arkadaşın kullanabileceği kararlı bir deneme sürümü hazırlamak.

- [ ] Onboarding → kelime ekleme → dört alıştırma → sonuç akışını uçtan uca test et.
- [ ] Uygulamayı kapatıp açtıktan sonra kelime ve ilerleme verilerinin korunduğunu doğrula.
- [ ] En az üç iPhone ekran boyutunda taşma ve klavye testi yap.
- [ ] Geri tuşları, modal ekranlar ve sekme geçişlerini kontrol et.
- [ ] Uygulama ikonu, splash ekranı, isim ve bundle identifier değerlerini doğrula.
- [ ] Kritik hataları düzelt; kapsam dışı fikirleri sonraki backlog'a taşı.

Tahmin: 2–3 saat.

## Sprint 4 — TestFlight hazırlığı

Sprint hedefi: Tek arkadaş için kurulabilir bir iOS test sürümü oluşturmak.

- [ ] Apple Developer hesabı ve EAS oturumunu doğrula.
- [ ] `eas.json` içindeki örnek Apple alanlarını gerçek ayarlarla yapılandır veya gereksiz alanları kaldır.
- [ ] Sürüm ve build numarasını doğrula.
- [ ] iOS production/preview build oluştur.
- [ ] TestFlight'a yükle ve test kullanıcısını ekle.
- [ ] Kurulum sonrası kısa smoke test yap.

Tahmin: 1–2 saat; Apple/EAS bekleme süreleri hariç.

## Sonraki sürüm fikirleri

- Aralıklı tekrar algoritması
- Telaffuz ve sesli örnekler
- B1, B2 ve C1 paketleri
- Bulut yedekleme ve cihazlar arası senkronizasyon
- Yapay zekâ ile cümle düzeltme
- Haftalık ilerleme raporu
