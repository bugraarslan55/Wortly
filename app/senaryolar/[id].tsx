import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSessionStore, useUserStore } from '../../store';
import { useGermanSpeech } from '../../utils/use-german-speech';
import { useAuthStore } from '../../store/auth';
import {
  ChoiceStep, getScenarioById, getScenarioMeta, isScenarioLevelLocked, ReplyStep, Scenario, ScenarioStep,
} from '../../constants/scenarios';
import {
  answerOption, buildHistory, buildOptions, canContinue as canContinueStep, ChoiceMap, choiceOutcome, createNavigationLock,
  createOnceGuard, EMPTY_PROGRESS, isLastReviewStep, isPlayableScenario, isReply, learnedPhrases, missedStepIndexes, needsExitConfirm, Option, ProgressMap, ReviewRun, reviewNext,
  reviewPrevious, reviewStepIndex, scoreScenario, startReview,
} from '../../utils/scenario-engine';
import { Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { makeStyles, useColors } from '../../hooks/use-theme';
import { Level } from '../../types';
import { AppIcon } from '../../components/app-icon';
import { PrimaryButton, ProgressBar, SecondaryButton } from '../../components/ui';
import { PhraseSaveButton } from '../../components/phrase-save-button';
import type { PhraseInput } from '../../utils/phrasebook';

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
  text, speakingMode, onSpeak, save,
}: {
  text: string; speakingMode: 'normal' | 'slow' | null; onSpeak: (text: string, mode: 'normal' | 'slow') => void;
  /** Verilirse satırın yanında "İfade Defterim'e kaydet/kaldır" düğmesi çıkar. */
  save?: PhraseInput;
}) {
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
      {save && <PhraseSaveButton phrase={save} />}
    </View>
  );
}

