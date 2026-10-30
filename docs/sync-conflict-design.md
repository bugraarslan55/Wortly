# Kelime senkronizasyonu: silme kalıcılığı ve çakışma çözümü (tasarım)

Durum: tasarım + hazırlanmış migration. **Migration hiçbir veritabanında uygulanmadı.**
İstemci yeni şemaya bağımlı değildir.

## Mevcut davranış
- Yazma: satırın tamamı `upsert` (son yazan kazanır). `updated_at` tetikleyiciyle güncellenir ama istemci okumaz.
- Silme: fiziksel `delete`; cihaz sahibi aynıysa ve bulut boşsa yerel kelimeler artık geri yüklenmez.
- Kalan açık: silmeyi görmemiş cihazın bekleyen düzenlemesi kelimeyi buluta yeniden yazar.

## 1. Silme kalıcılığı (tombstone)
`supabase/migrations/20261101090000_user_word_tombstones.sql`:
- Ayrı `user_word_tombstones(user_id, word_id, deleted_at)` tablosu; `user_words` değişmez.
- AFTER DELETE tetikleyicisi (SECURITY DEFINER, `search_path` boş) tombstone yazar. Yalnızca kullanıcının kendi silmesinde ve kullanıcı satırı varken yazar; hesap silme (cascade) ve yönetici silmesi tombstone üretmez.
- BEFORE INSERT tetikleyicisi (SECURITY INVOKER) tombstone'lu kimliği sessizce atlar. İstemci hata almaz, bekleyen kaydı takılı kalmaz.
- RLS: istemci yalnızca kendi tombstone'larını okur; doğrudan yazamaz. Varsayılan Supabase yetkileri geri alınır.
- Tombstone yazımı eski iOS istemcilerinin silmeleri için de otomatik çalışır.

### Neden `user_words.deleted_at` sütunu değil
Sütun + silinmişleri gizleyen SELECT politikası, eski istemcilerin upsert'lerini RLS hatasına çevirir (ON CONFLICT mevcut satırı da politikayla denetler); eski istemci başarısız kaydı yeniden dener ve sonraki bekleyen kayıtları bloklar. Politikayı değiştirmezsek eski istemciler silinmiş satırları okumaya devam eder. Bu iki sorun ayrı tabloda yoktur. (Bu gerekçe PostgreSQL semantiğine dayanır; sütun yaklaşımı yerelde denenmedi.)

### Saklama süresi: otomatik temizlik YOK
Bir cihazın en son ne zaman senkronize olduğu sunucuda bilinmez. Uzun süre çevrimdışı kalan bir cihaz, herhangi bir sabit süreden (ör. 180 gün) sonra silinmiş kelimeyi tombstone olmadan geri yazabilir. Güvenli bir silme stratejisi (ör. cihaz başına son senkron zamanı takibi) olmadığı için otomatik temizlik **önerilmez**. Tombstone kayıtları küçüktür (kullanıcı, kimlik, zaman) ve hesap silinince cascade ile temizlenir. Gelecekte cihaz takibi eklenirse temizlik yalnızca tüm cihazların son senkronundan eski kayıtlara uygulanabilir.

## 2. Çakışma önceliği
| Çakışma | Sonuç |
|---|---|
| Sil ↔ düzenle | **Silme kazanır.** Sunucu tombstone'lu kimliğin yazılmasını atlar; düzenleyen cihaz bir sonraki senkronda kelimeyi yerelden düşürür. |
| Düzenle ↔ düzenle (farklı alanlar) | Alan bazlı birleştirme: yerelde değişen alanlar, buluttaki güncel sürümün üzerine uygulanır. |
| Düzenle ↔ düzenle (aynı alan) | Yalnızca aynı alan bulutta da base'den sonra değiştiyse çakışma vardır. O zaman yerel düzenleme zamanı (`editedAt`) daha yeni olan kazanır; eşitlikte bulut kazanır. Cihaz saati sapabileceği için bu kural yalnızca nadir aynı-alan çakışmasında kullanılır. |
| Mastery ↔ içerik düzenlemesi | Bağımsız alanlar: mastery yalnızca `mastery_level`/`last_reviewed` olarak yazılır, içerik alanlarına dokunmaz. |
| Mastery ↔ mastery | `last_reviewed` değeri daha yeni olan kazanır. |

