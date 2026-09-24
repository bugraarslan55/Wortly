import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, TextInput, ScrollView, Keyboard,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ALL_TOPICS, getTopicById } from '../../constants/topics';
import { useWordStore, useSessionStore } from '../../store';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Word } from '../../types';
import { ColoredGermanWord } from '../../components/colored-german-word';
import { getArticlePalette } from '../../constants/article-colors';

const GERMAN_CHARS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];
const SESSION_SIZE = 10;

type Phase = 'input' | 'result';

const ANSWER_ALTERNATIVES: Record<string, string[]> = {
  // "istemek" iki yaygın A1 karşılığı da doğru olduğundan ikisini kabul et.
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

  if (word.article) {
    answers.push(`${word.article} ${word.german}`);
  }

  // Birleşik Goethe kayıtlarında tek tek verilen biçimleri de kabul et.
  if (word.german.includes('/')) {
    answers.push(...word.german.split('/'));
  }

  // "(sich) anmelden" için hem "sich anmelden" hem "anmelden" geçerlidir.
  const optionalPart = word.german.match(/^\(([^)]+)\)\s*(.+)$/);
  if (optionalPart) {
    answers.push(`${optionalPart[1]} ${optionalPart[2]}`, optionalPart[2]);
  }

  return answers.map(normalizeGermanAnswer);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function YazmaScreen() {
  const router = useRouter();
  const { wordIds, topicId } = useLocalSearchParams<{ wordIds: string; topicId?: string }>();
  const { words: customWords, updateMastery } = useWordStore();
  const { startSession, saveSession } = useSessionStore();

  const allBuiltIn = ALL_TOPICS.flatMap(t => t.words);
  const ids = wordIds?.split(',').filter(Boolean) || [];
  const words: Word[] = ids.length > 0
    ? ids.map(id => allBuiltIn.find(w => w.id === id) || customWords.find(w => w.id === id)).filter(Boolean) as Word[]
    : (topicId ? getTopicById(topicId)?.words : undefined) ?? customWords;

  // Oturum boyunca sırası sabit, en fazla 10 kelimelik karışık çalışma seti.
  const sessionWords = useMemo(
    () => shuffle(words).slice(0, SESSION_SIZE),
    [wordIds, topicId, words.length],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [wrongWordIds, setWrongWordIds] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  const currentWord = sessionWords[currentIndex];
  const progress = sessionWords.length > 0 ? ((currentIndex + 1) / sessionWords.length) * 100 : 0;

  React.useEffect(() => {
    if (sessionWords.length > 0) {
      startSession({ type: 'yazma', wordIds: sessionWords.map(w => w.id), score: 0, total: sessionWords.length, topicId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionWords]);

  const checkAnswer = () => {
    if (phase === 'result') return; // Aynı sorunun cevabı iki kez işlenmesin.
    Keyboard.dismiss();
    const given = normalizeGermanAnswer(input);
    const correct = getAcceptedAnswers(currentWord).includes(given);
    updateMastery(currentWord.id, correct);
    if (correct) setScore(s => s + 1);
    else setWrongWordIds(current => [...current, currentWord.id]);
    setIsCorrect(correct);
    setPhase('result');
  };

  const handleNext = async () => {
    if (currentIndex + 1 >= sessionWords.length) {
      await saveSession({
        id: Date.now().toString(36),
        date: Date.now(),
        type: 'yazma',
        wordIds: sessionWords.map(w => w.id),
        score,
        total: sessionWords.length,
        topicId,
      });
      router.replace({
        pathname: '/alistirma/sonuc',
        params: {
          score: String(score),
          total: String(sessionWords.length),
          type: 'yazma',
          topicId: topicId ?? '',
          wrongIds: wrongWordIds.join(','),
        },
      } as any);
    } else {
      setCurrentIndex(i => i + 1);
      setInput('');
      setPhase('input');
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  };

  const insertChar = (char: string) => {
    setInput(prev => prev + char);
    inputRef.current?.focus();
  };

  if (!words.length) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Kelime bulunamadı</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Geri</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yazarak Tekrar</Text>
        <Text style={styles.counter}>{currentIndex + 1}/{sessionWords.length}</Text>
      </View>

      {/* Progress */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Prompt card */}
        <View style={styles.promptCard}>
          <Text style={styles.promptHint}>Türkçe anlamı verilen kelimeyi Almanca yaz:</Text>
          <Text style={styles.promptTurkish}>{currentWord.turkish}</Text>
          {currentWord.article ? (
            <View style={[
              styles.articleHint,
              {
                backgroundColor: getArticlePalette(currentWord.article).background,
                borderColor: getArticlePalette(currentWord.article).foreground,
              },
            ]}>
              <Text style={[
                styles.articleHintText,
                { color: getArticlePalette(currentWord.article).foreground },
              ]}>
                Artikel: {currentWord.article}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Input */}
        <View style={[
          styles.inputWrapper,
          phase === 'result' && (isCorrect ? styles.inputCorrect : styles.inputWrong),
        ]}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Almanca kelimeyi yaz..."
            placeholderTextColor={Colors.outlineVariant}
            autoCapitalize="none"
            autoCorrect={false}
            editable={phase === 'input'}
            onSubmitEditing={phase === 'input' ? checkAnswer : undefined}
          />
          {phase === 'result' && (
            <Text style={styles.inputResultIcon}>{isCorrect ? '✓' : '✕'}</Text>
          )}
        </View>

        {/* Special chars */}
        {phase === 'input' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.charRow}>
            {GERMAN_CHARS.map(char => (
              <TouchableOpacity
                key={char}
                style={styles.charBtn}
                onPress={() => insertChar(char)}
                activeOpacity={0.7}
              >
                <Text style={styles.charBtnText}>{char}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Result */}
        {phase === 'result' && (
          <View style={[styles.resultBox, isCorrect ? styles.resultBoxCorrect : styles.resultBoxWrong]}>
            <Text style={styles.resultEmoji}>{isCorrect ? 'Mükemmel!' : 'Neredeyse!'}</Text>
            {!isCorrect && (
              <>
                <Text style={styles.resultLabel}>Doğru cevap:</Text>
                <ColoredGermanWord
                  article={currentWord.article}
                  german={currentWord.german}
                  style={styles.resultCorrect}
                  articleStyle={styles.resultCorrectArticle}
                />
              </>
            )}
            {currentWord.example && (
              <View style={styles.exampleBox}>
                <Text style={styles.exampleLabel}>Örnek cümle:</Text>
                <Text style={styles.exampleText}>{currentWord.example}</Text>
                {currentWord.exampleTurkish && (
                  <Text style={styles.exampleTr}>{currentWord.exampleTurkish}</Text>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom button */}
      {phase === 'input' ? (
        <TouchableOpacity
          style={[styles.ctaBtn, !input.trim() && styles.ctaBtnDisabled]}
          onPress={checkAnswer}
          disabled={!input.trim()}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaBtnText}>Kontrol Et</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.ctaBtn} onPress={() => void handleNext()} activeOpacity={0.85}>
          <Text style={styles.ctaBtnText}>
            {currentIndex + 1 >= sessionWords.length ? 'Sonuçları Gör' : 'Devam Et'}
          </Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.marginMain, paddingVertical: Spacing.md },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: Colors.onSurfaceVariant },
  headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.primary },
  counter: { fontSize: 14, fontWeight: '600', color: Colors.onSurfaceVariant },
  progressTrack: { height: 4, backgroundColor: Colors.surfaceContainer, marginHorizontal: Spacing.marginMain, borderRadius: 2, marginBottom: Spacing.md },
  progressFill: { height: 4, backgroundColor: Colors.golden, borderRadius: 2 },
  content: { paddingHorizontal: Spacing.marginMain, gap: Spacing.md, paddingBottom: 24 },
  promptCard: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 20, padding: Spacing.lg, alignItems: 'center', ...Shadows.level1 },
  promptHint: { fontSize: 12, color: Colors.outlineVariant, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
  promptTurkish: { fontSize: 28, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  articleHint: { marginTop: Spacing.sm, paddingHorizontal: 12, paddingVertical: 4, borderRadius: BorderRadius.full, borderWidth: 1 },
  articleHintText: { fontSize: 12, fontWeight: '700' },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.outlineVariant, paddingHorizontal: Spacing.md, ...Shadows.level1 },
  inputCorrect: { borderColor: Colors.success, backgroundColor: '#F0FFF4' },
  inputWrong: { borderColor: Colors.error, backgroundColor: Colors.errorContainer },
  input: { flex: 1, height: 56, fontSize: 20, color: Colors.primary, fontWeight: '600' },
  inputResultIcon: { fontSize: 20 },
  charRow: { gap: Spacing.sm, paddingVertical: 4 },
  charBtn: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', ...Shadows.level1 },
  charBtnText: { fontSize: 18, fontWeight: '600', color: Colors.primary },
  resultBox: { borderRadius: 16, padding: Spacing.md, gap: 6 },
  resultBoxCorrect: { backgroundColor: '#D8F3DC' },
  resultBoxWrong: { backgroundColor: Colors.errorContainer },
  resultEmoji: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  resultLabel: { fontSize: 12, color: Colors.onSurfaceVariant },
  resultCorrect: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  resultCorrectArticle: { fontWeight: '700' },
  exampleBox: { marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.08)', paddingTop: Spacing.sm },
  exampleLabel: { fontSize: 11, color: Colors.outlineVariant, marginBottom: 4 },
  exampleText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  exampleTr: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2 },
  ctaBtn: { marginHorizontal: Spacing.marginMain, marginBottom: 32, height: 54, backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  ctaBtnDisabled: { opacity: 0.5 },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyText: { fontSize: 16, color: Colors.onSurfaceVariant },
  backBtn: { backgroundColor: Colors.golden, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
});
