import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BorderRadius, Spacing } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import { AppIcon } from '../components/app-icon';
import { BadgeCard } from '../components/badge-card';
import { Card, IconTile, ProgressBar, SectionTitle } from '../components/ui';
import { useAchievementViews } from '../components/use-achievements';

export default function AchievementsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { badges, earnedCount } = useAchievementViews();
  const earned = badges.filter(badge => badge.earned);
  const locked = badges.filter(badge => !badge.earned);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as any);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Geri">
          <AppIcon name="chevron.left" size={16} color={colors.onSurfaceVariant} />
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Başarılarım</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View
          style={styles.summary}
          accessible
          accessibilityLabel={`${badges.length} rozetten ${earnedCount} tanesini kazandın`}
        >
          <View style={styles.summaryTop}>
            <IconTile name="medal" size={52} tone="gold" />
            <View style={styles.summaryText}>
              <Text style={styles.summaryCount} maxFontSizeMultiplier={1.3}>{earnedCount} / {badges.length}</Text>
              <Text style={styles.summaryLabel}>rozet kazanıldı</Text>
            </View>
          </View>
          <ProgressBar value={earnedCount} max={badges.length} label="Kazanılan rozet oranı" />
        </View>

        <SectionTitle>Kazanılanlar</SectionTitle>
        {earned.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Henüz rozet kazanmadın</Text>
            <Text style={styles.emptyText}>İlk alıştırmanı tamamlayarak ilk rozetini kazanabilirsin.</Text>
          </Card>
        ) : (
          earned.map(badge => <BadgeCard key={badge.id} badge={badge} />)
        )}

        {locked.length > 0 && <SectionTitle>Kilitli rozetler</SectionTitle>}
        {locked.map(badge => <BadgeCard key={badge.id} badge={badge} />)}

        <View style={styles.note} accessibilityRole="text">
          <AppIcon name="lock.fill" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.noteText}>
            Rozetler yalnızca bu cihazdaki gerçek çalışma verilerinle hesaplanır ve bu cihazda saklanır. Aynı
            hesabı başka bir cihazda kullanırsan oradaki rozetler farklı görünebilir. Kanıtlayamadığımız hiçbir
            rozet verilmez. Gösterilen tarih, rozetin bu cihazda ilk doğrulandığı gündür; gerçek kazanma anı
            daha eski olabilir.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: {
    minHeight: 56, paddingHorizontal: Spacing.marginMain,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backButton: { minWidth: 72, minHeight: Spacing.touchTargetMin, flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  content: { paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm, paddingBottom: Spacing.xl, gap: Spacing.sm + 2 },
  summary: {
    backgroundColor: Colors.navy, borderRadius: BorderRadius.xxl, borderCurve: 'continuous',
    padding: Spacing.lg, gap: Spacing.md, boxShadow: '0 8px 22px rgba(26, 31, 43, 0.2)',
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  summaryText: { flex: 1 },
  summaryCount: { fontSize: 30, lineHeight: 36, fontWeight: '700', color: Colors.golden },
  summaryLabel: { fontSize: 13, color: '#B8BCC8' },
  emptyCard: { gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  emptyText: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 18 },
  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: Colors.surfaceContainerLow,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, color: Colors.onSurfaceVariant },
}));
