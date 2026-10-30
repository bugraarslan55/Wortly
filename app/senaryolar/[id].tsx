import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { useUserStore } from '../../store';
import {
  getScenarioById, isScenarioLevelLocked, ReplyStep, Scenario, ScenarioStep,
} from '../../constants/scenarios';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Level } from '../../types';
import { AppIcon } from '../../components/app-icon';

type Option = { id: string; german: string; correct: boolean };
type StepProgress = { solved: boolean; firstTry: boolean; wrongIds: string[] };

const EMPTY_PROGRESS: StepProgress = { solved: false, firstTry: true, wrongIds: [] };

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function buildOptions(step: ReplyStep): Option[] {
  return shuffle([
    { id: 'correct', german: step.german, correct: true },
    { id: 'wrong-0', german: step.wrongOptions[0], correct: false },
    { id: 'wrong-1', german: step.wrongOptions[1], correct: false },
  ]);
}

export default function ScenarioScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useUserStore();
  const scenario = getScenarioById(id);
  const userLevel: Level = profile?.level ?? 'A1';

  const goBackToList = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/senaryolar' as any);
  }, [router]);

  if (!scenario) {
    return <MessageScreen text="Senaryo bulunamadı" onBack={goBackToList} />;
  }
  if (isScenarioLevelLocked(scenario.level, userLevel)) {
    return <MessageScreen text={`Bu senaryo kilitli. ${scenario.level} seviyesine ulaştığında açılır.`} onBack={goBackToList} />;
  }

  return <ScenarioPlayer scenario={scenario} onExit={goBackToList} />;
}

