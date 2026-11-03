import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BorderRadius, Spacing } from '../constants/theme';
import { makeStyles, useTheme } from '../hooks/use-theme';

/**
 * Bağlantı güvenliği nedeniyle Supabase bağlantısı kurulmadığında gösterilen yapılandırma hatası ekranı.
 * Gerçek adres, anahtar veya proje kimliği ASLA gösterilmez; yalnızca açıklama ve neden kodu görünür.
 * Bu ekran gösterilirken oturum başlatma, veri yükleme ve arka plan senkronizasyonu çalışmaz (kök yerleşim bunları başlatmaz).
 */
export function ConnectionBlockedScreen({ reason, message, onShown }: { reason: string; message: string; onShown?: () => void }) {
  const styles = useStyles();
  const { isDark } = useTheme();

  useEffect(() => { onShown?.(); }, [onShown]);

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} accessibilityRole="alert">
          <Text style={styles.eyebrow}>YAPILANDIRMA HATASI</Text>
          <Text style={styles.title} accessibilityRole="header">Uygulama veriye bağlanmadı</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ne yapmalı?</Text>
            <Text style={styles.step}>• Bu bir test/geliştirme sürümüyse .env.local dosyasında test projesini ve ortam işaretini ayarla.</Text>
            <Text style={styles.step}>• Gerçek hesabınla giriş yapmak için mağazadan yayın sürümünü kullan.</Text>
            <Text style={styles.step}>• Hiçbir veriniz silinmedi veya değiştirilmedi.</Text>
          </View>
          <Text style={styles.code}>Kod: {reason}</Text>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  content: { padding: Spacing.marginMain, gap: Spacing.md, flexGrow: 1, justifyContent: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: Colors.secondary },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: Colors.primary },
  message: { fontSize: 15, lineHeight: 22, color: Colors.onSurfaceVariant },
  card: {
    gap: Spacing.sm, padding: Spacing.md, borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: Colors.divider,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  step: { fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant },
  code: { fontSize: 12, color: Colors.onSurfaceVariant },
}));
