import type { QuizSession, Word } from '../types';
import type { ScenarioResult } from './learning-analysis';
import { strictTimestamp } from './timestamps';
import {
  countLearnedWords, countReviewedToday, getActiveStreak, toLocalDateKey,
} from './progress-stats';
import type { DayKeyOf } from './progress-stats';
import type { ReviewStateMap } from './spaced-repetition';

// Günlük görevler ve başarı rozetleri: yalnızca MEVCUT yerel öğrenme verisinden hesaplanan saf mantık.
// Yeni bir Supabase tablosu veya ayrı görev kaydı yoktur. Görev ilerlemesi her seferinde şu verilerden
// yeniden hesaplanır: çalışma oturumları, senaryo sonuçları, reviewStates (kelime tekrarları), profil serisi.
//
// GÜN TANIMI (tek ve ortak): kullanıcının CİHAZ YEREL takvim günü. Ana Sayfa günlük hedef halkası,
// günlük seri (profil), Günlük Görevler ve rozetler hep aynı tanımı kullanır. Türkiye'deki cihazlarda yerel
// gün Türkiye günüdür (UTC+3, yaz saati yok). Başka saat dilimindeki kullanıcının çalışması kendi
// takvim gününe yazılır; sabit bir saat dilimine kaydırılmaz. Kayıtlı zaman damgaları değiştirilmez;
// yalnızca hesaplama sırasında güne çevrilir.
//
// Dürüst sınırlar:
// - Veriler cihazda/hesapta olanla sınırlıdır; senkronize olmayan başka cihazdaki çalışma görünmez.
// - Yerel oturum listesi en çok 100 kayıt tutar; "bugün" hesapları bugünün kayıtlarına dayandığı için
//   bundan etkilenmez, ama geçmişe dönük seri kanıtı bununla sınırlıdır.

