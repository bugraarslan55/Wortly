import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../components/app-icon';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { getTopicById } from '../../constants/topics';
import { getGermanSpeechText } from '../../utils/german-speech';
import { Word } from '../../types';
import { useSessionStore } from '../../store';

const SESSION_SIZE = 20;

type ListenQuestion = {
  word: Word;
  options: Word[];
};

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function createQuestion(word: Word, wordPool: Word[]): ListenQuestion | undefined {
  const seenMeanings = new Set([word.turkish.trim().toLocaleLowerCase('tr-TR')]);
  const distractors: Word[] = [];

  for (const candidate of shuffle(wordPool)) {
    const normalizedMeaning = candidate.turkish.trim().toLocaleLowerCase('tr-TR');
    if (candidate.id === word.id || seenMeanings.has(normalizedMeaning)) continue;

    seenMeanings.add(normalizedMeaning);
    distractors.push(candidate);
    if (distractors.length === 3) break;
  }

  if (distractors.length < 3) return undefined;
  return { word, options: shuffle([word, ...distractors]) };
}

export default function DinleSecScreen() {
  const router = useRouter();
  const { topicId, wordIds } = useLocalSearchParams<{ topicId?: string; wordIds?: string }>();
  const topic = topicId ? getTopicById(topicId) : undefined;
  const { startSession, saveSession } = useSessionStore();
  const [speakingRate, setSpeakingRate] = useState<'normal' | 'slow' | null>(null);
  const [isHintVisible, setIsHintVisible] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongWordIds, setWrongWordIds] = useState<string[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);
  const speechRunRef = useRef(0);

  const sessionQuestions = useMemo(() => {
    if (!topic || (topic.level !== 'A1' && topic.level !== 'A2') || topic.words.length < 4) {
      return [];
    }

    const retryIds = wordIds?.split(',').filter(Boolean) ?? [];
    const questionPool = retryIds.length > 0
      ? retryIds
          .map(id => topic.words.find(word => word.id === id))
          .filter((word): word is Word => Boolean(word))
      : topic.words;

    return shuffle(questionPool)
      .slice(0, SESSION_SIZE)
      .map(word => createQuestion(word, topic.words))
      .filter((question): question is ListenQuestion => Boolean(question));
  }, [topic?.id, wordIds]);

  const question = sessionQuestions[currentIndex];
  const totalQuestions = sessionQuestions.length;

  useEffect(() => {
    if (sessionQuestions.length > 0) {
      startSession({
        type: 'dinle-sec',
        wordIds: sessionQuestions.map(item => item.word.id),
        score: 0,
        total: sessionQuestions.length,
        topicId,
      });
    }
  }, [sessionQuestions]);

  const speakWord = async (mode: 'normal' | 'slow') => {
    if (!question) return;

    const runId = speechRunRef.current + 1;
    speechRunRef.current = runId;
    setSpeakingRate(mode);
    await Speech.stop();

    if (speechRunRef.current !== runId) return;

    const finish = () => {
      if (speechRunRef.current === runId) setSpeakingRate(null);
    };

    Speech.speak(getGermanSpeechText(question.word), {
      language: 'de-DE',
      rate: mode === 'slow' ? 0.30 : 0.92,
      pitch: 1,
      onDone: finish,
      onError: finish,
      onStopped: finish,
    });
  };

  useEffect(() => {
    setSelectedOptionId(null);
    setIsHintVisible(false);
    void speakWord('normal');

    return () => {
      speechRunRef.current += 1;
      void Speech.stop();
    };
  }, [question?.word.id]);

  const selectedIsCorrect = selectedOptionId === question?.word.id;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/konular' as any);
  };

  const handleSelect = (optionId: string) => {
    if (selectedOptionId || !question) return;
    setSelectedOptionId(optionId);
    if (optionId === question.word.id) setScore(current => current + 1);
    else setWrongWordIds(current => [...current, question.word.id]);
  };

  const handleNext = async () => {
    if (!selectedOptionId || isCompleting) return;

    if (currentIndex >= totalQuestions - 1) {
      setIsCompleting(true);
      await saveSession({
        id: Date.now().toString(36),
        date: Date.now(),
        type: 'dinle-sec',
        wordIds: sessionQuestions.map(item => item.word.id),
        score,
        total: totalQuestions,
        topicId,
      });
      router.replace({
        pathname: '/alistirma/sonuc',
        params: {
          score: String(score),
          total: String(totalQuestions),
          type: 'dinle-sec',
          topicId: topicId ?? '',
          wrongIds: wrongWordIds.join(','),
        },
      } as any);
      return;
    }

    setCurrentIndex(index => index + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dinle ve Seç</Text>
        <Text style={styles.counter}>{Math.min(currentIndex + 1, totalQuestions)}/{totalQuestions}</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[
          styles.progressFill,
          { width: `${totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0}%` },
        ]} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.topicTitle}>{topic?.title || 'A1 / A2'}</Text>
        <Text style={styles.instruction}>Sesi dinle ve doğru anlamı seç</Text>

        <View style={styles.previewCard}>
          <View style={styles.speechControls}>
            <TouchableOpacity
              style={[styles.speechButton, speakingRate === 'normal' && styles.speechButtonActive]}
              onPress={() => void speakWord('normal')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Kelimeyi normal hızda dinle"
            >
              <AppIcon name="speaker.wave.2.fill" size={22} color={Colors.secondary} />
              <Text style={styles.speechButtonText}>Normal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.speechButton, speakingRate === 'slow' && styles.speechButtonActive]}
              onPress={() => void speakWord('slow')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Kelimeyi yavaş hızda dinle"
            >
              <AppIcon name="tortoise.fill" size={22} color={Colors.secondary} />
              <Text style={styles.speechButtonText}>Yavaş</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.previewTitle}>
            {speakingRate === 'slow'
              ? 'Yavaş hızda dinliyorsun…'
              : speakingRate === 'normal'
                ? 'Normal hızda dinliyorsun…'
                : 'Tekrar dinlemek için bir hız seç'}
          </Text>
          <Text style={styles.previewText}>
            Almanca kelime ekran açıldığında otomatik okunur.
          </Text>
          <TouchableOpacity
            style={[styles.hintButton, isHintVisible && styles.hintButtonActive]}
            onPress={() => setIsHintVisible(visible => !visible)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={isHintVisible ? 'İpucunu gizle' : 'İpucunu göster'}
            accessibilityState={{ expanded: isHintVisible }}
          >
            <AppIcon
              name={isHintVisible ? 'eye.slash.fill' : 'lightbulb.fill'}
              size={18}
              color={Colors.secondary}
            />
            <Text style={styles.hintButtonText}>{isHintVisible ? 'İpucunu Gizle' : 'İpucu'}</Text>
          </TouchableOpacity>
          {isHintVisible && question && (
            <View style={styles.hintContent} accessibilityLiveRegion="polite">
              <Text style={styles.hintGerman}>
                {[question.word.article, question.word.german].filter(Boolean).join(' ')}
              </Text>
              <Text style={styles.hintTurkish}>{question.word.turkish}</Text>
            </View>
          )}
        </View>

        <View style={styles.placeholderGroup} accessibilityLabel="Dört Türkçe cevap seçeneği">
          {question?.options.map((option, index) => {
            const isCorrect = selectedOptionId !== null && option.id === question.word.id;
            const isSelectedWrong = selectedOptionId === option.id && !isCorrect;

            return (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.placeholderOption,
                isCorrect && styles.optionCorrect,
                isSelectedWrong && styles.optionWrong,
              ]}
              onPress={() => handleSelect(option.id)}
              disabled={selectedOptionId !== null}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${String.fromCharCode(65 + index)}, ${option.turkish}`}
              accessibilityState={{ selected: selectedOptionId === option.id, disabled: selectedOptionId !== null }}
            >
              <View style={[
                styles.optionLetter,
                isCorrect && styles.optionLetterCorrect,
                isSelectedWrong && styles.optionLetterWrong,
              ]}>
                <Text style={[
                  styles.optionLetterText,
                  (isCorrect || isSelectedWrong) && styles.optionLetterTextAnswered,
                ]}>{String.fromCharCode(65 + index)}</Text>
              </View>
              <Text style={styles.optionText}>{option.turkish}</Text>
              {isCorrect && <AppIcon name="checkmark.circle.fill" size={22} color={Colors.success} />}
              {isSelectedWrong && <AppIcon name="xmark.circle.fill" size={22} color={Colors.error} />}
            </TouchableOpacity>
            );
          })}
        </View>

        {!selectedOptionId && (
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>Dinlediğin kelimenin anlamını seç</Text>
          </View>
        )}
      </ScrollView>

      {selectedOptionId && (
        <View style={styles.answerArea}>
          <View
            style={[styles.feedbackCard, selectedIsCorrect ? styles.feedbackCorrect : styles.feedbackWrong]}
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.feedbackTitle}>{selectedIsCorrect ? 'Doğru!' : 'Yanlış cevap'}</Text>
            {!selectedIsCorrect && (
              <Text style={styles.feedbackText}>Doğru anlam: {question?.word.turkish}</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.nextButton, isCompleting && styles.nextButtonDisabled]}
            onPress={() => void handleNext()}
            disabled={isCompleting}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={currentIndex < totalQuestions - 1 ? 'Sonraki soruya geç' : 'Sonuçları gör'}
          >
            <Text style={styles.nextButtonText}>
              {isCompleting ? 'Kaydediliyor…' : currentIndex < totalQuestions - 1 ? 'Devam Et' : 'Sonuçları Gör'}
            </Text>
            {!isCompleting && <AppIcon name="arrow.right" size={17} color={Colors.primary} />}
          </TouchableOpacity>
        </View>
      )}
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
  counter: { minWidth: 68, textAlign: 'right', fontSize: 14, fontWeight: '700', color: Colors.secondary, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 4, marginHorizontal: Spacing.marginMain, borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceContainer },
  progressFill: { width: '5%', height: '100%', borderRadius: BorderRadius.full, backgroundColor: Colors.golden },
  scroll: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.marginMain, paddingBottom: Spacing.xl, alignItems: 'center' },
  topicTitle: { fontSize: 13, fontWeight: '600', color: Colors.outline, marginTop: Spacing.sm },
  instruction: { fontSize: 22, lineHeight: 28, fontWeight: '700', color: Colors.primary, textAlign: 'center', marginTop: Spacing.sm },
  previewCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.level2,
  },
  speechControls: { width: '100%', flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  speechButton: { flex: 1, minHeight: 58, borderRadius: BorderRadius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1.5, borderColor: Colors.outlineVariant },
  speechButtonActive: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
  speechButtonText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  previewTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  previewText: { fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant, textAlign: 'center' },
  hintButton: { minHeight: 42, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1.5, borderColor: Colors.outlineVariant },
  hintButtonActive: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
  hintButtonText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  hintContent: { width: '100%', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, alignItems: 'center', gap: 2, borderRadius: BorderRadius.lg, backgroundColor: Colors.surfaceContainerLow },
  hintGerman: { fontSize: 18, fontWeight: '800', color: Colors.primary, textAlign: 'center' },
  hintTurkish: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center' },
  placeholderGroup: { width: '100%', gap: Spacing.sm, marginTop: Spacing.lg },
  placeholderOption: { minHeight: 58, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.outlineVariant },
  optionCorrect: { backgroundColor: Colors.successContainer, borderColor: Colors.success },
  optionWrong: { backgroundColor: Colors.errorContainer, borderColor: Colors.error },
  optionLetter: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceContainerLowest },
  optionLetterCorrect: { backgroundColor: Colors.success },
  optionLetterWrong: { backgroundColor: Colors.error },
  optionLetterText: { fontSize: 13, fontWeight: '700', color: Colors.outline },
  optionLetterTextAnswered: { color: Colors.onPrimary },
  optionText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.primary },
  previewBadge: { marginTop: 'auto', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceContainer },
  previewBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  answerArea: { width: '100%', paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.warmWhite },
  feedbackCard: { width: '100%', paddingHorizontal: Spacing.md, paddingVertical: 12, borderRadius: BorderRadius.lg, borderWidth: 1.5 },
  feedbackCorrect: { backgroundColor: Colors.successContainer, borderColor: Colors.success },
  feedbackWrong: { backgroundColor: Colors.errorContainer, borderColor: Colors.error },
  feedbackTitle: { fontSize: 15, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  feedbackText: { marginTop: 2, fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center' },
  nextButton: { width: '100%', height: 50, borderRadius: BorderRadius.lg, backgroundColor: Colors.golden, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  nextButtonDisabled: { opacity: 0.55 },
  nextButtonText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
});
