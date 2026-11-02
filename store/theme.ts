import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, Platform } from 'react-native';

// Görünüm tercihi cihaza özeldir: yalnızca AsyncStorage'da tutulur, hesaba veya
// Supabase'e bağlı değildir ve çıkış/hesap değişiminde silinmez.
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCE_KEY = '@wortly:theme-preference';

const STORAGE_TIMEOUT_MS = 3000;

const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

// Alert, klavye ve sistem çubukları gibi native bileşenler de seçilen temayı izlesin.
// Web'de bu API yoktur; orada yalnızca JS tarafındaki renkler kullanılır.
function applyNativeColorScheme(preference: ThemePreference) {
  if (Platform.OS === 'web') return;
  try {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
  } catch {
    // Native uygulama başarısız olsa da JS renkleri çalışmaya devam eder.
  }
}

interface ThemeStore {
  preference: ThemePreference;
  isLoaded: boolean;
  loadTheme: () => Promise<void>;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  preference: 'system',
  isLoaded: false,

  loadTheme: async () => {
    try {
      const stored = await Promise.race([
        AsyncStorage.getItem(THEME_PREFERENCE_KEY),
        new Promise<null>(resolve => setTimeout(() => resolve(null), STORAGE_TIMEOUT_MS)),
      ]);
      const preference = isThemePreference(stored) ? stored : 'system';
      applyNativeColorScheme(preference);
      set({ preference, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
  },

  setPreference: async (preference) => {
    // Seçim anında uygulanır; kalıcı kayıt başarısız olursa bu oturumda yine geçerli kalır.
    applyNativeColorScheme(preference);
    set({ preference });
    try {
      await AsyncStorage.setItem(THEME_PREFERENCE_KEY, preference);
    } catch {
      // Kayıt edilemeyen tercih bir sonraki açılışta sistem temasına döner.
    }
  },
}));