// ─── Gün hesabı ─────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** Verilen UTC farkına (dakika) göre gün anahtarı üreten işlev. Testler ve belirli bir bölge için. */
export function dayKeyForOffset(utcOffsetMinutes: number): DayKeyOf {
  return (ms: number) => new Date(ms + utcOffsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

/** Türkiye sabit UTC+3 kullanır; yalnızca testlerde/örneklerde başvuru olarak kullanılır. */
export const TURKEY_DAY_KEY: DayKeyOf = dayKeyForOffset(180);

/** Cihaz yerel gün anahtarı (uygulamanın varsayılanı). */
export const deviceDayKey: DayKeyOf = (ms) => toLocalDateKey(ms);

/** Verilen UTC farkına göre bir sonraki gece yarısı (00:00) zaman damgası. */
export function nextMidnightForOffset(now: number, utcOffsetMinutes: number): number {
  const offset = utcOffsetMinutes * 60 * 1000;
  return (Math.floor((now + offset) / DAY_MS) + 1) * DAY_MS - offset;
}

/** Cihaz yerel saatine göre bir sonraki gece yarısı. */
export function nextDeviceMidnight(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
}

function previousDayKey(key: string): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

// ─── Ortak girdi ve temizleme ───────────────────────────────────────────────

/** Başarı yüzdesinin güvenilir sayılması için gereken en az soru sayısı (1-2 soruluk tekrar turları sayılmaz). */
export const MIN_QUESTIONS_FOR_SUCCESS = 5;
export const SUCCESS_THRESHOLD = 0.8;

export interface LearningSnapshot {
  now: number;
  sessions: QuizSession[] | null | undefined;
  scenarioResults: ScenarioResult[] | null | undefined;
  reviewStates: ReviewStateMap | null | undefined;
  words: Word[] | null | undefined;
  profile: { streak?: number; lastStudyDate?: string } | null | undefined;
  /** Bulutta kayıtlı toplam oturum sayısı biliniyorsa (yerel liste 100 ile sınırlı olduğu için). */
  knownSessionTotal?: number | null;
  /** Gün tanımı; verilmezse cihaz yerel günü. */
  dayKey?: DayKeyOf;
}

const keyOf = (snapshot: LearningSnapshot): DayKeyOf => snapshot.dayKey ?? deviceDayKey;

interface CompletedExercise {
  id: string;
  dayKey: string;
  score: number;
  total: number;
  /** Flashcard sonucu kullanıcının kendi işaretidir; başarı hesaplarına girmez. */
  verified: boolean;
}

/** Bozuk/eksik kayıtları eler: sayı, tarih ve puan tutarlılığı doğrulanır; aynı kayıt iki kez sayılmaz. */
export function collectCompletedExercises(snapshot: LearningSnapshot): CompletedExercise[] {
  const { now } = snapshot;
  const dayOf = keyOf(snapshot);
  const seen = new Set<string>();
  const out: CompletedExercise[] = [];

  const add = (id: string | undefined, date: unknown, score: unknown, total: unknown, verified: boolean) => {
    const timestamp = strictTimestamp(date, now);
    if (timestamp === undefined) return;
    if (!Number.isInteger(score) || !Number.isInteger(total)) return;
    const s = score as number;
    const t = total as number;
    if (t < 1 || s < 0 || s > t) return;
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    out.push({ id: id ?? `anon-${out.length}`, dayKey: dayOf(timestamp), score: s, total: t, verified });
  };

  for (const session of Array.isArray(snapshot.sessions) ? snapshot.sessions : []) {
    if (!session) continue;
    add(`s:${session.id}`, session.date, session.score, session.total, session.type !== 'flashcard');
  }
  for (const result of Array.isArray(snapshot.scenarioResults) ? snapshot.scenarioResults : []) {
    if (!result) continue;
    add(result.id ? `r:${result.id}` : undefined, result.date, result.score, result.total, true);
  }
  return out;
}

const qualifiesForSuccess = (exercise: CompletedExercise, rate: number) =>
  exercise.verified && exercise.total >= MIN_QUESTIONS_FOR_SUCCESS && exercise.score / exercise.total >= rate;

/** Bugün cevaplanan FARKLI kelime sayısı. Ana Sayfa halkasıyla aynı işlevi kullanır (tek tanım). */
export function countDistinctWordsToday(snapshot: LearningSnapshot): number {
  return countReviewedToday(snapshot.reviewStates, snapshot.words, new Date(snapshot.now), keyOf(snapshot));
}

// ─── Günlük görevler ────────────────────────────────────────────────────────

export interface DailyTask {
  id: 'words' | 'exercises' | 'accuracy';
  icon: string;
  title: string;
  description: string;
  current: number;
  target: number;
  completed: boolean;
  /** İlerlemeyi açıklayan ek bilgi (ör. bugünkü en iyi sonuç); yoksa boş. */
  detail: string;
}

export const DAILY_TASK_TARGETS = { words: 5, exercises: 2, accuracy: 1 } as const;

export function computeDailyTasks(snapshot: LearningSnapshot): DailyTask[] {
  const today = keyOf(snapshot)(snapshot.now);
  const exercises = collectCompletedExercises(snapshot).filter(e => e.dayKey === today);

  const wordsToday = countDistinctWordsToday(snapshot);
  const completedToday = exercises.length;
  const verifiedToday = exercises.filter(e => e.verified && e.total >= MIN_QUESTIONS_FOR_SUCCESS);
  const bestRate = verifiedToday.length
    ? Math.max(...verifiedToday.map(e => e.score / e.total))
    : null;
  const successCount = exercises.filter(e => qualifiesForSuccess(e, SUCCESS_THRESHOLD)).length;

  const build = (
    id: DailyTask['id'], icon: string, title: string, description: string,
    current: number, target: number, detail = '',
  ): DailyTask => ({
    id, icon, title, description, current: Math.min(current, target), target, completed: current >= target, detail,
  });

  return [
    build('words', 'text.book.closed.fill', 'Bugün 5 farklı kelime çalış',
      'Bugün cevapladığın farklı kelimeler sayılır. Aynı kelimeyi tekrar etmek sayıyı artırmaz.',
      wordsToday, DAILY_TASK_TARGETS.words),
    build('exercises', 'checkmark.circle.fill', 'Bugün 2 alıştırma tamamla',
      'Bugün bitirdiğin ve sonucu kaydedilen alıştırmalar sayılır (flashcard ve senaryolar dahil).',
      completedToday, DAILY_TASK_TARGETS.exercises),
    build('accuracy', 'trophy.fill', 'Bir alıştırmada %80 başarı',
      `En az ${MIN_QUESTIONS_FOR_SUCCESS} soruluk bir alıştırmada %80 veya üzeri. Flashcard sayılmaz (sonucu kendi değerlendirmendir).`,
      successCount, DAILY_TASK_TARGETS.accuracy,
      bestRate === null ? '' : `Bugünkü en iyi sonuç: %${Math.floor(bestRate * 100)}`),
  ];
}

// ─── Çalışma günü serisi (oturum geçmişinden) ───────────────────────────────

/**
 * Oturum/senaryo geçmişinden kanıtlanabilir güncel seri: bugünden (veya bugün çalışılmadıysa dünden)
 * geriye doğru, her günde en az bir tamamlanmış alıştırma bulunan ardışık gün sayısı.
 */
export function computeHistoryStreak(snapshot: LearningSnapshot): number {
  const days = new Set(collectCompletedExercises(snapshot).map(e => e.dayKey));
  const today = keyOf(snapshot)(snapshot.now);
  let cursor = days.has(today) ? today : previousDayKey(today);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDayKey(cursor);
  }
  return streak;
}

/** Rozet için seri: profildeki güncel seri sayacı ile geçmişten kanıtlanan serinin büyüğü. */
export function provableStreak(snapshot: LearningSnapshot): number {
  const counter = getActiveStreak(snapshot.profile?.streak, snapshot.profile?.lastStudyDate, new Date(snapshot.now));
  return Math.max(counter, computeHistoryStreak(snapshot));
}

// ─── Başarı rozetleri ───────────────────────────────────────────────────────

export type AchievementId =
  | 'ilk-adim' | 'kelime-kasifi' | 'duzenli-ogrenci' | 'azimli-ogrenci' | 'kelime-ustasi' | 'basarili-ogrenci';

export interface AchievementDefinition {
  id: AchievementId;
  icon: string;
  title: string;
  description: string;
  /** Kazanılma koşulunu açıklayan metin. */
  condition: string;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'ilk-adim', icon: 'figure.walk', title: 'İlk Adım',
    description: 'Yolculuğun başladı.',
    condition: 'İlk alıştırmanı tamamla (flashcard, alıştırma veya senaryo).' },
  { id: 'kelime-kasifi', icon: 'safari', title: 'Kelime Kaşifi',
    description: 'Kelime hazneni büyütmeye başladın.',
    condition: '10 farklı kelimeyi “Öğrenildi” düzeyine çıkar.' },
  { id: 'duzenli-ogrenci', icon: 'calendar.badge.checkmark', title: 'Düzenli Öğrenci',
    description: 'Üst üste günler çalıştın.',
    condition: '3 gün üst üste çalış.' },
  { id: 'azimli-ogrenci', icon: 'flame.fill', title: 'Azimli Öğrenci',
    description: 'Bir hafta boyunca vazgeçmedin.',
    condition: '7 gün üst üste çalış.' },
  { id: 'kelime-ustasi', icon: 'graduationcap', title: 'Kelime Ustası',
    description: 'Geniş bir kelime hazinesi oluşturdun.',
    condition: '50 farklı kelimeyi “Öğrenildi” düzeyine çıkar.' },
  { id: 'basarili-ogrenci', icon: 'medal', title: 'Başarılı Öğrenci',
    description: 'Hatasız bir alıştırma tamamladın.',
    condition: `En az ${MIN_QUESTIONS_FOR_SUCCESS} soruluk bir alıştırmada %100 başarı elde et (flashcard sayılmaz).` },
];

