import { ExerciseType, QuizSession, Word } from '../types';
import { getNextReviewAt, getReviewState, ReviewStateMap } from './spaced-repetition';

// Saf analiz fonksiyonları: ekran, depolama veya ağ bağımlılığı yoktur.
// Eksik/bozuk veri hata fırlatmaz; boş ve güvenli sonuç döndürülür.

export type AnalysisCategory = 'dinleme' | 'yazma' | 'dogru-yanlis' | 'senaryo';

export const ANALYSIS_CATEGORIES: AnalysisCategory[] = ['dinleme', 'yazma', 'dogru-yanlis', 'senaryo'];

// Flashcard puanı kullanıcının kendi "biliyorum" işaretidir, doğrulanmış bir başarı
// değildir; bu yüzden başarı hesaplarına girmez (yalnızca toplam çalışma sayısına girer).
// 'bosluk' mevcut akışlarda kullanılmıyor, kategoriye atanmaz.
const CATEGORY_BY_EXERCISE: Partial<Record<ExerciseType, AnalysisCategory>> = {
  'dinle-sec': 'dinleme',
  'dinle-yaz': 'dinleme',
  yazma: 'yazma',
  cumle: 'yazma',
  'dogru-yanlis': 'dogru-yanlis',
};

/** Senaryo sonuçları, çağıran tarafın sağladığı ayrı kayıtlar olarak analiz edilir. */
export interface ScenarioResult {
  id?: string;
  scenarioId?: string;
  date?: number;
  score: number;
  total: number;
}

export interface CategoryStats {
  category: AnalysisCategory;
  /** Bu kategoriye ait geçerli çalışma sayısı. */
  sessions: number;
  correct: number;
  total: number;
  /** 0-100 tam sayı; veri yoksa null. */
  successRate: number | null;
}

export interface DailyPlan {
  /** Bugün çalışılması önerilen kelime sayısı. */
  wordCount: number;
  /** Önerilen alıştırma (oturum) sayısı. */
  exerciseCount: number;
  /** Ağırlık verilmesi önerilen alan; yeterli veri yoksa null. */
  focusCategory: AnalysisCategory | null;
  reason: 'due-words' | 'weak-category' | 'default';
}

export interface LearningAnalysis {
  totalSessions: number;
  overallSuccessRate: number | null;
  categoryStats: CategoryStats[];
  dueWords: Word[];
  weakestCategory: AnalysisCategory | null;
  dailyPlan: DailyPlan;
}

export interface LearningAnalysisInput {
  sessions?: QuizSession[] | null;
  words?: Word[] | null;
  reviewStates?: ReviewStateMap | null;
  scenarioResults?: ScenarioResult[] | null;
  dailyGoal?: number | null;
  now?: number;
}

/** En zayıf alan kararı için bir kategoride en az bu kadar cevap gerekir. */
export const MIN_ANSWERS_FOR_WEAKEST = 5;
export const DEFAULT_DAILY_GOAL = 10;
export const WORDS_PER_EXERCISE = 10;
const MAX_DAILY_GOAL = 50;
const MAX_EXERCISES = 5;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Geçerli bir sonuçsa [doğru, toplam] döndürür; bozuk veride null. */
function readScore(score: unknown, total: unknown): { correct: number; total: number } | null {
  if (!isCount(score) || !isCount(total) || total <= 0) return null;
  return { correct: Math.min(score, total), total };
}

const toPercent = (correct: number, total: number): number | null =>
  total > 0 ? Math.round((correct / total) * 100) : null;

export function countStudySessions(sessions?: QuizSession[] | null): number {
  return Array.isArray(sessions) ? sessions.length : 0;
}

export function calculateCategoryStats(
  sessions?: QuizSession[] | null,
  scenarioResults?: ScenarioResult[] | null,
): CategoryStats[] {
  const acc = new Map<AnalysisCategory, { sessions: number; correct: number; total: number }>(
    ANALYSIS_CATEGORIES.map(category => [category, { sessions: 0, correct: 0, total: 0 }]),
  );

  const add = (category: AnalysisCategory, score: unknown, total: unknown) => {
    const result = readScore(score, total);
    const entry = acc.get(category);
    if (!result || !entry) return;
    entry.sessions += 1;
    entry.correct += result.correct;
    entry.total += result.total;
  };

  for (const session of Array.isArray(sessions) ? sessions : []) {
    const category = session ? CATEGORY_BY_EXERCISE[session.type] : undefined;
    if (category) add(category, session.score, session.total);
  }
  for (const result of Array.isArray(scenarioResults) ? scenarioResults : []) {
    if (result) add('senaryo', result.score, result.total);
  }

  return ANALYSIS_CATEGORIES.map(category => {
    const entry = acc.get(category) ?? { sessions: 0, correct: 0, total: 0 };
    return { category, ...entry, successRate: toPercent(entry.correct, entry.total) };
  });
}

