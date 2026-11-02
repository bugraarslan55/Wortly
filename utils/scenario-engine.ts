import type { ReplyStep, Scenario, ScenarioStep } from '../constants/scenarios';
import type { ScenarioResult } from './learning-analysis';

// Senaryo oynatıcısının saf mantığı (ekran, ses ve depolama bağımlılığı yok; test edilebilir).
//
// Model: senaryolar doğrusal bir diyalogdur (say → reply → say ...). Dallanma yoktur: yanlış cevap seçenek
// kartını devre dışı bırakır ve kullanıcı konuşmaya doğru cevapla devam eder; böylece yanlış cevap hiçbir
// zaman anlamsız bir konuşma dalına götürmez. Puan, ilk denemede doğru bilinen cevaplardır.

export type OptionId = 'correct' | 'wrong-0' | 'wrong-1';

export interface Option {
  id: OptionId;
  german: string;
  correct: boolean;
  /** Seçeneğin Türkçe anlamı (veri varsa). */
  turkish?: string;
  /** Yanlış seçenek için neden uymadığını anlatan kısa not (veri varsa). */
  whyWrong?: string;
}

export interface StepProgress {
  solved: boolean;
  firstTry: boolean;
  wrongIds: string[];
}
export type ProgressMap = Record<number, StepProgress>;

export const EMPTY_PROGRESS: StepProgress = { solved: false, firstTry: true, wrongIds: [] };

/** Fisher–Yates; `rng` enjekte edilebilir (testlerde deterministik). */
export function shuffleWith<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function buildOptions(step: ReplyStep, rng: () => number = Math.random): Option[] {
  return shuffleWith<Option>([
    { id: 'correct', german: step.german, correct: true, turkish: step.turkish },
    { id: 'wrong-0', german: step.wrongOptions[0], correct: false, turkish: step.wrongTurkish?.[0], whyWrong: step.wrongNotes?.[0] },
    { id: 'wrong-1', german: step.wrongOptions[1], correct: false, turkish: step.wrongTurkish?.[1], whyWrong: step.wrongNotes?.[1] },
  ], rng);
}

/**
 * Bir seçeneğe dokunmayı işler (saf indirgeyici). Çözülmüş adım değişmez; aynı yanlış seçeneğe tekrar dokunmak
 * ikinci ceza oluşturmaz; bilinmeyen adım yok sayılır. Hızlı çift dokunuş aynı sonucu verir.
 */
export function answerOption(progress: ProgressMap, index: number, option: Pick<Option, 'id' | 'correct'>): ProgressMap {
  const previous = progress[index] ?? EMPTY_PROGRESS;
  if (previous.solved) return progress;
  if (option.correct) return { ...progress, [index]: { ...previous, solved: true } };
  if (previous.wrongIds.includes(option.id)) return progress;
  return {
    ...progress,
    [index]: { ...previous, firstTry: false, wrongIds: [...previous.wrongIds, option.id] },
  };
}

export const isReply = (step: ScenarioStep | undefined): step is ReplyStep => step?.type === 'reply';

export function countQuestions(steps: readonly ScenarioStep[]): number {
  return steps.filter(isReply).length;
}

export interface ScenarioScore {
  total: number;
  /** İlk denemede doğru bilinenler. */
  correct: number;
  /** En az bir yanlış deneme yapılanlar. */
  wrong: number;
  percent: number;
}

export function scoreScenario(steps: readonly ScenarioStep[], progress: ProgressMap): ScenarioScore {
  let correct = 0;
  let wrong = 0;
  let total = 0;
  steps.forEach((step, index) => {
    if (!isReply(step)) return;
    total += 1;
    const state = progress[index];
    if (state?.solved && state.firstTry) correct += 1;
    else if (state && state.wrongIds.length > 0) wrong += 1;
  });
  return { total, correct, wrong, percent: total > 0 ? Math.round((correct / total) * 100) : 0 };
}

export interface LearnedPhrase {
  german: string;
  turkish: string;
  /** İlk denemede bilinemedi: tekrar edilmeli. */
  missed: boolean;
}

/** Senaryoda kullanıcının söyleyebileceği ifadeler (doğru cevaplar), kaçırılanlar işaretli. */
export function learnedPhrases(steps: readonly ScenarioStep[], progress: ProgressMap): LearnedPhrase[] {
  const phrases: LearnedPhrase[] = [];
  steps.forEach((step, index) => {
    if (!isReply(step)) return;
    const state = progress[index];
    phrases.push({ german: step.german, turkish: step.turkish, missed: !state?.solved || !state.firstTry });
  });
  return phrases;
}

/** Sonraki adıma geçilebilir mi? (Replik adımında önce doğru cevap seçilmeli.) */
export function canContinue(step: ScenarioStep | undefined, state: StepProgress | undefined): boolean {
  if (!step) return false;
  return step.type === 'say' || !!state?.solved;
}

