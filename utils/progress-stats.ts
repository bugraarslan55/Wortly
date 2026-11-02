import { QuizSession, Word } from '../types';
import { strictTimestamp } from './timestamps';
import { getReviewState, ReviewStateMap } from './spaced-repetition';
import { ScenarioResult } from './learning-analysis';

// Ana Sayfa ve Profil aynı gerçek veriyi buradan okur. Saf fonksiyonlardır:
// depolama veya ağ bağımlılığı yoktur, eksik veri sıfır/boş sonuç verir.

export const DAILY_GOAL_OPTIONS = [5, 10, 15, 20] as const;

/** Cihazın yerel takvimine göre YYYY-MM-DD (UTC değil: gece yarısı sonrası gün doğru değişir). */
export function toLocalDateKey(date: Date | number = new Date()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function previousLocalDateKey(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return toLocalDateKey(d);
}

/**
 * Gösterilecek seri: son çalışma bugün ya da dündense kayıtlı seri, daha eskiyse 0.
 * (Kayıtlı değer yalnızca çalışma yapıldığında güncellendiği için bayat kalabilir.)
 */
export function getActiveStreak(
  streak: number | undefined,
  lastStudyDate: string | undefined,
  now: Date = new Date(),
): number {
  if (!streak || streak < 0 || !lastStudyDate) return 0;
  return lastStudyDate === toLocalDateKey(now) || lastStudyDate === previousLocalDateKey(now)
    ? streak
    : 0;
}

/** Bir zaman damgasının hangi takvim gününe düştüğünü söyleyen işlev (varsayılan: cihaz yerel günü). */
export type DayKeyOf = (ms: number) => string;

/**
 * Bugün en az bir kez tekrar edilen benzersiz kelime sayısı (konu ve kişisel kelimeler).
 * Ana Sayfa günlük hedef halkası ve Günlük Görevler AYNI işlevi ve AYNI gün tanımını kullanır
 * (`dayKeyOf`: varsayılan cihaz yerel günü; Türkiye'de yerel gün Türkiye günüdür). Geçersiz veya
 * ileri tarihli damgalar yok sayılır (`strictTimestamp`); bozuk kayıt bugünün ilerlemesi sayılmaz.
 */
export function countReviewedToday(
  reviewStates: ReviewStateMap | null | undefined,
  words: Word[] | null | undefined,
  now: Date = new Date(),
  dayKeyOf: DayKeyOf = toLocalDateKey,
): number {
  const nowMs = now.getTime();
  const today = dayKeyOf(nowMs);
  const seen = new Set<string>();
  for (const [id, state] of Object.entries(reviewStates ?? {})) {
    const ts = strictTimestamp(state?.lastReviewed, nowMs);
    if (ts !== undefined && dayKeyOf(ts) === today) seen.add(id);
  }
  // Başka cihazda çalışılan kişisel kelimeler buluttan lastReviewed ile gelir.
  for (const word of words ?? []) {
    if (!word?.isCustom) continue;
    const ts = strictTimestamp(word.lastReviewed, nowMs);
    if (ts !== undefined && dayKeyOf(ts) === today) seen.add(word.id);
  }
  return seen.size;
}

/** "Öğrenildi" (mastery 3) düzeyine ulaşmış benzersiz kelime sayısı. */
export function countLearnedWords(
  reviewStates: ReviewStateMap | null | undefined,
  words: Word[] | null | undefined,
): number {
  const states = reviewStates ?? {};
  const learned = new Set<string>();
  for (const [id, state] of Object.entries(states)) {
    if (state?.masteryLevel === 3) learned.add(id);
  }
  for (const word of words ?? []) {
    if (word.isCustom && !(word.id in states) && getReviewState(word, states).masteryLevel === 3) {
      learned.add(word.id);
    }
  }
  return learned.size;
}

/** Cihazda tutulan en fazla oturum / senaryo sonucu sayısı (yerel liste sınırı). */
export const LOCAL_SESSION_LIMIT = 100;
export const LOCAL_SCENARIO_LIMIT = 100;

export interface ExerciseCountSummary {
  count: number;
  /** false ise gerçek toplam gösterilen sayıdan büyük olabilir ("N+" biçiminde gösterilmeli). */
  exact: boolean;
}

/**
 * Tamamlanan alıştırma toplamı.
 * - Oturumlar: buluttan okunan gerçek toplam (`knownSessionTotal`) biliniyorsa o; bilinmiyorsa
 *   yerel liste, ve liste sınıra ulaştıysa "en az" (exact=false).
 * - Senaryo sonuçları yalnızca cihazda ve en fazla 100 tutulur; sınıra ulaştıysa exact=false.
 * Bilinmeyen kısım için sayı uydurulmaz.
 */
export function summarizeCompletedExercises(
  knownSessionTotal: number | null | undefined,
  sessions: QuizSession[] | null | undefined,
  scenarioResults: ScenarioResult[] | null | undefined,
): ExerciseCountSummary {
  const localSessions = Array.isArray(sessions) ? sessions.length : 0;
  const localScenarios = Array.isArray(scenarioResults) ? scenarioResults.length : 0;
  const sessionsKnown = typeof knownSessionTotal === 'number' && knownSessionTotal >= 0;
  const sessionCount = sessionsKnown ? Math.max(knownSessionTotal as number, localSessions) : localSessions;
  const sessionsExact = sessionsKnown || localSessions < LOCAL_SESSION_LIMIT;
  const scenariosExact = localScenarios < LOCAL_SCENARIO_LIMIT;
  return { count: sessionCount + localScenarios, exact: sessionsExact && scenariosExact };
}

/** Tamamlanan alıştırma/çalışma oturumu: kayıtlı oturumlar + senaryo sonuçları. */
export function countCompletedExercises(
  sessions: QuizSession[] | null | undefined,
  scenarioResults: ScenarioResult[] | null | undefined,
): number {
  return (Array.isArray(sessions) ? sessions.length : 0)
    + (Array.isArray(scenarioResults) ? scenarioResults.length : 0);
}

/** Profil/ana sayfada kullanılan sınırlandırılmış günlük hedef. */
export function normalizeDailyGoal(goal: number | null | undefined): number {
  return typeof goal === 'number' && Number.isFinite(goal) && goal >= 1 ? Math.min(Math.floor(goal), 50) : 10;
}
