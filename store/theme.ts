import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, Platform } from 'react-native';
import { loadThemePreference, THEME_PREFERENCE_KEY, type ThemePreference } from '../utils/theme-preference';

// Görünüm tercihi cihaza özeldir: yalnızca AsyncStorage'da tutulur, hesaba veya
// Supabase'e bağlı değildir ve çıkış/hesap değişiminde silinmez.
export type { ThemePreference } from '../utils/theme-preference';
export { THEME_PREFERENCE_KEY };

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
    // Saf yükleyici asla fırlatmaz ve takılmaz: okunamazsa/zaman aşımında "sistem" kullanılır, kayıtlı değer SİLİNMEZ.
    const { preference } = await loadThemePreference(AsyncStorage);
    try {
      applyNativeColorScheme(preference);
    } finally {
      set({ preference, isLoaded: true });
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
