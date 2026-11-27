# Öğrenme ilerlemesi senkronizasyonu (tasarım ve durum)

Durum: **migration'lar hazırlandı, hiçbir veritabanında uygulanmadı.** İstemci senkronizasyon kodu
yazıldı ama **`EXPO_PUBLIC_LEARNING_SYNC` özellik bayrağı arkasında ve varsayılan olarak KAPALI**.
Kapalıyken `user_word_progress` ve `scenario_results` tablolarına hiç istek gitmez (bir test kaynak
kodunu bu açıdan denetler) ve uygulama eskisi gibi davranır. Bayrak yalnızca bu tabloların oluşturulduğu
bir TEST Supabase projesinde, `.env.local` ile açılmalıdır.

## İstemci mimarisi (bayrak açıkken)
- `utils/learning-sync.ts`: saf çekirdek. Sayfalama (`fetchAllPages`, 1000'lik sayfalar), konu
  ilerlemesi için tam senkron (`syncProgressWithCloud`) ve hafif akış (`flushProgressIds`), senaryo
  sonuçları için aynıları (`syncScenariosWithCloud`, `flushScenarioIds`), sahiplik kararı
  (`decideProgressOwnership`). Ağ taşıyıcıları enjekte edilir; testler sahte sunucu kullanır.
- `store/index.ts`: Supabase taşıyıcıları, `syncProgress`, `syncScenarioResults`, bekleyen kuyruğa
  `progress` ve `scenario` varlıkları (id ile tekilleşir), `refreshLearningData` (öne gelince, en çok
  5 dakikada bir tam çekme).
- Tam senkron: bulutu oku → kelime başına `mergeProgress` → eksik/eski yerel kayıtları uygula,
  eksik/eski bulut kayıtlarını yükle. Hata olursa hiçbir şey "senkronize" işaretlenmez ve kuyruk
  korunur. Hafif akış yalnızca bekleyen kayıtları gönderir.
- Kullanıcı değişimi: yerel `reviewStates` başka kullanıcıya aitse (`review-owner`) hiçbir şey
  yüklenmez/uygulanmaz; sahibi belirsizse bu kullanıcı devralır (kelime senkronuyla aynı kural).
  Senaryo senkronu, yerel liste bu kullanıcı için yüklenmeden çalışmaz.
- Çıkış güvenliği: bu kullanıcı için tam senkron bu oturumda başarıyla bitmediyse (bayrak kapalı,
  tablolar yok, ağ hatası) tüm yerel konu ilerlemesi "bulutta doğrulanmamış" sayılır ve eski uyarı
  geçerlidir. Doğrulandıysa yalnızca henüz gönderilmemiş (bekleyen) kayıtlar uyarılır.
- Senaryo: kimliksiz eski kayıtlara içerikten kararlı kimlik atanır (silinmez, yinelenmez); geçersiz
  kayıtlar buluta gönderilmez ama yerelde korunur; doğrulanmamış kayıtlar yerel sınırın dışında da tutulur.

## Neden
- Konu kelimelerinin `reviewStates` kaydı (seviye + son tekrar) yalnızca cihazda tutulur ve çıkışta
  (`resetLocal`) silinir. Senaryo sonuçları da yalnızca cihazdadır.
- Kişisel kelimede ilerleme hem `user_words` satırında hem yerel `reviewStates` kaydında bulunur ve
  `reviewStates` öncelikli okunur; bayat yerel kayıt başka cihazdaki yeni çalışmayı bastırabiliyordu.

## Etkin olan düzeltmeler (migration gerektirmez)
1. `utils/progress-merge.ts`: kişisel kelimelerde bulut ile yerel ilerleme **kelime başına
   `last_reviewed` değeri yeni olan** tarafla birleştirilir (`mergeCustomWordProgress`, `syncWords`
   içinde). Yerel ilerleme daha yeniyse buluta yeniden gönderilir (bekleyen kuyruk ile).
2. `utils/signout-plan.ts` + `app/profile.tsx`: buluta kaydedilmeyen konu ilerlemesi varken çıkış,
   açık bir uyarı ve **açık onay** (yıkıcı "İlerlemeyi silip çık") olmadan yapılmaz. Bu ilerleme
   "senkronize edilebilir" gibi sunulmaz.

## Çakışma politikası (istemci ve sunucu aynıdır)
- `last_reviewed` yeni olan kazanır; seviyesi düşükse bile (yanlış cevap seviyeyi düşürebilir).
- Zaman damgası eşitse yüksek seviye kazanır; böylece sıradan bağımsız aynı sonuca yakınsanır.
- Geçersiz/eksik tarih (null, NaN, 2020 öncesi, metin çöpü) "bilinmiyor" sayılır; geçerli taraf kazanır.
  İkisi de bilinmiyorsa bulut değeri korunur.
- İleri tarihli damga (5 dakikadan fazla) şimdiye çekilir. Sunucuda `updated_at` her zaman sunucu saatidir.
- **Sınırlama:** istemci saatine tamamen güvenilemez. Sunucu yalnızca *ileri* sapmayı sınırlar. Saati
  çok geri olan bir cihazın gerçek tekrarı, daha ileri tarihli bir kayıtla karşılaşırsa kaybedebilir.
  Bunu tamamen çözmek için olay günlüğü (her tekrar için satır) gerekir; bu tasarımda bilinçli olarak
  kapsam dışıdır (tablo boyutu ve karmaşıklık).

## Hazırlanan (uygulanmamış) migration'lar
- `supabase/migrations/20261102090000_user_word_progress.sql`
  - `(user_id, word_id)` birincil anahtar, `mastery_level 0–3`, `last_reviewed` zorunlu (≥ 2020).
  - RLS: select/insert/update yalnızca kendi satırı; DELETE yok (hesap silinince cascade).
  - `BEFORE INSERT OR UPDATE` tetikleyicisi: bayat yazmayı hatasız yok sayar, eşitlikte yüksek seviye,
    gelecek damgayı çeker, `user_id`/`word_id`/`created_at` değişmez, `updated_at` sunucu saati.
- `supabase/migrations/20261102091000_scenario_results.sql`
  - `(user_id, id)` birincil anahtar; yalnızca ekleme (UPDATE/DELETE yetkisi ve politikası yok).
  - İstemci `upsert(..., { onConflict: 'user_id,id', ignoreDuplicates: true })` kullanmalı.
  - `score <= total`, `total >= 1`, damga ≥ 2020, gelecek damga çekilir, `created_at` sunucu saati.

## Tombstone migration ile ilişki
`20261101090000_user_word_tombstones.sql` yalnızca `user_words` içindir. Yeni tablolar farklı,
tetikleyici/işlev adları farklıdır. Sıra bağımsızdır (iki sırada da PGlite ile uygulandı) ve hesap
silme üçünü de temizler. İlerleme tablosunda silme olmadığı için tombstone gerekmez.

## Testler
- `npm test`: birleştirme, geçersiz tarih, çevrimdışı/iki cihaz, çıkış planı (53 test).
- `supabase/tests/progress_tables.test.js` (PGlite, gerçek PostgreSQL; Supabase taklidi): RLS,
  kısıtlar, bayat/eşit/gelecek damga, iki cihaz, tekrar gönderim, append-only, cascade, tombstone
  ile birlikte uygulama, idempotent migration (25 test). Gerçek Supabase'de (PostgREST/GoTrue)
  **doğrulanmadı**; `STAGING_TEST_PLAN.md` ile ayrı test projesinde sınanmalıdır.

## Üretime geçmeden önce
1. Ayrı bir **test** Supabase projesinde migration'ları sırayla uygula ve `staging.integration.test.js`
   benzeri bir testi iki yeni tabloya genişlet (PostgREST upsert, bayat yazma, iki oturum).
2. İstemci tarafını (pull/push, kuyruğa `progress` ve `scenario` varlıkları, ilk senkron birleşimi,
   çıkış uyarısından "senkronize et" seçeneği) ayrı bir PR'da, test projesinde doğrulayarak yaz.
3. Üretimde yedek al, migration'ları uygula, sonra yeni istemciyi yayınla (eski istemciler yeni
   tabloları kullanmaz; etkilenmez).
