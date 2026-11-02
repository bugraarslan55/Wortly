import { useEffect, useMemo, useRef, useState } from 'react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRootNavigationState, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { AppState, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  flushPendingChanges, getPendingChangeCount,
  useUserStore, useWordStore, useSessionStore,
} from '../store';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { useTheme } from '../hooks/use-theme';
import {
  clearHandledNotificationResponse, isNotificationTap, NotificationTapResponse, REVIEW_NOTIFICATION_TYPE,
  setReminderContentProvider, subscribeToNotificationResponses, syncReminderForUser,
} from '../utils/review-reminder';
import { getNotificationRoute } from '../utils/review-route';
import { getMiniQuizReminderContent } from '../utils/mini-quiz';

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
  const handledNotificationRef = useRef<{ key: string; at: number } | null>(null);
  const {
    profile, loadProfile, syncProfile, isLoaded,
    syncedUserId: profileSyncedUserId,
  } = useUserStore();
  const {
    loadWords, syncWords, isLoaded: areWordsLoaded,
    syncedUserId: wordsSyncedUserId,
  } = useWordStore();
  const {
    loadSessions, loadScenarioResults, syncSessions, isLoaded: areSessionsLoaded,
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

  const isUserDataSynced = !currentUserId || dataSynced || forceOpen;

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
      if (state === 'active') flush();
    });
    const timer = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [currentUserId, isUserDataSynced]);

  // Kayıtlı ayardan günlük hatırlatmayı yeniden planlar; çıkış yapılmışsa iptal eder.
  // Bildirim metni için kelime seçilebilsin diye kullanıcı verisi hazır olana kadar beklenir;
  // uygulama her öne geldiğinde de yenilenir (günlük bildirimin içeriği planlama anında sabitlenir).
  useEffect(() => {
    if (!isAuthLoaded) return;
    if (currentUserId && !isUserDataSynced) return;
    void syncReminderForUser(currentUserId);
    if (!currentUserId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncReminderForUser(currentUserId);
    });
    return () => subscription.remove();
  }, [isAuthLoaded, currentUserId, isUserDataSynced]);

  // Bildirime dokunma (uygulama kapalıyken, arka plandayken ya da açıkken) yakalanır ve bekletilir.
  useEffect(() => subscribeToNotificationResponses(setPendingResponse), []);

  // Uygulama hazır olunca bekleyen dokunma işlenir: mini quiz (ya da kelime yoksa tekrar akışı).
  const isAppReady =
    isLoaded && isAuthLoaded && isUserDataSynced && !!currentUserId && !!profile?.onboardingCompleted;
  useEffect(() => {
    if (!pendingResponse || !isAppReady || !navigationState?.key) return;
    setPendingResponse(null);
    clearHandledNotificationResponse();
    if (!isNotificationTap(pendingResponse)) return;

    const { notification } = pendingResponse;
    const data = notification.request.content.data;
    if (data?.type !== REVIEW_NOTIFICATION_TYPE || data.userId !== currentUserId) return;

    // Aynı dokunuş hem başlangıç yanıtından hem dinleyiciden gelebilir; kısa sürede tekrarı yok sayılır.
    // (Günlük bildirimin kimliği sabit olduğundan kimlik tek başına ayırt edici değildir.)
    const key = `${notification.request.identifier}:${notification.date}`;
    const handled = handledNotificationRef.current;
    if (handled && handled.key === key && Date.now() - handled.at < 5000) return;
    handledNotificationRef.current = { key, at: Date.now() };
    router.push(getNotificationRoute(data) as any);
  }, [pendingResponse, isAppReady, navigationState?.key, currentUserId, router]);

  if (!isLoaded || !isAuthLoaded || !isUserDataSynced || !isThemeLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.warmWhite }}>
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
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
