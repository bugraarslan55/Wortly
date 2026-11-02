import type { Level, QuizSession, Word } from '../types';
import type { Scenario } from '../constants/scenarios';
import {
  collectCompletedExercises, deviceDayKey, previousDayKey, type LearningSnapshot,
} from './achievements';
import {
  ANALYSIS_CATEGORIES, AnalysisCategory, analyzeLearning, readScore, ScenarioResult,
} from './learning-analysis';
import {
  completedRecords, countLearnedWords, countReviewedToday, DayKeyOf, getActiveStreak, LOCAL_SCENARIO_LIMIT, LOCAL_SESSION_LIMIT,
  masteryDistribution, normalizeDailyGoal, summarizeCompletedExercises, type ExerciseCountSummary,
} from './progress-stats';
import { scenarioHistory } from './scenario-engine';
import { getNextReviewAt, getReviewState, ReviewStateMap } from './spaced-repetition';
import { uniqueById } from './unique';

// Öğrenme raporu: Analiz ekranının tüm sayıları buradan gelir (saf; ekran, depolama, ağ yok).
//
// Her metriğin kaynağı:
// - Öğrenilen kelime  → countLearnedWords (Profil ve rozetlerle AYNI işlev ve aynı "bilinen kelime" kuralı)
// - Tekrar bekleyen   → analyzeLearning.dueWords (Ana Sayfa planıyla AYNI adaylar)
// - Seri              → getActiveStreak (Ana Sayfa ve Profil ile aynı)
// - Günlük hedef      → countReviewedToday + normalizeDailyGoal (Ana Sayfa halkasıyla aynı)
// - Tamamlanan alıştırma → summarizeCompletedExercises (Profil ile aynı; kimliğe göre tekilleştirilmiş)
// - Haftalık etkinlik → collectCompletedExercises (günlük görevler ve rozetlerle aynı: tekilleştirilmiş,
//                       geçerli puanlı, gelecek tarihli kayıtlar atılmış), yerel gün sınırıyla
// Kaynağı olmayan metrik gösterilmez: örn. kelime başına günlük tekrar geçmişi tutulmadığı için "günde kaç
// farklı kelime çalışıldı" geçmişi hesaplanamaz.

export const WEEK_DAYS = 7;
export const WEAK_SCENARIO_BELOW = 80;
export const MIN_ANSWERS_FOR_RATE = 5;

export interface ReportInput {
  now: number;
  dayKey?: DayKeyOf;
  level: Level;
  profile: { streak?: number; lastStudyDate?: string; dailyGoal?: number } | null | undefined;
  sessions: QuizSession[] | null | undefined;
  scenarioResults: ScenarioResult[] | null | undefined;
  reviewStates: ReviewStateMap | null | undefined;
  /** Mağazadaki tüm kelimeler (kişisel kelimeler dahil). */
  words: Word[] | null | undefined;
  /** Tekrar adayları: kullanıcının seviyesindeki konu kelimeleri + kişisel kelimeler (Ana Sayfa ile aynı). */
  candidates: Word[];
  isKnownWordId?: (id: string) => boolean;
  /** Buluttan bilinen gerçek oturum toplamı (varsa). */
  knownSessionTotal?: number | null;
  scenarios: readonly Scenario[];
}

export interface DayActivity {
  dayKey: string;
  /** 0 = Pazar … 6 = Cumartesi (yerel takvim). */
  weekday: number;
  exercises: number;
  isToday: boolean;
}

export interface WeeklyActivity {
  days: DayActivity[];
  total: number;
  previousTotal: number;
  /** Önceki 7 günlük pencere eksiksiz değilse (yerel kayıt sınırı) karşılaştırma yapılmaz. */
  comparison: { current: number; previous: number; delta: number } | null;
  /** Yerel kayıt sınırı yüzünden son 7 günün bir kısmı eksik olabilir. */
  mayBeIncomplete: boolean;
  /** Son 7 günde hiç kayıt yok. */
  empty: boolean;
}

