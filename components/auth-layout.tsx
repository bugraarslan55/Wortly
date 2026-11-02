import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '../constants/theme';
import { makeStyles } from '../hooks/use-theme';
import { KeyboardSafeView } from './keyboard-safe-view';
import { BrandMark, Card } from './ui';

/**
 * Giriş, kayıt ve şifre sıfırlama ekranlarının ortak iskeleti (iOS ve Android'de aynı).
 * Klavye açıkken açıklama gizlenir ve içerik sıkışır; böylece alanlar ve ana düğme
 * görünür kalır. İçerik yine de taşarsa en alta kaydırılır.
 */
export function AuthLayout({
  title, subtitle, children, footer,
}: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const styles = useStyles();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardSafeView>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[styles.container, keyboardVisible && styles.containerCompact]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            if (keyboardVisible) scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <View style={[styles.brand, keyboardVisible && styles.brandCompact]}>
            <BrandMark />
          </View>

          <View style={[styles.header, keyboardVisible && styles.headerCompact]}>
            <Text style={styles.headline} accessibilityRole="header">{title}</Text>
            {!keyboardVisible && <Text style={styles.subtext}>{subtitle}</Text>}
          </View>

          <Card style={styles.form}>{children}</Card>

          {footer && <View style={styles.footer}>{footer}</View>}
        </ScrollView>
      </KeyboardSafeView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  // Üst ve alt boşluk dengeli; içerik hafifçe yukarı yaslanır (alt boşluk biraz fazla).
  container: {
    flexGrow: 1, justifyContent: 'center',
    paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.md, paddingBottom: Spacing.xl,
  },
  containerCompact: { justifyContent: 'flex-start', paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  brand: { alignItems: 'center', marginBottom: Spacing.md },
  brandCompact: { marginBottom: Spacing.sm },
  header: { alignItems: 'center', marginBottom: Spacing.md, gap: 6 },
  headerCompact: { marginBottom: Spacing.sm },
  headline: {
    fontSize: 25, lineHeight: 32, fontWeight: '700', color: Colors.primary, textAlign: 'center', letterSpacing: -0.3,
  },
  subtext: { fontSize: 15, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 21, maxWidth: 320 },
  form: { gap: Spacing.sm + 4, padding: Spacing.md + 4 },
  footer: { alignItems: 'center', marginTop: Spacing.sm },
}));
