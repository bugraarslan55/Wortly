import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../components/app-icon';
import { BorderRadius, Colors, Shadows, Spacing } from '../../constants/theme';
import { getTopicById } from '../../constants/topics';
import { getGermanSpeechText } from '../../utils/german-speech';
import { Word } from '../../types';
import { useSessionStore } from '../../store';

const SESSION_SIZE = 10;
const GERMAN_CHARACTERS = ['ä', 'ö', 'ü', 'ß'] as const;

const ANSWER_ALTERNATIVES: Record<string, string[]> = {
  'goethe-a1-wollen': ['möchten'],
};

function normalizeGermanAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/\s+/g, ' ')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function getAcceptedAnswers(word: Word): string[] {
  const answers = [word.german, ...(ANSWER_ALTERNATIVES[word.id] ?? [])];

  if (word.article) answers.push(`${word.article} ${word.german}`);
  if (word.german.includes('/')) answers.push(...word.german.split('/'));

  const optionalPart = word.german.match(/^\(([^)]+)\)\s*(.+)$/);
  if (optionalPart) {
    answers.push(`${optionalPart[1]} ${optionalPart[2]}`, optionalPart[2]);
  }

  return answers.map(normalizeGermanAnswer);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
}

export default function DinleYazScreen() {
  const router = useRouter();
  const { topicId } = useLocalSearchParams<{ topicId?: string }>();
  const topic = topicId ? getTopicById(topicId) : undefined;
  const isSupportedTopic = topic?.level === 'A1' || topic?.level === 'A2';
  const { startSession, saveSession } = useSessionStore();
  const sessionWords = useMemo(
    () => isSupportedTopic ? shuffle(topic.words).slice(0, SESSION_SIZE) : [],
    [isSupportedTopic, topic?.id],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const currentWord = sessionWords[currentIndex];
  const totalQuestions = sessionWords.length;
  const [answer, setAnswer] = useState('');
  const [answerResult, setAnswerResult] = useState<boolean | null>(null);
  const [speakingRate, setSpeakingRate] = useState<'normal' | 'slow' | null>(null);
  const speechRunRef = useRef(0);

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

  const speakWord = async (mode: 'normal' | 'slow') => {
    if (!currentWord) return;

    const runId = speechRunRef.current + 1;
    speechRunRef.current = runId;
    setSpeakingRate(mode);
    await Speech.stop();

    if (speechRunRef.current !== runId) return;

    const finish = () => {
      if (speechRunRef.current === runId) setSpeakingRate(null);
    };

    Speech.speak(getGermanSpeechText(currentWord), {
      language: 'de-DE',
      rate: mode === 'slow' ? 0.30 : 0.92,
      pitch: 1,
      onDone: finish,
      onError: finish,
      onStopped: finish,
    });
  };

  useEffect(() => {
    setAnswer('');
    setAnswerResult(null);
    void speakWord('normal');

    return () => {
      speechRunRef.current += 1;
      void Speech.stop();
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
    if (!currentWord || !answer.trim() || answerResult !== null) return;

    Keyboard.dismiss();
    const isCorrect = getAcceptedAnswers(currentWord).includes(normalizeGermanAnswer(answer));
    if (isCorrect) setScore((current) => current + 1);
    setAnswerResult(isCorrect);
  };

  const handleNext = async () => {
    if (answerResult === null || isCompleting) return;

    if (currentIndex >= totalQuestions - 1) {
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
      router.replace(`/alistirma/sonuc?score=${score}&total=${totalQuestions}&type=dinle-yaz` as any);
      return;
    }

    setCurrentIndex((index) => index + 1);
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
        <Text style={styles.headerTitle}>Dinle ve Yaz</Text>
        <Text style={styles.counter}>
          {totalQuestions > 0 ? `${currentIndex + 1}/${totalQuestions}` : '—'}
        </Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[
          styles.progressFill,
          { width: totalQuestions > 0 ? `${((currentIndex + 1) / totalQuestions) * 100}%` : '0%' },
        ]} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.topicTitle}>{topic?.title || 'A1 / A2'}</Text>
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
            <View style={styles.characterRow} accessibilityLabel="Almanca karakter kısayolları">
              {GERMAN_CHARACTERS.map((character) => (
                <TouchableOpacity
                  key={character}
                  style={styles.characterButton}
                  onPress={() => setAnswer((current) => `${current}${character}`)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${character} karakterini ekle`}
                >
                  <Text style={styles.characterButtonText}>{character}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {answerResult !== null && (
            <View style={[styles.resultBox, answerResult ? styles.resultBoxCorrect : styles.resultBoxWrong]}>
              <Text style={styles.resultTitle}>{answerResult ? 'Doğru!' : 'Yanlış cevap'}</Text>
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
          <Text style={styles.unavailableText}>Bu çalışma yalnızca A1 ve A2 konularında kullanılabilir.</Text>
        )}
      </ScrollView>
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
});