4. Statik kelime kimliklerinin sürümler arasında kararlı olduğunu doğrula (kimlik değişirse ilerleme eşleşmez).

## Senaryo geçmişi (yerel 100 sınırı ve bulut geçmişi)
- Yerelde en çok 100 sonuç tutulur (depolama boyutu ve açılış hızı için). Bulut açıkken geçmişin tamamı
  `scenario_results` içinde durur; yerel kırpma yalnızca bulutta DOĞRULANMIŞ kayıtlara uygulanır,
  yüklenemeyen/geçersiz kayıtlar sınırın dışında da korunur (sessiz kayıp yok).
- Profil sayacı, bayrak açıkken bulut toplamını satır indirmeden okur (`count: exact, head: true`);
  bilinmiyorsa "N+" gösterilir, sayı uydurulmaz.
- Öğrenme analizi yerel (son 100) sonuçlara dayanır; bu, son performansı yansıtmak için yeterlidir.
- Tam geçmiş ekranı gerekirse: `(user_id, completed_at desc)` indeksi var; anahtar tabanlı sayfalama
  (`completed_at < son_görülen`, sayfa başına 20-50 satır) önerilir. Bu ekran bu aşamada YAPILMADI
  (yeni migration gerektirmez; yalnızca istemci).
- Büyük hesaplar: tam senkron senaryoları 1000'lik sayfalarla okur; çok büyük geçmişlerde (binlerce)
  ilk açılışta maliyet artar. Çözüm gerekirse artımlı çekme (`created_at > son_senkron`) eklenebilir
  ve migration gerektirmez (`created_at` sunucu saatidir).
