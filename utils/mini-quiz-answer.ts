// Mini quiz yanıtının kaydı için saf mantık (mağaza/React bağımlılığı yok; birim testlenebilir).

/** Aynı soru örneğinin (çift dokunuş, yeniden render, art arda çağrı) iki kez kaydedilmesini engeller. */
export function createMiniQuizAnswerGuard() {
  const claimed = new Set<string>();
  return {
    /** İlk çağrıda true (kaydedilebilir), aynı anahtar için sonrakilerde false. */
    claim(key: string): boolean {
      if (!key || claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
  };
}

export interface MiniQuizAnswerDeps {
  updateMastery: (wordId: string, correct: boolean) => Promise<unknown> | unknown;
  updateStreak: () => Promise<unknown> | unknown;
}

/**
 * Mini quiz yanıtı YALNIZCA kelime ilerlemesini (ve gün serisini) günceller. Çalışma oturumu (QuizSession) KAYDEDİLMEZ:
 * tek soruluk bir yanıt "alıştırma tamamla" görevine, başarı görevine (en az 5 soru), rozetlere ve alıştırma sayılarına
 * girmemelidir; ayrıca yeni bir oturum türü veritabanı/istemci modelini değiştirirdi. Kelime ilerlemesi analiz, "bugün
 * çalışılan kelime" ve (bayrak açıksa) öğrenme senkronuyla zaten tutarlıdır.
 * Aynı `questionKey` ikinci kez gelirse HİÇBİR şey yapılmaz ve false döner.
 */
export async function recordMiniQuizAnswer(
  guard: ReturnType<typeof createMiniQuizAnswerGuard>,
  questionKey: string,
  wordId: string,
  correct: boolean,
  deps: MiniQuizAnswerDeps,
): Promise<boolean> {
  if (!wordId || !guard.claim(questionKey)) return false;
  try { await deps.updateMastery(wordId, correct); } catch { /* ilerleme yazılamazsa yanıt gösterimi etkilenmez */ }
  try { await deps.updateStreak(); } catch { /* seri yazılamazsa sessizce atlanır */ }
  return true;
}
