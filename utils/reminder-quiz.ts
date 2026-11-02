import type { PlannedReminder } from './reminder-plan';

// Bildirim planına mini quiz kelimesi ekleme (saf mantık; depolama, ağ veya expo-notifications bağımlılığı yok).
//
// - Yalnızca "daily" (genel) ve "review" (tekrar) bildirimleri soruya dönüşür. Seri ve günlük hedef bildirimleri
//   koşullu iddialar içerdiğinden (ör. "N kelime kaldı") olduğu gibi kalır.
// - Her bildirim için FARKLI bir kelime seçilir (aynı kelime art arda günlerde tekrarlanmaz).
// - İçerik sağlayıcı bulamazsa ya da hata verirse planlanan genel metin aynen korunur.

export const QUIZ_REMINDER_KINDS: ReadonlyArray<PlannedReminder['kind']> = ['daily', 'review'];

/**
 * Mini quiz bildiriminin sabit metni. Kilit ekranında kullanıcıya ait HİÇBİR kelime, çeviri veya ilerleme verisi görünmez;
 * kelime yalnızca bildirimin gizli verisinde (data.wordId) taşınır ve dokunulunca uygulama içinde sorulur.
 */
export const QUIZ_REMINDER_BODY = 'Günün mini sorusu hazır. Dokun ve kısa bir soruyu cevapla.';

export interface QuizContent {
  body?: string;
  wordId?: string;
}

export function decoratePlanWithQuiz(
  plan: readonly PlannedReminder[],
  pick: (excludeIds: string[]) => QuizContent | null,
): PlannedReminder[] {
  const used: string[] = [];
  return plan.map((item) => {
    if (!QUIZ_REMINDER_KINDS.includes(item.kind)) return item;
    let content: QuizContent | null = null;
    try {
      content = pick([...used]);
    } catch {
      content = null;
    }
    if (!content || typeof content.wordId !== 'string' || !content.wordId) return item;
    used.push(content.wordId);
    // Sağlayıcının metni YOK SAYILIR: gövde her zaman sabit ve veri içermeyen metindir.
    return { ...item, body: QUIZ_REMINDER_BODY, wordId: content.wordId };
  });
}
