import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useUserStore, useWordStore } from '../store';
import { replanReminders } from '../utils/reminder-sync';
import { shouldReplanOnAppState } from '../utils/reminder-guard';
import { revokeReminderOwner, setReminderOwner } from '../utils/review-reminder';
import { useDayTick } from './use-achievements';

const DEBOUNCE_MS = 1500;

/**
 * Hatırlatma planını güncel tutar: kullanıcı değişince, çalışma verisi/hedef/seri değişince, gün
 * değişince ve uygulama öne gelince (saat dilimi/saat değişiklikleri dahil) yeniden planlar.
 * Çalışırken çok sık planlama olmasın diye kısa bir bekleme uygulanır.
 *
 * Bildirim sahipliği (`userId`) veri eşitlemesinden BAĞIMSIZ ve eşzamanlı güncellenir: hesap değişince
 * ya da çıkışta eski hesabın süren planlamaları anında geçersiz olur.
 */
export function useReminderSync(userId: string | null, enabled: boolean) {
  const day = useDayTick();
  const reviewStates = useWordStore(state => state.reviewStates);
  const words = useWordStore(state => state.words);
  const level = useUserStore(state => state.profile?.level);
  const dailyGoal = useUserStore(state => state.profile?.dailyGoal);
  const streak = useUserStore(state => state.profile?.streak);
  const lastStudyDate = useUserStore(state => state.profile?.lastStudyDate);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (userId) setReminderOwner(userId);
    else revokeReminderOwner();
  }, [userId]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => { void replanReminders(userId); }, userId ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [enabled, userId, day, reviewStates, words, level, dailyGoal, streak, lastStudyDate]);

  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener('change', (next) => {
      const previous = appState.current;
      appState.current = next;
      if (shouldReplanOnAppState(previous, next)) void replanReminders(userId);
    });
    return () => subscription.remove();
  }, [enabled, userId]);
}
