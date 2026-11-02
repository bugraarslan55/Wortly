import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSessionStore, useUserStore } from '../../store';
import { useGermanSpeech } from '../../utils/use-german-speech';
import { useAuthStore } from '../../store/auth';
import {
  getScenarioById, getScenarioMeta, isScenarioLevelLocked, ReplyStep, Scenario, ScenarioStep,
} from '../../constants/scenarios';
import {
  answerOption, buildOptions, canContinue as canContinueStep, createNavigationLock, createOnceGuard, EMPTY_PROGRESS, isPlayableScenario,
  isReply, learnedPhrases, needsExitConfirm, Option, ProgressMap, scoreScenario,
} from '../../utils/scenario-engine';
import { Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { makeStyles, useColors } from '../../hooks/use-theme';
import { Level } from '../../types';
import { AppIcon } from '../../components/app-icon';
import { PrimaryButton, ProgressBar, SecondaryButton } from '../../components/ui';

/** "Devam" düğmesine art arda hızlı dokunuşlar bir adımı atlamasın. */
const NEXT_LOCK_MS = 350;
const OPTION_LETTERS = ['A', 'B', 'C'];

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
  // Bozuk/eksik senaryo verisi ekranı çökertmez.
  if (!isPlayableScenario(scenario)) {
    return <MessageScreen text="Bu senaryo şu anda kullanılamıyor." icon="questionmark.circle" onBack={goBackToList} />;
  }

  return <ScenarioPlayer scenario={scenario} onExit={goBackToList} />;
}

function MessageScreen({ text, onBack, icon = 'lock.fill' }: { text: string; onBack: () => void; icon?: string }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.center}>
        <AppIcon name={icon} size={34} color={colors.outlineVariant} />
        <Text style={styles.messageText}>{text}</Text>
        <PrimaryButton label="Senaryolara dön" onPress={onBack} />
      </View>
    </SafeAreaView>
  );
}

function ListenButtons({
  text, speakingMode, onSpeak,
}: { text: string; speakingMode: 'normal' | 'slow' | null; onSpeak: (text: string, mode: 'normal' | 'slow') => void }) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={styles.listenRow}>
      <TouchableOpacity
        style={[styles.listenBtn, speakingMode === 'normal' && styles.listenBtnActive]}
        onPress={() => onSpeak(text, 'normal')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Cümleyi normal hızda dinle"
      >
        <AppIcon name="speaker.wave.2.fill" size={16} color={colors.primary} />
        <Text style={styles.listenBtnText} maxFontSizeMultiplier={1.4}>Dinle</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.listenBtn, speakingMode === 'slow' && styles.listenBtnActive]}
        onPress={() => onSpeak(text, 'slow')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Cümleyi yavaş hızda dinle"
      >
        <AppIcon name="tortoise.fill" size={16} color={colors.primary} />
        <Text style={styles.listenBtnText} maxFontSizeMultiplier={1.4}>Yavaş</Text>
      </TouchableOpacity>
    </View>
  );
}

