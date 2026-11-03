import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { evaluateDevEnvironment } from './env-safety';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Supabase yapılandırması eksik: EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY gerekli.',
  );
}

// Geliştirme çalıştırmasında bağlı projenin "test" olarak işaretlenmediği durumda bir kez uyarır (hiçbir değer yazdırılmaz).
const devReport = evaluateDevEnvironment({ appEnv: process.env.EXPO_PUBLIC_APP_ENV, isDev: typeof __DEV__ !== 'undefined' && __DEV__ });
if (devReport.message) console.warn(devReport.message);

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