/** Tüm kategorilerdeki doğru/toplam cevaptan genel yüzde; veri yoksa null. */
export function calculateOverallSuccessRate(
  sessions?: QuizSession[] | null,
  scenarioResults?: ScenarioResult[] | null,
): number | null {
  const stats = calculateCategoryStats(sessions, scenarioResults);
  const correct = stats.reduce((sum, item) => sum + item.correct, 0);
  const total = stats.reduce((sum, item) => sum + item.total, 0);
  return toPercent(correct, total);
}

/**
 * Daha önce çalışılmış ve tekrar zamanı gelmiş kelimeler, en çok gecikenden başlayarak.
 * Hiç çalışılmamış kelimeler "tekrar" sayılmaz (ana ekrandaki tekrar kartıyla aynı kural).
 */
export function findDueWords(
  words?: Word[] | null,
  reviewStates?: ReviewStateMap | null,
  now: number = Date.now(),
): Word[] {
  if (!Array.isArray(words)) return [];
  const states = reviewStates ?? {};
  const unique = Array.from(new Map(words.filter(Boolean).map(word => [word.id, word])).values());

  return unique
    .map(word => ({ word, state: getReviewState(word, states) }))
    .filter(({ state }) => Boolean(state.lastReviewed) && getNextReviewAt(state) <= now)
    .sort((a, b) => getNextReviewAt(a.state) - getNextReviewAt(b.state))
    .map(({ word }) => word);
}

/**
 * Yeterli cevabı olan kategoriler arasında başarısı en düşük olan; eşitlikte cevabı
 * daha çok olan, o da eşitse sabit kategori sırası. Yeterli veri yoksa null.
 */
export function findWeakestCategory(
  stats: CategoryStats[],
  minAnswers: number = MIN_ANSWERS_FOR_WEAKEST,
): AnalysisCategory | null {
  const candidates = (Array.isArray(stats) ? stats : []).filter(
    item => item.successRate !== null && item.total >= minAnswers,
  );
  if (candidates.length === 0) return null;

  const weakest = candidates.reduce((best, item) => {
    const itemRate = item.successRate ?? 100;
    const bestRate = best.successRate ?? 100;
    if (itemRate !== bestRate) return itemRate < bestRate ? item : best;
    return item.total > best.total ? item : best;
  });
  return weakest.category;
}

const sanitizeGoal = (goal: number | null | undefined): number =>
  isCount(goal) && goal >= 1 ? Math.min(Math.floor(goal), MAX_DAILY_GOAL) : DEFAULT_DAILY_GOAL;

/**
 * Önerilen günlük plan:
 * - Bekleyen tekrar yoksa kelime sayısı günlük hedeftir.
 * - Tekrar varsa hedefin yarısı ile iki katı arasında, bekleyen kadar kelime önerilir.
 * - Alıştırma sayısı her 10 kelime için bir oturumdur (1-5 arası).
 */
export function recommendDailyPlan(
  dueCount: number,
  weakestCategory: AnalysisCategory | null,
  dailyGoal?: number | null,
): DailyPlan {
  const goal = sanitizeGoal(dailyGoal);
  const due = isCount(dueCount) ? Math.floor(dueCount) : 0;

  const wordCount = due > 0
    ? Math.min(Math.max(due, Math.ceil(goal / 2)), goal * 2)
    : goal;
  const exerciseCount = Math.min(MAX_EXERCISES, Math.max(1, Math.ceil(wordCount / WORDS_PER_EXERCISE)));

  return {
    wordCount,
    exerciseCount,
    focusCategory: weakestCategory,
    reason: due > 0 ? 'due-words' : weakestCategory ? 'weak-category' : 'default',
  };
}

export function analyzeLearning(input: LearningAnalysisInput = {}): LearningAnalysis {
  const { sessions, words, reviewStates, scenarioResults, dailyGoal, now } = input;

  const categoryStats = calculateCategoryStats(sessions, scenarioResults);
  const dueWords = findDueWords(words, reviewStates, now);
  const weakestCategory = findWeakestCategory(categoryStats);

  return {
    totalSessions: countStudySessions(sessions) + (Array.isArray(scenarioResults) ? scenarioResults.length : 0),
    overallSuccessRate: calculateOverallSuccessRate(sessions, scenarioResults),
    categoryStats,
    dueWords,
    weakestCategory,
    dailyPlan: recommendDailyPlan(dueWords.length, weakestCategory, dailyGoal),
  };
}
