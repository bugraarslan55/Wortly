import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';

// Expo Go (Android) uzaktan push ve expo-notifications'ın bazı native modüllerini (ör.
// ExpoTopicSubscriptionModule) içermez. Paket yalnızca import edilse bile "Push notifications
// are unavailable in Expo Go on Android" hatasını yazar ve native modül hatası fırlatır.
// Bu bir kod hatası değil Expo Go kısıtıdır; bu yüzden orada paket hiç yüklenmez ve
// hatırlatma özelliği kapalı kalır. iOS, Android development build ve production'da
// paket normal yüklenir.
const isAndroidExpoGo =
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

function loadNotifications(): typeof NotificationsModule | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  if (isAndroidExpoGo) return null;
  try {
    return require('expo-notifications') as typeof NotificationsModule;
  } catch (error) {
    // Expo Go dışında yükleme hatası beklenmez; gerçek bir yapılandırma sorunudur.
    console.warn('[Wortly] expo-notifications yüklenemedi, hatırlatmalar devre dışı:', error);
    return null;
  }
}

const Notifications = loadNotifications() as typeof NotificationsModule;

export type ReminderSettings = { enabled: boolean; hour: number; minute: number };

export const DEFAULT_REMINDER: ReminderSettings = { enabled: false, hour: 20, minute: 0 };
export const REVIEW_NOTIFICATION_TYPE = 'daily-review';

// Günlük bildirimin metni ve (varsa) mini quiz kelimesi. Uygun içerik yoksa genel metin kullanılır.
export type ReminderContent = { body: string; wordId?: string };

const DEFAULT_BODY = 'Bugünkü kelime tekrarın hazır';

// İçerik sağlayıcı dışarıdan verilir; böylece bu dosya store'lara bağımlı olmaz (store/auth bu dosyayı içe aktarır).
let contentProvider: (() => ReminderContent | null) | null = null;
export function setReminderContentProvider(provider: (() => ReminderContent | null) | null) {
  contentProvider = provider;
}

function resolveContent(): ReminderContent {
  try {
    return contentProvider?.() ?? { body: DEFAULT_BODY };
  } catch {
    return { body: DEFAULT_BODY };
  }
}
export const isReminderSupported = Notifications != null;

export type NotificationTapResponse = NotificationsModule.NotificationResponse;

// Bildirime dokunma (yanıt) akışı. useLastNotificationResponse hook'u kullanılmaz: hook, kimliği
// öncekiyle aynı olan yanıtı yok sayar ve günlük bildirimimiz hep aynı kimliği taşır; bu yüzden
// süreç bir kez yanıt aldıktan sonraki dokunuşlar kaybolur. Burada her yanıt işleyiciye iletilir:
// uygulamayı açan dokunuş (kapalıyken) getLastNotificationResponseAsync ile, sonrakiler dinleyiciyle gelir.
export function subscribeToNotificationResponses(
  handler: (response: NotificationTapResponse) => void,
): () => void {
  if (!isReminderSupported) return () => undefined;
  let active = true;
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    if (active) handler(response);
  });
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (active && response) handler(response);
    })
    .catch(() => undefined);
  return () => {
    active = false;
    subscription.remove();
  };
}

/** Yalnızca bildirimin kendisine dokunma sayılır (kapatma/özel eylemler yönlendirmez). */
export const isNotificationTap = (response: NotificationTapResponse) =>
  isReminderSupported && response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER;

/** İşlenen yanıt, sonraki açılış/yeniden bağlanmada tekrar işlenmesin diye temizlenir. */
export function clearHandledNotificationResponse(): void {
  if (!isReminderSupported) return;
  void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
}

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

function isGranted(permission: NotificationsModule.NotificationPermissionsStatus) {
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
  const content = resolveContent();
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: {
      title: 'Wortly',
      body: content.body,
      data: {
        type: REVIEW_NOTIFICATION_TYPE,
        userId,
        ...(content.wordId ? { wordId: content.wordId } : {}),
      },
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