export interface DueWordInfo {
  id: string;
  german: string;
  article: string;
  turkish: string;
  masteryLevel: number;
  overdueDays: number;
  isCustom: boolean;
  topicId?: string;
}

export interface TypeRow {
  type: string;
  label: string;
  sessions: number;
  correct: number;
  total: number;
  /** Yeterli cevap yoksa null. */
  rate: number | null;
}

export interface ScenarioRow {
  id: string;
  title: string;
  level: Level;
  attempts: number;
  bestPercent: number;
  lastPercent: number;
}

export interface LevelProgress {
  level: Level;
  locked: boolean;
  completed: number;
  total: number;
}

export interface LearningReport {
  overview: {
    learned: number;
    dueCount: number;
    streak: number;
    completed: ExerciseCountSummary;
    scenariosCompleted: number;
    scenarioTotal: number;
    goal: { done: number; target: number; reached: boolean };
    hasAnyData: boolean;
  };
  activity: WeeklyActivity;
  mastery: { counts: [number, number, number, number]; total: number };
  dueWords: DueWordInfo[];
  exercises: {
    rows: TypeRow[];
    flashcardSessions: number;
    correct: number;
    total: number;
    wrong: number;
    /** Doğrulanmış (flashcard hariç) alıştırmalardaki başarı; yeterli cevap yoksa null. */
    successRate: number | null;
    weakestCategory: AnalysisCategory | null;
    categoryRates: Record<AnalysisCategory, { rate: number | null; total: number }>;
  };
  scenarios: {
    attempts: number;
    uniqueCompleted: number;
    averagePercent: number | null;
    best: ScenarioRow[];
    needsWork: ScenarioRow[];
    byLevel: LevelProgress[];
  };
}

const TYPE_LABELS: Record<string, string> = {
  'dinle-sec': 'Dinle ve Seç',
  'dinle-yaz': 'Dinle ve Yaz',
  yazma: 'Yazarak Tekrar',
  cumle: 'Cümle Yazma',
  'dogru-yanlis': 'Doğru / Yanlış',
};
const SCORED_TYPES = Object.keys(TYPE_LABELS);

const DAY_MS = 24 * 60 * 60 * 1000;
const LEVELS: Level[] = ['A1', 'A2', 'B1'];

const percent = (correct: number, total: number): number | null =>
  total > 0 ? Math.round((correct / total) * 100) : null;

function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y!, m! - 1, d!).getDay();
}

function lastDays(today: string, count: number): string[] {
  const keys = [today];
  while (keys.length < count) keys.push(previousDayKey(keys[keys.length - 1]!));
  return keys; // en yeniden en eskiye
}

export type ReportAvailability = 'signed-out' | 'loading' | 'ready';

/**
 * Rapor ne zaman gösterilebilir? Oturum yoksa kişisel veri gösterilmez ('signed-out'). Yerel veriler
 * yüklenmemişse veya bu kullanıcı için eşitleme tamamlanmamışsa (ör. hesap değişimi sırasında önceki
 * hesabın kalıntısı bellekte olabilir) 'loading'. Yalnızca üç kaynak da bu kullanıcıyı işaret edince 'ready'.
 */
export function reportAvailability(input: {
  userId: string | null | undefined;
  localLoaded: boolean;
  profileSyncedUserId: string | null | undefined;
  wordsSyncedUserId: string | null | undefined;
  sessionsSyncedUserId: string | null | undefined;
}): ReportAvailability {
  if (!input.userId) return 'signed-out';
  if (!input.localLoaded) return 'loading';
  const { userId } = input;
  return input.profileSyncedUserId === userId && input.wordsSyncedUserId === userId && input.sessionsSyncedUserId === userId
    ? 'ready'
    : 'loading';
}