function MessageScreen({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <AppIcon name="lock.fill" size={34} color={Colors.outlineVariant} />
        <Text style={styles.messageText}>{text}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onBack} accessibilityRole="button">
          <Text style={styles.primaryBtnText}>Senaryolara dön</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function ScenarioPlayer({ scenario, onExit }: { scenario: Scenario; onExit: () => void }) {
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState<Record<number, StepProgress>>({});
  const [shownTranslations, setShownTranslations] = useState<Record<number, boolean>>({});
  const [speakingMode, setSpeakingMode] = useState<'normal' | 'slow' | null>(null);
  const speechRunRef = useRef(0);

  const steps = scenario.steps;
  const step = steps[index];
  const totalQuestions = steps.filter(item => item.type === 'reply').length;

  // Seçenekler her açılışta ve "Tekrar oyna"da yeniden karıştırılır.
  const optionsByStep = useMemo(() => {
    const map: Record<number, Option[]> = {};
    steps.forEach((item, stepIndex) => {
      if (item.type === 'reply') map[stepIndex] = buildOptions(item);
    });
    return map;
  }, [steps, round]);

  const stopSpeech = useCallback(() => {
    speechRunRef.current += 1;
    setSpeakingMode(null);
    void Speech.stop();
  }, []);

  useEffect(() => () => {
    speechRunRef.current += 1;
    void Speech.stop();
  }, []);

  useEffect(() => {
    stopSpeech();
  }, [index, finished, stopSpeech]);

  const speak = async (text: string, mode: 'normal' | 'slow') => {
    const runId = speechRunRef.current + 1;
    speechRunRef.current = runId;
    setSpeakingMode(mode);
    await Speech.stop();
    if (speechRunRef.current !== runId) return;

    const finish = () => {
      if (speechRunRef.current === runId) setSpeakingMode(null);
    };
    Speech.speak(text, {
      language: 'de-DE',
      rate: mode === 'slow' ? 0.30 : 0.92,
      pitch: 1,
      onDone: finish,
      onError: finish,
      onStopped: finish,
    });
  };

  const stepProgress = progress[index] ?? EMPTY_PROGRESS;
  const canContinue = step.type === 'say' || stepProgress.solved;

  const handleOptionPress = (option: Option) => {
    if (stepProgress.solved) return;
    setProgress(current => {
      const previous = current[index] ?? EMPTY_PROGRESS;
      if (option.correct) {
        return { ...current, [index]: { ...previous, solved: true } };
      }
      if (previous.wrongIds.includes(option.id)) return current;
      return {
        ...current,
        [index]: { ...previous, firstTry: false, wrongIds: [...previous.wrongIds, option.id] },
      };
    });
  };

  const handleNext = () => {
    if (!canContinue) return;
    if (index >= steps.length - 1) setFinished(true);
    else setIndex(index + 1);
  };

  const handlePrevious = () => {
    if (index > 0) setIndex(index - 1);
  };

  const handleReplay = () => {
    setRound(value => value + 1);
    setIndex(0);
    setProgress({});
    setShownTranslations({});
    setFinished(false);
  };

  const handleExit = () => {
    stopSpeech();
    onExit();
  };

  if (finished) {
    const correctCount = steps.reduce((count, item, stepIndex) => {
      const state = progress[stepIndex];
      return item.type === 'reply' && state?.solved && state.firstTry ? count + 1 : count;
    }, 0);
    const percent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
          <View style={styles.resultIconBox}>
            <AppIcon name="checkmark.seal.fill" size={44} color={Colors.success} />
          </View>
          <Text style={styles.resultTitle}>Senaryo tamamlandı</Text>
          <Text style={styles.resultScenario}>{scenario.title}</Text>

          <View style={styles.resultCard}>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Doğru cevap</Text>
              <Text style={styles.resultValue}>{correctCount}</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Toplam soru</Text>
              <Text style={styles.resultValue}>{totalQuestions}</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Başarı</Text>
              <Text style={styles.resultValue}>%{percent}</Text>
            </View>
          </View>
          <Text style={styles.resultNote}>Doğru cevap sayısı, ilk denemede doğru bildiğin soruları gösterir.</Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleReplay} activeOpacity={0.85} accessibilityRole="button">
            <Text style={styles.primaryBtnText}>Tekrar oyna</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleExit} activeOpacity={0.85} accessibilityRole="button">
            <Text style={styles.secondaryBtnText}>Senaryolara dön</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const options = optionsByStep[index] ?? [];
  const showTranslation = !!shownTranslations[index];
  const isLast = index === steps.length - 1;
  const lineStep: ScenarioStep = step;
  const showLine = lineStep.type === 'say' || stepProgress.solved;
  const speaker = lineStep.type === 'say' ? lineStep.speaker : 'Sen';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleExit}
          style={styles.headerBack}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Text style={styles.headerBackText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{scenario.title}</Text>
        <Text
          style={styles.headerProgress}
          accessibilityLabel={`${steps.length} adımın ${index + 1}. adımı`}
        >
          {index + 1} / {steps.length}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index + 1) / steps.length) * 100}%` }]} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.placeRow}>
          <AppIcon name="mappin.and.ellipse" size={12} color={Colors.secondary} />
          <Text style={styles.placeText}>{scenario.place}</Text>
        </View>

        {step.type === 'reply' && !stepProgress.solved && (
          <View style={styles.promptCard}>
            <Text style={styles.promptLabel}>Senin görevin</Text>
            <Text style={styles.promptText}>{step.prompt}</Text>
          </View>
        )}

        {showLine && (
          <View style={[styles.lineCard, step.type === 'reply' && styles.lineCardUser]}>
            <View style={styles.speakerBadge}>
              <Text style={styles.speakerText}>{speaker}</Text>
            </View>
            <Text style={styles.germanText}>{lineStep.german}</Text>

            <View style={styles.listenRow}>
              <TouchableOpacity
                style={[styles.listenBtn, speakingMode === 'normal' && styles.listenBtnActive]}
                onPress={() => speak(lineStep.german, 'normal')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Cümleyi normal hızda dinle"
              >
                <AppIcon name="speaker.wave.2.fill" size={16} color={Colors.primary} />
                <Text style={styles.listenBtnText}>Dinle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.listenBtn, speakingMode === 'slow' && styles.listenBtnActive]}
                onPress={() => speak(lineStep.german, 'slow')}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Cümleyi yavaş hızda dinle"
              >
                <AppIcon name="tortoise.fill" size={16} color={Colors.primary} />
                <Text style={styles.listenBtnText}>Yavaş</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.translationToggle}
              onPress={() => setShownTranslations(current => ({ ...current, [index]: !current[index] }))}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.translationToggleText}>
                {showTranslation ? 'Türkçeyi gizle' : 'Türkçeyi göster'}
              </Text>
            </TouchableOpacity>
            {showTranslation && <Text style={styles.turkishText}>{lineStep.turkish}</Text>}
          </View>
        )}

        {step.type === 'reply' && !stepProgress.solved && (
          <View style={styles.options}>
            {options.map(option => {
              const wrong = stepProgress.wrongIds.includes(option.id);
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.option, wrong && styles.optionWrong]}
                  onPress={() => handleOptionPress(option)}
                  disabled={wrong}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: wrong }}
                >
                  <Text style={[styles.optionText, wrong && styles.optionTextWrong]}>{option.german}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {step.type === 'reply' && !stepProgress.solved && stepProgress.wrongIds.length > 0 && (
          <View style={styles.feedbackWrong} accessibilityLiveRegion="polite">
            <Text style={styles.feedbackWrongTitle}>Tekrar dene</Text>
            <Text style={styles.feedbackLabel}>Doğru cevap</Text>
            <Text style={styles.feedbackGerman}>{step.german}</Text>
            <Text style={styles.feedbackLabel}>Anlamı</Text>
            <Text style={styles.feedbackTurkish}>{step.turkish}</Text>
          </View>
        )}

        {step.type === 'reply' && stepProgress.solved && (
          <View style={styles.feedbackCorrect} accessibilityLiveRegion="polite">
            <AppIcon name="checkmark.circle.fill" size={18} color={Colors.success} />
            <Text style={styles.feedbackCorrectText}>Doğru</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnBack, index === 0 && styles.navBtnDisabled]}
          onPress={handlePrevious}
          disabled={index === 0}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Önceki adım"
        >
          <Text style={styles.navBtnBackText}>← Önceki</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, styles.navBtnNext, !canContinue && styles.navBtnDisabled]}
          onPress={handleNext}
          disabled={!canContinue}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Senaryoyu bitir' : 'Sonraki adım'}
        >
          <Text style={styles.navBtnNextText}>{isLast ? 'Bitir' : 'Devam →'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  messageText: { fontSize: 15, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 21 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.marginMain, height: 52, gap: Spacing.sm,
  },
  headerBack: { minHeight: 44, minWidth: 64, justifyContent: 'center' },
  headerBackText: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  headerProgress: { minWidth: 64, textAlign: 'right', fontSize: 13, fontWeight: '700', color: Colors.secondary },
  progressTrack: {
    height: 4, marginHorizontal: Spacing.marginMain, borderRadius: 2,
    backgroundColor: Colors.surfaceContainer, overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: Colors.golden },
  content: { padding: Spacing.marginMain, paddingBottom: Spacing.xl, gap: Spacing.md },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  placeText: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  promptCard: {
    backgroundColor: Colors.secondaryContainer, borderRadius: BorderRadius.xl,
    padding: Spacing.md, gap: 4,
  },
  promptLabel: { fontSize: 11, fontWeight: '700', color: Colors.onSecondaryContainer, textTransform: 'uppercase' },
  promptText: { fontSize: 16, fontWeight: '600', color: Colors.primary, lineHeight: 22 },
  lineCard: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, gap: Spacing.md, ...Shadows.level2,
  },
  lineCardUser: { borderWidth: 1.5, borderColor: Colors.golden },
  speakerBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceContainer,
  },
  speakerText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  germanText: { fontSize: 20, fontWeight: '700', color: Colors.primary, lineHeight: 28 },
  listenRow: { flexDirection: 'row', gap: Spacing.sm },
  listenBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 44, borderRadius: BorderRadius.lg, backgroundColor: Colors.surfaceContainer,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  listenBtnActive: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
  listenBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  translationToggle: { minHeight: 40, justifyContent: 'center' },
  translationToggleText: { fontSize: 14, fontWeight: '600', color: Colors.secondary },
  turkishText: { fontSize: 15, color: Colors.onSurfaceVariant, lineHeight: 21 },
  options: { gap: Spacing.sm },
  option: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.outlineVariant, ...Shadows.level1,
  },
  optionWrong: { backgroundColor: Colors.errorContainer, borderColor: Colors.error },
  optionText: { fontSize: 16, fontWeight: '600', color: Colors.primary, lineHeight: 22 },
  optionTextWrong: { color: Colors.onErrorContainer },
  feedbackWrong: {
    backgroundColor: Colors.errorContainer, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 3,
  },
  feedbackWrongTitle: { fontSize: 15, fontWeight: '700', color: Colors.error },
  feedbackLabel: { fontSize: 11, fontWeight: '700', color: Colors.onErrorContainer, marginTop: 6, textTransform: 'uppercase' },
  feedbackGerman: { fontSize: 16, fontWeight: '700', color: Colors.primary, lineHeight: 22 },
  feedbackTurkish: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 20 },
  feedbackCorrect: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.successContainer, borderRadius: BorderRadius.lg, padding: Spacing.md,
  },
  feedbackCorrectText: { fontSize: 15, fontWeight: '700', color: Colors.success },
  bottomBar: {
    flexDirection: 'row', gap: Spacing.sm, padding: Spacing.marginMain,
    borderTopWidth: 1, borderTopColor: `${Colors.primary}0D`, backgroundColor: Colors.warmWhite,
  },
  navBtn: { minHeight: 50, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  navBtnBack: { flex: 1, backgroundColor: Colors.surfaceContainer },
  navBtnNext: { flex: 2, backgroundColor: Colors.golden },
  navBtnDisabled: { opacity: 0.45 },
  navBtnBackText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  navBtnNextText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  resultContent: { padding: Spacing.marginMain, paddingTop: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  resultIconBox: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.successContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  resultTitle: { fontSize: 24, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  resultScenario: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center' },
  resultCard: {
    width: '100%', backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, gap: Spacing.md, ...Shadows.level1,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultLabel: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  resultValue: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  resultDivider: { height: 1, backgroundColor: Colors.outlineVariant, opacity: 0.4 },
  resultNote: { fontSize: 12, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 17 },
  primaryBtn: {
    width: '100%', minHeight: 52, borderRadius: BorderRadius.lg, backgroundColor: Colors.golden,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  secondaryBtn: {
    width: '100%', minHeight: 52, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
});
