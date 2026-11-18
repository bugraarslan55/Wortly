# Gramer Rehberi: sıfatlar ve edatlar

## Amaç ve kapsam

Kullanıcı, kelime çalışmasından ayrı bir alanda Almanca sıfat ve edat kurallarını kısa örneklerle öğrenir ve dört soruluk kontrollerle pekiştirir. Bölüm ana sayfadaki **Gramer Rehberi** kartından açılır. Mevcut Konular, senaryolar, günlük kelime hedefi ve seri aynı kalır.

## Ders sırası

| Seviye | Konu | Öğrenme hedefi |
| --- | --- | --- |
| A1 | Temel sıfatlar | `sein` sonrasında yalın sıfatı kullanmak. |
| A1 | `für`, `ohne`, `mit` | `für/ohne` + Akkusativ; `mit` + Dativ ayrımını kurmak. |
| A2 | Karşılaştırma | `-er als`, `am …-sten`, `so … wie` ve sık düzensiz biçimleri tanımak. |
| A2 | Sıfat sonlarına giriş | Nominativ örnekleri ve eril Akkusativ ile çekime başlamak. |
| A2 | `wo` / `wohin` | İki yönlü edatlarda konum için Dativ, hedefe yönelme için Akkusativ seçmek. |
| B1 | Sıfat çekimini pekiştir | Belirli artikel ile Dativ, Genitiv ve çoğul son ekleri kullanmak. |
| B1 | Fiil + edat | `warten auf`, `sich interessieren für`, `sprechen mit`, `denken an` kalıplarını öğrenmek. |
| B1 | `wegen` / `trotz` | Standart yazı dilinde Genitiv biçimlerini kullanmak. |

Seviyeler uygulamadaki profil seviyesiyle açılır. Liste kilitli seviyeyi gösterir ama seçtirmez; doğrudan ders bağlantısında da aynı kontrol uygulanır.

## Ders ve alıştırma akışı

1. Ders başlığı, tek ana kural, en az üç Almanca/Türkçe örnek ve öğrenme ipucu gösterilir.
2. “4 Soruluk Kontrole Başla” kısa çoktan seçmeli kontrolü başlatır.
3. Cevap seçildikten sonra doğru seçenek ve açıklama görünür. Aynı soru tekrar puanlanmaz.
4. Dördüncü sorudan sonra doğru/toplam sonucu çıkar. Kullanıcı yeniden deneyebilir veya derse/listeye dönebilir.

Kontrolün durumu yalnızca ekran belleğindedir. Çıkışta sıfırlanır. Yerel depoya, Supabase'e, kelime seviyesine, günlük hedefe veya seriye yazılmaz. Bu sınır, gramer sorularını kelime çalışmasıyla karıştırmadan ilk sürümü yayımlamayı sağlar. Kalıcı gramer ilerlemesi sonraki bir karar olarak tasarlanabilir.

## Uygulama parçaları

- `constants/grammar.ts`: ders kataloğu, örnekler, sorular ve seviye kuralı.
- `app/gramer/index.tsx`: seviyeye göre ders listesi.
- `app/gramer/[id].tsx`: ders, dört soru, açıklama ve sonuç.
- `utils/grammar-quiz.ts`: tek cevap sayımı ve ilerleme mantığı.
- Ana sayfa kartı ve korumalı rota kaydı.
- `tests/grammar.test.js`: katalog, seviye ve quiz davranışı.

## Doğrulama ve yayın sırası

1. İçerik denetimi: Almanca biçimler, Türkçe çeviriler, yanlış seçenekler ve açıklamalar okunur. Otomatik yapı denetimi dil doğruluğunun yerini tutmaz.
2. `npm test`, `npx tsc --noEmit`, `git diff --check` ve web export çalıştırılır.
3. Açık/koyu tema, küçük ekran, uzun metin, seviye kilidi ve dört soruluk bitiş simülatör veya cihazda gözlemlenir.
4. Değişiklikler ayrı commit olarak GitHub dalına gönderilir. Native modül veya bağımlılık eklenmediği için özellik kodu yeni native modül gerektirmez; TestFlight sürümüne girmesi için ayrıca dağıtım gerekir.

## Kaynaklar ve pedagojik not

- [Goethe A1 gramer özeti](https://lernen.goethe.de/deutschonline/A1/PDF/DE/deutschonline_Redemittel_und_Grammatik_1-18.pdf)
- [Goethe A2 gramer özeti](https://lernplattform.goethe.de/pluginfile.php/1534638/mod_folder/content/0/DTonlineA2_gesamt_K01-18_GR-RM_Rueckschau_DE.pdf)
- [Goethe B1 gramer özeti](https://lernplattform.goethe.de/pluginfile.php/1499547/mod_folder/content/0/DTonlineB1_GR-RM_Rueckschau_DE.pdf)

Bu sekiz ders uygulama içi bir öğrenme sırasıdır; resmî sınav müfredatının birebir kopyası değildir. A2'deki sıfat sonları dersi giriş düzeyindedir; B1 dersi Dativ, Genitiv ve çoğul örnekleriyle pekiştirir. `wegen/trotz` için günlük konuşmada karşılaşılabilen Dativ biçimleri bir notla belirtilir, sorular yazı dilindeki Genitiv'i öğretir.

Kaynak bağlantıları tarayıcıda kontrol edildi. Claude'un çalıştığı ortamda A2/B1 dosya sunucusuna DNS erişimi olmadı; derslerin dil doğruluğu için anadili Almanca olan birinin son okuması ayrıca yararlı olacaktır.
