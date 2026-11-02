import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Spacing, BorderRadius, Shadows } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import { AppIcon } from '../components/app-icon';
import { CATEGORY_LABELS, describeReason, useLearningAnalysis } from '../components/daily-plan-card';
import { AnalysisCategory } from '../utils/learning-analysis';

const CATEGORY_ICONS: Record<AnalysisCategory, string> = {
  dinleme: 'speaker.wave.2.fill',
  yazma: 'pencil.line',
  'dogru-yanlis': 'checkmark.circle.fill',
  senaryo: 'bubble.left.and.bubble.right.fill',
};

export default function AnalysisScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const analysis = useLearningAnalysis();
  const { dailyPlan, dueWords, weakestCategory, categoryStats, totalSessions, overallSuccessRate } = analysis;
  const dueCount = dueWords.length;
  const hasData = totalSessions > 0;

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={styles.title}>Öğrenme Analizi</Text>
          <Text style={styles.subtitle}>Çalışma geçmişine göre güçlü ve zayıf yönlerin.</Text>
        </View>

        {/* Genel özet */}
        <View style={styles.card}>
          <View style={styles.summaryRow}>
            <View
              style={styles.summaryItem}
              accessible
              accessibilityLabel={`Genel başarı ${overallSuccessRate === null ? 'verisi yok' : `yüzde ${overallSuccessRate}`}`}
            >
              <Text style={styles.bigValue}>{overallSuccessRate === null ? '—' : `%${overallSuccessRate}`}</Text>
              <Text style={styles.statLabel}>Genel başarı</Text>
            </View>
            <View
              style={styles.summaryItem}
              accessible
              accessibilityLabel={`Toplam ${totalSessions} çalışma`}
            >
              <Text style={styles.bigValue}>{totalSessions}</Text>
              <Text style={styles.statLabel}>Toplam çalışma</Text>
            </View>
          </View>
          {!hasData && (
            <Text style={styles.emptyText}>
              Henüz çalışma kaydın yok. Birkaç alıştırma tamamladığında başarın ve zayıf alanların burada görünecek.
            </Text>
          )}
        </View>

        {/* Alıştırma türüne göre başarı */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alıştırma Başarısı</Text>
          <View style={styles.card}>
            {categoryStats.map((item, index) => {
              const rate = item.successRate;
              const isWeakest = item.category === weakestCategory;
              return (
                <View
                  key={item.category}
                  style={[styles.categoryRow, index > 0 && styles.categoryRowDivider]}
                  accessible
                  accessibilityLabel={
                    rate === null
                      ? `${CATEGORY_LABELS[item.category]}: henüz veri yok`
                      : `${CATEGORY_LABELS[item.category]}: yüzde ${rate} başarı, ${item.sessions} çalışma`
                  }
                >
                  <View style={styles.categoryIconBox}>
                    <AppIcon name={CATEGORY_ICONS[item.category]} size={16} color={colors.secondary} />
                  </View>
                  <View style={styles.categoryBody}>
                    <View style={styles.categoryHeader}>
                      <Text style={styles.categoryName}>{CATEGORY_LABELS[item.category]}</Text>
                      {isWeakest && (
                        <View style={styles.weakBadge}>
                          <Text style={styles.weakBadgeText}>En zayıf</Text>
                        </View>
                      )}
                      <Text style={styles.categoryRate}>{rate === null ? 'Veri yok' : `%${rate}`}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${rate ?? 0}%` }]} />
                    </View>
                    <Text style={styles.categoryMeta}>
                      {rate === null ? 'Henüz çalışma yok' : `${item.sessions} çalışma · ${item.correct}/${item.total} doğru`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Tekrar ve en zayıf alan */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{dueCount}</Text>
            <Text style={styles.statLabel}>Tekrar bekleyen kelime</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
              {weakestCategory ? CATEGORY_LABELS[weakestCategory] : 'Veri yok'}
            </Text>
            <Text style={styles.statLabel}>En zayıf alan</Text>
          </View>
        </View>

        {/* Günlük plan */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Günlük Önerilen Plan</Text>
          <View style={styles.card}>
            <View style={styles.planRow}>
              <View style={styles.planItem}>
                <Text style={styles.bigValue}>{dailyPlan.wordCount}</Text>
                <Text style={styles.statLabel}>kelime</Text>
              </View>
              <View style={styles.planItem}>
                <Text style={styles.bigValue}>{dailyPlan.exerciseCount}</Text>
                <Text style={styles.statLabel}>alıştırma</Text>
              </View>
            </View>
            <Text style={styles.reason}>{describeReason(dailyPlan, dueCount)}</Text>
            <TouchableOpacity
              style={styles.startBtn}
              onPress={() => router.push('/konular' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Konulara git"
            >
              <Text style={styles.startBtnText}>Konulara Git</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  topBar: { paddingHorizontal: Spacing.marginMain, height: 48, justifyContent: 'center' },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: Spacing.xl, gap: Spacing.md },
  title: { fontSize: 24, fontWeight: '700', color: Colors.primary },
  subtitle: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },

  card: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: 24, padding: Spacing.lg,
    ...Shadows.level1, gap: Spacing.md,
  },
  section: { gap: Spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary },

  summaryRow: { flexDirection: 'row', gap: Spacing.sm },
  summaryItem: {
    flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: 16,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, gap: 2,
  },
  bigValue: { fontSize: 26, fontWeight: '700', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.onSurfaceVariant },
  emptyText: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 19 },

  categoryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  categoryRowDivider: {
    paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.surfaceContainer,
  },
  categoryIconBox: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryContainer, alignItems: 'center', justifyContent: 'center',
  },
  categoryBody: { flex: 1, gap: 6 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  categoryName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.primary },
  categoryRate: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  categoryMeta: { fontSize: 11, color: Colors.onSurfaceVariant },
  weakBadge: {
    backgroundColor: Colors.secondaryContainer, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  weakBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.surfaceContainer, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: Colors.secondaryFixedDim },

  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statCard: {
    flex: 1, backgroundColor: Colors.surfaceContainerLowest, borderRadius: 20,
    padding: Spacing.md, gap: 2, ...Shadows.level1,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: Colors.primary },

  planRow: { flexDirection: 'row', gap: Spacing.sm },
  planItem: {
    flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: 16,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, gap: 2,
  },
  reason: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 19 },
  startBtn: {
    backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, height: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  startBtnText: { fontSize: 14, fontWeight: '700', color: Colors.onGolden },
}));
