import { useEffect, useRef, useState } from 'react';
import { Stack, useRootNavigationState, useRouter } from 'expo-router';
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
import { REVIEW_NOTIFICATION_TYPE, syncReminderForUser, useLastNotificationResponse } from '../utils/review-reminder';
import { getReviewRoute } from '../utils/review-route';
import { Colors } from '../constants/theme';

// Android'de ekran geçişlerinde pencere arka planı (siyah) görünmesin; iOS davranışı değişmez.
const androidScreenOptions = Platform.OS === 'android'
  ? { contentStyle: { backgroundColor: Colors.warmWhite } }
  : {};

const devWarn = (...args: unknown[]) => {
  if (__DEV__) console.warn(...args);
};

const devLog = (...args: unknown[]) => {
  if (__DEV__) console.debug(...args);
};

export default function RootLayout() {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const lastNotificationResponse = useLastNotificationResponse();
  const handledNotificationRef = useRef<string | null>(null);
  const {
    profile, loadProfile, syncProfile, isLoaded,
    syncedUserId: profileSyncedUserId,
  } = useUserStore();
  const {
    loadWords, syncWords, isLoaded: areWordsLoaded,
    syncedUserId: wordsSyncedUserId,
  } = useWordStore();
  const {
    loadSessions, syncSessions, isLoaded: areSessionsLoaded,
    syncedUserId: sessionsSyncedUserId,
  } = useSessionStore();
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

    return () => subscription.remove();
  }, [handleAuthUrl, initializeAuth, loadProfile, loadWords, loadSessions]);

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
  useEffect(() => {
    if (!isAuthLoaded) return;
    void syncReminderForUser(currentUserId);
  }, [isAuthLoaded, currentUserId]);

  // Bildirime dokunulunca, uygulama hazır olduktan sonra mevcut tekrar akışına gider.
  const isAppReady =
    isLoaded && isAuthLoaded && isUserDataSynced && !!currentUserId && !!profile?.onboardingCompleted;
  useEffect(() => {
    if (!isAppReady || !navigationState?.key || !lastNotificationResponse) return;
    const request = lastNotificationResponse.notification.request;
    const data = request.content.data;
    if (data?.type !== REVIEW_NOTIFICATION_TYPE || data.userId !== currentUserId) return;

    const handledKey = `${request.identifier}:${lastNotificationResponse.notification.date}`;
    if (handledNotificationRef.current === handledKey) return;
    handledNotificationRef.current = handledKey;
    router.push(getReviewRoute() as any);
  }, [isAppReady, navigationState?.key, lastNotificationResponse, currentUserId, router]);

  if (!isLoaded || !isAuthLoaded || !isUserDataSynced) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, ...androidScreenOptions }}>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
