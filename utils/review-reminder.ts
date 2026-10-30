import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type ReminderSettings = { enabled: boolean; hour: number; minute: number };

export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, hour: 20, minute: 0 };
export const REVIEW_NOTIFICATION_TYPE = 'daily-review';
export const isReminderSupported = Platform.OS === 'ios' || Platform.OS === 'android';

const CHANNEL_ID = 'daily-review';
const NOTIFICATION_ID = 'wortly-daily-review';

const storageKey = (userId: string) => `@wortly:review-reminder:${userId}`;

if (isReminderSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// Planlama işlemleri sırayla çalışır; hızlı saat değişikliklerinde çift bildirim oluşmaz.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function clampSettings(value: Partial<ReminderSettings> | null): ReminderSettings {
  const hour = Number.isInteger(value?.hour) ? Math.min(23, Math.max(0, value!.hour as number)) : DEFAULT_REMINDER.hour;
  const minute = Number.isInteger(value?.minute) ? Math.min(59, Math.max(0, value!.minute as number)) : DEFAULT_REMINDER.minute;
  return { enabled: value?.enabled === true, hour, minute };
}

export async function loadReminderSettings(userId: string): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return clampSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_REMINDER;
  }
}

export async function saveReminderSettings(userId: string, settings: ReminderSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(settings));
  } catch {
    // Ayar bu oturumda bellekte kalır.
  }
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Günlük tekrar',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function isGranted(permission: Notifications.NotificationPermissionsStatus) {
  return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (!isReminderSupported) return false;
  try {
    return isGranted(await Notifications.getPermissionsAsync());
  } catch {
    return false;
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isReminderSupported) return false;
  try {
    await ensureChannel();
    let permission = await Notifications.getPermissionsAsync();
    if (isGranted(permission)) return true;
    if (permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: false, allowSound: true },
      });
    }
    return isGranted(permission);
  } catch {
    return false;
  }
}

async function cancelOwnNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(request => request.content.data?.type === REVIEW_NOTIFICATION_TYPE)
      .map(request => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

async function scheduleOwnNotification(userId: string, settings: ReminderSettings) {
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: 'Wortly',
      body: 'Bugünkü kelime tekrarın hazır',
      data: { type: REVIEW_NOTIFICATION_TYPE, userId },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: settings.hour,
      minute: settings.minute,
      channelId: CHANNEL_ID,
    },
  });
}

// Önce mevcut hatırlatmayı iptal eder, ayar açıksa ve izin varsa yenisini planlar.
export function applyReminder(userId: string, settings: ReminderSettings): Promise<void> {
  if (!isReminderSupported) return Promise.resolve();
  return enqueue(async () => {
    try {
      await cancelOwnNotifications();
      if (settings.enabled && (await hasNotificationPermission())) {
        await scheduleOwnNotification(userId, settings);
      }
    } catch (error) {
      console.warn('[Wortly] Hatırlatma planlanamadı:', error);
    }
  });
}

// Uygulama açılışında ve kullanıcı değiştiğinde: kayıtlı ayardan yeniden planlar.
// userId null ise (çıkış yapılmış) hiçbir hatırlatma bırakılmaz.
export function syncReminderForUser(userId: string | null): Promise<void> {
  if (!isReminderSupported) return Promise.resolve();
  if (!userId) return cancelReviewReminders();
  return loadReminderSettings(userId).then(settings => applyReminder(userId, settings));
}

export function cancelReviewReminders(): Promise<void> {
  if (!isReminderSupported) return Promise.resolve();
  return enqueue(async () => {
    try {
      await cancelOwnNotifications();
    } catch (error) {
      console.warn('[Wortly] Hatırlatma iptal edilemedi:', error);
    }
  });
}
