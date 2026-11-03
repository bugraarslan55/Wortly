import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';
import {
  DEFAULT_REMINDER_PREFS, isManagedReminderData, normalizePrefs, REMINDER_NOTIFICATION_TYPE,
  type PlannedReminder, type ReminderPrefs,
} from './reminder-plan';
import { createOwnerGate, createSerialQueue, runGuardedApply, type SchedulerAdapter } from './reminder-guard';
import { rememberHandled } from './notification-routing';

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

export type ReminderSettings = ReminderPrefs;

export const DEFAULT_REMINDER: ReminderSettings = DEFAULT_REMINDER_PREFS;
export const REVIEW_NOTIFICATION_TYPE = REMINDER_NOTIFICATION_TYPE;
export const isReminderSupported = Notifications != null;

/** Uygulama açıkken bildirim yanıtı hook'u. Desteklenmeyen ortamda sabit `null` döner (hook sırası değişmez). */
export const useLastNotificationResponse: typeof NotificationsModule.useLastNotificationResponse =
  isReminderSupported ? Notifications.useLastNotificationResponse : () => null;

// Kanal kimliği önceki sürümle aynı kalır (app.json `defaultChannel`); yalnızca görünen ad güncellenir.
const CHANNEL_ID = 'daily-review';

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

// Planlama işlemleri sırayla çalışır; hızlı değişikliklerde çift bildirim oluşmaz.
const enqueue = createSerialQueue();

/**
 * Bildirim sahipliği kapısı. Oturumdaki kullanıcı değişince/çıkışta dönem artar; süren planlamalar
 * geçersiz olur ve yeni bildirim kuramaz (bkz. reminder-guard.ts).
 */
export const reminderGate = createOwnerGate();
export const setReminderOwner = (userId: string | null) => reminderGate.setOwner(userId);
/** Çıkışta SENKRON çağrılır: süren tüm planlamaları anında geçersiz kılar. */
export const revokeReminderOwner = () => reminderGate.revoke();

// Eski sürümün kaydı ({enabled, hour, minute}) da aynı anahtardadır; eksik alanlar varsayılanla tamamlanır.
export async function loadReminderSettings(userId: string): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    return normalizePrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_REMINDER;
  }
}

export async function saveReminderSettings(userId: string, settings: ReminderSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(normalizePrefs(settings)));
  } catch {
    // Ayar bu oturumda bellekte kalır.
  }
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Çalışma hatırlatmaları',
    description: 'Günlük çalışma, tekrar ve hedef hatırlatmaları',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function isGranted(permission: NotificationsModule.NotificationPermissionsStatus) {
  return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** İzin durumu. `denied` ve `canAskAgain=false` ise kullanıcı cihaz ayarlarına yönlendirilmelidir. */
export async function getNotificationPermissionState(): Promise<{ state: PermissionState; canAskAgain: boolean }> {
  if (!isReminderSupported) return { state: 'unsupported', canAskAgain: false };
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (isGranted(permission)) return { state: 'granted', canAskAgain: true };
    return {
      state: permission.status === Notifications.PermissionStatus.UNDETERMINED ? 'undetermined' : 'denied',
      canAskAgain: permission.canAskAgain,
    };
  } catch {
    return { state: 'denied', canAskAgain: false };
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  return (await getNotificationPermissionState()).state === 'granted';
}

/** İzni YALNIZCA kullanıcı bildirimi etkinleştirdiğinde ister (uygulama açılışında istenmez). */
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

// Yalnızca Wortly'nin kendi hatırlatmaları (yeni ve eski tür) iptal edilir; başka bildirimlere dokunulmaz.
async function cancelOwnNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter(request => isManagedReminderData(request.content.data))
      .map(request => Notifications.cancelScheduledNotificationAsync(request.identifier)),
  );
}

// Bildirim merkezinde duran Wortly bildirimlerinden, "keepUserId" dışındaki hesaplara ait olanları kaldırır.
async function dismissForeignNotifications(keepUserId: string | null) {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(
      presented
        .filter(item => {
          const data = item.request.content.data;
          return isManagedReminderData(data) && (keepUserId === null || data?.userId !== keepUserId);
        })
        .map(item => Notifications.dismissNotificationAsync(item.request.identifier)),
    );
  } catch {
    // Bazı ortamlarda desteklenmeyebilir; zamanlanmış bildirimlerin iptali yine yapılır.
  }
}

function createAdapter(userId: string | null): SchedulerAdapter<PlannedReminder> {
  return {
    cancelOwn: cancelOwnNotifications,
    dismissForeign: dismissForeignNotifications,
    hasPermission: hasNotificationPermission,
    prepare: ensureChannel,
    schedule: async (item) => {
      await Notifications.scheduleNotificationAsync({
        identifier: item.id,
        content: {
          title: item.title,
          body: item.body,
          // Yalnızca tür ve hesap kimliği; kelime metni bildirimde/verisinde bulunmaz.
          data: { type: REVIEW_NOTIFICATION_TYPE, kind: item.kind, userId },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.date,
          channelId: CHANNEL_ID,
        },
      });
    },
  };
}

/**
 * Planı cihaza uygular: önce Wortly'nin mevcut hatırlatmalarını iptal eder, sonra (izin varsa) planı
 * tek seferlik, günlük kimlikli bildirimler olarak kurar. Her çağrı idempotenttir; çift bildirim oluşmaz.
 * "isValid" (sahiplik belirteci + canlı oturum) her adımdan önce doğrulanır; geçersizse hiçbir şey kurulmaz.
 * Tam zamanlı alarm (SCHEDULE_EXACT_ALARM) kullanılmaz; Android'de Doze/güç tasarrufu gecikme yapabilir.
 */
export function applyReminderPlan(userId: string, plan: PlannedReminder[], isValid: () => boolean): Promise<void> {
  if (!isReminderSupported) return Promise.resolve();
  return enqueue(async () => {
    try {
      await runGuardedApply({ adapter: createAdapter(userId), plan, userId, isValid });
    } catch (error) {
      console.warn('[Wortly] Hatırlatma planlanamadı:', error);
    }
  });
}

/** Tüm Wortly hatırlatmalarını iptal eder ve sahipliği geri alır (çıkış / oturum yok). */
export function cancelReviewReminders(): Promise<void> {
  // Önce senkron geçersiz kıl: sırada bekleyen/süren planlamalar bundan sonra bildirim kuramaz.
  revokeReminderOwner();
  if (!isReminderSupported) return Promise.resolve();
  return enqueue(async () => {
    try {
      await cancelOwnNotifications();
      await dismissForeignNotifications(null);
    } catch (error) {
      console.warn('[Wortly] Hatırlatma iptal edilemedi:', error);
    }
  });
}

// İşlenmiş bildirim yanıtları kalıcıdır: uygulama yeniden açılınca eski dokunma tekrar yönlendirmez.
const HANDLED_KEY = '@wortly:handled-notification-taps';

export async function loadHandledTaps(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HANDLED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export async function markTapHandled(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify(rememberHandled(await loadHandledTaps(), key)));
  } catch {
    // Kalıcı kayıt yazılamazsa oturum içi küme yine tekrar işlemeyi engeller.
  }
}
