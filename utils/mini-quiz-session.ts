// Mini Quiz oturumunun soru sınırı ve özeti (saf mantık; mağaza, React veya expo bağımlılığı yok).
//
// Bir açılış en fazla MINI_QUIZ_MAX_QUESTIONS soru sorar; bildirimdeki kelime ilk sorudur ve bu sınıra dahildir.
// Aynı kelime aynı quiz içinde tekrar sorulmaz. Uygun soru biterse (5'ten önce) quiz kapanmaz, tamamlanma gösterilir.
// Sayaç ekrana aittir: ekran her açıldığında createMiniQuizProgress() ile sıfırdan başlar.

export const MINI_QUIZ_MAX_QUESTIONS = 5;

export interface MiniQuizProgress {
  /** Cevaplanan soru sayısı. */
  answered: number;
  correct: number;
}

export function createMiniQuizProgress(): MiniQuizProgress {
  return { answered: 0, correct: 0 };
}

/** Bir cevabı sayar. Girdiyi değiştirmez. */
export function recordMiniQuizAnswer(progress: MiniQuizProgress, correct: boolean): MiniQuizProgress {
  return { answered: progress.answered + 1, correct: progress.correct + (correct ? 1 : 0) };
}

export function isMiniQuizFinished(progress: MiniQuizProgress, maxQuestions: number = MINI_QUIZ_MAX_QUESTIONS): boolean {
  return progress.answered >= maxQuestions;
}

export type MiniQuizStep<Q> = { kind: 'question'; question: Q } | { kind: 'complete' };

/**
 * Cevaptan sonra ne yapılacağı. Sınır dolduysa seçici hiç çağrılmaz. Seçici soru bulamazsa, hata verirse ya da zaten
 * sorulmuş bir kelime döndürürse quiz tamamlanır (tekrar yok, beklenmedik kapanma yok).
 */
export function nextMiniQuizStep<Q extends { word: { id: string } }>(
  progress: MiniQuizProgress,
  shownIds: readonly string[],
  pick: (excludeIds: string[]) => Q | null,
  maxQuestions: number = MINI_QUIZ_MAX_QUESTIONS,
): MiniQuizStep<Q> {
  if (isMiniQuizFinished(progress, maxQuestions)) return { kind: 'complete' };
  let question: Q | null = null;
  try {
    question = pick([...shownIds]);
  } catch {
    question = null;
  }
  if (!question || shownIds.includes(question.word.id)) return { kind: 'complete' };
  return { kind: 'question', question };
}

export interface MiniQuizSummary {
  /** "doğru/toplam", ör. "4/5". */
  scoreText: string;
  /** Beş soru dolmadan, uygun soru kalmadığı için bitti. */
  cutShort: boolean;
}

export function buildMiniQuizSummary(
  progress: MiniQuizProgress,
  maxQuestions: number = MINI_QUIZ_MAX_QUESTIONS,
): MiniQuizSummary {
  return { scoreText: `${progress.correct}/${progress.answered}`, cutShort: progress.answered < maxQuestions };
}
