import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ALL_TOPICS, getTopicById } from '../../constants/topics';
import { useWordStore, useSessionStore } from '../../store';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Word } from '../../types';
import { ColoredGermanWord } from '../../components/colored-german-word';

type Phase = 'show' | 'reveal';

const SESSION_SIZE = 20;
const NUMBER_WORDS = new Set([
  'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn',
  'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn',
  'achtzehn', 'neunzehn', 'zwanzig', 'einundzwanzig', 'dreißig', 'vierzig',
  'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig', '(ein)hundert',
  'hunderteins', 'zweihundert', '(ein)tausend', 'erste', 'zweite', 'dritte', 'vierte',
]);

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function DogruYanlisScreen() {
  const router = useRouter();
  const { wordIds, topicId } = useLocalSearchParams<{ wordIds: string; topicId?: string }>();
  const { words: customWords, updateMastery } = useWordStore();
  const { startSession, saveSession } = useSessionStore();

  // Kelime listesini cevap verildiğinde yeniden üretme; aksi halde rastgele
  // eşleşme aynı soru açıkken değişebilir.
  const words = useMemo<Word[]>(() => {
    const allBuiltIn = ALL_TOPICS.flatMap(topic => topic.words);
    const ids = wordIds?.split(',').filter(Boolean) || [];

    if (ids.length === 0) return (topicId ? getTopicById(topicId)?.words : undefined) ?? customWords;

    return ids
      .map(id => allBuiltIn.find(word => word.id === id) || customWords.find(word => word.id === id))
      .filter((word): word is Word => Boolean(word));
  }, [wordIds, topicId, customWords]);

  // Büyük Goethe listelerinde normal kelimelere öncelik ver. Yalnızca sayı
  // içeren bir konu açılırsa alıştırmanın boş kalmaması için sayıları yedekle.
  const sessionWords = useMemo(() => {
    const regularWords = shuffle(words.filter(word => !NUMBER_WORDS.has(word.german)));
    const numberWords = shuffle(words.filter(word => NUMBER_WORDS.has(word.german)));
    return shuffle([...regularWords, ...numberWords].slice(0, SESSION_SIZE));
  }, [wordIds, words.length]);

  // Her kelimeye rastgele yanlış Türkçe eşleştir
  const quizItems = useMemo(() => {
    return sessionWords.map((word) => {
      // Aynı Türkçe anlama sahip kelimeler yanlış seçenek olamaz. Tek kelimelik
      // alıştırmada da alternatif bulunmadığı için eşleşme zorunlu olarak doğrudur.
      const alternatives = sessionWords.filter(candidate => (
        candidate.id !== word.id
        && candidate.turkish.trim().toLocaleLowerCase('tr-TR')
          !== word.turkish.trim().toLocaleLowerCase('tr-TR')
      ));
      const showCorrect = alternatives.length === 0 || Math.random() > 0.5;
      let shownTurkish: string;
      if (showCorrect) {
        shownTurkish = word.turkish;
      } else {
        const alternative = alternatives[Math.floor(Math.random() * alternatives.length)];
        shownTurkish = alternative.turkish;
      }
      return { word, shownTurkish, isCorrect: showCorrect };
    });
  }, [sessionWords]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('show');
  const [score, setScore] = useState(0);
  const [lastAnswer, setLastAnswer] = useState<boolean | null>(null);

  const current = quizItems[currentIndex];
  const progress = quizItems.length > 0 ? ((currentIndex + 1) / quizItems.length) * 100 : 0;

  React.useEffect(() => {
    if (quizItems.length > 0) {
      startSession({ type: 'dogru-yanlis', wordIds: quizItems.map(q => q.word.id), score: 0, total: quizItems.length, topicId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizItems.length]);

  const handleAnswer = (answer: boolean) => {
    // Aynı sorunun cevabı iki kez işlenmesin.
    if (phase === 'reveal') return;
    const correct = answer === current.isCorrect;
    updateMastery(current.word.id, correct);
    if (correct) setScore(s => s + 1);
    setLastAnswer(correct);
    setPhase('reveal');
  };

  const handleNext = () => {
    if (currentIndex + 1 >= quizItems.length) {
      saveSession({
        id: Date.now().toString(36),
        date: Date.now(),
        type: 'dogru-yanlis',
        wordIds: quizItems.map(q => q.word.id),
        score,
        total: quizItems.length,
        topicId,
      });
      router.replace(`/alistirma/sonuc?score=${score}&total=${quizItems.length}&type=dogru-yanlis` as any);
    } else {
      setCurrentIndex(i => i + 1);
      setPhase('show');
      setLastAnswer(null);
    }
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
        <Text style={styles.headerTitle}>Doğru / Yanlış</Text>
        <Text style={styles.counter}>{currentIndex + 1}/{quizItems.length}</Text>
      </View>

      {/* Progress */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      {/* Score badge */}
      <View style={styles.scoreBadge}>
        <Text style={styles.scoreText}>Skor {score}</Text>
      </View>

      {/* Card */}
      <View style={styles.cardArea}>
        <View style={[
          styles.card,
          phase === 'reveal' && (lastAnswer ? styles.cardCorrect : styles.cardWrong),
        ]}>
          {/* German word */}
          <Text style={styles.cardHint}>Almanca</Text>
          <ColoredGermanWord
            article={current.word.article}
            german={current.word.german}
            style={styles.cardGerman}
            articleStyle={styles.cardArticle}
          />

          {/* Divider */}
          <View style={styles.divider} />

          {/* Turkish shown */}
          <Text style={styles.cardHint}>Gösterilen Türkçe</Text>
          <Text style={styles.cardTurkish}>{current.shownTurkish}</Text>

          {/* Reveal */}
          {phase === 'reveal' && !current.isCorrect && (
            <View style={styles.correctAnswer}>
              <Text style={styles.correctAnswerLabel}>Doğru Türkçe:</Text>
              <Text style={styles.correctAnswerText}>{current.word.turkish}</Text>
            </View>
          )}
          {phase === 'reveal' && (
            <Text style={styles.resultEmoji}>{lastAnswer ? 'Doğru!' : 'Yanlış!'}</Text>
          )}
        </View>
      </View>

      {/* Buttons */}
      {phase === 'show' ? (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.answerBtn, styles.wrongBtn]}
            onPress={() => handleAnswer(false)}
            activeOpacity={0.85}
          >
            <Text style={styles.answerBtnEmoji}>✗</Text>
            <Text style={styles.answerBtnText}>Yanlış</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.answerBtn, styles.correctBtn]}
            onPress={() => handleAnswer(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.answerBtnEmoji}>✓</Text>
            <Text style={styles.answerBtnText}>Doğru</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>
            {currentIndex + 1 >= quizItems.length ? 'Sonuçları Gör' : 'Devam Et'}
          </Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.marginMain, paddingVertical: Spacing.md,
  },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: Colors.onSurfaceVariant },
  headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.primary },
  counter: { fontSize: 14, fontWeight: '600', color: Colors.onSurfaceVariant },
  progressTrack: { height: 4, backgroundColor: Colors.surfaceContainer, marginHorizontal: Spacing.marginMain, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: Colors.golden, borderRadius: 2 },
  scoreBadge: { alignSelf: 'flex-end', marginRight: Spacing.marginMain, marginTop: Spacing.sm, backgroundColor: Colors.successContainer, paddingHorizontal: 12, paddingVertical: 4, borderRadius: BorderRadius.full },
  scoreText: { fontSize: 13, fontWeight: '700', color: Colors.success },
  cardArea: { flex: 1, paddingHorizontal: Spacing.marginMain, justifyContent: 'center' },
  card: { backgroundColor: Colors.surfaceContainerLowest, borderRadius: 24, padding: Spacing.xl, alignItems: 'center', ...Shadows.level2 },
  cardCorrect: { borderWidth: 2, borderColor: Colors.success, backgroundColor: '#F0FFF4' },
  cardWrong: { borderWidth: 2, borderColor: Colors.error, backgroundColor: Colors.errorContainer },
  cardHint: { fontSize: 11, fontWeight: '600', color: Colors.outlineVariant, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  cardArticle: { fontSize: 18, color: Colors.secondary, marginBottom: 2 },
  cardGerman: { fontSize: 34, fontWeight: '700', color: Colors.primary, textAlign: 'center', marginBottom: Spacing.md },
  divider: { height: 1, width: '60%', backgroundColor: Colors.outlineVariant, marginVertical: Spacing.md },
  cardTurkish: { fontSize: 22, fontWeight: '600', color: Colors.onSurface, textAlign: 'center' },
  correctAnswer: { marginTop: Spacing.md, alignItems: 'center', backgroundColor: 'rgba(45,106,79,0.1)', borderRadius: 12, padding: Spacing.sm, width: '100%' },
  correctAnswerLabel: { fontSize: 11, color: Colors.success, fontWeight: '600', marginBottom: 2 },
  correctAnswerText: { fontSize: 16, fontWeight: '700', color: Colors.success },
  resultEmoji: { marginTop: Spacing.md, fontSize: 18, fontWeight: '700', color: Colors.primary },
  buttonRow: { flexDirection: 'row', paddingHorizontal: Spacing.marginMain, paddingBottom: 32, gap: Spacing.md },
  answerBtn: { flex: 1, height: 64, borderRadius: BorderRadius.xl, alignItems: 'center', justifyContent: 'center', gap: 4 },
  wrongBtn: { backgroundColor: '#FFDAD6' },
  correctBtn: { backgroundColor: '#D8F3DC' },
  answerBtnEmoji: { fontSize: 22 },
  answerBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  nextBtn: { marginHorizontal: Spacing.marginMain, marginBottom: 32, height: 54, backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyText: { fontSize: 16, color: Colors.onSurfaceVariant },
  backBtn: { backgroundColor: Colors.golden, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
});
