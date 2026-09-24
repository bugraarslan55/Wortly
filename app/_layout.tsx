import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useUserStore, useWordStore, useSessionStore } from '../store';

export default function RootLayout() {
  const { loadProfile, profile, isLoaded } = useUserStore();
  const { loadWords } = useWordStore();
  const { loadSessions } = useSessionStore();

  useEffect(() => {
    loadProfile();
    loadWords();
    loadSessions();
  }, []);

  if (!isLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen
          name="onboarding"
          options={{ animation: 'fade' }}
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
