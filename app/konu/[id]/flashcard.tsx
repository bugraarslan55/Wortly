import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getTopicById, ALL_TOPICS } from '../../../constants/topics';
import { Colors, Spacing, BorderRadius, Shadows } from '../../../constants/theme';
import { useWordStore, useSessionStore } from '../../../store';
import { Word } from '../../../types';
import { AppIcon } from '../../../components/app-icon';
import { ColoredGermanPlural, ColoredGermanWord } from '../../../components/colored-german-word';

const SESSION_SIZE = 20;
// Özel pseudo-topic ID: "Kelimelerim" ekranından gelen, topicId filtresine
// bakılmaksızın TÜM kişisel kelimeleri tek çalışma seti olarak kullanan mod.
const PERSONAL_WORDS_ID = 'kelimelerim';

// Fisher-Yates: rastgele sıralı, orijinal diziyi değiştirmeyen bir kopya döner.
function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function FlashcardScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { words: customWords, updateMastery } = useWordStore();
  const { startSession, saveSession } = useSessionStore();

  const isPersonalMode = id === PERSONAL_WORDS_ID;
  const topic = isPersonalMode ? undefined : getTopicById(id);
  const words: Word[] = isPersonalMode
    ? customWords.filter(w => w.isCustom)
    : topic ? topic.words : customWords.filter(w => w.topicId === id);
  const [sessionVersion, setSessionVersion] = useState(0);

  // Oturum başına: karıştırılmış ve en fazla SESSION_SIZE kelimelik bir alt küme.
  // sessionVersion yalnızca "Tekrar Çalış" ile artar; böylece oturum içinde sıra
  // sabit kalır, yeni oturum başlatıldığında ise kelimeler yeniden karıştırılır.
  const sessionWords = useMemo(
    () => shuffle(words).slice(0, SESSION_SIZE),
    [id, words.length, sessionVersion],
  );

  React.useEffect(() => {
    if (sessionWords.length > 0) {
      startSession({
        type: 'flashcard',
        wordIds: sessionWords.map(w => w.id),
        score: 0,
        total: sessionWords.length,
        topicId: isPersonalMode ? undefined : id,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionWords]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [results, setResults] = useState<{ id: string; knew: boolean }[]>([]);
  const [finished, setFinished] = useState(false);

  const flipAnim = useState(new Animated.Value(0))[0];

  // Hızlı çift dokunuşta aynı kartın iki kez işlenmesini engelleyen kilit.
  // useState yerine ref kullanılır çünkü setState asenkron olduğu için art
  // arda gelen iki basış, state henüz güncellenmeden ikisi de geçebilir.
  const answeredRef = React.useRef(false);
  React.useEffect(() => {
    answeredRef.current = false;
  }, [currentIndex]);

  const currentWord = sessionWords[currentIndex];
  const progress = sessionWords.length > 0 ? ((currentIndex + 1) / sessionWords.length) * 100 : 0;

  const flip = () => {
    Animated.timing(flipAnim, {
      toValue: isFlipped ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
    setIsFlipped(!isFlipped);
  };

  const handleResult = (knew: boolean) => {
    if (answeredRef.current) return; // Aynı kart iki kez işlenmesin (hızlı çift dokunuş).
    answeredRef.current = true;
    updateMastery(currentWord.id, knew);
    const newResults = [...results, { id: currentWord.id, knew }];
    setResults(newResults);
    setIsFlipped(false);
    flipAnim.setValue(0);

    if (currentIndex + 1 >= sessionWords.length) {
      setFinished(true);
      const knewCount = newResults.filter(r => r.knew).length;
      saveSession({
        id: Date.now().toString(36),
        date: Date.now(),
        type: 'flashcard',
        wordIds: sessionWords.map(w => w.id),
        score: knewCount,
        total: sessionWords.length,
        topicId: isPersonalMode ? undefined : id,
      });
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  if (!words.length) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <AppIcon name="tray" size={36} color={Colors.outlineVariant} />
          <Text style={styles.emptyText}>Bu konuda kelime bulunamadı</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (finished) {
    const knewCount = results.filter(r => r.knew).length;
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.resultIconBox}>
            <AppIcon
              name={knewCount / sessionWords.length > 0.8 ? 'trophy.fill' : 'arrow.clockwise'}
              size={34}
              color={Colors.secondary}
            />
          </View>
          <Text style={styles.resultTitle}>Flashcard Tamamlandı!</Text>
          <Text style={styles.resultScore}>
            {knewCount} / {sessionWords.length} doğru
          </Text>
          <TouchableOpacity
            style={[styles.ctaBtn, { marginTop: Spacing.xl }]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaBtnText}>Konuya Dön</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.ghostBtn, { marginTop: Spacing.sm }]}
            onPress={() => {
              setCurrentIndex(0);
              setResults([]);
              setIsFlipped(false);
              setFinished(false);
              setSessionVersion(version => version + 1);
              flipAnim.setValue(0);
              // currentIndex zaten 0'dan 0'a değişmeyebileceği için (tek
              // kelimelik oturum) [currentIndex] effect'i tetiklenmeyebilir;
              // kilidi burada açıkça sıfırla.
              answeredRef.current = false;
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.ghostBtnText}>Tekrar Çalış</Text>
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
        <Text style={styles.headerTitle}>{isPersonalMode ? 'Kelimelerim' : (topic?.title || 'Flashcard')}</Text>
        <Text style={styles.counter}>{currentIndex + 1}/{sessionWords.length}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      {/* Card */}
      <View style={styles.cardContainer}>
        <TouchableOpacity onPress={flip} activeOpacity={0.95} style={{ width: '100%' }}>
          {/* Front */}
          <Animated.View style={[styles.flashcard, { transform: [{ rotateY: frontInterpolate }] }]}>
            <Text style={styles.cardHint}>Almanca</Text>
            <ColoredGermanWord
              article={currentWord.article}
              german={currentWord.german}
              style={styles.cardGerman}
              articleStyle={styles.cardArticle}
            />
            {currentWord.plural && (
              <ColoredGermanPlural plural={currentWord.plural} style={styles.cardPlural} />
            )}
            <Text style={styles.tapHint}>Çevirmek için dokun</Text>
          </Animated.View>

          {/* Back */}
          <Animated.View
            style={[styles.flashcard, styles.flashcardBack, { transform: [{ rotateY: backInterpolate }] }]}
          >
            <Text style={styles.cardHint}>Türkçe</Text>
            <Text style={styles.cardTurkish}>{currentWord.turkish}</Text>
            {currentWord.example && (
              <View style={styles.exampleBox}>
                <Text style={styles.exampleDe}>{currentWord.example}</Text>
                {currentWord.exampleTurkish && (
                  <Text style={styles.exampleTr}>{currentWord.exampleTurkish}</Text>
                )}
              </View>
            )}
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.resultBtn, styles.wrongBtn]}
          onPress={() => handleResult(false)}
          activeOpacity={0.85}
        >
          <Text style={styles.resultBtnEmoji}>✗</Text>
          <Text style={styles.resultBtnText}>Bilmiyorum</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.resultBtn, styles.rightBtn]}
          onPress={() => handleResult(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.resultBtnEmoji}>✓</Text>
          <Text style={styles.resultBtnText}>Biliyorum</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.marginMain, paddingVertical: Spacing.md,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surfaceContainer, alignItems: 'center', justifyContent: 'center',
  },
  closeBtnText: { fontSize: 14, color: Colors.onSurfaceVariant },
  headerTitle: { fontSize: 16, fontWeight: '600', color: Colors.primary },
  counter: { fontSize: 14, fontWeight: '600', color: Colors.onSurfaceVariant },
  progressTrack: {
    height: 4, backgroundColor: Colors.surfaceContainer,
    marginHorizontal: Spacing.marginMain, borderRadius: 2, marginBottom: Spacing.lg,
  },
  progressFill: {
    height: 4, backgroundColor: Colors.golden, borderRadius: 2,
  },
  cardContainer: {
    flex: 1, paddingHorizontal: Spacing.marginMain, alignItems: 'center', justifyContent: 'center',
  },
  flashcard: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: 24, padding: Spacing.xl,
    alignItems: 'center', justifyContent: 'center', minHeight: 280,
    backfaceVisibility: 'hidden', ...Shadows.level2,
  },
  flashcardBack: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: Colors.primaryContainer,
  },
  cardHint: { fontSize: 11, fontWeight: '600', color: Colors.outlineVariant, letterSpacing: 1, marginBottom: Spacing.sm, textTransform: 'uppercase' },
  cardArticle: { fontSize: 20, fontWeight: '400', color: Colors.secondary, marginBottom: 4 },
  cardGerman: { fontSize: 36, fontWeight: '700', color: Colors.primary, textAlign: 'center', marginBottom: Spacing.sm },
  cardPlural: { fontSize: 13, color: Colors.onSurfaceVariant, marginBottom: Spacing.md },
  tapHint: { fontSize: 12, color: Colors.outlineVariant, marginTop: Spacing.md },
  cardTurkish: { fontSize: 32, fontWeight: '700', color: Colors.golden, textAlign: 'center', marginBottom: Spacing.md },
  exampleBox: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: Spacing.md, marginTop: Spacing.sm, width: '100%' },
  exampleDe: { fontSize: 13, fontWeight: '600', color: Colors.onPrimaryContainer, textAlign: 'center', marginBottom: 4 },
  exampleTr: { fontSize: 12, color: Colors.onPrimaryContainer, textAlign: 'center', opacity: 0.8 },
  buttonRow: {
    flexDirection: 'row', paddingHorizontal: Spacing.marginMain, paddingBottom: 32, gap: Spacing.md,
  },
  resultBtn: {
    flex: 1, height: 64, borderRadius: BorderRadius.xl,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  wrongBtn: { backgroundColor: '#FFDAD6' },
  rightBtn: { backgroundColor: Colors.golden },
  resultBtnEmoji: { fontSize: 18 },
  resultBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  resultIconBox: {
    width: 68, height: 68, borderRadius: BorderRadius.xxl,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  emptyText: { fontSize: 16, color: Colors.onSurfaceVariant, marginBottom: Spacing.xl },
  backBtn: { backgroundColor: Colors.golden, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  resultTitle: { fontSize: 24, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  resultScore: { fontSize: 18, color: Colors.onSurfaceVariant },
  ctaBtn: { backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, height: 50, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  ghostBtn: { borderRadius: BorderRadius.lg, height: 50, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.outlineVariant },
  ghostBtnText: { fontSize: 15, color: Colors.onSurfaceVariant, fontWeight: '600' },
});
