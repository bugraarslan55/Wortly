import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWordStore } from '../store';
import { BorderRadius, Spacing } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import { AppIcon } from '../components/app-icon';
import { Card, EmptyState, PrimaryButton, ProgressBar, SecondaryButton } from '../components/ui';
import { useOwnSessions } from '../components/use-achievements';
import { useLearningAnalysis, usePlanCandidates } from '../components/daily-plan-card';
import { getReviewState } from '../utils/spaced-repetition';
import { toLocalDateKey } from '../utils/progress-stats';
import {
  buildStudyPlan, findStepSession, PlanStepType, summarizeStepSessions,
} from '../utils/study-plan';
import { setPlanRunActive } from '../utils/plan-run';
import { goBack } from '../utils/safe-back';

const STEP_LABELS: Record<PlanStepType, string> = {
  'dogru-yanlis': 'Doğru / Yanlış',
  yazma: 'Yazarak Tekrar',
};

/**
 * Ana sayfadaki günlük planı çalıştırır. Kelimeler plan başlarken bir kez seçilir ve sabit kalır;
 * her adım mevcut alıştırma ekranını (puanlama, ilerleme ve senkron kaydı dahil) o kelimelerle açar.
 * Adımın bittiği, alıştırmanın kendi kaydettiği oturumdan anlaşılır.
 */