export interface AchievementStatus extends AchievementDefinition {
  /** Mevcut veri koşulu ŞU AN kanıtlıyor mu? (Kalıcı kazanım ayrıca yerelde saklanır.) */
  provable: boolean;
  /** Hesaplanabilir ilerleme; hesaplanamıyorsa null (sahte yüzde gösterilmez). */
  current: number | null;
  target: number | null;
  /** İlerleme çubuğu olmayan koşullar için gerçek veriye dayalı kısa not; yoksa boş. */
  detail: string;
}

export const LEARNED_FOR_EXPLORER = 10;
export const LEARNED_FOR_MASTER = 50;

export function evaluateAchievements(snapshot: LearningSnapshot): AchievementStatus[] {
  const exercises = collectCompletedExercises(snapshot);
  const knownTotal = typeof snapshot.knownSessionTotal === 'number' ? snapshot.knownSessionTotal : 0;
  const completedCount = Math.max(exercises.length, knownTotal);
  const learned = countLearnedWords(snapshot.reviewStates, snapshot.words);
  const streak = provableStreak(snapshot);

  const eligible = exercises.filter(e => e.verified && e.total >= MIN_QUESTIONS_FOR_SUCCESS);
  const perfect = eligible.some(e => e.score === e.total);
  const best = eligible.length ? Math.max(...eligible.map(e => e.score / e.total)) : null;

  const status = (
    definition: AchievementDefinition,
    provable: boolean,
    current: number | null,
    target: number | null,
    detail = '',
  ): AchievementStatus => ({ ...definition, provable, current, target, detail });
  const [first, explorer, regular, steady, master, perfectBadge] = ACHIEVEMENTS;

  return [
    status(first, completedCount >= 1, Math.min(completedCount, 1), 1),
    status(explorer, learned >= LEARNED_FOR_EXPLORER, Math.min(learned, LEARNED_FOR_EXPLORER), LEARNED_FOR_EXPLORER),
    status(regular, streak >= 3, Math.min(streak, 3), 3),
    status(steady, streak >= 7, Math.min(streak, 7), 7),
    status(master, learned >= LEARNED_FOR_MASTER, Math.min(learned, LEARNED_FOR_MASTER), LEARNED_FOR_MASTER),
    status(perfectBadge, perfect, null, null,
      best === null ? '' : `Şimdiye kadarki en iyi sonucun: %${Math.floor(best * 100)}`),
  ];
}

