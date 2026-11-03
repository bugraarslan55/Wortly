import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSessionStore, useUserStore, useWordStore } from '../store';
import { getTopicsForLevel } from '../constants/topics';
import { BorderRadius, Colors, Spacing } from '../constants/theme';
import { AnalysisCategory, analyzeLearning, DailyPlan } from '../utils/learning-analysis';
import { reviewRouteForDue } from '../utils/study-recommendations';
import { AppIcon } from './app-icon';
import { Card, IconTile, PrimaryButton } from './ui';
import { useOwnScenarioResults, useOwnSessions } from './use-achievements';

export const CATEGORY_LABELS: Record<AnalysisCategory, string> = {
  dinleme: 'Dinleme',
  yazma: 'Yazma',
  'dogru-yanlis': 'Doğru/Yanlış',
  senaryo: 'Senaryo',
};

export function describeReason(plan: DailyPlan, dueCount: number): string {
  if (plan.reason === 'due-words') {
    return `${dueCount} kelimenin tekrar zamanı geldi. Önce bunları tekrar etmek unutmayı azaltır.`;
  }
  if (plan.reason === 'weak-category' && plan.focusCategory) {
    return `${CATEGORY_LABELS[plan.focusCategory]} alıştırmalarında başarın daha düşük. Bugün buna ağırlık ver.`;
  }
  return 'Henüz yeterli verin yok. Günlük hedefine göre hazırlanan plana başlayabilirsin.';
}

/** Ana sayfa kartı ve analiz ekranı aynı store verisinden aynı analizi kullanır. */
export function useLearningAnalysis() {
  const profile = useUserStore(state => state.profile);
  const words = useWordStore(state => state.words);
  const reviewStates = useWordStore(state => state.reviewStates);
  const sessions = useOwnSessions();
  const scenarioResults = useOwnScenarioResults();

  const level = profile?.level || 'A1';
  const dailyGoal = profile?.dailyGoal;

  // Seviye konuları + kişisel kelimeler: tekrar adayları.
  const candidates = useMemo(() => {
    const topicWords = getTopicsForLevel(level).flatMap(topic => topic.words);
    return [...topicWords, ...(words ?? []).filter(word => word.isCustom)];
  }, [level, words]);

  return useMemo(
    () => analyzeLearning({ sessions, words: candidates, reviewStates, scenarioResults, dailyGoal }),
    [sessions, candidates, reviewStates, scenarioResults, dailyGoal],
  );
}

export function DailyPlanCard() {
  const router = useRouter();
  const analysis = useLearningAnalysis();

  const { dailyPlan, dueWords, weakestCategory } = analysis;
  const dueCount = dueWords.length;

  const handleStart = () => {
    router.push(reviewRouteForDue(dueWords) as any);
  };

  const planLabel = `${dailyPlan.wordCount} kelime · ${dailyPlan.exerciseCount} alıştırma`;
  const startLabel = dueCount > 0 ? `${dueCount} Kelimeyi Tekrar Et` : 'Çalışmaya Başla';

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <IconTile name="scope" size={36} />
        <Text style={styles.title} numberOfLines={1}>Bugünkü Planın</Text>
        <TouchableOpacity
          style={styles.analysisLink}
          onPress={() => router.push('/analiz' as any)}
          activeOpacity={0.8}
          accessibilityRole="link"
          accessibilityLabel="Analizi Gör"
          accessibilityHint="Öğrenme analizi ekranını açar"
        >
          <Text style={styles.analysisLinkText}>Analizi Gör</Text>
          <AppIcon name="chevron.right" size={12} color={Colors.secondary} />
        </TouchableOpacity>
      </View>

      {/* Yalnızca gerçek veri gösterilir: en zayıf alan yeterli cevap yokken gizlenir. */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue} maxFontSizeMultiplier={1.3}>{dueCount}</Text>
          <Text style={styles.statLabel}>Tekrar bekleyen</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue} maxFontSizeMultiplier={1.3}>{planLabel}</Text>
          <Text style={styles.statLabel}>Önerilen çalışma</Text>
        </View>
        {weakestCategory && (
          <View style={styles.stat}>
            <Text style={styles.statValue} maxFontSizeMultiplier={1.3}>{CATEGORY_LABELS[weakestCategory]}</Text>
            <Text style={styles.statLabel}>En zayıf alan</Text>
          </View>
        )}
      </View>

      <Text style={styles.reason}>{describeReason(dailyPlan, dueCount)}</Text>

      <PrimaryButton
        label={startLabel}
        onPress={handleStart}
        accessibilityHint={dueCount > 0 ? 'Tekrar zamanı gelen kelimelerin çalışmasını açar' : 'Konular ekranını açar'}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm + 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2 },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.primary },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stat: {
    flexGrow: 1, flexBasis: 100, backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.md,
    borderCurve: 'continuous', paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.sm + 4, gap: 2,
    justifyContent: 'center',
  },
  statValue: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.onSurfaceVariant },
  reason: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 19 },
  analysisLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: Spacing.touchTargetMin, paddingLeft: Spacing.sm,
  },
  analysisLinkText: { fontSize: 13, fontWeight: '700', color: Colors.secondary },
});