export default function PlanScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const analysis = useLearningAnalysis();
  const candidates = usePlanCandidates();
  const reviewStates = useWordStore(state => state.reviewStates);
  const sessions = useOwnSessions();

  const [plan] = useState(() => buildStudyPlan({
    candidates,
    reviewStates,
    dueWords: analysis.dueWords,
    dailyPlan: analysis.dailyPlan,
    dayKey: toLocalDateKey(),
  }));
  const [startedAt, setStartedAt] = useState<(number | null)[]>(() => plan.steps.map(() => null));

  // Plan açıkken sonuç ekranı "Plana dön" akışını gösterir; ekran kapanınca bayrak temizlenir.
  useEffect(() => {
    setPlanRunActive(true);
    return () => setPlanRunActive(false);
  }, []);

  const results = plan.steps.map((step, index) => findStepSession(step, startedAt[index], sessions));
  const doneCount = results.filter(Boolean).length;
  const nextIndex = results.findIndex(result => !result);
  const finished = plan.steps.length > 0 && nextIndex === -1;
  const summary = useMemo(() => summarizeStepSessions(results), [results]);

  const strongCount = useMemo(
    () => plan.words.filter(word => getReviewState(word, reviewStates).masteryLevel >= 2).length,
    [plan.words, reviewStates],
  );

  const exit = () => goBack(router);

  const handleClose = () => {
    if (doneCount === 0 || finished) {
      exit();
      return;
    }
    Alert.alert(
      'Planı bırak?',
      'Tamamladığın alıştırmaların ilerlemesi kaydedildi. Kalan alıştırmalar için planı yeniden başlatman gerekir.',
      [
        { text: 'Devam et', style: 'cancel' },
        { text: 'Çık', style: 'destructive', onPress: exit },
      ],
    );
  };

  const startStep = (index: number) => {
    const step = plan.steps[index];
    if (!step) return;
    setStartedAt(previous => previous.map((value, i) => (i === index ? Date.now() : value)));
    router.push({ pathname: `/alistirma/${step.type}`, params: { wordIds: step.wordIds.join(',') } } as any);
  };

  const compositionParts = [
    plan.dueCount > 0 ? `${plan.dueCount} tekrar` : null,
    plan.weakCount > 0 ? `${plan.weakCount} zayıf` : null,
    plan.newCount > 0 ? `${plan.newCount} yeni` : null,
  ].filter(Boolean);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleClose}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Planı kapat"
        >
          <AppIcon name="xmark" size={18} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
        <Text style={styles.topTitle} accessibilityRole="header">Bugünkü Planın</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {plan.steps.length === 0 ? (
          <EmptyState
            icon="scope"
            title="Bugün için kelime bulunamadı"
            description="Seviyene uygun yeni veya zayıf kelime kalmadı. Konulardan istediğin kelimeleri çalışabilirsin."
            actionLabel="Konulara git"
            onAction={() => router.replace('/(tabs)/konular' as any)}
          />
        ) : (
          <>
            <Card style={styles.card}>
              <Text style={styles.headline}>{plan.words.length} kelime · {plan.steps.length} alıştırma</Text>
              {compositionParts.length > 0 && (
                <Text style={styles.muted}>{compositionParts.join(' · ')}</Text>
              )}
              <ProgressBar
                value={doneCount}
                max={plan.steps.length}
                tone={finished ? 'success' : 'gold'}
                label={`${plan.steps.length} alıştırmadan ${doneCount} tanesi tamamlandı`}
              />
              <Text style={styles.muted}>{doneCount}/{plan.steps.length} alıştırma tamamlandı</Text>
            </Card>

            {plan.steps.map((step, index) => {
              const result = results[index];
              const isNext = index === nextIndex;
              return (
                <View
                  key={`${step.type}-${index}`}
                  style={[styles.stepRow, isNext && styles.stepRowActive]}
                  accessible
                  accessibilityLabel={`${index + 1}. alıştırma, ${STEP_LABELS[step.type]}, ${step.wordIds.length} kelime, ${
                    result ? `tamamlandı, ${result.total} sorudan ${result.score} doğru` : isNext ? 'sırada' : 'bekliyor'
                  }`}
                >
                  <View style={[styles.stepBadge, result && styles.stepBadgeDone]}>
                    {result
                      ? <AppIcon name="checkmark.circle.fill" size={18} color={colors.success} />
                      : <Text style={styles.stepNumber}>{index + 1}</Text>}
                  </View>
                  <View style={styles.stepText}>
                    <Text style={styles.stepTitle}>{STEP_LABELS[step.type]}</Text>
                    <Text style={styles.muted}>
                      {step.wordIds.length} kelime{result ? ` · ${result.score}/${result.total} doğru` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}

            {finished ? (
              <Card style={styles.card}>
                <Text style={styles.headline} accessibilityRole="header">Plan tamamlandı</Text>
                <Text style={styles.summaryScore}>%{summary.percent}</Text>
                <Text style={styles.muted}>
                  {summary.total} sorudan {summary.correct} doğru · {plan.words.length} kelime çalıştın.
                </Text>
                <Text style={styles.muted} accessibilityLiveRegion="polite">
                  Bu plandaki {plan.words.length} kelimeden {strongCount} tanesi “Bilinçli” veya “Öğrenildi” düzeyinde.
                </Text>
              </Card>
            ) : null}

            <View style={styles.actions}>
              {finished ? (
                <PrimaryButton label="Ana Sayfaya Dön" onPress={exit} />
              ) : (
                <>
                  <PrimaryButton
                    label={doneCount === 0 ? 'Planı Başlat' : `${nextIndex + 1}. Alıştırmaya Devam Et`}
                    onPress={() => startStep(nextIndex)}
                    accessibilityHint={`${STEP_LABELS[plan.steps[nextIndex]!.type]} alıştırmasını açar`}
                  />
                  <SecondaryButton label="Şimdi Değil" onPress={handleClose} />
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  topBar: {
    minHeight: 56, paddingHorizontal: Spacing.marginMain,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  closeButton: {
    width: Spacing.touchTargetMin, height: Spacing.touchTargetMin, borderRadius: 22,
    backgroundColor: Colors.surfaceContainer, alignItems: 'center', justifyContent: 'center',
  },
  topSpacer: { width: Spacing.touchTargetMin, height: Spacing.touchTargetMin },
  topTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm, paddingBottom: Spacing.xl, gap: Spacing.sm + 2 },
  card: { gap: Spacing.sm },
  headline: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  muted: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 19 },
  summaryScore: { fontSize: 34, fontWeight: '700', color: Colors.primary },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.lg, borderCurve: 'continuous',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  stepRowActive: { borderColor: Colors.golden },
  stepBadge: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBadgeDone: { backgroundColor: Colors.successContainer },
  stepNumber: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  stepText: { flex: 1, gap: 2 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  actions: { gap: Spacing.sm, marginTop: Spacing.sm },
}));
