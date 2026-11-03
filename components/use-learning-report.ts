import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { SCENARIOS } from '../constants/scenarios';
import { getTopicsForLevel } from '../constants/topics';
import { useSessionStore, useUserStore, useWordStore } from '../store';
import { useAuthStore } from '../store/auth';
import { computeDailyTasks, deviceDayKey } from '../utils/achievements';
import { buildLearningReport, LearningReport, reportAvailability, REPORT_STALL_MS } from '../utils/learning-report';
import { buildRecommendations, Recommendation } from '../utils/study-recommendations';
import { useDayTick, useLearningSnapshot } from './use-achievements';

export type ReportStatus = 'signed-out' | 'loading' | 'stalled' | 'ready' | 'error';

export interface LearningReportState {
  status: ReportStatus;
  report: LearningReport | null;
  recommendations: Recommendation[];
  retry: () => void;
}

/**
 * Analiz ekranı için rapor ve öneriler. Ana Sayfa, Profil, Günlük Görevler ve rozetlerle AYNI yerel verileri,
 * aynı "şimdi/gün" kaynağını ve aynı "tamamlanmış kayıt" tanımını kullanır; ağ isteği yapmaz.
 *
 * Hesap güvenliği: oturum yoksa kişisel veri gösterilmez ('signed-out'); profil, kelimeler ve oturumlar bu
 * kullanıcı için eşitlenene kadar 'loading' (önceki hesabın kalıntısı hiç gösterilmez); senaryo sonuçları yalnızca
 * oturumdaki kullanıcıya aitse kullanılır.
 *
 * Performans: ekran başka bir ekranın altında kalmışsa (ör. öneriden başlatılan alıştırma sırasında) yeniden
 * hesaplanmaz; ekrana dönülünce güncel veriyle tek seferde hesaplanır.
 */
export function useLearningReport(): LearningReportState {
  const focused = useIsFocused();
  const now = useDayTick();
  const snapshot = useLearningSnapshot(now);
  const userId = useAuthStore(state => state.session?.user.id) ?? null;
  const profile = useUserStore(state => state.profile);
  const profileLoaded = useUserStore(state => state.isLoaded);
  const wordsLoaded = useWordStore(state => state.isLoaded);
  const sessionsLoaded = useSessionStore(state => state.isLoaded);
  const profileSynced = useUserStore(state => state.syncedUserId);
  const wordsSynced = useWordStore(state => state.syncedUserId);
  const sessionsSynced = useSessionStore(state => state.syncedUserId);
  const [attempt, setAttempt] = useState(0);
  const [stalled, setStalled] = useState(false);
  // Yeniden dene: hesaplamayı yenile ve bu kullanıcı için eşitlemeyi tekrar başlat (ağ yoksa zaman aşımıyla biter).
  const retry = useCallback(() => {
    setStalled(false);
    setAttempt(value => value + 1);
    if (userId) {
      void useUserStore.getState().syncProfile(userId);
      void useWordStore.getState().syncWords(userId);
      void useSessionStore.getState().syncSessions(userId);
    }
  }, [userId]);
  const last = useRef<{ key: string; state: LearningReportState } | null>(null);

  const availability = reportAvailability({
    userId,
    localLoaded: profileLoaded && wordsLoaded && sessionsLoaded,
    profileSyncedUserId: profileSynced,
    wordsSyncedUserId: wordsSynced,
    sessionsSyncedUserId: sessionsSynced,
    stalled,
  });

  // Eşitleme çok uzun sürerse ekran sonsuza kadar yüklenmede kalmaz.
  const waiting = !!userId && availability === 'loading';
  useEffect(() => {
    if (!waiting) { setStalled(false); return; }
    const timer = setTimeout(() => setStalled(true), REPORT_STALL_MS);
    return () => clearTimeout(timer);
  }, [waiting, attempt, userId]);

  return useMemo<LearningReportState>(() => {
    if (availability !== 'ready') {
      last.current = null; // başka hesabın eski raporu bir daha gösterilmez
      return { status: availability, report: null, recommendations: [], retry };
    }
    // Odakta değilken ve aynı kullanıcı için önceki sonuç varsa yeniden hesaplama yapılmaz.
    if (!focused && last.current && last.current.key === userId) return last.current.state;
    try {
      const userLevel = profile?.level ?? 'A1';
      const words = snapshot.words ?? [];
      const topics = getTopicsForLevel(userLevel);
      const candidates = [...topics.flatMap(topic => topic.words), ...words.filter(word => word.isCustom)];
      const report = buildLearningReport({
        now,
        level: userLevel,
        profile: snapshot.profile,
        sessions: snapshot.sessions,
        scenarioResults: snapshot.scenarioResults,
        reviewStates: snapshot.reviewStates,
        words,
        candidates,
        isKnownWordId: snapshot.isKnownWordId,
        knownSessionTotal: snapshot.knownSessionTotal,
        scenarios: SCENARIOS,
      });
      const recommendations = buildRecommendations({
        report,
        level: userLevel,
        userId,
        dayKey: deviceDayKey(now),
        tasks: computeDailyTasks(snapshot),
        scenarios: SCENARIOS,
        scenarioResults: snapshot.scenarioResults,
        sessions: snapshot.sessions,
        allowedTopicIds: topics.map(topic => topic.id),
      });
      const state: LearningReportState = { status: 'ready', report, recommendations, retry };
      last.current = { key: userId ?? '', state };
      return state;
    } catch {
      return { status: 'error', report: null, recommendations: [], retry };
    }
    // `attempt` değişimi hesaplamayı yeniden çalıştırır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability, focused, now, snapshot, profile, userId, attempt, retry]);
}