function ScenarioPlayer({ scenario, onExit }: { scenario: Scenario; onExit: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const navigation = useNavigation();
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [shownTranslations, setShownTranslations] = useState<Record<number, boolean>>({});
  // Ortak ses kontrolcüsü: eski istekler iptal edilir; ekran kapanınca ve arka plana geçince ses durur.
  const { speak: speakText, stop: stopSpeech, speakingRate: speakingMode } = useGermanSpeech();
  const savedRounds = useRef(createOnceGuard<number>());
  const nextLock = useRef(createNavigationLock(NEXT_LOCK_MS));
  const exitAlertOpenRef = useRef(false);
  const { session } = useAuthStore();
  const { saveScenarioResult } = useSessionStore();

  const steps = scenario.steps;
  const step = steps[index];
  const meta = getScenarioMeta(scenario.id);

  // Seçenekler her açılışta ve "Tekrar çalış"ta yeniden karıştırılır.
  const optionsByStep = useMemo(() => {
    const map: Record<number, Option[]> = {};
    steps.forEach((item, stepIndex) => {
      if (isReply(item)) map[stepIndex] = buildOptions(item);
    });
    return map;
  }, [steps, round]);

  useEffect(() => {
    stopSpeech();
  }, [index, finished, stopSpeech]);

  const speak = (text: string, mode: 'normal' | 'slow') => {
    void speakText(text, mode);
  };

  const stepProgress = progress[index] ?? EMPTY_PROGRESS;
  const canContinue = canContinueStep(step, progress[index]);
  const score = scoreScenario(steps, progress);

  // Yarıda çıkış (geri düğmesi, kaydırma hareketi, başlık geri okları): ilerleme varsa onay iste.
  const confirmRef = useRef(false);
  confirmRef.current = needsExitConfirm(progress, finished);
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (!confirmRef.current || exitAlertOpenRef.current) {
        if (confirmRef.current) event.preventDefault();
        return;
      }
      event.preventDefault();
      exitAlertOpenRef.current = true;
      Alert.alert(
        'Senaryodan çıkılsın mı?',
        'Şu ana kadarki ilerlemen kaydedilmez. Senaryoyu baştan çalışabilirsin.',
        [
          { text: 'Devam et', style: 'cancel', onPress: () => { exitAlertOpenRef.current = false; } },
          {
            text: 'Çık',
            style: 'destructive',
            onPress: () => {
              exitAlertOpenRef.current = false;
              confirmRef.current = false;
              navigation.dispatch(event.data.action);
            },
          },
        ],
        { cancelable: true, onDismiss: () => { exitAlertOpenRef.current = false; } },
      );
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!finished || !session?.user.id) return;
    // Her tur (round) için sonuç yalnızca BİR kez kaydedilir; efekt yeniden çalışsa da ikinci kayıt oluşmaz.
    if (!savedRounds.current.claim(round)) return;
    void saveScenarioResult(session.user.id, {
      scenarioId: scenario.id,
      score: score.correct,
      total: score.total,
    });
    // Senaryo da bir çalışma günüdür: günlük seri güncellenir (diğer alıştırmalarla tutarlı).
    void useUserStore.getState().updateStreak();
  }, [finished, round, session?.user.id, scenario.id, score.correct, score.total, saveScenarioResult]);

  const handleOptionPress = (option: Option) => {
    setProgress(current => answerOption(current, index, option));
  };

  const handleNext = () => {
    if (!canContinue || !nextLock.current.tryAcquire()) return;
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
    const phrases = learnedPhrases(steps, progress);
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
          <View style={styles.resultIconBox}>
            <AppIcon name="checkmark.seal.fill" size={44} color={colors.success} />
          </View>
          <Text style={styles.resultTitle}>Senaryo tamamlandı</Text>
          <Text style={styles.resultScenario}>{scenario.title}</Text>

          <View style={styles.resultCard}>
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>İlk denemede doğru</Text>
              <Text style={styles.resultValue}>{score.correct}</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Yanlış denenen</Text>
              <Text style={styles.resultValue}>{score.wrong}</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Toplam soru</Text>
              <Text style={styles.resultValue}>{score.total}</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Başarı</Text>
              <Text style={styles.resultValue}>%{score.percent}</Text>
            </View>
            <ProgressBar value={score.correct} max={score.total} label={`Başarı yüzde ${score.percent}`} tone="success" />
          </View>

          <View style={styles.phrasesCard}>
            <Text style={styles.phrasesTitle}>Öğrendiğin ifadeler</Text>
            {phrases.map((phrase, phraseIndex) => (
              <View key={phraseIndex} style={styles.phraseRow}>
                <View style={styles.phraseText}>
                  <Text style={styles.phraseGerman}>{phrase.german}</Text>
                  <Text style={styles.phraseTurkish}>{phrase.turkish}</Text>
                  {phrase.missed && <Text style={styles.phraseMissed}>Tekrar etmeye değer</Text>}
                </View>
                <TouchableOpacity
                  style={styles.phraseListen}
                  onPress={() => speak(phrase.german, 'normal')}
                  accessibilityRole="button"
                  accessibilityLabel={`İfadeyi dinle: ${phrase.german}`}
                >
                  <AppIcon name="speaker.wave.2.fill" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <PrimaryButton label="Tekrar Çalış" onPress={handleReplay} icon="arrow.clockwise" style={styles.fullWidth} />
          <SecondaryButton label="Senaryolara Dön" onPress={handleExit} style={styles.fullWidth} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const options = optionsByStep[index] ?? [];
  const showTranslation = !!shownTranslations[index];
  const isLast = index === steps.length - 1;
  const current: ScenarioStep = step;
  const reply: ReplyStep | null = isReply(current) ? current : null;
  const lastWrongId = stepProgress.wrongIds[stepProgress.wrongIds.length - 1];
  const lastWrong = options.find(option => option.id === lastWrongId);
  // Önceki iki konuşma satırı bağlam olarak gösterilir (konuşmanın içinde olma hissi).
  const history = steps.slice(Math.max(0, index - 2), index);

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
      <View style={styles.progressWrap}>
        <ProgressBar value={index + 1} max={steps.length} label={`Adım ${index + 1} / ${steps.length}`} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.placeRow}>
          <AppIcon name="mappin.and.ellipse" size={12} color={colors.secondary} />
          <Text style={styles.placeText}>
            {scenario.place}{meta ? ` · ${meta.germanTitle}` : ''}
          </Text>
        </View>

        {history.map((item, offset) => (
          <View
            key={`h-${index - history.length + offset}`}
            style={[styles.historyBubble, item.type === 'reply' && styles.historyBubbleUser]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={styles.historySpeaker}>{item.type === 'say' ? item.speaker : 'Sen'}</Text>
            <Text style={styles.historyText} numberOfLines={2}>{item.german}</Text>
          </View>
        ))}

        {reply && !stepProgress.solved && (
          <View style={styles.promptCard}>
            <Text style={styles.promptLabel}>Senin görevin</Text>
            <Text style={styles.promptText}>{reply.prompt}</Text>
          </View>
        )}

        {current.type === 'say' && (
          <View style={styles.bubbleRow}>
            <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <AppIcon name="person.crop.circle.fill" size={26} color={colors.primary} />
            </View>
            <View style={styles.bubble}>
              <Text style={styles.speakerText}>{current.speaker}</Text>
              <Text style={styles.germanText}>{current.german}</Text>
              <ListenButtons text={current.german} speakingMode={speakingMode} onSpeak={speak} />
              <TouchableOpacity
                style={styles.translationToggle}
                onPress={() => setShownTranslations(state => ({ ...state, [index]: !state[index] }))}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.translationToggleText}>
                  {showTranslation ? 'Türkçeyi gizle' : 'Türkçeyi göster'}
                </Text>
              </TouchableOpacity>
              {showTranslation && <Text style={styles.turkishText}>{current.turkish}</Text>}
            </View>
          </View>
        )}

        {reply && !stepProgress.solved && (
          <View style={styles.options}>
            {options.map((option, optionIndex) => {
              const wrong = stepProgress.wrongIds.includes(option.id);
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.option, wrong && styles.optionWrong]}
                  onPress={() => handleOptionPress(option)}
                  disabled={wrong}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Seçenek ${OPTION_LETTERS[optionIndex]}: ${option.german}`}
                  accessibilityState={{ disabled: wrong }}
                >
                  <View style={[styles.optionLetter, wrong && styles.optionLetterWrong]}>
                    {wrong
                      ? <AppIcon name="xmark" size={13} color={colors.error} />
                      : <Text style={styles.optionLetterText}>{OPTION_LETTERS[optionIndex]}</Text>}
                  </View>
                  <Text style={[styles.optionText, wrong && styles.optionTextWrong]}>{option.german}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {reply && !stepProgress.solved && lastWrong && (
          <View style={styles.feedbackWrong} accessibilityLiveRegion="polite">
            <View style={styles.feedbackHeader}>
              <AppIcon name="xmark.circle.fill" size={18} color={colors.error} />
              <Text style={styles.feedbackWrongTitle}>Bu cevap burada uymuyor</Text>
            </View>
            {!!lastWrong.turkish && (
              <>
                <Text style={styles.feedbackLabel}>Bu cevabın anlamı</Text>
                <Text style={styles.feedbackTurkish}>{lastWrong.turkish}</Text>
              </>
            )}
            {!!lastWrong.whyWrong && <Text style={styles.feedbackWhy}>{lastWrong.whyWrong}</Text>}
            <Text style={styles.feedbackHint}>Başka bir seçeneği dene.</Text>
          </View>
        )}

        {reply && stepProgress.solved && (
          <>
            <View style={[styles.bubbleRow, styles.bubbleRowUser]}>
              <View style={[styles.bubble, styles.bubbleUser]}>
                <Text style={styles.speakerText}>Sen</Text>
                <Text style={styles.germanText}>{reply.german}</Text>
                <ListenButtons text={reply.german} speakingMode={speakingMode} onSpeak={speak} />
              </View>
            </View>
            <View style={styles.feedbackCorrect} accessibilityLiveRegion="polite">
              <View style={styles.feedbackHeader}>
                <AppIcon name="checkmark.circle.fill" size={18} color={colors.success} />
                <Text style={styles.feedbackCorrectText}>
                  {stepProgress.firstTry ? 'Doğru!' : 'Doğru cevap'}
                </Text>
              </View>
              <Text style={styles.feedbackLabelGreen}>Anlamı</Text>
              <Text style={styles.feedbackTurkish}>{reply.turkish}</Text>
              {!!reply.note && (
                <View style={styles.noteRow}>
                  <AppIcon name="lightbulb.fill" size={14} color={colors.secondary} />
                  <Text style={styles.noteText}>{reply.note}</Text>
                </View>
              )}
            </View>
          </>
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

const useStyles = makeStyles(Colors => StyleSheet.create({
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
  progressWrap: { paddingHorizontal: Spacing.marginMain },
  content: { padding: Spacing.marginMain, paddingBottom: Spacing.xl, gap: Spacing.md },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  placeText: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant, flexShrink: 1 },
  historyBubble: {
    alignSelf: 'flex-start', maxWidth: '85%', backgroundColor: Colors.surfaceContainerLow,
    borderRadius: BorderRadius.lg, paddingVertical: 8, paddingHorizontal: Spacing.md, opacity: 0.8,
  },
  historyBubbleUser: { alignSelf: 'flex-end', backgroundColor: Colors.surfaceContainer },
  historySpeaker: { fontSize: 10, fontWeight: '700', color: Colors.onSurfaceVariant, textTransform: 'uppercase' },
  historyText: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 18 },
  promptCard: {
    backgroundColor: Colors.secondaryContainer, borderRadius: BorderRadius.xl,
    padding: Spacing.md, gap: 4,
  },
  promptLabel: { fontSize: 11, fontWeight: '700', color: Colors.onSecondaryContainer, textTransform: 'uppercase' },
  promptText: { fontSize: 16, fontWeight: '600', color: Colors.primary, lineHeight: 22 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  bubbleRowUser: { justifyContent: 'flex-end' },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceContainer,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  bubble: {
    flexShrink: 1, flexGrow: 1, backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.xl,
    borderTopLeftRadius: 6, padding: Spacing.lg, gap: Spacing.md, ...Shadows.level2,
  },
  bubbleUser: { flexGrow: 0, maxWidth: '92%', borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: 6, borderWidth: 1.5, borderColor: Colors.golden },
  speakerText: { fontSize: 12, fontWeight: '700', color: Colors.secondary, textTransform: 'uppercase' },
  germanText: { fontSize: 20, fontWeight: '700', color: Colors.primary, lineHeight: 28 },
  listenRow: { flexDirection: 'row', gap: Spacing.sm },
  listenBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 44, borderRadius: BorderRadius.lg, backgroundColor: Colors.surfaceContainer,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  listenBtnActive: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
  listenBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  translationToggle: { minHeight: 44, justifyContent: 'center' },
  translationToggleText: { fontSize: 14, fontWeight: '600', color: Colors.secondary },
  turkishText: { fontSize: 15, color: Colors.onSurfaceVariant, lineHeight: 21 },
  options: { gap: Spacing.sm },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 56,
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1.5, borderColor: Colors.outlineVariant, ...Shadows.level1,
  },
  optionWrong: { backgroundColor: Colors.errorContainer, borderColor: Colors.error },
  optionLetter: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surfaceContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  optionLetterWrong: { backgroundColor: Colors.surfaceContainerLowest },
  optionLetterText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  optionText: { flex: 1, fontSize: 16, fontWeight: '600', color: Colors.primary, lineHeight: 22 },
  optionTextWrong: { color: Colors.onErrorContainer },
  feedbackHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feedbackWrong: {
    backgroundColor: Colors.errorContainer, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 4,
  },
  feedbackWrongTitle: { fontSize: 15, fontWeight: '700', color: Colors.error, flexShrink: 1 },
  feedbackLabel: { fontSize: 11, fontWeight: '700', color: Colors.onErrorContainer, marginTop: 6, textTransform: 'uppercase' },
  feedbackLabelGreen: { fontSize: 11, fontWeight: '700', color: Colors.success, marginTop: 6, textTransform: 'uppercase' },
  feedbackTurkish: { fontSize: 14, color: Colors.onSurfaceVariant, lineHeight: 20 },
  feedbackWhy: { fontSize: 14, color: Colors.primary, lineHeight: 20, marginTop: 4 },
  feedbackHint: { fontSize: 13, fontWeight: '600', color: Colors.onErrorContainer, marginTop: 6 },
  feedbackCorrect: {
    backgroundColor: Colors.successContainer, borderRadius: BorderRadius.lg, padding: Spacing.md, gap: 4,
  },
  feedbackCorrectText: { fontSize: 15, fontWeight: '700', color: Colors.success },
  noteRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 8, padding: Spacing.sm,
    borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceContainerLowest,
  },
  noteText: { flex: 1, fontSize: 13, color: Colors.primary, lineHeight: 19 },
  bottomBar: {
    flexDirection: 'row', gap: Spacing.sm, padding: Spacing.marginMain,
    borderTopWidth: 1, borderTopColor: `${Colors.primary}0D`, backgroundColor: Colors.warmWhite,
  },
  navBtn: { minHeight: 50, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  navBtnBack: { flex: 1, backgroundColor: Colors.surfaceContainer },
  navBtnNext: { flex: 2, backgroundColor: Colors.golden },
  navBtnDisabled: { opacity: 0.45 },
  navBtnBackText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  navBtnNextText: { fontSize: 15, fontWeight: '700', color: Colors.onGolden },
  resultContent: { padding: Spacing.marginMain, paddingTop: Spacing.xl, paddingBottom: Spacing.xl, alignItems: 'center', gap: Spacing.md },
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
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  resultLabel: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  resultValue: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  resultDivider: { height: 1, backgroundColor: Colors.outlineVariant, opacity: 0.4 },
  phrasesCard: {
    width: '100%', backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, gap: Spacing.md,
  },
  phrasesTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  phraseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  phraseText: { flex: 1, gap: 2 },
  phraseGerman: { fontSize: 15, fontWeight: '700', color: Colors.primary, lineHeight: 21 },
  phraseTurkish: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 18 },
  phraseMissed: { fontSize: 11, fontWeight: '700', color: Colors.error },
  phraseListen: {
    width: Spacing.touchTargetMin, height: Spacing.touchTargetMin, borderRadius: Spacing.touchTargetMin / 2,
    backgroundColor: Colors.surfaceContainerLowest, alignItems: 'center', justifyContent: 'center',
  },
  fullWidth: { width: '100%' },
}));
