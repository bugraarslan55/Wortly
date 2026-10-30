import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUserStore } from '../store';
import { useAuthStore } from '../store/auth';
import { Colors, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { AppIcon } from '../components/app-icon';
import { ReviewReminderCard } from '../components/review-reminder-card';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile } = useUserStore();
  const { session, signOut } = useAuthStore();

  const email = session?.user?.email ?? '—';
  const level = profile?.level ?? 'A1';

  const handleSignOut = () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabından çıkış yapmak istiyor musun?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/auth' as any);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.content}>
        <View style={styles.avatarBox}>
          <AppIcon name="person.crop.circle.fill" size={64} color={Colors.secondary} />
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <AppIcon name="envelope.fill" size={18} color={Colors.secondary} />
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>E-posta</Text>
              <Text style={styles.rowValue}>{email}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <AppIcon name="chart.bar.fill" size={18} color={Colors.secondary} />
            <View style={styles.rowTextBox}>
              <Text style={styles.rowLabel}>Seviye</Text>
              <Text style={styles.rowValue}>{level}</Text>
            </View>
          </View>
        </View>

        <ReviewReminderCard userId={session?.user?.id ?? null} />

        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Çıkış Yap"
        >
          <Text style={styles.signOutBtnText}>Çıkış Yap</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: {
    height: 56,
    paddingHorizontal: Spacing.marginMain,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: { minWidth: 68, paddingVertical: Spacing.sm },
  backText: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  content: { flex: 1, paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.lg, alignItems: 'center' },
  avatarBox: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.level1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  rowTextBox: { flex: 1 },
  rowLabel: { fontSize: 12, fontWeight: '600', color: Colors.outlineVariant, textTransform: 'uppercase' },
  rowValue: { fontSize: 16, fontWeight: '600', color: Colors.primary, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.outlineVariant, opacity: 0.4 },
  signOutBtn: {
    width: '100%',
    marginTop: Spacing.xl,
    height: 52,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.error,
  },
  signOutBtnText: { fontSize: 15, fontWeight: '700', color: Colors.error },
});
