import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ALL_TOPICS, getTopicById } from '../../constants/topics';
import { useWordStore, useSessionStore } from '../../store';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Word } from '../../types';
import { GermanCharacterBar } from '../../components/german-character-bar';
import { ColoredGermanWord } from '../../components/colored-german-word';

type Phase = 'write' | 'checked';

// Büyük/küçük harf, fazla boşluk ve sondaki noktalama puanı etkilemez.
// ä/ö/ü/ß gibi Almanca yazımlar ise öğrenme amacıyla korunur.
function normalizeSentence(sentence: string): string {
  return sentence
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/\s+/g, ' ')
    .replace(/[.!?;:,]+$/g, '')
    .trim();
}

export default function CumleScreen() {
  const router = useRouter();
  const { wordIds, topicId } = useLocalSearchParams<{ wordIds: string; topicId?: string }>();
  const { words: customWords, updateMastery } = useWordStore();
  const { startSession, saveSession } = useSessionStore();

  const allBuiltIn = ALL_TOPICS.flatMap(t => t.words);
  const ids = wordIds?.split(',').filter(Boolean) || [];
  const allWords: Word[] = ids.length > 0
    ? ids.map(id => allBuiltIn.find(w => w.id === id) || customWords.find(w => w.id === id)).filter(Boolean) as Word[]
    : (topicId ? getTopicById(topicId)?.words : undefined) ?? customWords;

  // Türkçe cümle soru, daha önce kaydedilen Almanca cümle beklenen cevaptır.
  const words = useMemo(
    () => allWords.filter(w =>
      w.example && w.example.trim().length > 0 &&
      w.exampleTurkish && w.exampleTurkish.trim().length > 0
    ),
    [allWords]
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('write');
  const [input, setInput] = useState('');
  const [score, setScore] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<1 | 2>(1);
  const [firstAttemptWrong, setFirstAttemptWrong] = useState(false);
  const [answerMatched, setAnswerMatched] = useState<boolean | null>(null);

  const currentWord = words[currentIndex];
  const progress = words.length > 0 ? ((currentIndex + 1) / words.length) * 100 : 0;

  React.useEffect(() => {
    if (words.length > 0) {
      startSession({ type: 'cumle', wordIds: words.map(w => w.id), score: 0, total: words.length, topicId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words.length]);

  const handleCheck = () => {
    if (phase !== 'write') return;
    Keyboard.dismiss();
    const trimmed = input.trim();
    if (!trimmed) {
      setValidationError('Önce Almanca cümleyi yazmalısın.');
      return;
    }

    const matched = normalizeSentence(trimmed) === normalizeSentence(currentWord.example!);

    if (!matched && attempt === 1) {
      setFirstAttemptWrong(true);
      setAttempt(2);
      setValidationError('Henüz doğru değil. Cümleni düzeltip bir kez daha dene.');
      return;
    }

    const earnedPoint = matched && !firstAttemptWrong;
    updateMastery(currentWord.id, earnedPoint);
    if (earnedPoint) setScore(current => current + 1);

    setValidationError(null);
    setAnswerMatched(matched);
    setPhase('checked');
  };

  const handleNext = () => {
    if (currentIndex + 1 >= words.length) {
      saveSession({
        id: Date.now().toString(36),
        date: Date.now(),
        type: 'cumle',
        wordIds: words.map(w => w.id),
        score,
        total: words.length,
        topicId,
      });
      router.replace(`/alistirma/sonuc?score=${score}&total=${words.length}&type=cumle` as any);
    } else {
      setCurrentIndex(i => i + 1);
      setInput('');
      setPhase('write');
      setValidationError(null);
      setAttempt(1);
      setFirstAttemptWrong(false);
      setAnswerMatched(null);
    }
  };

  if (!words.length) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>İki dilde örnek cümlesi olan kelime bulunamadı</Text>
          <Text style={styles.emptySubtext}>
            Kelime eklerken Almanca örnek cümleyi ve Türkçe çevirisini birlikte yazarsan
            bu alıştırmayı kullanabilirsin.
          </Text>
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
        <Text style={styles.headerTitle}>Cümle Yazma</Text>
        <Text style={styles.counter}>{currentIndex + 1}/{words.length}</Text>
      </View>

      {/* Progress */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Target word */}
          <View style={styles.promptCard}>
            <Text style={styles.promptHint}>BU TÜRKÇE CÜMLENİN ALMANCASINI YAZ</Text>
            <Text style={styles.translationPrompt}>{currentWord.exampleTurkish}</Text>
            <View style={styles.wordHint}>
              <Text style={styles.wordHintLabel}>Kullanacağın kelime</Text>
              <ColoredGermanWord
                article={currentWord.article}
                german={currentWord.german}
                style={styles.wordHintText}
                articleStyle={styles.wordHintArticle}
              />
            </View>
          </View>

          {/* Input */}
          <View style={[
            styles.inputWrapper,
            phase !== 'write' && styles.inputDone,
          ]}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={(t) => { setInput(t); setValidationError(null); }}
              placeholder="Kayıtlı Almanca cümleyi yaz..."
              placeholderTextColor={Colors.outlineVariant}
              multiline
              editable={phase === 'write'}
            />
          </View>

          {phase === 'write' && (
            <GermanCharacterBar
              onSelect={(character) => {
                setInput(current => current + character);
                setValidationError(null);
              }}
            />
          )}

          {validationError && (
            <Text style={styles.errorText}>{validationError}</Text>
          )}

          {/* Automatic result */}
          {phase === 'checked' && (
            <View style={[
              styles.referenceBox,
              answerMatched ? styles.referenceBoxCorrect : styles.referenceBoxWrong,
            ]}>
              <Text style={[
                styles.resultTitle,
                answerMatched ? styles.resultTitleCorrect : styles.resultTitleWrong,
              ]}>
                {answerMatched
                  ? firstAttemptWrong ? 'Şimdi doğru!' : 'Doğru!'
                  : 'Doğru cümleyi birlikte görelim'}
              </Text>
              <Text style={styles.referenceLabel}>KAYITLI ALMANCA CÜMLE</Text>
              <Text style={styles.referenceText}>{currentWord.example}</Text>
              <Text style={styles.referenceTr}>{currentWord.exampleTurkish}</Text>
              {firstAttemptWrong && (
                <Text style={styles.referenceNote}>Bu kelime tekrar listende kalacak.</Text>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom CTA */}
      {phase === 'write' ? (
        <TouchableOpacity
          style={[styles.ctaBtn, !input.trim() && styles.ctaBtnDisabled]}
          onPress={handleCheck}
          disabled={!input.trim()}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaBtnText}>{attempt === 1 ? 'Kontrol Et' : 'Tekrar Kontrol Et'}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.ctaBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.ctaBtnText}>
            {currentIndex + 1 >= words.length ? 'Sonuçları Gör' : 'Devam Et'}
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
  promptHint: { fontSize: 12, color: Colors.outlineVariant, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm, textAlign: 'center' },
  translationPrompt: { fontSize: 21, lineHeight: 28, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  wordHint: {
    marginTop: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceContainerLow,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  wordHintLabel: { fontSize: 11, fontWeight: '600', color: Colors.outline },
  wordHintText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  wordHintArticle: { fontWeight: '700' },
  inputWrapper: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.outlineVariant, padding: Spacing.md, ...Shadows.level1,
  },
  inputDone: { borderColor: Colors.secondaryFixedDim, backgroundColor: Colors.surfaceContainerLow },
  input: { minHeight: 80, fontSize: 16, color: Colors.primary, textAlignVertical: 'top' },
  errorText: { fontSize: 13, color: Colors.error, fontWeight: '600' },
  referenceBox: { borderRadius: 16, padding: Spacing.md, gap: 4, borderWidth: 1 },
  referenceBoxCorrect: { backgroundColor: Colors.successContainer, borderColor: Colors.success },
  referenceBoxWrong: { backgroundColor: Colors.errorContainer, borderColor: Colors.error },
  resultTitle: { fontSize: 15, fontWeight: '700', marginBottom: Spacing.sm },
  resultTitleCorrect: { color: Colors.success },
  resultTitleWrong: { color: Colors.error },
  referenceLabel: { fontSize: 11, fontWeight: '700', color: Colors.success, textTransform: 'uppercase' },
  referenceText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  referenceTr: { fontSize: 13, color: Colors.onSurfaceVariant },
  referenceNote: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 6, lineHeight: 15 },
  ctaBtn: { marginHorizontal: Spacing.marginMain, marginBottom: 32, height: 54, backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  ctaBtnDisabled: { opacity: 0.4 },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 18 },
  backBtn: { backgroundColor: Colors.golden, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
});