## 3. Optimistic concurrency (istemci tarafı, sonraki aşama)
1. Her kelime için buluttan okunan `updated_at` yerelde saklanır (`baseUpdatedAt`) ve son senkron anlık görüntüsü tutulur.
2. Mevcut kelime güncellemesi: `update ... where id = ? and user_id = ? and updated_at = baseUpdatedAt` + `select('id')`. Satır güncellemesi PostgreSQL'de satır kilidiyle serileşir; aynı anda gelen iki koşullu güncellemeden yalnızca biri eşleşir.
3. 0 satır dönerse: bulut sürümü çekilir, anlık görüntüye göre alan bazlı birleştirilir, yeni `updated_at` ile yeniden denenir. Satır yoksa (silinmiş) kelime yerelden düşürülür.
4. Yeni kelime: `insert ... on conflict do nothing`.
5. `Word` tipine isteğe bağlı `baseUpdatedAt`/`editedAt` eklenir; eski yerel kayıtlar bu alanlar olmadan da geçerlidir.
6. İsteğe bağlı sunucu koruması (ayrı aşama): BEFORE UPDATE tetikleyicisi, `new.last_reviewed < old.last_reviewed` ise mastery alanlarını eskide tutabilir; böylece eski bir istemcinin tüm-satır yazısı mastery ilerlemesini geri almaz.

## 4. Eski iOS ↔ yeni sürüm
- Migration yalnızca ekleme yapar; eski istemcilerin sorguları değişmez.
- Eski istemci silmesi tombstone üretir; eski istemcinin eski kopya upsert'i sessizce atlanır.
- Eski istemci hâlâ satırın tamamını yazar: düzenle↔düzenle çakışmasında eski sürümler için son-yazan-kazanır sürer. OCC yalnızca yeni istemciler arasında etkilidir.

## 5. Doğrulananlar ve doğrulanamayanlar
Yerel PostgreSQL (PGlite, PostgreSQL 18) üzerinde `supabase/tests/user_word_tombstones.test.js` ile **doğrulandı**:
- Eski kopya `INSERT ... ON CONFLICT DO UPDATE` (tek ve toplu) hata vermeden atlanır; diğer satırlar yazılır.
- Silme doğru kullanıcı ve kimlikle tombstone yazar; başka kullanıcı etkilenmez.
- Hesap silme (yönetici ve kullanıcı bağlamı) kelime ve tombstone'ları hatasız temizler.
- Tombstone varlığı başka kullanıcıya hata/sessizlik farkıyla sızmaz; istemci doğrudan tombstone yazamaz.
- Migration iki kez uygulanabilir.

**Doğrulanamayanlar:**
- Gerçek Supabase (PostgREST, GoTrue `auth.uid()` uygulaması, Supabase PostgreSQL sürümü): `auth` şeması taklit edildi.
- Eşzamanlı oturumlar: silme ile eski kopya upsert'i aynı anda yürürse (silmenin commit'inden önce başlayan upsert) tombstone görünmeyebilir ve kelime dirilebilir. Pencere dardır; tek bağlantılı yerel testte sınanamadı.
- Migration öncesi silinmiş kelimeler için tombstone yoktur ve geri yazılabilir (geriye dönük doldurulamaz).

## 6. Test stratejisi
- **SQL testleri (otomatik, yerel):** `supabase/tests/user_word_tombstones.test.js` (ekleme, düzenleme, silme, eski kopya upsert'i, toplu upsert, iki kullanıcı, eski istemci akışı, hesap silme, izolasyon, yetki).
- **Senaryo testleri (cihazda, staging veritabanı ile):**
  1. Android'de kelime ekle/düzenle/sil; iOS'ta yansıma.
  2. Uçak modunda düzenle, internet gelince senkron; bulutta tek, doğru sürüm.
  3. A cihazında sil, B cihazı çevrimdışı düzenlesin; B senkronlayınca kelime geri **gelmemeli**.
  4. A anlamı düzenlerken B alıştırma çözsün: anlam geri **alınmamalı** (OCC aşamasından sonra).
  5. İki kullanıcıyla çıkış/giriş: veriler karışmamalı.
  6. Eski iOS sürümü + yeni veritabanı: ekleme, düzenleme, silme çalışmalı.
  7. Hesap silme.

## 7. Dağıtım sırası
1. Staging/branch veritabanında migration'ı uygula; yukarıdaki cihaz senaryolarını ve SQL testlerini çalıştır.
2. Üretimde yedek al, migration'ı uygula (istemci sürümlerinden bağımsız).
3. Doğrula: eski iOS ile ekle/düzenle/sil; silinen kelime başka cihazda dirilmiyor.
4. Yeni istemciyi (OCC) yayınla; eski sürümler çalışmaya devam eder.

## Geri alma
Migration dosyasının sonundaki yorumlu `drop trigger/function` komutları korumayı kaldırır; kelime verisi etkilenmez.
