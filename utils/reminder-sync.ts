import { useAuthStore } from '../store/auth';
import { useUserStore, useWordStore } from '../store';
import { getTopicsForLevel } from '../constants/topics';
import { buildReminderPlan } from './reminder-plan';
import {
  applyReminderPlan, cancelReviewReminders, isReminderSupported, loadReminderSettings, reminderGate,
} from './review-reminder';

/**
 * Kayıtlı ayardan ve GÜNCEL yerel öğrenme verisinden hatırlatma planını yeniden kurar.
 * Uygulama açılışında, öne gelince, çalışma verisi/ayar değişince ve gün değişince çağrılır.
 * userId null ise (çıkış yapılmış) ya da oturumdaki kullanıcıyla uyuşmuyorsa hiçbir hatırlatma bırakılmaz;
 * böylece başka hesabın bilgisi bildirimde görünmez. Ağ isteği yapmaz.
 *
 * Yarış koruması: planlama başında sahiplik belirteci alınır; uygulama aşamasında (kuyrukta beklerken ve her
 * bildirimden önce) hem belirteç hem canlı oturum yeniden doğrulanır. Çıkış/hesap değişimi bu sırada olursa
 * hiçbir bildirim kurulmaz.
 */
export async function replanReminders(userId: string | null): Promise<void> {
  if (!isReminderSupported) return;
  const currentUserId = useAuthStore.getState().session?.user.id ?? null;
  if (!userId || userId !== currentUserId) {
    await cancelReviewReminders();
    return;
  }

  const token = reminderGate.token(userId);
  if (!token) {
    await cancelReviewReminders();
    return;
  }

  const prefs = await loadReminderSettings(userId);
  const { profile } = useUserStore.getState();
  const { words, reviewStates } = useWordStore.getState();
  const topicWords = getTopicsForLevel(profile?.level || 'A1').flatMap(topic => topic.words);
  const candidates = Array.from(
    new Map([...topicWords, ...words.filter(word => word.isCustom)].map(word => [word.id, word])).values(),
  );

  const plan = buildReminderPlan({
    now: Date.now(),
    prefs,
    candidates,
    reviewStates,
    dailyGoal: profile?.dailyGoal,
    streak: profile?.streak,
    lastStudyDate: profile?.lastStudyDate,
  });
  const isValid = () => reminderGate.isValid(token) && useAuthStore.getState().session?.user.id === userId;
  if (!isValid()) return; // ayar okunurken oturum değişti
  await applyReminderPlan(userId, plan, isValid);
}
