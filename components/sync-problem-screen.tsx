import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing } from '../constants/theme';
import { BrandMark, PrimaryButton } from './ui';

/**
 * Veriler bu hesap için doğrulanamadığında (ör. cihazda başka bir hesaba ait ya da sahibi bilinmeyen kayıt var ve
 * eşitleme tamamlanamadı) gösterilir. Kişisel veri HİÇ gösterilmez; cihazdaki hiçbir veri silinmez.
 * `attempts`: kullanıcı kaç kez "Tekrar dene" dedi (sonuç hâlâ başarısızsa bu ekran yine gösterilir).
 */
export function SyncProblemScreen({
  onRetry, busy, attempts = 0, email,
}: { onRetry: () => void; busy?: boolean; attempts?: number; email?: string | null }) {
  return (
    <View style={styles.container}>
      <BrandMark />
      <Text style={styles.title} accessibilityRole="header">Verilerin doğrulanamadı</Text>
      {!!email && <Text style={styles.account}>Giriş yapılan hesap: {email}</Text>}
      <Text style={styles.text} accessibilityLiveRegion="polite">
        Bu cihazdaki kayıtların bu hesaba ait olduğu doğrulanamadı ya da eşitleme tamamlanamadı. Güvenliğin için kişisel
        verilerin şu an gösterilmiyor. Cihazdaki hiçbir veri silinmedi.
      </Text>
      <Text style={styles.text}>
        İnternet bağlantını kontrol edip tekrar dene. Tekrar denemek verilerini değiştirmez veya çoğaltmaz.
      </Text>
      {attempts > 0 && !busy && (
        <Text style={styles.failed} accessibilityLiveRegion="polite">
          Son deneme tamamlanamadı. Verilerin güvende; bağlantını kontrol edip yeniden dene.
        </Text>
      )}
      <PrimaryButton label="Tekrar dene" onPress={onRetry} loading={busy} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: Colors.warmWhite, alignItems: 'center', justifyContent: 'center',
    gap: Spacing.lg, paddingHorizontal: Spacing.xl,
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  account: { fontSize: 13, fontWeight: '600', color: Colors.secondary, textAlign: 'center' },
  text: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 21 },
  failed: { fontSize: 13, fontWeight: '600', color: Colors.error, textAlign: 'center', lineHeight: 19 },
  button: { alignSelf: 'stretch' },
});
