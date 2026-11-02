import type { Word } from '../types';
import { findDueWords } from './learning-analysis';
import { countReviewedToday, getActiveStreak, normalizeDailyGoal, toLocalDateKey } from './progress-stats';
import type { ReviewStateMap } from './spaced-repetition';

// Bildirim planlama mantığı (saf; expo-notifications, depolama veya ağ bağımlılığı yok).
//
// Yerel bildirimler uygulama kapalıyken koşul kontrolü yapamaz: içerik ve "gösterilsin mi" kararı
// PLANLAMA ANINDA verilir. Bu yüzden plan uygulama açılınca, öne gelince, çalışma verisi değişince ve
// gün değişince yeniden hesaplanır; her gün için EN FAZLA BİR bildirim üretilir (üst üste bildirim yok).
// Bugünün hedefi tamamlanmışsa bugünün bildirimi hiç planlanmaz. Gelecek günler için tahmin
// gerektiren iddialar (ör. "N kelime tekrar bekliyor") yalnızca yakın günlerde ve gerçek veriden yapılır.

export interface ReminderPrefs {
  /** Ana anahtar: kapalıysa hiçbir bildirim planlanmaz. */
  enabled: boolean;
  hour: number;
  minute: number;
  /** Tekrarı gelen kelime varsa bunu söyleyen mesaja izin ver. */
  review: boolean;
  /** Günlük hedef mesajına izin ver. */
  goal: boolean;
  /** Çalışma serisini koruma mesajına izin ver (varsayılan kapalı). */
  streak: boolean;
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  enabled: false, hour: 20, minute: 0, review: true, goal: true, streak: false,
};

/** Kaç gün ilerisi planlanır (iOS en fazla 64 bekleyen yerel bildirim tutar). */
export const PLAN_DAYS = 14;
/** Tekrar sayısı iddiası yalnızca bugün ve sonraki 2 gün için yapılır; sonrası tahmin olur. */
export const REVIEW_CLAIM_DAYS = 3;
/** Geçmişe veya "şimdi"ye bu kadar yakın saatler planlanmaz. */
const MIN_LEAD_MS = 60 * 1000;

/** Wortly'nin planladığı bildirimlerin `data.type` değeri. */
export const REMINDER_NOTIFICATION_TYPE = 'study-reminder';
/** Önceki sürümün yinelenen bildirimi; yeni planlamada temizlenir. */
export const LEGACY_REMINDER_TYPE = 'daily-review';

/** İptal edilecek bildirim Wortly'nin yönettiği türlerden biri mi? Başka bildirimlere dokunulmaz. */
export function isManagedReminderData(data: unknown): boolean {
  const type = (data as { type?: unknown } | null | undefined)?.type;
  return type === REMINDER_NOTIFICATION_TYPE || type === LEGACY_REMINDER_TYPE;
}

export const REMINDER_KINDS = ['streak', 'review', 'goal', 'daily'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface PlannedReminder {
  /** Gün başına tek kimlik: aynı gün tekrar planlansa da çift bildirim oluşmaz. */
  id: string;
  kind: ReminderKind;
  title: string;
  body: string;
  /** Mini quiz bildirimiyse sorulan kelimenin kimliği (yalnızca bu hesabın verisinden seçilir). */
  wordId?: string;
  /** Tetiklenme zamanı (epoch ms, cihazın o anki yerel saatiyle hesaplanır). */
  date: number;
}

export interface PlanInput {
  now: number;
  prefs: ReminderPrefs;
  /** Tekrar için değerlendirilecek kelimeler: kullanıcının seviyesindeki konu kelimeleri + kişisel kelimeler. */
  candidates: Word[];
  reviewStates: ReviewStateMap | null | undefined;
  dailyGoal?: number | null;
  streak?: number;
  lastStudyDate?: string;
  days?: number;
}

const toInt = (value: unknown, fallback: number, min: number, max: number) =>
  Number.isInteger(value) ? Math.min(max, Math.max(min, value as number)) : fallback;

/** Bozuk/eksik depolanmış ayarı güvenli varsayılanlarla tamamlar. */
export function normalizePrefs(value: Partial<ReminderPrefs> | null | undefined): ReminderPrefs {
  const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    enabled: value?.enabled === true,
    hour: toInt(value?.hour, DEFAULT_REMINDER_PREFS.hour, 0, 23),
    minute: toInt(value?.minute, DEFAULT_REMINDER_PREFS.minute, 0, 59),
    review: flag(value?.review, DEFAULT_REMINDER_PREFS.review),
    goal: flag(value?.goal, DEFAULT_REMINDER_PREFS.goal),
    streak: flag(value?.streak, DEFAULT_REMINDER_PREFS.streak),
  };
}

