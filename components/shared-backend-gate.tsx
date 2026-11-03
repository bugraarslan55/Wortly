import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BorderRadius, Spacing } from '../constants/theme';
import { makeStyles, useColors, useTheme } from '../hooks/use-theme';
import { useAuthStore } from '../store/auth';
import { allowedTestUserIds, supabase } from '../utils/supabase';
import {
  createAccountVerifier, evaluateAccountGate, type AccountGate, type Verification,
} from '../utils/shared-backend';

/**
 * ORTAK BACKEND (TEST MODU) — yalnızca geliştirmede ve bilinçli olarak etkinleştirildiğinde kullanılır (bkz. docs/dev-environment.md).
 *
 * NOT: Bu hesap kapısı İSTEMCİ TARAFLI bir emniyet önlemidir; gerçek güvenlik sınırı Supabase Auth ve RLS'tir. Amaç yanlışlıkla
 * gerçek bir kullanıcı hesabıyla deneysel kod çalıştırmayı önlemektir.
 */

export const SHARED_BACKEND_BANNER_TEXT = 'TEST MODU — ORTAK VERİTABANI';

function SharedBackendBanner() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.banner, { paddingTop: insets.top + 3 }]}
      accessibilityRole="alert"
      accessibilityLabel="Test modu, ortak veritabanı"
    >
      <Text style={styles.bannerText} numberOfLines={1}>{SHARED_BACKEND_BANNER_TEXT}</Text>
    </View>
  );
}

/**
 * Her ekranın üstünde sade bir şerit. Şerit akışın parçasıdır (içeriğin üstüne binmez); altındaki ekranlar yerel
 * güvenli alanı kendisi hesapladığı için durum çubuğu boşluğu iki kez eklenmez.
 */
export function SharedBackendFrame({ children }: { children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <SafeAreaProvider>
      <View style={styles.frame}>
        <SharedBackendBanner />
        <View style={styles.content}>{children}</View>
      </View>
    </SafeAreaProvider>
  );
}

function GateScreen({ title, message, busy, actions, onShown }: {
  title: string;
  message: string;
  busy?: boolean;
  actions?: { label: string; onPress: () => void }[];
  onShown?: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const { isDark } = useTheme();
  useEffect(() => { onShown?.(); }, [onShown]);
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={styles.screenContent}>
        {busy ? <ActivityIndicator color={colors.secondary} accessibilityLabel="Yükleniyor" /> : null}
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        <Text style={styles.message}>{message}</Text>
        {(actions ?? []).map(action => (
          <TouchableOpacity key={action.label} style={styles.button} onPress={action.onPress} accessibilityRole="button">
            <Text style={styles.buttonText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Oturum açıldığında uygulamanın veri akışları (AppRoot: yükleme, yazma, bildirim, senkron) ancak SUNUCUNUN doğruladığı kullanıcı
 * izin listesindeyse başlar. Oturum varken kimlik doğrulanana kadar `children` HİÇ render edilmez; bu yüzden girişten hemen sonra bile
 * izinsiz bir hesapla hiçbir veri akışı başlamaz. Oturum yoksa yalnızca giriş ekranı gösterilir (veri akışı yoktur).
 */
export function SharedBackendGate({ children, onScreenShown }: { children: React.ReactNode; onScreenShown?: () => void }) {
  const authLoaded = useAuthStore(state => state.isLoaded);
  const session = useAuthStore(state => state.session);
  const sessionUserId = session?.user?.id ?? null;
  const [result, setResult] = useState<{ sessionUserId: string; verification: Verification } | null>(null);
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const signingOut = useRef(false);

  const verifier = useMemo(() => createAccountVerifier(
    () => supabase.auth.getUser() as Promise<{ data: { user: { id: string } | null } | null; error: unknown }>,
    (id, verification) => setResult({ sessionUserId: id, verification }),
  ), []);

  useEffect(() => { void useAuthStore.getState().initialize(); }, []);

  useEffect(() => {
    if (!sessionUserId) {
      verifier.cancel();
      setResult(null);
      return;
    }
    setResult(null); // yeni/değişen kullanıcı: önceki sonuç geçersiz, doğrulama bekleniyor
    void verifier.verify(sessionUserId);
    return () => verifier.cancel();
  }, [sessionUserId, attempt, verifier]);

  // Yalnızca BU oturum kullanıcısına ait sonuç geçerlidir (A'dan B'ye geçişte A'nın sonucu kullanılmaz).
  const verification: Verification = result && result.sessionUserId === sessionUserId ? result.verification : { status: 'pending' };
  const gate: AccountGate = evaluateAccountGate({
    sharedMode: true, authLoaded, sessionUserId, verification, allowedUserIds: allowedTestUserIds,
  });

  const signOutQuietly = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    try {
      // Yerel veri SİLİNMEZ ve mağazalar sıfırlanmaz: yalnızca uzak oturum kapatılır.
      await supabase.auth.signOut();
    } catch {
      // Uzak çıkış başarısız olsa bile yerel oturum bilgisi temizlenir.
    } finally {
      useAuthStore.setState({ session: null });
      signingOut.current = false;
    }
  }, []);

  useEffect(() => {
    if (gate === 'denied') {
      setDenied(true);
      void signOutQuietly();
    }
  }, [gate, signOutQuietly]);

  if (denied) {
    return (
      <GateScreen
        title="Bu hesap test modunda kullanılamaz"
        message="Ortak veritabanında yalnızca önceden belirlenmiş test hesapları kullanılabilir. Oturum kapatıldı; hiçbir veri okunmadı veya değiştirilmedi."
        onShown={onScreenShown}
        actions={[{ label: 'Giriş ekranına dön', onPress: () => setDenied(false) }]}
      />
    );
  }
  if (gate === 'initializing' || gate === 'verifying') {
    return <GateScreen title="Hesap doğrulanıyor" message="Test modunda hesabın doğrulanıyor." busy onShown={onScreenShown} />;
  }
  if (gate === 'unverifiable') {
    return (
      <GateScreen
        title="Hesap doğrulanamadı"
        message="Hesap sunucuda doğrulanamadığı için veri akışı başlatılmadı. İnternet bağlantını kontrol edip tekrar dene."
        onShown={onScreenShown}
        actions={[
          { label: 'Tekrar dene', onPress: () => setAttempt(value => value + 1) },
          { label: 'Oturumu kapat', onPress: () => { void signOutQuietly(); } },
        ]}
      />
    );
  }
  return <>{children}</>;
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  frame: { flex: 1, backgroundColor: Colors.warmWhite },
  content: { flex: 1 },
  banner: { backgroundColor: Colors.golden, paddingBottom: 3, alignItems: 'center', justifyContent: 'center' },
  bannerText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: Colors.onGolden },
  screen: { flex: 1, backgroundColor: Colors.warmWhite },
  screenContent: { padding: Spacing.marginMain, gap: Spacing.md, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: Colors.primary },
  message: { fontSize: 15, lineHeight: 22, color: Colors.onSurfaceVariant },
  button: {
    minHeight: Spacing.touchTargetMin, borderRadius: BorderRadius.full, backgroundColor: Colors.golden,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, alignSelf: 'flex-start',
  },
  buttonText: { fontSize: 15, fontWeight: '700', color: Colors.onGolden },
}));
