import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSessionStore, useUserStore, useWordStore } from '../store';
import { getTopicsForLevel } from '../constants/topics';
import { BorderRadius, Colors, Shadows, Spacing } from '../constants/theme';
import { AnalysisCategory, analyzeLearning, DailyPlan } from '../utils/learning-analysis';
import { AppIcon } from './app-icon';

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
  const sessions = useSessionStore(state => state.sessions);
  const scenarioResults = useSessionStore(state => state.scenarioResults);

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
    const firstDueWord = dueWords[0];
    if (firstDueWord?.isCustom) {
      router.push('/kelime/calis' as any);
    } else if (firstDueWord?.topicId) {
      router.push(`/konu/${firstDueWord.topicId}/alistirma` as any);
    } else {
      router.push('/konular' as any);
    }
  };

  const weakestLabel = weakestCategory ? CATEGORY_LABELS[weakestCategory] : 'Veri yok';
  const planLabel = `${dailyPlan.wordCount} kelime · ${dailyPlan.exerciseCount} alıştırma`;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <View style={styles.iconBox}>
          <AppIcon name="scope" size={18} color={Colors.secondary} />
        </View>
        <Text style={styles.title}>Bugünkü Planın</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{dueCount}</Text>
          <Text style={styles.statLabel}>Tekrar bekleyen</Text>
        </View>
        <View style={[styles.stat, styles.statWide]}>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{planLabel}</Text>
          <Text style={styles.statLabel}>Önerilen çalışma</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{weakestLabel}</Text>
          <Text style={styles.statLabel}>En zayıf alan</Text>
        </View>
      </View>

      <Text style={styles.reason}>{describeReason(dailyPlan, dueCount)}</Text>

      <TouchableOpacity
        style={styles.startBtn}
        onPress={handleStart}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Çalışmaya Başla"
        accessibilityHint={dueCount > 0 ? 'Tekrar zamanı gelen kelimelerin çalışmasını açar' : 'Konular ekranını açar'}
      >
        <Text style={styles.startBtnText}>Çalışmaya Başla</Text>
      </TouchableOpacity>

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
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: 24, padding: Spacing.lg,
    ...Shadows.level1, gap: Spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  iconBox: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryContainer, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  stat: {
    flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: 16,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, gap: 2, justifyContent: 'center',
  },
  statWide: { flex: 1.6 },
  statValue: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.onSurfaceVariant },
  reason: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 19 },
  startBtn: {
    backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, height: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  startBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  analysisLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    minHeight: Spacing.touchTargetMin, marginTop: -Spacing.sm,
  },
  analysisLinkText: { fontSize: 13, fontWeight: '700', color: Colors.secondary },
});