export const reminderId = (date: number | Date) => `wortly-reminder-${toLocalDateKey(date)}`;

function wordsText(count: number) {
  return `${count} kelime`;
}

export function buildReminderPlan(input: PlanInput): PlannedReminder[] {
  const { prefs, now } = input;
  if (!prefs.enabled) return [];

  const days = Math.max(0, Math.min(PLAN_DAYS, Math.floor(input.days ?? PLAN_DAYS)));
  const goal = normalizeDailyGoal(input.dailyGoal);
  const nowDate = new Date(now);
  const todayKey = toLocalDateKey(nowDate);
  const reviewedToday = countReviewedToday(input.reviewStates, input.candidates, nowDate);
  const goalDoneToday = reviewedToday >= goal;
  const studiedToday = input.lastStudyDate === todayKey || reviewedToday > 0;
  const activeStreak = getActiveStreak(input.streak, input.lastStudyDate, nowDate);

  const plan: PlannedReminder[] = [];
  for (let k = 0; k < days; k += 1) {
    // Yerel takvim günü + seçilen saat (DST/saat dilimi: her planlamada yerel saatten yeniden hesaplanır).
    const fire = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + k, prefs.hour, prefs.minute, 0, 0);
    const date = fire.getTime();
    if (date - now < MIN_LEAD_MS) continue; // bugünün saati geçtiyse bugün yok
    if (k === 0 && goalDoneToday) continue; // hedef tamamlandı: rahatsız etme

    let reminder: Omit<PlannedReminder, 'id' | 'date'> | null = null;

    // 1) Seri: yalnızca gerçekten bilinen durumlarda. Bugün: dün çalışıldı, bugün henüz çalışılmadı.
    // Yarın: bugün çalışıldı (seri kayıtlı). Daha ilerisi bilinemez, söylenmez.
    if (prefs.streak && activeStreak > 0 && ((k === 0 && !studiedToday) || (k === 1 && studiedToday))) {
      reminder = {
        kind: 'streak',
        title: 'Serini koru',
        body: `${activeStreak} günlük serin devam ediyor. ${k === 0 ? 'Bugün' : 'Yarın'} da çalışarak koru.`,
      };
    }

    // 2) Gerçek tekrar bekleyen kelime sayısı (o günün bildirim saatinde zamanı gelmiş olanlar).
    if (!reminder && prefs.review && k < REVIEW_CLAIM_DAYS) {
      const due = findDueWords(input.candidates, input.reviewStates, date).length;
      if (due > 0) {
        reminder = {
          kind: 'review',
          title: 'Tekrar zamanı',
          body: `${wordsText(due)} tekrarını bekliyor. Kısa bir tekrarla aklında tut.`,
        };
      }
    }

    // 3) Günlük hedef. Bugün için kalan sayı gerçek veriden; sonraki günler için yalnızca hedef hatırlatılır.
    if (!reminder && prefs.goal) {
      reminder = k === 0
        ? {
            kind: 'goal',
            title: 'Günlük hedefin seni bekliyor',
            body: `Bugünkü ${wordsText(goal)} hedefine ${wordsText(goal - reviewedToday)} kaldı.`,
          }
        : {
            kind: 'goal',
            title: 'Günlük hedefin seni bekliyor',
            body: `Bugünkü hedefin ${wordsText(goal)}. Birkaç dakikada başlayabilirsin.`,
          };
    }

    // 4) Genel, sade hatırlatma.
    if (!reminder) {
      reminder = {
        kind: 'daily',
        title: 'Wortly ile Almanca zamanı',
        body: 'Bugün birkaç kelime tekrar ederek öğrenmene devam et.',
      };
    }

    plan.push({ id: reminderId(fire), date, ...reminder });
  }
  return plan;
}