// ─── Kalıcı rozet kaydı ─────────────────────────────────────────────────────
//
// Veri modeli (ileride cihazlar arası senkronizasyona uygun): büyüyen küme. Her rozet için en erken
// doğrulama zamanı tutulur; iki kayıt birleştirilirken birleşim alınır ve çakışmada en erken zaman
// kazanır. Rozet asla geri alınmaz (silme yok), bu yüzden birleştirme değişmeli ve kendini tekrar eden
// (idempotent) olur. `verifiedAt` rozetin GERÇEK kazanılma anı değildir: bu cihazda koşulun ilk kez
// doğrulandığı andır (uygulama güncellemesinden sonra eski bir başarı ilk açılışta doğrulanabilir).

export interface EarnedRecord {
  version: 1;
  badges: Record<string, { verifiedAt: number }>;
}

export const EMPTY_EARNED_RECORD: EarnedRecord = { version: 1, badges: {} };

const MIN_VERIFIED_AT = Date.UTC(2020, 0, 1);

/** Saklanan metni okur; bozuk/yanlış biçimli girdide boş kayıt döner. Eski biçimi ({id: zaman}) de kabul eder. */
export function parseEarnedRecord(raw: string | null | undefined): EarnedRecord {
  if (!raw) return EMPTY_EARNED_RECORD;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_EARNED_RECORD;
    const source: Record<string, unknown> =
      parsed.version === 1 && parsed.badges && typeof parsed.badges === 'object' && !Array.isArray(parsed.badges)
        ? parsed.badges
        : parsed;
    const badges: EarnedRecord['badges'] = {};
    for (const [id, value] of Object.entries(source)) {
      const verifiedAt = typeof value === 'number' ? value : (value as { verifiedAt?: unknown } | null)?.verifiedAt;
      if (typeof verifiedAt === 'number' && Number.isFinite(verifiedAt) && verifiedAt >= MIN_VERIFIED_AT) {
        badges[id] = { verifiedAt };
      }
    }
    return { version: 1, badges };
  } catch {
    return EMPTY_EARNED_RECORD;
  }
}

