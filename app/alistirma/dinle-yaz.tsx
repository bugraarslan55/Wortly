import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../components/app-icon';
import { BorderRadius, Colors, Shadows, Spacing } from '../../constants/theme';
import { getTopicById } from '../../constants/topics';
import { getGermanSpeechText } from '../../utils/german-speech';
import { useGermanSpeech } from '../../utils/use-german-speech';
import { selectWordsForReview } from '../../utils/spaced-repetition';
import { checkGermanAnswer, describeAnswerNote } from '../../utils/answer-check';
import { GermanCharacterBar } from '../../components/german-character-bar';
import { KeyboardSafeView } from '../../components/keyboard-safe-view';
import { ExerciseHeader, ExerciseProgress, confirmLeaveExercise, useActionLock } from '../../components/exercise-ui';
import { Word } from '../../types';
import { useSessionStore, useWordStore } from '../../store';

const SESSION_SIZE = 10;
export default function DinleYazScreen() {
  const router = useRouter();
  const { topicId, wordIds } = useLocalSearchParams<{ topicId?: string; wordIds?: string }>();
  const topic = topicId ? getTopicById(topicId) : undefined;
  const { words: customWords, reviewStates, updateMastery } = useWordStore();
  const customWordList = useMemo(() => customWords.filter(word => word.isCustom), [customWords]);
  const isSupportedTopic = topic
    ? topic.level === 'A1' || topic.level === 'A2' || topic.level === 'B1'
    : customWordList.length > 0;
  const { startSession, saveSession } = useSessionStore();
  const sessionWords = useMemo(() => {
    if (!isSupportedTopic) return [];

    const sourceWords = topic ? topic.words : customWordList;
    const retryIds = wordIds?.split(',').filter(Boolean) ?? [];
    const wordPool = retryIds.length > 0
      ? retryIds
          .map((id) => sourceWords.find((word) => word.id === id))
          .filter((word): word is Word => Boolean(word))
      : sourceWords;

    return selectWordsForReview(wordPool, SESSION_SIZE, reviewStates);
  }, [isSupportedTopic, topic?.id, wordIds, customWordList.length]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongWordIds, setWrongWordIds] = useState<string[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);
  const currentWord = sessionWords[currentIndex];
  const totalQuestions = sessionWords.length;
  const [answer, setAnswer] = useState('');
  const [answerResult, setAnswerResult] = useState<boolean | null>(null);
  const { speak, stop: stopSpeech, speakingRate } = useGermanSpeech();
  const [answerNote, setAnswerNote] = useState('');
  // State asenkron güncellendiği için hızlı çift dokunuşta aynı soru iki kez puanlanabilirdi.
  const answerLock = useActionLock();
  const completeLock = useActionLock();

  useEffect(() => {
    if (sessionWords.length === 0) return;

    startSession({
      type: 'dinle-yaz',
      wordIds: sessionWords.map((word) => word.id),
      score: 0,
      total: sessionWords.length,
      topicId,
    });
  }, [sessionWords]);

  const speakWord = (mode: 'normal' | 'slow') => {
    if (currentWord) void speak(getGermanSpeechText(currentWord), mode);
  };

  useEffect(() => {
    setAnswer('');
    setAnswerResult(null);
    setAnswerNote('');
    answerLock.release();
    void speakWord('normal');

    return () => {
      // Sorular arasında geçerken ve ekran kapanırken önceki ses kesilir.
      stopSpeech();
    };
  }, [currentWord?.id]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/konular' as any);
  };

  const checkAnswer = () => {
    if (!currentWord || !answer.trim() || answerResult !== null || !answerLock.acquire()) return;

    Keyboard.dismiss();
    stopSpeech(); // Cevap verilince devam eden ses durur.
    const verdict = checkGermanAnswer(currentWord, answer);
    const isCorrect = verdict.correct;
    setAnswerNote(describeAnswerNote(verdict));
    void updateMastery(currentWord.id, isCorrect);
    if (isCorrect) setScore((current) => current + 1);
    else setWrongWordIds((current) => [...current, currentWord.id]);
    setAnswerResult(isCorrect);
  };

  const handleNext = async () => {
    if (answerResult === null || isCompleting) return;

    if (currentIndex >= totalQuestions - 1) {
      if (!completeLock.acquire()) return;
      setIsCompleting(true);
      await saveSession({
        id: Date.now().toString(36),
        date: Date.now(),
        type: 'dinle-yaz',
        wordIds: sessionWords.map((word) => word.id),
        score,
        total: totalQuestions,
        topicId,
      });
      router.replace({
        pathname: '/alistirma/sonuc',
        params: {
          score: String(score),
          total: String(totalQuestions),
          type: 'dinle-yaz',
          topicId: topicId ?? '',
          wrongIds: wrongWordIds.join(','),
        },
      } as any);
      return;
    }

    setCurrentIndex((index) => index + 1);
  };

  if (totalQuestions === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Bu çalışma başlatılamıyor</Text>
          <Text style={styles.emptyText}>
            {topic
              ? 'Dinle ve Yaz için bu konuda kullanılabilir kelime bulunamadı.'
              : 'Önce en az bir kişisel kelime ekle.'}
          </Text>
          <TouchableOpacity style={styles.emptyBackButton} onPress={handleBack} activeOpacity={0.85}>
            <Text style={styles.emptyBackButtonText}>Geri dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ExerciseHeader
        title="Dinle ve Yaz"
        current={currentIndex + 1}
        total={totalQuestions}
        onClose={() => confirmLeaveExercise(currentIndex > 0 || answerResult !== null, handleBack)}
      />
      <ExerciseProgress current={currentIndex + 1} total={totalQuestions} />

      <KeyboardSafeView>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.topicTitle}>{topic?.title || 'Kelimelerim'}</Text>
        <Text style={styles.instruction}>Kelimeyi dinle ve Almancasını yaz</Text>

        <View style={styles.listenCard}>
          <View style={styles.iconCircle}>
            <AppIcon name="waveform" size={34} color={Colors.secondary} />
          </View>
          <Text style={styles.listenTitle}>
            {speakingRate === 'slow'
              ? 'Yavaş hızda dinliyorsun…'
              : speakingRate === 'normal'
                ? 'Normal hızda dinliyorsun…'
                : 'Tekrar dinlemek için bir hız seç'}
          </Text>
          <View style={styles.speechControls}>
            <TouchableOpacity
              style={[styles.speechButton, speakingRate === 'normal' && styles.speechButtonActive]}
              onPress={() => void speakWord('normal')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Kelimeyi normal hızda dinle"
            >
              <AppIcon name="speaker.wave.2.fill" size={21} color={Colors.secondary} />
              <Text style={styles.speechButtonText}>Normal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.speechButton, speakingRate === 'slow' && styles.speechButtonActive]}
              onPress={() => void speakWord('slow')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Kelimeyi yavaş hızda dinle"
            >
              <AppIcon name="tortoise.fill" size={21} color={Colors.secondary} />
              <Text style={styles.speechButtonText}>Yavaş</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.listenText}>Kelime ekran açıldığında otomatik okunur.</Text>
        </View>

        <View style={styles.answerSection}>
          <Text style={styles.answerLabel}>Almanca cevabın</Text>
          <TextInput
            style={[
              styles.answerInput,
              answerResult === true && styles.answerInputCorrect,
              answerResult === false && styles.answerInputWrong,
            ]}
            value={answer}
            onChangeText={setAnswer}
            placeholder="Almanca cevabını yaz"
            placeholderTextColor={Colors.outline}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            editable={isSupportedTopic && answerResult === null}
            onSubmitEditing={checkAnswer}
            accessibilityLabel="Almanca cevap alanı"
          />
          {answerResult === null && (
            <GermanCharacterBar onSelect={(character) => setAnswer((current) => current + character)} />
          )}
          {answerResult !== null && (
            <View style={[styles.resultBox, answerResult ? styles.resultBoxCorrect : styles.resultBoxWrong]}>
              <Text style={styles.resultTitle}>{answerResult ? 'Doğru!' : 'Yanlış cevap'}</Text>
              {answerResult && !!answerNote && <Text style={styles.correctAnswer}>{answerNote}</Text>}
              {!answerResult && <Text style={styles.correctAnswerTurkish}>Senin cevabın: {answer.trim()}</Text>}
              {!answerResult && currentWord && (
                <>
                  <Text style={styles.correctAnswer}>
                    Doğru cevap: {currentWord.article ? `${currentWord.article} ` : ''}{currentWord.german}
                  </Text>
                  <Text style={styles.correctAnswerTurkish}>{currentWord.turkish}</Text>
                </>
              )}
            </View>
          )}
          {answerResult === null ? (
            <TouchableOpacity
              style={[styles.checkButton, !answer.trim() && styles.checkButtonDisabled]}
              onPress={checkAnswer}
              disabled={!answer.trim()}
              accessibilityRole="button"
              accessibilityState={{ disabled: !answer.trim() }}
            >
              <Text style={styles.checkButtonText}>Kontrol Et</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.checkButton, isCompleting && styles.checkButtonDisabled]}
              onPress={() => void handleNext()}
              disabled={isCompleting}
              accessibilityRole="button"
              accessibilityState={{ disabled: isCompleting }}
            >
              <Text style={styles.checkButtonText}>
                {currentIndex >= totalQuestions - 1 ? 'Sonuçları Gör' : 'Devam Et'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!isSupportedTopic && (
          <Text style={styles.unavailableText}>Bu çalışma A1, A2, B1 veya kişisel kelimelerle kullanılabilir.</Text>
        )}
      </ScrollView>
      </KeyboardSafeView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: { height: 56, paddingHorizontal: Spacing.marginMain, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { minWidth: 68, paddingVertical: Spacing.sm },
  backText: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  counter: { minWidth: 68, textAlign: 'right', fontSize: 14, fontWeight: '700', color: Colors.secondary, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 4, marginHorizontal: Spacing.marginMain, borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceContainer },
  progressFill: { height: '100%', borderRadius: BorderRadius.full, backgroundColor: Colors.golden },
  scroll: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.marginMain, paddingBottom: Spacing.xxl, alignItems: 'center' },
  topicTitle: { marginTop: Spacing.sm, fontSize: 13, fontWeight: '600', color: Colors.outline },
  instruction: { marginTop: Spacing.sm, fontSize: 22, lineHeight: 28, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  listenCard: { width: '100%', marginTop: Spacing.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm, borderRadius: BorderRadius.xxl, backgroundColor: Colors.surfaceContainerLowest, ...Shadows.level2 },
  iconCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.secondaryContainer },
  listenTitle: { marginTop: Spacing.sm, fontSize: 17, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  speechControls: { width: '100%', marginTop: Spacing.sm, flexDirection: 'row', gap: Spacing.sm },
  speechButton: { flex: 1, minHeight: 54, borderRadius: BorderRadius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1.5, borderColor: Colors.outlineVariant },
  speechButtonActive: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
  speechButtonText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  listenText: { fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant, textAlign: 'center' },
  answerSection: { width: '100%', marginTop: Spacing.xl, gap: Spacing.sm },
  answerLabel: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  answerInput: { minHeight: 58, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.outlineVariant, backgroundColor: Colors.surfaceContainerLow, fontSize: 17, color: Colors.primary },
  answerInputCorrect: { borderColor: Colors.success, backgroundColor: '#F0FFF4' },
  answerInputWrong: { borderColor: Colors.error, backgroundColor: Colors.errorContainer },
  characterRow: { width: '100%', flexDirection: 'row', gap: Spacing.sm },
  characterButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.outlineVariant, backgroundColor: Colors.surfaceContainerLowest },
  characterButtonText: { fontSize: 19, fontWeight: '700', color: Colors.primary },
  resultBox: { width: '100%', padding: Spacing.md, borderRadius: BorderRadius.lg, gap: 4 },
  resultBoxCorrect: { backgroundColor: '#D8F3DC' },
  resultBoxWrong: { backgroundColor: Colors.errorContainer },
  resultTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  correctAnswer: { fontSize: 15, color: Colors.onSurfaceVariant },
  correctAnswerTurkish: { fontSize: 13, lineHeight: 18, color: Colors.outline },
  checkButton: { height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.lg, backgroundColor: Colors.golden },
  checkButtonDisabled: { opacity: 0.45 },
  checkButtonText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  unavailableText: { marginTop: Spacing.md, fontSize: 13, lineHeight: 18, color: Colors.error, textAlign: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant, textAlign: 'center' },
  emptyBackButton: { minHeight: 48, paddingHorizontal: Spacing.xl, borderRadius: BorderRadius.lg, backgroundColor: Colors.golden, alignItems: 'center', justifyContent: 'center' },
  emptyBackButtonText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
});
