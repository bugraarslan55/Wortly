import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '../utils/supabase';
import { clearPronunciationRecordings } from '../utils/pronunciation-storage';
import { useWordStore, useUserStore, useSessionStore } from './index';

type AuthResult =
  | { ok: true; session: Session | null }
  | { ok: false; message: string };

type PasswordResetResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

interface AuthStore {
  session: Session | null;
  isLoaded: boolean;
  isBusy: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  resetPasswordForEmail: (email: string) => Promise<PasswordResetResult>;
  handleAuthUrl: (url: string) => Promise<boolean>;
  signOut: () => Promise<void>;
}

let listenerStarted = false;

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
        set({ session });
        // Şifre kurtarma bağlantısı açıldığında Supabase bu olayı tetikler;
        // kullanıcıyı doğrudan yeni şifre belirleme ekranına yönlendir.
        if (event === 'PASSWORD_RECOVERY') {
          router.replace('/auth/reset');
        }
      });
    }
  },

  signIn: async (email, password) => {
    set({ isBusy: true });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    set({ isBusy: false });

    if (error) return { ok: false, message: getAuthMessage(error.message) };
    set({ session: data.session });
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
    set({ session: data.session });
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
    const { queryParams } = Linking.parse(url);
    const getQueryParam = (name: string) => {
      const value = queryParams?.[name];
      if (Array.isArray(value)) return value[0] ?? null;
      return typeof value === 'string' ? value : null;
    };

    // Supabase password-recovery links return the session in the URL hash
    // (`access_token`, `refresh_token`, `type=recovery`). The client has
    // detectSessionInUrl disabled, so consume that hash explicitly.
    const hash = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
    const hashParams = new URLSearchParams(hash);
    const accessToken = hashParams.get('access_token') ?? getQueryParam('access_token');
    const refreshToken = hashParams.get('refresh_token') ?? getQueryParam('refresh_token');
    const authType = hashParams.get('type') ?? getQueryParam('type');

    if (accessToken && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) return false;

      set({ session: data.session });
      if (authType === 'recovery') router.replace('/auth/reset');
      return true;
    }

    const code = getQueryParam('code');
    if (!code) return false;

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return false;

    set({ session: data.session });
    return true;
  },

  signOut: async () => {
    const previousUserId = get().session?.user.id;
    await supabase.auth.signOut();
    // Önce önceki kullanıcıya ait yerel state/AsyncStorage'ı temizle, sonra
    // session'ı sıfırla — böylece oturum kapanıp auth ekranına geçildiğinde
    // artık hiçbir ekran eski kullanıcının profil/kelime/geçmiş verisini
    // bellekte tutmuyor olur.
    await Promise.all([
      useWordStore.getState().resetLocal(),
      useUserStore.getState().resetLocal(),
      useSessionStore.getState().resetLocal(),
      clearPronunciationRecordings(previousUserId),
    ]);
    set({ session: null });
  },
}));