export function buildLearningReport(input: ReportInput): LearningReport {
  const { now, level } = input;
  const dayOf = input.dayKey ?? deviceDayKey;
  // TEK tamamlanmış kayıt tanımı (tüm ekranlarla aynı): geçerli puan/tarih, kimliğe göre tekilleştirilmiş.
  const sessions = completedRecords(input.sessions, now);
  const scenarioResults = completedRecords(input.scenarioResults, now);
  const rawSessions = uniqueById(input.sessions);
  const rawScenarios = uniqueById(input.scenarioResults);
  const reviewStates = input.reviewStates ?? {};
  const words = input.words ?? [];

  const snapshot: LearningSnapshot = {
    now,
    sessions,
    scenarioResults,
    reviewStates,
    words,
    profile: input.profile,
    dayKey: dayOf,
    isKnownWordId: input.isKnownWordId,
  };

  // ── Ortak hesaplamalar (diğer ekranlarla aynı işlevler)
  const analysis = analyzeLearning({
    sessions, words: input.candidates, reviewStates, scenarioResults, dailyGoal: input.profile?.dailyGoal, now,
  });
  const learned = countLearnedWords(reviewStates, words, input.isKnownWordId);
  const streak = getActiveStreak(input.profile?.streak, input.profile?.lastStudyDate, new Date(now));
  const goalTarget = normalizeDailyGoal(input.profile?.dailyGoal);
  const goalDone = countReviewedToday(reviewStates, words, new Date(now), dayOf);
  const completed = summarizeCompletedExercises(input.knownSessionTotal, input.sessions, input.scenarioResults, now);

  // ── Haftalık etkinlik
  const completedExercises = collectCompletedExercises(snapshot);
  const perDay = new Map<string, number>();
  for (const exercise of completedExercises) perDay.set(exercise.dayKey, (perDay.get(exercise.dayKey) ?? 0) + 1);
  const today = dayOf(now);
  const keys = lastDays(today, WEEK_DAYS * 2);
  const thisWeekKeys = keys.slice(0, WEEK_DAYS);
  const days: DayActivity[] = thisWeekKeys
    .map(dayKey => ({ dayKey, weekday: weekdayOf(dayKey), exercises: perDay.get(dayKey) ?? 0, isToday: dayKey === today }))
    .reverse(); // eskiden yeniye (soldan sağa)
  const total = days.reduce((sum, day) => sum + day.exercises, 0);
  const previousTotal = keys.slice(WEEK_DAYS).reduce((sum, key) => sum + (perDay.get(key) ?? 0), 0);

  // Yerel kayıtlar en çok 100 tane tutulur. Liste sınıra dayandıysa ve en eski kaydı pencereden yeniyse,
  // pencerenin eski kısmı eksik olabilir.
  const windowStart = keys[WEEK_DAYS * 2 - 1]!;
  const oldestKey = (items: readonly { date?: number }[]) => {
    const stamps = items.map(item => item.date).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return stamps.length ? dayOf(Math.min(...stamps)) : null;
  };
  const truncated = (items: readonly { date?: number }[], limit: number) => {
    if (items.length < limit) return false;
    const oldest = oldestKey(items);
    return oldest !== null && oldest > windowStart;
  };
  const dataTruncated = truncated(rawSessions, LOCAL_SESSION_LIMIT) || truncated(rawScenarios, LOCAL_SCENARIO_LIMIT);
  const weekStart = thisWeekKeys[WEEK_DAYS - 1]!;
  const weekTruncated = (items: readonly { date?: number }[], limit: number) => {
    if (items.length < limit) return false;
    const oldest = oldestKey(items);
    return oldest !== null && oldest > weekStart;
  };
  const mayBeIncomplete = weekTruncated(rawSessions, LOCAL_SESSION_LIMIT) || weekTruncated(rawScenarios, LOCAL_SCENARIO_LIMIT);

  const activity: WeeklyActivity = {
    days,
    total,
    previousTotal,
    comparison: dataTruncated ? null : { current: total, previous: previousTotal, delta: total - previousTotal },
    mayBeIncomplete,
    empty: total === 0,
  };

  // ── Kelime dağılımı ve tekrar bekleyenler
  const mastery = masteryDistribution(reviewStates, words, input.isKnownWordId);
  const dueWords: DueWordInfo[] = analysis.dueWords.slice(0, 5).map(word => {
    const state = getReviewState(word, reviewStates);
    return {
      id: word.id,
      german: word.german,
      article: word.article,
      turkish: word.turkish,
      masteryLevel: state.masteryLevel,
      overdueDays: Math.max(0, Math.floor((now - getNextReviewAt(state)) / DAY_MS)),
      isCustom: !!word.isCustom,
      topicId: word.topicId,
    };
  });

  // ── Alıştırma performansı (flashcard başarıya girmez)
  const rows: TypeRow[] = SCORED_TYPES.map(type => ({ type, label: TYPE_LABELS[type]!, sessions: 0, correct: 0, total: 0, rate: null }));
  let flashcardSessions = 0;
  for (const session of sessions) {
    if (!session) continue;
    if (session.type === 'flashcard') { flashcardSessions += 1; continue; }
    const row = rows.find(item => item.type === session.type);
    const score = readScore(session.score, session.total);
    if (!row || !score) continue;
    row.sessions += 1;
    row.correct += score.correct;
    row.total += score.total;
  }
  for (const row of rows) row.rate = row.total >= MIN_ANSWERS_FOR_RATE ? percent(row.correct, row.total) : null;
  const exCorrect = rows.reduce((sum, row) => sum + row.correct, 0);
  const exTotal = rows.reduce((sum, row) => sum + row.total, 0);
  const categoryRates = Object.fromEntries(
    ANALYSIS_CATEGORIES.map(category => {
      const stat = analysis.categoryStats.find(item => item.category === category);
      return [category, { rate: stat && stat.total >= MIN_ANSWERS_FOR_RATE ? stat.successRate : null, total: stat?.total ?? 0 }];
    }),
  ) as Record<AnalysisCategory, { rate: number | null; total: number }>;

  // ── Senaryo performansı
  const rowsByScenario: ScenarioRow[] = [];
  for (const scenario of input.scenarios) {
    const history = scenarioHistory(scenarioResults, scenario.id);
    if (!history) continue;
    rowsByScenario.push({
      id: scenario.id, title: scenario.title, level: scenario.level,
      attempts: history.attempts, bestPercent: history.bestPercent, lastPercent: history.lastPercent,
    });
  }
  const attempts = rowsByScenario.reduce((sum, row) => sum + row.attempts, 0);
  const averagePercent = rowsByScenario.length
    ? Math.round(rowsByScenario.reduce((sum, row) => sum + row.bestPercent, 0) / rowsByScenario.length)
    : null;
  const byLevel: LevelProgress[] = LEVELS.map(lv => {
    const all = input.scenarios.filter(scenario => scenario.level === lv);
    return {
      level: lv,
      locked: LEVELS.indexOf(lv) > LEVELS.indexOf(level),
      completed: rowsByScenario.filter(row => row.level === lv).length,
      total: all.length,
    };
  });

  return {
    overview: {
      learned,
      dueCount: analysis.dueWords.length,
      streak,
      completed,
      scenariosCompleted: rowsByScenario.length,
      scenarioTotal: input.scenarios.length,
      goal: { done: goalDone, target: goalTarget, reached: goalDone >= goalTarget },
      hasAnyData: completed.count > 0 || mastery.total > 0,
    },
    activity,
    mastery,
    dueWords,
    exercises: {
      rows,
      flashcardSessions,
      correct: exCorrect,
      total: exTotal,
      wrong: exTotal - exCorrect,
      successRate: exTotal >= MIN_ANSWERS_FOR_RATE ? percent(exCorrect, exTotal) : null,
      weakestCategory: analysis.weakestCategory,
      categoryRates,
    },
    scenarios: {
      attempts,
      uniqueCompleted: rowsByScenario.length,
      averagePercent,
      best: [...rowsByScenario].sort((a, b) => b.bestPercent - a.bestPercent || b.attempts - a.attempts).slice(0, 3),
      needsWork: rowsByScenario
        .filter(row => row.bestPercent < WEAK_SCENARIO_BELOW)
        .sort((a, b) => a.bestPercent - b.bestPercent)
        .slice(0, 3),
      byLevel,
    },
  };
}
