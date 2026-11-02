import { useEffect, useMemo, useRef, useState } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRootNavigationState, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  flushPendingChanges, getPendingChangeCount, refreshLearningData,
  useUserStore, useWordStore, useSessionStore,
} from '../store';
import { useAuthStore } from '../store/auth';
import { useAchievementStore } from '../store/achievements';
import { AchievementTracker } from '../components/use-achievements';
import { BrandMark } from '../components/ui';
import { useThemeStore } from '../store/theme';
import { useTheme } from '../hooks/use-theme';
import {
  clearHandledNotificationResponse, isNotificationTap, loadHandledTaps, markTapHandled, NotificationTapResponse,
  setReminderContentProvider, subscribeToNotificationResponses,
} from '../utils/review-reminder';
import { decideTap } from '../utils/notification-routing';
import { useReminderSync } from '../components/use-reminder-sync';
import { SyncProblemScreen } from '../components/sync-problem-screen';
import { computeAccessGate } from '../utils/access-gate';
import { getNotificationRoute, getReviewRoute } from '../utils/review-route';
import { getMiniQuizReminderContent } from '../utils/mini-quiz';
import { isLearningSyncEnabled } from '../utils/feature-flags';

// Günlük bildirim metni için mini quiz kelimesi (modül yüklenirken, ilk planlamadan önce kaydedilir).
setReminderContentProvider(getMiniQuizReminderContent);

const devWarn = (...args: unknown[]) => {
  if (__DEV__) console.warn(...args);
};

const devLog = (...args: unknown[]) => {
  if (__DEV__) console.debug(...args);
};

