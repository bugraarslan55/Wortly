# Günlük görevler ve başarı rozetleri

- Gün tanımı tektir: cihaz yerel takvim günü (Türkiye'de = Türkiye günü). Günlük hedef halkası, günlük
  seri, Günlük Görevler ve rozetler aynı tanımı ve aynı "şimdi" kaynağını kullanır; gece yarısında ve
  uygulama arka plandan dönünce birlikte yenilenir. Kayıtlı zaman damgaları değiştirilmez.
- Görev ilerlemesi ayrı kaydedilmez; her seferinde oturumlar, senaryo sonuçları ve kelime tekrarlarından
  hesaplanır. Bozuk veya ileri tarihli kayıtlar ilerleme sayılmaz.
- Kazanılan rozetler yalnızca cihazda (kullanıcıya özel AsyncStorage anahtarı) saklanır; Supabase tablosu
  ve migration YOKTUR. Kayıt biçimi birleştirilebilir bir "büyüyen küme"dir (rozet başına en erken
  doğrulama zamanı; birleşim, değişmeli, idempotent). İleride cihazlar arası senkron istenirse tek bir
  "kullanıcı başına rozet kimliği + doğrulama zamanı" tablosu ve birleşimi (mergeEarnedRecords) yeterlidir;
  şimdilik hazırlanmadı.
- Rozetteki tarih "bu cihazda ilk doğrulama" günüdür, gerçek kazanılma anı değildir.
