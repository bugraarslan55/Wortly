import type { ChoiceOption, ChoiceStep, ReplyStep, Scenario, ScenarioStep } from '../constants/scenarios';
import { overlappingCandidates } from './speech-answer';
import type { ScenarioResult } from './learning-analysis';

// Senaryo oynatıcısının saf mantığı (ekran, ses ve depolama bağımlılığı yok; test edilebilir).
//
// Karar noktaları (`choice` adımı): doğru/yanlış değildir; iki geçerli cevaptan biri seçilir ve karşı tarafın yanıtı seçime
// göre değişir, akış ortak devama bağlanır. Seçimler puana, yanlış listesine ve kayda GİRMEZ (ilerleme haritasından ayrıdır).
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

export const isChoice = (step: ScenarioStep | undefined): step is ChoiceStep => step?.type === 'choice';

/** Yalnızca puanlanan (doğru/yanlış) sorular sayılır; karar noktaları soru değildir. */
export function countQuestions(steps: readonly ScenarioStep[]): number {
  return steps.filter(isReply).length;
}

export function countChoices(steps: readonly ScenarioStep[]): number {
  return steps.filter(isChoice).length;
}

/** Kullanıcının seçimleri: adım indeksi → seçilen seçenek (0 ya da 1). Puan/kayıt haritasından (ProgressMap) ayrıdır. */
export type ChoiceMap = Record<number, 0 | 1>;

export interface ChoiceOutcome {
  /** Kullanıcının seçtiği cevap (Almanca + Türkçe). */
  chosen: Pick<ChoiceOption, 'german' | 'turkish'>;
  /** Karşı tarafın bu seçime verdiği yanıt. */
  response: { speaker: string; german: string; turkish: string };
}

/** Seçime göre karşı tarafın yanıtı. Seçim yoksa/geçersizse null. Saf: hiçbir şeyi kaydetmez. */
export function choiceOutcome(step: ChoiceStep | undefined, selected: number | undefined): ChoiceOutcome | null {
  if (!step || (selected !== 0 && selected !== 1)) return null;
  const option = step.options[selected];
  if (!option) return null;
  return {
    chosen: { german: option.german, turkish: option.turkish },
    response: { speaker: step.speaker, german: option.responseGerman, turkish: option.responseTurkish },
  };
}

export interface HistoryEntry {
  key: string;
  speaker: string;
  german: string;
  /** Kullanıcının söylediği satır mı? */
  user: boolean;
}

/**
 * Bağlam için `index`ten önceki son `count` konuşma satırı. Cevap adımı kullanıcının doğru cevabını, karar noktası ise
 * karşı tarafın sorusunu, (seçildiyse) kullanıcının seçtiği cevabı ve karşı tarafın yanıtını verir.
 */
export function buildHistory(
  steps: readonly ScenarioStep[], index: number, choices: ChoiceMap = {}, count = 2,
): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  steps.slice(0, Math.max(0, index)).forEach((step, stepIndex) => {
    if (step.type === 'say') {
      entries.push({ key: `s${stepIndex}`, speaker: step.speaker, german: step.german, user: false });
    } else if (step.type === 'reply') {
      entries.push({ key: `r${stepIndex}`, speaker: 'Sen', german: step.german, user: true });
    } else {
      entries.push({ key: `c${stepIndex}q`, speaker: step.speaker, german: step.german, user: false });
      const outcome = choiceOutcome(step, choices[stepIndex]);
      if (outcome) {
        entries.push({ key: `c${stepIndex}u`, speaker: 'Sen', german: outcome.chosen.german, user: true });
        entries.push({ key: `c${stepIndex}a`, speaker: outcome.response.speaker, german: outcome.response.german, user: false });
      }
    }
  });
  return entries.slice(-count);
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

/**
 * İlk denemede yanlış cevaplanan cevap adımlarının indeksleri (sonradan doğru bilinse de), senaryodaki sırasıyla.
 * Yalnızca ana turun ilerlemesinden okunur; hiçbir şeyi değiştirmez ve kaydetmez.
 */
export function missedStepIndexes(steps: readonly ScenarioStep[], progress: ProgressMap): number[] {
  const missed: number[] = [];
  steps.forEach((step, index) => {
    if (isReply(step) && (progress[index]?.wrongIds.length ?? 0) > 0) missed.push(index);
  });
  return missed;
}

