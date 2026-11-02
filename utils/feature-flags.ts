// Özellik bayrakları. Yeni, henüz üretim veritabanında hazır olmayan özellikler VARSAYILAN KAPALIDIR.

let learningSyncOverride: boolean | null = null;

/**
 * Cihazlar arası öğrenme ilerlemesi ve senaryo sonucu senkronizasyonu.
 *
 * Bu bayrak yalnızca `user_word_progress` ve `scenario_results` tabloları ilgili Supabase
 * projesinde (migration'lar uygulanarak) oluşturulduktan sonra açılmalıdır. Kapalıyken bu tablolara
 * hiç istek gönderilmez ve uygulama eskisi gibi davranır.
 *
 * Açmak için (yalnızca test projesinde): `.env.local` içine `EXPO_PUBLIC_LEARNING_SYNC=true`.
 * Birim testleri `setLearningSyncOverride` ile bayrağı kontrollü şekilde açıp kapatır.
 */
export function isLearningSyncEnabled(): boolean {
  if (learningSyncOverride !== null) return learningSyncOverride;
  return process.env.EXPO_PUBLIC_LEARNING_SYNC === 'true';
}

/** Yalnızca testler için: bayrağı ortam değişkenini yok sayarak ayarlar; null ile sıfırlanır. */
export function setLearningSyncOverride(value: boolean | null): void {
  learningSyncOverride = value;
}
