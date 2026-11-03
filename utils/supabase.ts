import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBlockedClient } from './blocked-client';
import { blockMessage, evaluateConnection, isProtectedBuild, type ConnectionVerdict } from './env-safety';

// Bu değişkenler Metro tarafından DERLEME SIRASINDA satır içine alınır (tam ifade olarak yazılmalıdır).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const buildProfile = process.env.EXPO_PUBLIC_BUILD_PROFILE;
const appEnv = process.env.EXPO_PUBLIC_APP_ENV;
const productionRefs = process.env.EXPO_PUBLIC_PRODUCTION_PROJECT_REFS;
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
// EAS'ın derleme sırasında verdiği profil adı (app.config.js → extra.buildProfile). EAS dışı yerel derlemede yoktur.
const easProfile = (Constants.expoConfig?.extra as { buildProfile?: string | null } | undefined)?.buildProfile ?? null;

// Hiçbir ağ/depolama erişimi yapmadan, istemci OLUŞTURULMADAN ÖNCE verilir. Değerlendirme beklenmedik şekilde hata verirse:
// korumalı (geliştirme/preview) derlemede bağlantı engellenir; yayın derlemesinde engellenmez (kilitlenme riski yok).
function decide(): ConnectionVerdict {
  try {
    return evaluateConnection({ isDev, buildProfile, easProfile, url: supabaseUrl, hasKey: !!supabasePublishableKey, appEnv, productionRefs });
  } catch {
    if (isProtectedBuild({ isDev, buildProfile, easProfile })) {
      return { allow: false, mode: 'blocked', reason: 'guard-error', userMessage: blockMessage('guard-error') };
    }
    return { allow: true, mode: 'release', verified: false, reason: 'guard-error-release', userMessage: null };
  }
}

/** Bağlantı kararı: adres, anahtar veya proje kimliği İÇERMEZ; yalnızca neden kodu ve açıklama taşır. */
export const connectionVerdict: ConnectionVerdict = decide();
export const isConnectionBlocked = !connectionVerdict.allow;

if (__DEV__ && !connectionVerdict.allow) console.warn(`[Wortly] Supabase bağlantısı engellendi (${connectionVerdict.reason}). Ayrıntı: docs/dev-environment.md`);

// Engelliyse GERÇEK istemci hiç oluşturulmaz (oturum depolaması da okunmaz).
export const supabase: SupabaseClient = connectionVerdict.allow
  ? createClient(supabaseUrl as string, supabasePublishableKey as string, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })
  : (createBlockedClient() as SupabaseClient);