/**
 * "Yanlışlarımı Tekrar Et" turu: yalnızca yanlış cevaplanan adımlar, senaryodaki sırasıyla. Tur ayrı bir ilerleme haritasında
 * oynanır; ana turun puanını, sonuç kaydını ve diğer verileri etkilemez.
 */
export interface ReviewRun {
  /** Senaryo adımlarına indeksler (artan sırada). */
  indexes: number[];
  /** `indexes` içindeki konum. */
  position: number;
}

/** Yanlış cevap yoksa null (buton gösterilmez). */
export function startReview(steps: readonly ScenarioStep[], progress: ProgressMap): ReviewRun | null {
  const indexes = missedStepIndexes(steps, progress);
  return indexes.length > 0 ? { indexes, position: 0 } : null;
}

export const reviewStepIndex = (run: ReviewRun): number => run.indexes[run.position]!;

export const isLastReviewStep = (run: ReviewRun): boolean => run.position >= run.indexes.length - 1;

/** Sonraki yanlış adım; tur bittiyse null (sonuç ekranına dönülür). Girdiyi değiştirmez. */
export function reviewNext(run: ReviewRun): ReviewRun | null {
  return isLastReviewStep(run) ? null : { ...run, position: run.position + 1 };
}

/** Önceki yanlış adım; ilk adımdaysa aynı konumda kalır. Girdiyi değiştirmez. */
export function reviewPrevious(run: ReviewRun): ReviewRun {
  return run.position > 0 ? { ...run, position: run.position - 1 } : run;
}

/** Sonraki adıma geçilebilir mi? (Replik adımında önce doğru cevap seçilmeli.) */
export function canContinue(
  step: ScenarioStep | undefined, state: StepProgress | undefined, choice?: number,
): boolean {
  if (!step) return false;
  if (step.type === 'say') return true;
  // Karar noktasında bir cevap seçilmeden ilerlenmez; seçim doğru/yanlış değildir.
  if (step.type === 'choice') return choice === 0 || choice === 1;
  return !!state?.solved;
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
    if (!step || (step.type !== 'say' && step.type !== 'reply' && step.type !== 'choice')) {
      issues.push(`${at}: geçersiz tür`);
      return;
    }
    if (!step.german?.trim() || !step.turkish?.trim()) issues.push(`${at}: Almanca/Türkçe metin eksik`);
    if (step.type === 'say') {
      if (!step.speaker?.trim()) issues.push(`${at}: konuşan yok`);
      return;
    }
    if (step.type === 'choice') {
      if (!step.speaker?.trim()) issues.push(`${at}: konuşan yok`);
      if (!step.prompt?.trim()) issues.push(`${at}: görev metni yok`);
      const options = step.options;
      if (!Array.isArray(options) || options.length !== 2) {
        issues.push(`${at}: karar noktasında iki seçenek gerekli`);
      } else {
        const complete = options.every(option =>
          option?.german?.trim() && option.turkish?.trim() && option.responseGerman?.trim() && option.responseTurkish?.trim());
        if (!complete) issues.push(`${at}: seçenek ve yanıt metinleri eksik`);
        else {
          const [first, second] = options;
          if (first.german.trim().toLowerCase() === second.german.trim().toLowerCase()) issues.push(`${at}: seçenekler farklı olmalı`);
          if (first.responseGerman.trim().toLowerCase() === second.responseGerman.trim().toLowerCase()) {
            issues.push(`${at}: seçime göre yanıtlar farklı olmalı`);
          }
          if (step.voice === true) {
            const accepted = options.map(option => option.accepted);
            if (accepted.some(list => list !== undefined && (!Array.isArray(list) || list.some(text => typeof text !== 'string' || !text.trim())))) {
              issues.push(`${at}: sesli cevap alternatifleri geçerli metin olmalı`);
            } else if (overlappingCandidates(options).length > 0) {
              issues.push(`${at}: sesli cevap alternatifleri seçenekler arasında çakışmamalı`);
            }
          }
        }
      }
      // Ortak devam: karar noktasından sonra konuşma satırı gelmeli (bağlam ve "cevap replikten sonra gelir" kuralı korunur).
      if (steps[index + 1]?.type !== 'say') issues.push(`${at}: karar noktasından sonra ortak devam (konuşma satırı) gerekli`);
      if (steps[index - 1]?.type === 'choice') issues.push(`${at}: art arda iki karar noktası olamaz`);
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