function ScenarioPlayer({ scenario, onExit }: { scenario: Scenario; onExit: () => void }) {
  const styles = useStyles();
  const colors = useColors();
  const navigation = useNavigation();
  const [round, setRound] = useState(0);
  const [mainIndex, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState<ProgressMap>({});
  // "Yanlışlarımı Tekrar Et": yalnızca yanlış adımları oynatan ayrı tur. Cevapları AYRI haritada tutulur; ana ilerleme, puan,
  // sonuç kaydı ve seri bu turdan etkilenmez (kayıt efekti yalnızca `finished`/`round`/ana puana bağlıdır).
  const [review, setReview] = useState<ReviewRun | null>(null);
  const [reviewProgress, setReviewProgress] = useState<ProgressMap>({});
  const [reviewPass, setReviewPass] = useState(0);
  // Karar noktası seçimleri: puan/kayıt haritasından (progress) AYRIDIR; doğru/yanlış değildir ve hiçbir yere kaydedilmez.
  const [choices, setChoices] = useState<ChoiceMap>({});
  // Oynatılan adım: ana turda sıradaki adım, tekrar turunda yanlış adımlardan biri.
  const index = review ? reviewStepIndex(review) : mainIndex;
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

  // Seçenekler her açılışta, "Tekrar çalış"ta ve her yanlış-tekrar turunda yeniden karıştırılır.
  const optionsByStep = useMemo(() => {
    const map: Record<number, Option[]> = {};
    steps.forEach((item, stepIndex) => {
      if (isReply(item)) map[stepIndex] = buildOptions(item);
    });
    return map;
  }, [steps, round, reviewPass]);

  useEffect(() => {
    stopSpeech();
  }, [index, finished, review, stopSpeech]);

  const speak = (text: string, mode: 'normal' | 'slow') => {
    void speakText(text, mode);
  };

  /** İfade Defterim kaydı: metinler kaydedilirken kopyalanır (senaryo sonradan değişse de kayıt aynı kalır). */
  const phraseOf = (item: { german: string; turkish: string }, speaker: string): PhraseInput => ({
    german: item.german, turkish: item.turkish, speaker,
    scenarioId: scenario.id, scenarioTitle: scenario.title, level: scenario.level,
  });

  const activeProgress = review ? reviewProgress : progress;
  const stepProgress = activeProgress[index] ?? EMPTY_PROGRESS;
  const canContinue = canContinueStep(step, activeProgress[index], choices[index]);
  // Puan her zaman ANA turun ilerlemesinden hesaplanır (tekrar turu puanı değiştirmez).
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
    // Tekrar turundaki cevaplar yalnızca tekrar turunun haritasına yazılır (ana puan ve kayıt değişmez).
    if (review) setReviewProgress(current => answerOption(current, index, option));
    else setProgress(current => answerOption(current, index, option));
  };

  /** Karar noktasında bir cevap seçer (değiştirilebilir). Puanı, yanlış listesini ve kaydı etkilemez. */
  const handleChoicePress = (selected: 0 | 1) => {
    setChoices(current => (current[index] === selected ? current : { ...current, [index]: selected }));
  };

  const handleNext = () => {
    if (!canContinue || !nextLock.current.tryAcquire()) return;
    if (review) {
      // Son yanlış adımdan sonra tekrar biter ve sonuç ekranına dönülür (reviewNext bitişte null verir).
      setReview(reviewNext(review));
      return;
    }
    if (index >= steps.length - 1) setFinished(true);
    else setIndex(index + 1);
  };

  const handlePrevious = () => {
    if (review) {
      setReview(reviewPrevious(review));
      return;
    }
    if (index > 0) setIndex(index - 1);
  };

  const handleReplay = () => {
    setRound(value => value + 1);
    setIndex(0);
    setProgress({});
    setChoices({});
    setReview(null);
    setReviewProgress({});
    setShownTranslations({});
    setFinished(false);
  };

  const handleReviewMistakes = () => {
    const run = startReview(steps, progress);
    if (!run) return;
    setReviewProgress({});
    setShownTranslations({});
    setReviewPass(value => value + 1);
    setReview(run);
  };

  /** Tekrar turundan sonuç ekranına döner (sonuç zaten kaydedildi; kaybolan bir şey yok). */
  const handleLeaveReview = () => {
    stopSpeech();
    setReview(null);
  };

  const handleExit = () => {
    stopSpeech();
    onExit();
  };

  if (finished && !review) {
    const phrases = learnedPhrases(steps, progress);
    const missedCount = missedStepIndexes(steps, progress).length;
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

          {missedCount > 0 && (
            <PrimaryButton
              label="Yanlışlarımı Tekrar Et"
              onPress={handleReviewMistakes}
              icon="arrow.triangle.2.circlepath"
              accessibilityHint={`İlk denemede yanlış yaptığın ${missedCount} soruyu yeniden oynatır; puanını değiştirmez`}
              style={styles.fullWidth}
            />
          )}
          <PrimaryButton label="Tekrar Çalış" onPress={handleReplay} icon="arrow.clockwise" style={styles.fullWidth} />
          <SecondaryButton label="Senaryolara Dön" onPress={handleExit} style={styles.fullWidth} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const options = optionsByStep[index] ?? [];
  // Tekrar turunda ilerleme yalnızca yanlış adımlar içinde sayılır.
  const position = review ? review.position + 1 : index + 1;
  const total = review ? review.indexes.length : steps.length;
  const isLast = review ? isLastReviewStep(review) : index === steps.length - 1;
  const atFirst = review ? review.position === 0 : index === 0;
  const current: ScenarioStep = step;
  const reply: ReplyStep | null = isReply(current) ? current : null;
  const lastWrongId = stepProgress.wrongIds[stepProgress.wrongIds.length - 1];
  const lastWrong = options.find(option => option.id === lastWrongId);
  // Önceki iki konuşma satırı bağlam olarak gösterilir (konuşmanın içinde olma hissi). Tekrar turunda bağlam, sorudan hemen
  // önceki konuşma satırıdır (tam metin, dinle ve çeviri ile).
  const history = review ? [] : buildHistory(steps, index, choices, 2);
  const contextIndex = review ? index - 1 : -1;
  const contextStep = contextIndex >= 0 ? steps[contextIndex] : undefined;

  const renderSayBubble = (item: { speaker: string; german: string; turkish: string }, itemIndex: number) => {
    const showTranslation = !!shownTranslations[itemIndex];
    return (
      <View style={styles.bubbleRow}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <AppIcon name="person.crop.circle.fill" size={26} color={colors.primary} />
        </View>
        <View style={styles.bubble}>
          <Text style={styles.speakerText}>{item.speaker}</Text>
          <Text style={styles.germanText}>{item.german}</Text>
          <ListenButtons text={item.german} speakingMode={speakingMode} onSpeak={speak} save={phraseOf(item, item.speaker)} />
          <TouchableOpacity
            style={styles.translationToggle}
            onPress={() => setShownTranslations(state => ({ ...state, [itemIndex]: !state[itemIndex] }))}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.translationToggleText}>
              {showTranslation ? 'Türkçeyi gizle' : 'Türkçeyi göster'}
            </Text>
          </TouchableOpacity>
          {showTranslation && <Text style={styles.turkishText}>{item.turkish}</Text>}
        </View>
      </View>
    );
  };

  // Karar noktası: iki doğal cevap, seçime göre değişen karşı taraf yanıtı. Doğru/yanlış yok; puana ve kayda girmez.
  const renderChoice = (item: ChoiceStep) => {
    const selected = choices[index];
    const outcome = choiceOutcome(item, selected);
    return (
      <>
        {renderSayBubble(item, index)}
        <View style={styles.promptCard}>
          <Text style={styles.promptLabel}>Senin görevin</Text>
          <Text style={styles.promptText}>{item.prompt}</Text>
        </View>
        <View style={styles.options} accessibilityLabel="Cevap seçenekleri">
          {item.options.map((option, optionIndex) => {
            const chosen = selected === optionIndex;
            return (
              <View key={optionIndex} style={styles.optionRow}>
                <TouchableOpacity
                  style={[styles.option, styles.optionGrow, chosen && styles.optionChosen]}
                  onPress={() => handleChoicePress(optionIndex === 0 ? 0 : 1)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Cevap ${OPTION_LETTERS[optionIndex]}: ${option.german}. ${option.turkish}`}
                  accessibilityHint="Bu cevap puanı etkilemez; karşı tarafın yanıtı seçimine göre değişir"
                  accessibilityState={{ selected: chosen }}
                >
                  <View style={[styles.optionLetter, chosen && styles.optionLetterChosen]}>
                    <Text style={styles.optionLetterText}>{OPTION_LETTERS[optionIndex]}</Text>
                  </View>
                  <View style={styles.choiceTexts}>
                    <Text style={styles.choiceGerman}>{option.german}</Text>
                    <Text style={styles.choiceTurkish}>{option.turkish}</Text>
                  </View>
                </TouchableOpacity>
                <PhraseSaveButton phrase={phraseOf(option, 'Sen')} />
              </View>
            );
          })}
        </View>

        {outcome && (
          <>
            <View style={[styles.bubbleRow, styles.bubbleRowUser]}>
              <View style={[styles.bubble, styles.bubbleUser]}>
                <Text style={styles.speakerText}>Sen</Text>
                <Text style={styles.germanText}>{outcome.chosen.german}</Text>
                <ListenButtons text={outcome.chosen.german} speakingMode={speakingMode} onSpeak={speak} save={phraseOf(outcome.chosen, 'Sen')} />
              </View>
            </View>
            {renderSayBubble(outcome.response, 1000 + index)}
            <Text style={styles.choiceNote} accessibilityLiveRegion="polite">
              İki cevap da doğal ve doğru. Diğerini seçip karşı tarafın yanıtını da görebilirsin; bu seçim puanını etkilemez.
            </Text>
          </>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={review ? handleLeaveReview : handleExit}
          style={styles.headerBack}
          accessibilityRole="button"
          accessibilityLabel={review ? 'Sonuç ekranına dön' : 'Geri'}
        >
          <Text style={styles.headerBackText}>{review ? '← Sonuç' : '← Geri'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{scenario.title}</Text>
        <Text
          style={styles.headerProgress}
          accessibilityLabel={`${total} adımın ${position}. adımı`}
        >
          {position} / {total}
        </Text>
      </View>
      <View style={styles.progressWrap}>
        <ProgressBar value={position} max={total} label={`Adım ${position} / ${total}`} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {review && (
          <View style={styles.reviewBanner} accessibilityRole="summary">
            <Text style={styles.reviewBannerTitle}>Yanlışlarını tekrar ediyorsun</Text>
            <Text style={styles.reviewBannerText}>Bu turdaki cevaplar ilk sonucunu ve puanını değiştirmez.</Text>
          </View>
        )}

        <View style={styles.placeRow}>
          <AppIcon name="mappin.and.ellipse" size={12} color={colors.secondary} />
          <Text style={styles.placeText}>
            {scenario.place}{meta ? ` · ${meta.germanTitle}` : ''}
          </Text>
        </View>

        {contextStep?.type === 'say' && renderSayBubble(contextStep, contextIndex)}

        {history.map(item => (
          <View
            key={`h-${item.key}`}
            style={[styles.historyBubble, item.user && styles.historyBubbleUser]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={styles.historySpeaker}>{item.speaker}</Text>
            <Text style={styles.historyText} numberOfLines={2}>{item.german}</Text>
          </View>
        ))}

        {reply && !stepProgress.solved && (
          <View style={styles.promptCard}>
            <Text style={styles.promptLabel}>Senin görevin</Text>
            <Text style={styles.promptText}>{reply.prompt}</Text>
          </View>
        )}

        {current.type === 'say' && renderSayBubble(current, index)}
        {current.type === 'choice' && renderChoice(current)}

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
                <ListenButtons text={reply.german} speakingMode={speakingMode} onSpeak={speak} save={phraseOf(reply, 'Sen')} />
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
          style={[styles.navBtn, styles.navBtnBack, atFirst && styles.navBtnDisabled]}
          onPress={handlePrevious}
          disabled={atFirst}
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
          accessibilityLabel={isLast ? (review ? 'Tekrarı bitir ve sonuca dön' : 'Senaryoyu bitir') : 'Sonraki adım'}
        >
          <Text style={styles.navBtnNextText}>{isLast ? (review ? 'Sonuca dön' : 'Bitir') : 'Devam →'}</Text>
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
  reviewBanner: {
    width: '100%', gap: 2, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outlineVariant,
  },
  reviewBannerTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  reviewBannerText: { fontSize: 12, lineHeight: 17, color: Colors.onSurfaceVariant },
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
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  optionGrow: { flex: 1 },
  optionWrong: { backgroundColor: Colors.errorContainer, borderColor: Colors.error },
  optionChosen: { borderColor: Colors.golden },
  optionLetterChosen: { backgroundColor: Colors.golden },
  choiceTexts: { flex: 1, gap: 2 },
  choiceGerman: { fontSize: 16, fontWeight: '600', color: Colors.primary, lineHeight: 22 },
  choiceTurkish: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 18 },
  choiceNote: { fontSize: 12, lineHeight: 17, color: Colors.onSurfaceVariant, textAlign: 'center' },
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
