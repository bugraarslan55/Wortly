import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useSessionStore, useUserStore, useWordStore } from '../store';
import { useAuthStore } from '../store/auth';
import { useAchievementStore } from '../store/achievements';
import { makeIsKnownWordId } from '../utils/known-words';
import { isStaticWordId } from '../utils/static-word-ids';
import {
  AchievementView, DailyTask, LearningSnapshot, computeDailyTasks, evaluateAchievements, nextDeviceMidnight,
  pickNewlyEarned, recordForUser, toAchievementViews,
} from '../utils/achievements';

// Tek ortak "şimdi" kaynağı: yerel gece yarısında ve uygulama arka plandan dönünce güncellenir. Tüm
// ekranlar (Ana Sayfa halkası, görevler, rozetler) aynı gün sınırını aynı anda görür.
let currentNow = Date.now();
const listeners = new Set<(now: number) => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let appStateSubscription: { remove: () => void } | undefined;

function publish() {
  currentNow = Date.now();
  listeners.forEach(listener => listener(currentNow));
}

function scheduleMidnight() {
  if (timer) clearTimeout(timer);
  const delay = Math.max(1000, nextDeviceMidnight(Date.now()) - Date.now() + 500);
  timer = setTimeout(() => {
    publish();
    scheduleMidnight();
  }, delay);
}

function subscribeTick(listener: (now: number) => void): () => void {
  if (listeners.size === 0) {
    scheduleMidnight();
    appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        publish();
        scheduleMidnight(); // saat/gün değişmiş olabilir; zamanlayıcıyı yeniden kur
      }
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearTimeout(timer);
      timer = undefined;
      appStateSubscription?.remove();
      appStateSubscription = undefined;
    }
  };
}

/** Şimdiki zaman; gece yarısında ve uygulama öne gelince tüm abonelerde birlikte güncellenir. */
export function useDayTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    return subscribeTick(setNow);
  }, []);
  return now;
}

/** Mevcut yerel öğrenme verisinin anlık görüntüsü (yeni kayıt veya ağ isteği yok). */
export function useLearningSnapshot(now: number): LearningSnapshot {
  const userId = useAuthStore(state => state.session?.user.id);
  const profile = useUserStore(state => state.profile);
  const words = useWordStore(state => state.words);
  const reviewStates = useWordStore(state => state.reviewStates);
  const sessions = useSessionStore(state => state.sessions);
  const scenarioResults = useSessionStore(state => state.scenarioResults);
  const sessionTotal = useSessionStore(state => state.sessionTotal);

  // Silinmiş kelimelerin kalıntı ilerleme kayıtları "öğrenilen kelime" sayısına ve rozetlere girmesin.
  const isKnownWordId = useMemo(() => makeIsKnownWordId(words, isStaticWordId), [words]);

  return useMemo(() => ({
    now,
    sessions,
    scenarioResults,
    reviewStates,
    words,
    profile,
    knownSessionTotal: sessionTotal && sessionTotal.userId === userId ? sessionTotal.count : null,
    isKnownWordId,
  }), [now, sessions, scenarioResults, reviewStates, words, profile, sessionTotal, userId, isKnownWordId]);
}

export function useDailyTasks(): DailyTask[] {
  const now = useDayTick();
  const snapshot = useLearningSnapshot(now);
  return useMemo(() => computeDailyTasks(snapshot), [snapshot]);
}

export type BadgeView = AchievementView;

export function useAchievementViews(): { badges: AchievementView[]; earnedCount: number } {
  const now = useDayTick();
  const snapshot = useLearningSnapshot(now);
  const userId = useAuthStore(state => state.session?.user.id);
  const record = useAchievementStore(state => state.record);
  const loadedFor = useAchievementStore(state => state.userId);

  return useMemo(() => {
    const badges = toAchievementViews(evaluateAchievements(snapshot), recordForUser(loadedFor, userId, record));
    return { badges, earnedCount: badges.filter(badge => badge.earned).length };
  }, [snapshot, record, loadedFor, userId]);
}

/**
 * Kök düzeyde çalışır (ekran açık olmasa da): koşulu o an KANITLANAN rozetleri kalıcı olarak kaydeder.
 * Yalnızca bu kullanıcı için veriler yerel olarak yüklenip senkronize edildikten sonra çalışır; böylece
 * başka hesabın kalıntı verisiyle rozet verilmez.
 */
export function AchievementTracker() {
  const userId = useAuthStore(state => state.session?.user.id);
  const profileSynced = useUserStore(state => state.syncedUserId);
  const wordsSynced = useWordStore(state => state.syncedUserId);
  const sessionsSynced = useSessionStore(state => state.syncedUserId);
  const loadedUserId = useAchievementStore(state => (state.isLoaded ? state.userId : null));
  const record = useAchievementStore(state => state.record);
  const markEarned = useAchievementStore(state => state.markEarned);

  const now = useDayTick();
  const snapshot = useLearningSnapshot(now);

  useEffect(() => {
    if (!userId || loadedUserId !== userId) return;
    if (profileSynced !== userId || wordsSynced !== userId || sessionsSynced !== userId) return;
    const fresh = pickNewlyEarned(evaluateAchievements(snapshot), record);
    if (fresh.length > 0) void markEarned(userId, fresh, Date.now());
  }, [userId, loadedUserId, profileSynced, wordsSynced, sessionsSynced, snapshot, record, markEarned]);

  return null;
}