export default function RootLayout() {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  // Dokunulan bildirim yanıtı; uygulama (oturum, veri, navigasyon) hazır olana kadar bekletilir.
  const [pendingResponse, setPendingResponse] = useState<NotificationTapResponse | null>(null);
  // İşlenmiş bildirim dokunmaları (kalıcı kayıttan yüklenir) ve bir dokunmanın ilk görüldüğü an.
  const handledTapsRef = useRef<Set<string>>(new Set());
  const firstSeenTapRef = useRef<Map<string, number>>(new Map());
  const [handledTapsLoaded, setHandledTapsLoaded] = useState(false);
  const {
    profile, loadProfile, syncProfile, isLoaded,
    syncedUserId: profileSyncedUserId,
  } = useUserStore();
  const {
    loadWords, syncWords, syncProgress, isLoaded: areWordsLoaded,
    syncedUserId: wordsSyncedUserId,
  } = useWordStore();
  const {
    loadSessions, loadScenarioResults, syncScenarioResults, scenarioResultsOwner, syncSessions, isLoaded: areSessionsLoaded,
    syncedUserId: sessionsSyncedUserId,
  } = useSessionStore();
  const { isDark, colors } = useTheme();
  const { loadTheme, isLoaded: isThemeLoaded } = useThemeStore();
  // Ekran geçişlerinde ve modallarda navigasyon katmanı da seçilen temanın zeminini kullanır.
  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.secondary,
        background: colors.warmWhite,
        card: colors.surfaceContainerLowest,
        text: colors.primary,
        border: colors.outlineVariant,
      },
    };
  }, [isDark, colors]);

  // Web'de sayfa zemini ve yerel kontroller (kaydırma çubuğu vb.) seçilen temayı izlesin.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.backgroundColor = colors.warmWhite;
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark, colors]);
  const {
    initialize: initializeAuth,
    handleAuthUrl,
    isLoaded: isAuthLoaded,
    session,
  } = useAuthStore();

  useEffect(() => {
    initializeAuth();
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthUrl(url);
    });
    void Linking.getInitialURL().then((url) => {
      if (url) void handleAuthUrl(url);
    });
    loadProfile();
    loadWords();
    loadSessions();
    void loadTheme();

    return () => subscription.remove();
  }, [handleAuthUrl, initializeAuth, loadProfile, loadWords, loadSessions, loadTheme]);

  useEffect(() => {
    if (!isAuthLoaded || !isLoaded || !session?.user.id) return;
    void syncProfile(session.user.id);
  }, [isAuthLoaded, isLoaded, session?.user.id, syncProfile]);

  useEffect(() => {
    if (!isAuthLoaded || !areWordsLoaded || !session?.user.id) return;
    void syncWords(session.user.id);
  }, [isAuthLoaded, areWordsLoaded, session?.user.id, syncWords]);

  useEffect(() => {
    if (!isAuthLoaded || !areSessionsLoaded || !session?.user.id) return;
    void syncSessions(session.user.id);
  }, [isAuthLoaded, areSessionsLoaded, session?.user.id, syncSessions]);

  useEffect(() => {
    if (!isAuthLoaded || !session?.user.id) return;
    void loadScenarioResults(session.user.id);
  }, [isAuthLoaded, session?.user.id, loadScenarioResults]);

  // Kazanılan rozetlerin yerel kaydı (kullanıcıya özel; buluta gönderilmez).
  const loadAchievements = useAchievementStore(state => state.load);
  useEffect(() => {
    if (!isAuthLoaded || !session?.user.id) return;
    void loadAchievements(session.user.id);
  }, [isAuthLoaded, session?.user.id, loadAchievements]);

  // Oturum açık bir kullanıcı varsa, o kullanıcı için profil/kelime/geçmiş
  // senkronizasyonu en az bir kez tamamlanana kadar uygulamayı render etme.
  // Bu, cihazda önceki kullanıcıdan kalan yerel verinin, yeni kullanıcı
  // girişinde senkronizasyon bitmeden ekranda kısa süreliğine görünmesini
  // engeller. Oturum yoksa (auth ekranına gidilecek) beklemeden devam edilir.
  const currentUserId = session?.user.id ?? null;
  const dataSynced = (
    profileSyncedUserId === currentUserId &&
    wordsSyncedUserId === currentUserId &&
    sessionsSyncedUserId === currentUserId
  );

  // Son çare: store katmanındaki zaman aşımı korumalarına rağmen (ör. ağ
  // dışı/beklenmeyen bir native köprü kilitlenmesi yüzünden) senkronizasyon
  // hâlâ tamamlanmamışsa, uygulama yine de sonsuza kadar boş ekranda kalmasın.
  // Belirli bir süre sonra kapı zorla açılır; bu noktada signOut sırasında
  // zaten temizlenmiş olan eski kullanıcı verisi ekranda görünmez.
  const FORCE_OPEN_MS = 12000;
  const [forceOpen, setForceOpen] = useState(false);
  const forceOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!currentUserId || dataSynced) {
      setForceOpen(false);
      if (forceOpenTimer.current) {
        clearTimeout(forceOpenTimer.current);
        forceOpenTimer.current = null;
      }
      return;
    }

    if (forceOpenTimer.current) return;
    forceOpenTimer.current = setTimeout(() => {
      devWarn('[Wortly][gate] Senkronizasyon zaman aşımına uğradı, kapı zorla açılıyor.', {
        profileSynced: profileSyncedUserId === currentUserId,
        wordsSynced: wordsSyncedUserId === currentUserId,
        sessionsSynced: sessionsSyncedUserId === currentUserId,
      });
      forceOpenTimer.current = null;
      setForceOpen(true);
    }, FORCE_OPEN_MS);

    return () => {
      if (forceOpenTimer.current) {
        clearTimeout(forceOpenTimer.current);
        forceOpenTimer.current = null;
      }
    };
  }, [currentUserId, dataSynced, profileSyncedUserId, wordsSyncedUserId, sessionsSyncedUserId]);

  // Sahiplik doğrulaması: cihazdaki kişisel veri YALNIZCA bu kullanıcıya aitse (kayıtlı sahip eşleşiyorsa) gösterilir.
  // Başka kullanıcıya ait ya da sahibi bilinmeyen veri varken eşitleme bitse de, zaman aşımı dolsa da ekranlar açılmaz;
  // bunun yerine güvenli hata ekranı ve "Tekrar dene" gösterilir. Zaman aşımı güvenlik kontrolünü ATLAMAZ.
  const wordsOwner = useWordStore(state => state.wordsOwner);
  const reviewOwner = useWordStore(state => state.reviewOwner);
  const wordCount = useWordStore(state => state.words.length);
  const reviewCount = useWordStore(state => Object.keys(state.reviewStates).length);
  const profileOwner = useUserStore(state => state.profileOwner);
  const sessionsOwner = useSessionStore(state => state.sessionsOwner);
  const sessionCount = useSessionStore(state => state.sessions.length);
  const gate = computeAccessGate({
    userId: currentUserId,
    dataSynced,
    forceOpen,
    state: { profile, profileOwner, wordsOwner, wordCount, reviewOwner, reviewCount, sessionsOwner, sessionCount },
  });
  const isUserDataSynced = gate.isUserDataSynced;
  const syncProblem = gate.syncProblem;
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryAttempts, setRetryAttempts] = useState(0);
  // "Tekrar dene": yalnızca eşitlemeyi yeniden başlatır (idempotent); veri silmez veya çoğaltmaz.
  const retrySync = () => {
    if (!currentUserId || retryBusy) return;
    setRetryBusy(true);
    void Promise.allSettled([
      syncProfile(currentUserId), syncWords(currentUserId), syncSessions(currentUserId),
    ]).finally(() => { setRetryAttempts(count => count + 1); setRetryBusy(false); });
  };

  useEffect(() => {
    devLog('[Wortly][gate] durum:', {
      isLoaded, isAuthLoaded, hasUser: !!currentUserId,
      profileSynced: profileSyncedUserId === currentUserId,
      wordsSynced: wordsSyncedUserId === currentUserId,
      sessionsSynced: sessionsSyncedUserId === currentUserId,
      areWordsLoaded, areSessionsLoaded, isUserDataSynced,
    });
  }, [isLoaded, isAuthLoaded, currentUserId, profileSyncedUserId, wordsSyncedUserId, sessionsSyncedUserId, areWordsLoaded, areSessionsLoaded, isUserDataSynced]);

  // Bekleyen (çevrimdışı yapılmış) değişiklikleri uygulama açıkken de buluta gönderir:
  // uygulama öne gelince ve bekleyen kayıt varken düzenli aralıklarla yeniden dener.
  // Bağlantı var görünse de Supabase erişilemeyebileceği için başarı, kuyruğun
  // boşalmasıyla ölçülür; başarısız kayıtlar kuyrukta kalır. Eşzamanlı çağrılar
  // store içinde tek isteğe indirgenir.
  const FLUSH_INTERVAL_MS = 30000;
  useEffect(() => {
    if (!currentUserId || !isUserDataSynced) return;
    const flush = () => {
      if (AppState.currentState !== 'active') return;
      void getPendingChangeCount(currentUserId).then((count) => {
        if (count > 0) return flushPendingChanges(currentUserId);
      }).catch((error) => devWarn('[Wortly] Bekleyen değişiklikler gönderilemedi:', error));
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        flush();
        void refreshLearningData(currentUserId);
      }
    });
    const timer = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [currentUserId, isUserDataSynced]);

  // Hatırlatma planını güncel veriden yeniden kurar (açılış, öne gelme, çalışma/ayar/gün değişimi);
  // çıkış yapılmışsa Wortly hatırlatmalarını iptal eder. Veri eşitlenmeden planlanmaz.
  useReminderSync(currentUserId, isAuthLoaded && isUserDataSynced);

  // Bildirime dokunma: karar saf mantıkta verilir (utils/notification-routing.ts).
  // - Oturum yoksa korumalı ekrana gidilmez; bildirim sahibi giriş yaparsa (süre dolmadıysa) işlenir.
  // - Başka hesabın bildirimi hiçbir şey göstermez ve yönlendirmez.
  // - Aynı dokunma bir kez işlenir; işlenenler kalıcıdır (uygulama yeniden açılınca tekrar tetiklenmez).
  useEffect(() => {
    let active = true;
    void loadHandledTaps().then((keys) => {
      if (!active) return;
      keys.forEach(key => handledTapsRef.current.add(key));
      setHandledTapsLoaded(true);
    });
    return () => { active = false; };
  }, []);

  // Cihazlar arası öğrenme senkronizasyonu (varsayılan KAPALI; EXPO_PUBLIC_LEARNING_SYNC=true gerekir).
  // Kapıyı beklemez. Kelime senkronu bitince (reviewStates sahipliği netleşince) konu ilerlemesi,
  // yerel senaryo listesi bu kullanıcı için yüklenince senaryo sonuçları eşitlenir.
  useEffect(() => {
    if (!isLearningSyncEnabled() || !session?.user.id) return;
    if (wordsSyncedUserId !== session.user.id) return;
    void syncProgress(session.user.id, { full: true });
  }, [wordsSyncedUserId, session?.user.id, syncProgress]);

  useEffect(() => {
    if (!isLearningSyncEnabled() || !session?.user.id) return;
    if (scenarioResultsOwner !== session.user.id) return;
    void syncScenarioResults(session.user.id, { full: true });
  }, [scenarioResultsOwner, session?.user.id, syncScenarioResults]);

  // Bildirime dokunma (uygulama kapalıyken, arka plandayken ya da açıkken) yakalanır ve bekletilir.
  useEffect(() => subscribeToNotificationResponses(setPendingResponse), []);

  const isAppReady =
    isLoaded && isAuthLoaded && isUserDataSynced && !!currentUserId && !!profile?.onboardingCompleted;
  useEffect(() => {
    if (!pendingResponse || !handledTapsLoaded || !isAuthLoaded || !navigationState?.key) return;
    if (!isNotificationTap(pendingResponse)) {
      setPendingResponse(null);
      return;
    }
    const request = pendingResponse.notification.request;
    const key = `${request.identifier}:${pendingResponse.notification.date}`;
    const now = Date.now();
    if (!firstSeenTapRef.current.has(key)) firstSeenTapRef.current.set(key, now);

    const decision = decideTap({
      tap: { key, data: request.content.data },
      currentUserId,
      appReady: isAppReady,
      handled: handledTapsRef.current,
      firstSeenAt: firstSeenTapRef.current.get(key) ?? now,
      now,
    });
    if (decision.action === 'wait') return; // oturum/veri hazır olunca yeniden değerlendirilir; yanıt bekletilir
    // Karar verildi (yönlendir / yok say): yanıt bir daha işlenmesin. Aynı dokunuş hem başlangıç yanıtından hem
    // dinleyiciden gelebilir; işlenenler eşzamanlı olarak kümeye eklenir, böylece çift yönlendirme olmaz.
    setPendingResponse(null);
    clearHandledNotificationResponse();
    if (decision.markHandled) {
      handledTapsRef.current.add(key);
      void markTapHandled(key);
    }
    if (decision.action !== 'navigate') return;
    // Rota dokunma anındaki gerçek veriden hesaplanır. Mini quiz yalnızca bu hesapta var olan bir kelime için açılır
    // (silinmiş/başka hesaba ait kelime kimliği tekrar akışına düşer). Ana Sayfa için navigate, yığında ikinci bir
    // Ana Sayfa oluşturmaz.
    if (decision.target === 'quiz') router.push(getNotificationRoute({ wordId: decision.wordId }) as any);
    else if (decision.target === 'review') router.push(getReviewRoute() as any);
    else router.navigate('/(tabs)' as any);
  }, [pendingResponse, handledTapsLoaded, isAuthLoaded, isAppReady, navigationState?.key, currentUserId, router]);

  if (!isThemeLoaded) return null;

  if (isLoaded && isAuthLoaded && syncProblem) {
    return <SyncProblemScreen onRetry={retrySync} busy={retryBusy} attempts={retryAttempts} email={session?.user.email ?? null} />;
  }

  // Veriler yüklenirken (ağ yavaşsa birkaç saniye sürebilir) boş ekran yerine marka ve yükleme göstergesi.
  if (!isLoaded || !isAuthLoaded || !isUserDataSynced) {
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.warmWhite, alignItems: 'center', justifyContent: 'center', gap: 20 }}
        accessibilityRole="progressbar"
        accessibilityLabel="Wortly yükleniyor"
      >
        <BrandMark />
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.warmWhite }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AchievementTracker />
        <ThemeProvider value={navigationTheme}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.warmWhite } }}>
        <Stack.Screen
          name="auth"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="onboarding"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="profile"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="oturum-arsivi"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="basarilarim"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="mini-quiz"
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
        <Stack.Screen
          name="analiz"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="senaryolar/index"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="senaryolar/[id]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="(tabs)"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="konu/[id]/flashcard"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="konu/[id]/kelimeler"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="konu/[id]/alistirma"
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
        <Stack.Screen
          name="alistirma/dogru-yanlis"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="alistirma/dinle-sec"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="alistirma/dinle-yaz"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="alistirma/yazma"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="alistirma/cumle"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="alistirma/sonuc"
          options={{ animation: 'fade' }}
        />
        <Stack.Screen
          name="kelime/ekle"
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
        <Stack.Screen
          name="kelime/calis"
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
        <Stack.Screen
          name="kelime/[id]"
          options={{ animation: 'slide_from_right' }}
        />
        </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
