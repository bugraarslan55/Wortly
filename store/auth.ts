import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../utils/supabase';
import { clearPronunciationRecordings } from '../utils/pronunciation-storage';
import { cancelReviewReminders, revokeReminderOwner, setReminderOwner } from '../utils/review-reminder';
import { runSignOut, type SignOutResult } from '../utils/sign-out-flow';
import { useWordStore, useUserStore, useSessionStore, purgeAccountStorage } from './index';
import { useAchievementStore } from './achievements';
import { usePhrasebookStore } from './phrasebook';
import {
  ACCOUNT_DELETE_CONFIRM_VALUE, interpretDeleteResponse, runAccountDeletion, type AccountDeletionResult,
} from '../utils/account-deletion';
import { isServerReachable } from '../utils/connectivity';
import { APP_SCHEME, parseAuthLink } from '../utils/auth-link';
import type { RecoveryStatus } from '../utils/recovery-gate';

type AuthResult =
  | { ok: true; session: Session | null }
  | { ok: false; message: string };

type PasswordResetResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

interface AuthStore {
  session: Session | null;
  /**
   * Şifre sıfırlama kapısı (utils/recovery-gate.ts): yeni şifre YALNIZCA bu cihazda doğrulanmış sıfırlama oturumunun hesabına
   * uygulanır. `updateUser` açık oturumun hesabını güncellediğinden, doğrulanmamış bir bağlantıyla açık gmail oturumunun
   * şifresi yanlışlıkla değiştirilebilirdi.
   */
  recoveryStatus: RecoveryStatus;
  recoveryUserId: string | null;
  /** Şifre güncellendi: sıfırlama yetkisini tüketir. */
  finishRecovery: () => void;
  isLoaded: boolean;
  isBusy: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  resetPasswordForEmail: (email: string) => Promise<PasswordResetResult>;
  handleAuthUrl: (url: string) => Promise<boolean>;
  signOut: () => Promise<SignOutResult>;
  /** Hesabı sunucuda kalıcı siler (kimlik doğrulaması sunucuda yapılır), sonra yalnızca bu hesabın yerel verisini temizler. */
  deleteAccount: () => Promise<AccountDeletionResult>;
}

/** Sunucudaki silme isteği zaman aşımı (ms). */
const DELETE_ACCOUNT_TIMEOUT_MS = 30000;

let listenerStarted = false;

/** İşlenen PKCE kodları (aynı bağlantı bir oturumda bir kez değiştirilir). */
const handledCodes = new Map<string, Promise<boolean>>();
const MAX_HANDLED_CODES = 20;