/** Yeni doğrulanan rozetleri kayda ekler; zaten kayıtlı olanlar DEĞİŞMEZ ve ikinci kez eklenmez. */
export function recordEarned(
  record: EarnedRecord,
  ids: string[],
  now: number,
): { record: EarnedRecord; fresh: string[] } {
  const fresh = Array.from(new Set(ids)).filter(id => !(id in record.badges));
  if (fresh.length === 0) return { record, fresh };
  const badges = { ...record.badges };
  for (const id of fresh) badges[id] = { verifiedAt: now };
  return { record: { version: 1, badges }, fresh };
}

/** İki kaydın birleşimi (gelecekteki cihazlar arası senkron için): rozet başına en erken doğrulama kazanır. */
export function mergeEarnedRecords(a: EarnedRecord, b: EarnedRecord): EarnedRecord {
  const badges: EarnedRecord['badges'] = { ...a.badges };
  for (const [id, entry] of Object.entries(b.badges)) {
    const existing = badges[id];
    if (!existing || entry.verifiedAt < existing.verifiedAt) badges[id] = entry;
  }
  return { version: 1, badges };
}

/** Başka kullanıcıya ait kayıt hiçbir zaman gösterilmez/kullanılmaz. */
export function recordForUser(
  loadedFor: string | null | undefined,
  userId: string | null | undefined,
  record: EarnedRecord,
): EarnedRecord {
  return userId && loadedFor === userId ? record : EMPTY_EARNED_RECORD;
}

export interface AchievementView extends AchievementStatus {
  /** Koşul şu an kanıtlanıyor VEYA daha önce bu cihazda doğrulanıp kaydedilmiş. */
  earned: boolean;
  /** Bu cihazda koşulun ilk doğrulandığı an; kayıtlı değilse undefined. Gerçek kazanma anı değildir. */
  verifiedAt?: number;
}

/** Güncel durum ile kalıcı kaydı birleştirir: mastery düşse veya seri bozulsa bile kazanılmış rozet kalır. */
export function toAchievementViews(statuses: AchievementStatus[], record: EarnedRecord): AchievementView[] {
  return statuses.map(status => ({
    ...status,
    earned: status.provable || status.id in record.badges,
    verifiedAt: record.badges[status.id]?.verifiedAt,
  }));
}

/** Şu an kanıtlanan ama henüz kalıcı olarak kaydedilmemiş rozet kimlikleri. */
export function pickNewlyEarned(statuses: AchievementStatus[], record: EarnedRecord): AchievementId[] {
  return statuses.filter(s => s.provable && !(s.id in record.badges)).map(s => s.id);
}

const TURKISH_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "2 Kasım 2026" (Intl desteğine bağlı değildir; varsayılan cihaz yerel günü). */
export function formatTurkishDate(ms: number, dayKeyOf: DayKeyOf = deviceDayKey): string {
  const [year, month, day] = dayKeyOf(ms).split('-').map(Number);
  return `${day} ${TURKISH_MONTHS[month - 1]} ${year}`;
}