/** Yarıda çıkış uyarısı gerekir mi? (İlerleme var ve senaryo bitmedi.) */
export function needsExitConfirm(progress: ProgressMap, finished: boolean): boolean {
  if (finished) return false;
  return Object.values(progress).some(state => state.solved || state.wrongIds.length > 0);
}

export interface ScenarioHistory {
  attempts: number;
  /** En iyi başarı yüzdesi. */
  bestPercent: number;
  lastPercent: number;
}

/** Kullanıcının bu senaryodaki önceki sonuçlarının özeti; sonuç yoksa null. Kayıtlar değiştirilmez. */
export function scenarioHistory(results: readonly ScenarioResult[] | null | undefined, scenarioId: string): ScenarioHistory | null {
  const mine = (results ?? []).filter(
    result => result?.scenarioId === scenarioId && Number.isFinite(result.total) && result.total > 0 && Number.isFinite(result.score),
  );
  if (mine.length === 0) return null;
  const percents = mine.map(result => Math.round((Math.min(result.score, result.total) / result.total) * 100));
  return {
    attempts: mine.length,
    bestPercent: Math.max(...percents),
    // Kayıtlar en yenisi başta saklanır (store: [yeni, ...eskiler]).
    lastPercent: percents[0]!,
  };
}

/**
 * Senaryo verisinin yapısal doğrulaması. Boş liste = oynanabilir. Bozuk/eksik veri ekranı çökertmesin diye
 * oynatıcı ve liste bunu kullanır; içerik testleri de aynı kuralları denetler.
 */
export function validateScenario(scenario: Scenario | undefined | null): string[] {
  const issues: string[] = [];
  if (!scenario || typeof scenario !== 'object') return ['senaryo yok'];
  if (!scenario.id) issues.push('kimlik yok');
  if (!['A1', 'A2', 'B1'].includes(scenario.level)) issues.push('geçersiz seviye');
  if (!scenario.title?.trim()) issues.push('başlık yok');
  const steps = scenario.steps;
  if (!Array.isArray(steps) || steps.length === 0) return [...issues, 'adım yok'];

  if (steps[0]?.type !== 'say') issues.push('konuşma bir replikle başlamalı');
  let replies = 0;
  steps.forEach((step, index) => {
    const at = `adım ${index + 1}`;
    if (!step || (step.type !== 'say' && step.type !== 'reply')) {
      issues.push(`${at}: geçersiz tür`);
      return;
    }
    if (!step.german?.trim() || !step.turkish?.trim()) issues.push(`${at}: Almanca/Türkçe metin eksik`);
    if (step.type === 'say') {
      if (!step.speaker?.trim()) issues.push(`${at}: konuşan yok`);
      return;
    }
    replies += 1;
    if (!step.prompt?.trim()) issues.push(`${at}: görev metni yok`);
    const wrong = step.wrongOptions;
    if (!Array.isArray(wrong) || wrong.length !== 2 || wrong.some(option => !option?.trim())) {
      issues.push(`${at}: iki yanlış seçenek gerekli`);
      return;
    }
    const all = [step.german, ...wrong].map(option => option.trim().toLowerCase());
    if (new Set(all).size !== 3) issues.push(`${at}: seçenekler birbirinden farklı olmalı`);
    if (steps[index - 1]?.type !== 'say') issues.push(`${at}: cevap bir replikten sonra gelmeli`);
    if (step.wrongTurkish && step.wrongTurkish.some(text => !text?.trim())) issues.push(`${at}: boş Türkçe anlam`);
    if (step.wrongNotes && step.wrongNotes.some(text => !text?.trim())) issues.push(`${at}: boş not`);
  });
  if (replies === 0) issues.push('hiç soru yok');
  return issues;
}

export const isPlayableScenario = (scenario: Scenario | undefined | null): scenario is Scenario =>
  validateScenario(scenario).length === 0;

/**
 * Hızlı art arda dokunuşlara karşı kısa süreli kilit (ör. "Devam" düğmesi bir adımı atlamasın).
 * `tryAcquire` kilit açıksa true döner ve kilidi `durationMs` boyunca kapatır; süre dolunca yeniden açılır.
 * Saat enjekte edilebilir (testlerde sahte zaman). Zamanlayıcı gerektirmez, bu yüzden sızıntı yapmaz.
 */
export function createNavigationLock(durationMs: number, now: () => number = Date.now) {
  let lockedUntil = -Infinity;
  return {
    tryAcquire(): boolean {
      const current = now();
      if (current < lockedUntil) return false;
      lockedUntil = current + durationMs;
      return true;
    },
    release() {
      lockedUntil = -Infinity;
    },
  };
}

/**
 * Bir işlemin aynı anahtar için yalnızca BİR kez yapılmasını sağlar (ör. aynı turun sonucunu tek kez kaydetmek).
 * `claim` ilk çağrıda true, aynı anahtarla sonraki çağrılarda false döner.
 */
export function createOnceGuard<K>() {
  const claimed = new Set<K>();
  return {
    claim(key: K): boolean {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
  };
}