const getAuthMessage = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.';
  if (normalized.includes('user already registered')) return 'Bu e-posta zaten kayıtlı.';
  if (normalized.includes('password should be at least')) return 'Şifre en az 6 karakter olmalı.';
  if (normalized.includes('email not confirmed')) return 'Önce e-posta adresini doğrulamalısın.';
  if (normalized.includes('rate limit')) return 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.';
  return 'İşlem sırasında bir hata oluştu. Lütfen tekrar dene.';
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  session: null,
  recoveryStatus: 'none',
  recoveryUserId: null,
  finishRecovery: () => set({ recoveryStatus: 'none', recoveryUserId: null }),
  isLoaded: false,
  isBusy: false,

  initialize: async () => {
    if (get().isLoaded) return;

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      set({ session: null, isLoaded: true });
    } else {
      set({ session: data.session, isLoaded: true });
    }

    if (!listenerStarted) {
      listenerStarted = true;
      supabase.auth.onAuthStateChange((event, session) => {
        set(state => {
          // Şifre kurtarma bağlantısı değiştirildiğinde Supabase bu olayı OLAYI TAŞIYAN oturumla tetikler: sıfırlama yetkisi o
          // hesaba bağlanır. Oturum başka hesaba geçerse/kapanırsa eski yetki düşer (aynı hesabın jeton yenilemesi korur).
          if (event === 'PASSWORD_RECOVERY' && session) {
            return { session, recoveryStatus: 'ready' as const, recoveryUserId: session.user.id };
          }
          const keep = !!session && session.user.id === state.recoveryUserId;
          return {
            session,
            recoveryUserId: keep ? state.recoveryUserId : null,
            recoveryStatus: keep ? state.recoveryStatus : (state.recoveryStatus === 'verifying' ? 'verifying' : 'none'),
          };
        });
      });
    }
  },

  signIn: async (email, password) => {
    set({ isBusy: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    set({ isBusy: false });

    if (error) return { ok: false, message: getAuthMessage(error.message) };
    set({ session: data.session, recoveryStatus: 'none', recoveryUserId: null });
    return { ok: true, session: data.session };
  },

  signUp: async (email, password) => {
    set({ isBusy: true });
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: Linking.createURL('auth/callback'),
      },
    });
    set({ isBusy: false });

    if (error) return { ok: false, message: getAuthMessage(error.message) };
    set({ session: data.session, recoveryStatus: 'none', recoveryUserId: null });
    return { ok: true, session: data.session };
  },

  resetPasswordForEmail: async (email) => {
    set({ isBusy: true });
    const redirectTo = Platform.OS === 'web'
      ? `${window.location.origin}/auth/reset`
      : Linking.createURL('auth/reset');
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    set({ isBusy: false });

    if (error) return { ok: false, message: getAuthMessage(error.message) };
    return { ok: true, message: 'Şifre sıfırlama bağlantısı e-posta adresine gönderildi.' };
  },

  handleAuthUrl: async (url) => {
    // Tek geçit: yalnızca uygulamanın kendi ürettiği auth/callback ve auth/reset bağlantılarındaki tek kullanımlık PKCE kodu
    // kabul edilir. Ham belirteç taşıyan HİÇBİR bağlantı oturum kuramaz (belirteçle oturum kurma yolu kaldırıldı); başka
    // yol/şema reddedilir (utils/auth-link.ts). Kod, akışı başlatan cihazın yerel doğrulayıcısıyla değiştirilir; doğrulayıcı
    // yoksa/uyuşmuyorsa değişim başarısız olur ve mevcut oturum DEĞİŞMEZ.
    const link = parseAuthLink(url, {
      appScheme: APP_SCHEME,
      allowExpoDev: typeof __DEV__ !== 'undefined' && __DEV__,
      webOrigin: Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : null,
    });
    if (!link) return false;

    // Aynı bağlantıyı layout ve callback ekranı birlikte işleyebilir; tek kullanımlık kod bir kez gönderilir (ikinci deneme,
    // başka bir bekleyen akışın doğrulayıcısıyla eşleşip onu tüketebilirdi).
    const known = handledCodes.get(link.code);
    if (known) return known;

    // Şifre sıfırlama yolu: kod değişimi bitene dek form "doğrulanıyor" durumundadır; başarısızlıkta açık oturumun hesabına
    // şifre YAZILMASIN diye durum 'failed' olur (utils/recovery-gate.ts).
    if (link.route === 'reset') set({ recoveryStatus: 'verifying', recoveryUserId: null });

    const exchange = (async () => {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(link.code);
        if (error || !data?.session) {
          if (link.route === 'reset') set({ recoveryStatus: 'failed', recoveryUserId: null });
          return false;
        }
        // (supabase-js `redirectType`'ı çalışma zamanında döndürür; tip tanımında yoktur.)
        const { redirectType } = data as typeof data & { redirectType?: string | null };
        // Şifre sıfırlamayı başlatan istek doğrulayıcıyı "recovery" olarak işaretler; yönlendirme ve şifre yetkisi URL'ye değil
        // buna bağlıdır. Yetki, kodu değiştirerek kurulan oturumun hesabına verilir (açık eski oturuma değil).
        if (redirectType === 'recovery') {
          // Yönlendirme burada DEĞİL, app/_layout.tsx içinde (oturum ve Stack.Protected güncellendikten sonra) yapılır.
          set({ session: data.session, recoveryStatus: 'ready', recoveryUserId: data.session.user.id });
        } else {
          set({ session: data.session, recoveryStatus: link.route === 'reset' ? 'failed' : 'none', recoveryUserId: null });
        }
        return true;
      } catch {
        if (link.route === 'reset') set({ recoveryStatus: 'failed', recoveryUserId: null });
        return false;
      }
    })();
    handledCodes.set(link.code, exchange);
    if (handledCodes.size > MAX_HANDLED_CODES) handledCodes.delete(handledCodes.keys().next().value as string);
    return exchange;
  },

  signOut: async () => {
    const previousUserId = get().session?.user.id;
    // Çıkış başarısız olursa (ağ hatası vb.) oturum açık kalır: yerel veri silinmez ve bildirim
    // sahipliği geri yüklenir. Başarılıysa yerel state/AsyncStorage temizlenir, sonra session sıfırlanır
    // (auth ekranına geçildiğinde hiçbir ekran eski kullanıcının verisini bellekte tutmaz).
    return runSignOut(previousUserId, {
      revokeOwner: revokeReminderOwner,
      restoreOwner: setReminderOwner,
      remoteSignOut: () => supabase.auth.signOut(),
      wipeLocal: async () => {
        await Promise.all([
          useWordStore.getState().resetLocal(),
          useUserStore.getState().resetLocal(),
          useSessionStore.getState().resetLocal(),
          Promise.resolve(useAchievementStore.getState().reset()),
          Promise.resolve(usePhrasebookStore.getState().reset()),
          clearPronunciationRecordings(previousUserId),
          cancelReviewReminders(),
        ]);
      },
      clearSession: () => set({ session: null, recoveryStatus: 'none', recoveryUserId: null }),
    });
  },

  deleteAccount: async () => {
    const userId = get().session?.user.id;
    return runAccountDeletion(userId, {
      isOnline: () => isServerReachable(
        process.env.EXPO_PUBLIC_SUPABASE_URL,
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      ),
      revokeOwner: revokeReminderOwner,
      restoreOwner: setReminderOwner,
      // Silinecek hesap istemciden gönderilmez: sunucu, isteğin erişim belirtecinden kullanıcıyı kendisi doğrular.
      remoteDelete: async () => {
        try {
          return interpretDeleteResponse(await supabase.functions.invoke('delete-account', {
            body: { confirm: ACCOUNT_DELETE_CONFIRM_VALUE },
            timeout: DELETE_ACCOUNT_TIMEOUT_MS,
          }));
        } catch {
          return { ok: false, reason: 'network' };
        }
      },
      wipeLocal: async (deletedUserId) => {
        // Önce bellekteki store'lar (geç yazmalar silinen veriyi geri getirmesin), sonra kalıcı anahtarlar.
        // Profil bekleyen kaydı yalnızca bu kullanıcınınkiyle sınırlıdır; telaffuz temizliği sahipliği doğrulayamadığı
        // dosyayı silmez. `false` dönen adım (telaffuz/bildirim) tamamlanamamış temizliktir.
        const steps = await Promise.allSettled([
          useWordStore.getState().resetLocal(),
          useUserStore.getState().resetLocal({ pendingOwnerId: deletedUserId }),
          useSessionStore.getState().resetLocal(),
          Promise.resolve(useAchievementStore.getState().reset()),
          Promise.resolve(usePhrasebookStore.getState().reset()),
          clearPronunciationRecordings(deletedUserId, { strict: true }),
          cancelReviewReminders(),
        ]);
        let purgeError: unknown = null;
        try {
          await purgeAccountStorage(deletedUserId);
        } catch (error) {
          purgeError = error;
        }
        const incomplete = steps.some(step => step.status === 'rejected' || (step.status === 'fulfilled' && step.value === false));
        if (purgeError || incomplete) throw purgeError ?? new Error('Yerel temizlik eksik kaldı');
      },
      // Sunucuda hesap artık yok: ağ çağrısı yapmadan yalnızca yerel oturum kaydı silinir.
      endSession: async () => {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
      },
      clearSession: () => set({ session: null, recoveryStatus: 'none', recoveryUserId: null }),
    });
  },
}));
