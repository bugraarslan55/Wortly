import { isManagedReminderData } from './reminder-plan';

// Bildirime dokunma (yanıt) kararı için saf mantık. Navigasyonu ve depolamayı yapmaz; yalnızca
// "şimdi git / bekle / yok say" kararını verir. Yanıt aynı olsa bile bu işlev tekrar çağrılabilir
// (React efektleri yeniden çalışabilir); çift işleme `handled` kümesiyle engellenir.

/** Bekleyen (henüz işlenmemiş) bir dokunma bu süreden sonra bayat sayılır ve yok sayılır. */
export const TAP_MAX_AGE_MS = 15 * 60 * 1000;

export interface NotificationTap {
  /** Bildirim kimliği + teslim zamanı: aynı bildirimin tekrar işlenmesini engellemek için. */
  key: string;
  data: { type?: unknown; kind?: unknown; userId?: unknown; wordId?: unknown } | null | undefined;
}

export type TapDecision =
  /** 'quiz': günlük mini quiz bildirimi (kelime kimliğiyle); 'review': tekrar akışı; 'home': Ana Sayfa. */
  | { action: 'navigate'; target: 'review' | 'home' | 'quiz'; wordId?: string; markHandled: true }
  /** Henüz yönlendirme yapılamaz (giriş yok / uygulama hazır değil). Daha sonra tekrar değerlendirilir. */
  | { action: 'wait'; markHandled: false }
  | { action: 'ignore'; markHandled: boolean; reason: 'not-wortly' | 'already-handled' | 'other-account' | 'expired' | 'no-owner' };

export function decideTap(input: {
  tap: NotificationTap;
  /** Şu an oturum açmış kullanıcı (yoksa null). */
  currentUserId: string | null;
  /** Oturum açık, veriler eşitlenmiş ve onboarding tamamlanmış (korumalı ekranlar açılabilir). */
  appReady: boolean;
  handled: ReadonlySet<string>;
  /** Bu dokunmanın uygulama tarafından ilk görüldüğü an (ms). */
  firstSeenAt: number;
  now: number;
  maxAgeMs?: number;
}): TapDecision {
  const { tap, currentUserId, appReady, handled, firstSeenAt, now } = input;
  const maxAge = input.maxAgeMs ?? TAP_MAX_AGE_MS;

  if (!isManagedReminderData(tap.data)) return { action: 'ignore', markHandled: true, reason: 'not-wortly' };
  if (handled.has(tap.key)) return { action: 'ignore', markHandled: false, reason: 'already-handled' };

  const ownerId = typeof tap.data?.userId === 'string' ? tap.data.userId : null;
  if (!ownerId) return { action: 'ignore', markHandled: true, reason: 'no-owner' };

  if (now - firstSeenAt > maxAge) return { action: 'ignore', markHandled: true, reason: 'expired' };

  // Giriş yoksa: korumalı ekrana gönderme; bildirim sahibi giriş yaparsa işlenir (süre dolmadıysa).
  if (!currentUserId) return { action: 'wait', markHandled: false };
  // Başka hesap açıksa: o hesabın bildirimi bu kullanıcıya hiçbir şey göstermez ve yönlendirmez.
  if (ownerId !== currentUserId) return { action: 'ignore', markHandled: true, reason: 'other-account' };
  if (!appReady) return { action: 'wait', markHandled: false };

  const wordId = typeof tap.data?.wordId === 'string' && tap.data.wordId ? tap.data.wordId : null;
  // Mini quiz yalnızca günlük/tekrar bildirimlerinde ve kelime kimliği varsa açılır; diğerleri eskisi gibi yönlenir.
  if (wordId && (tap.data?.kind === 'daily' || tap.data?.kind === 'review')) return { action: 'navigate', target: 'quiz', wordId, markHandled: true };
  return { action: 'navigate', target: tap.data?.kind === 'review' ? 'review' : 'home', markHandled: true };
}

/** İşlenmiş anahtarları sınırlı uzunlukta tutar (en yeni sonda). */
export function rememberHandled(keys: readonly string[], key: string, limit = 20): string[] {
  return [...keys.filter(existing => existing !== key), key].slice(-limit);
}
