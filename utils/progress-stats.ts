import { QuizSession, Word } from '../types';
import { strictTimestamp } from './timestamps';
import { getReviewState, ReviewStateMap } from './spaced-repetition';
import type { ScenarioResult } from './learning-analysis';
import { uniqueById } from './unique';

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
 * Bir çalışma tamamlandığında yeni seri durumu. Aynı gün ikinci kez çağrılırsa null döner (seri iki kez artmaz).
 * Dün çalışıldıysa seri bir artar, aksi halde 1'den başlar. Bozuk/negatif kayıtlı seri 0 sayılır.
 */
export function nextStreakState(
  current: { streak?: number; lastStudyDate?: string },
  today: string,
  yesterday: string,
): { streak: number; lastStudyDate: string } | null {
  if (current.lastStudyDate === today) return null;
  const base = Number.isFinite(current.streak) && (current.streak as number) > 0 ? Math.floor(current.streak as number) : 0;
  return { streak: current.lastStudyDate === yesterday ? base + 1 : 1, lastStudyDate: today };
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
  /** Verilirse yalnızca bilinen kelime kimlikleri sayılır (silinmiş kelimelerin kalıntısı sayılmaz). */
  isKnownId?: (id: string) => boolean,
): number {
  const states = reviewStates ?? {};
  const learned = new Set<string>();
  for (const [id, state] of Object.entries(states)) {
    if (state?.masteryLevel === 3 && (!isKnownId || isKnownId(id))) learned.add(id);
  }
  for (const word of words ?? []) {
    if (word.isCustom && !(word.id in states) && getReviewState(word, states).masteryLevel === 3) {
      learned.add(word.id);
    }
  }
  return learned.size;
}

/**
 * Öğrenme seviyesi dağılımı: çalışılmış (inceleme kaydı olan) ve kişisel kelimeler. `counts[3]` TAM OLARAK
 * `countLearnedWords` ile aynı kümeyi sayar (aynı kurallar), bu yüzden "Öğrenilen kelime" her ekranda aynıdır.
 * Hiç çalışılmamış konu kelimeleri dağılıma girmez (binlerce "yeni" kelime anlamsız olurdu).
 * Geçersiz seviye değerleri (ör. bozuk eski veri) yok sayılır.
 */
export function masteryDistribution(
  reviewStates: ReviewStateMap | null | undefined,
  words: Word[] | null | undefined,
  isKnownId?: (id: string) => boolean,
): { counts: [number, number, number, number]; total: number } {
  const states = reviewStates ?? {};
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  const seen = new Set<string>();
  const add = (id: string, level: unknown) => {
    if (seen.has(id) || !Number.isInteger(level) || (level as number) < 0 || (level as number) > 3) return;
    seen.add(id);
    counts[level as 0 | 1 | 2 | 3] += 1;
  };
  for (const [id, state] of Object.entries(states)) {
    if (!isKnownId || isKnownId(id)) add(id, state?.masteryLevel);
  }
  for (const word of words ?? []) {
    if (word?.isCustom && !(word.id in states)) add(word.id, getReviewState(word, states).masteryLevel);
  }
  return { counts, total: counts[0] + counts[1] + counts[2] + counts[3] };
}

/**
 * TEK "tamamlanmış kayıt" tanımı (Ana Sayfa, Profil, Analiz, Başarılarım ve Günlük Görevler aynısını kullanır):
 * tamsayı puan ve toplam, toplam >= 1, 0 <= puan <= toplam ve geçerli (gelecekte olmayan) bir tarih.
 * Eksik/bozuk kayıtlar (puansız, toplamı 0, puanı toplamdan büyük, tarihsiz, çok eski ya da ileri tarihli)
 * tamamlanmış sayılmaz. Kayıtlar silinmez veya dönüştürülmez; yalnızca sayımda yok sayılır.
 */
export function isCompletedRecord(record: unknown, now: number = Date.now()): boolean {
  if (!record || typeof record !== 'object') return false;
  const { score, total, date } = record as { score?: unknown; total?: unknown; date?: unknown };
  if (!Number.isInteger(score) || !Number.isInteger(total)) return false;
  const s = score as number;
  const t = total as number;
  if (t < 1 || s < 0 || s > t) return false;
  return strictTimestamp(date, now) !== undefined;
}

/** Geçerli tamamlanmış kayıtlar, kimliğe göre tekilleştirilmiş (aynı kayıt iki kez sayılmaz). */
export function completedRecords<T extends { id?: string }>(items: readonly T[] | null | undefined, now: number = Date.now()): T[] {
  if (!Array.isArray(items)) return [];
  return uniqueById(items.filter(item => isCompletedRecord(item, now)));
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
 * - Senaryo sonuçları: özellik bayrağı açıkken bulut toplamı (`knownScenarioTotal`) bilinir; aksi halde
 *   yalnızca cihazda ve en fazla 100 tutulur, sınıra ulaştıysa exact=false.
 * Bilinmeyen kısım için sayı uydurulmaz.
 */
export function summarizeCompletedExercises(
  knownSessionTotal: number | null | undefined,
  sessions: QuizSession[] | null | undefined,
  scenarioResults: ScenarioResult[] | null | undefined,
  knownScenarioTotal?: number | null,
  now: number = Date.now(),
): ExerciseCountSummary {
  // Yalnızca geçerli, tamamlanmış ve tekilleştirilmiş kayıtlar sayılır. "Sınırda mı" kararı ham listenin
  // uzunluğuna bakar (yerel 100 kayıt sınırı ham listeye uygulanır).
  const localSessions = completedRecords(sessions, now).length;
  const localScenarios = completedRecords(scenarioResults, now).length;
  const rawSessions = uniqueById(sessions).length;
  const rawScenarios = uniqueById(scenarioResults).length;
  const sessionsKnown = typeof knownSessionTotal === 'number' && knownSessionTotal >= 0;
  const sessionCount = sessionsKnown ? Math.max(knownSessionTotal as number, localSessions) : localSessions;
  const sessionsExact = sessionsKnown || rawSessions < LOCAL_SESSION_LIMIT;
  const scenariosKnown = typeof knownScenarioTotal === 'number' && knownScenarioTotal >= 0;
  const scenarioCount = scenariosKnown ? Math.max(knownScenarioTotal as number, localScenarios) : localScenarios;
  const scenariosExact = scenariosKnown || rawScenarios < LOCAL_SCENARIO_LIMIT;
  return { count: sessionCount + scenarioCount, exact: sessionsExact && scenariosExact };
}

/** Tamamlanan alıştırma/çalışma oturumu: kayıtlı oturumlar + senaryo sonuçları. */
export function countCompletedExercises(
  sessions: QuizSession[] | null | undefined,
  scenarioResults: ScenarioResult[] | null | undefined,
  now: number = Date.now(),
): number {
  return completedRecords(sessions, now).length + completedRecords(scenarioResults, now).length;
}

/** Profil/ana sayfada kullanılan sınırlandırılmış günlük hedef. */
export function normalizeDailyGoal(goal: number | null | undefined): number {
  return typeof goal === 'number' && Number.isFinite(goal) && goal >= 1 ? Math.min(Math.floor(goal), 50) : 10;
}
