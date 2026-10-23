import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useUserStore, useWordStore, useSessionStore } from '../store';
import { useAuthStore } from '../store/auth';

export default function RootLayout() {
  const {
    loadProfile, syncProfile, isLoaded,
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
      console.warn('[Wortly][gate] Senkronizasyon zaman aşımına uğradı, kapı zorla açılıyor.', {
        currentUserId,
        profileSyncedUserId,
        wordsSyncedUserId,
        sessionsSyncedUserId,
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
    console.warn('[Wortly][gate] durum:', {
      isLoaded, isAuthLoaded, currentUserId,
      profileSyncedUserId, wordsSyncedUserId, sessionsSyncedUserId,
      areWordsLoaded, areSessionsLoaded, isUserDataSynced,
    });
  }, [isLoaded, isAuthLoaded, currentUserId, profileSyncedUserId, wordsSyncedUserId, sessionsSyncedUserId, areWordsLoaded, areSessionsLoaded, isUserDataSynced]);

  if (!isLoaded || !isAuthLoaded || !isUserDataSynced) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
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
