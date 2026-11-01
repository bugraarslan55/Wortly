import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getTopicById } from '../../../constants/topics';
import { Colors, Spacing, BorderRadius } from '../../../constants/theme';
import { useWordStore, useSessionStore, useUserStore } from '../../../store';
import { Word } from '../../../types';
import { AppIcon } from '../../../components/app-icon';
import { ColoredGermanPlural, ColoredGermanWord } from '../../../components/colored-german-word';
import { ExerciseHeader, ExerciseProgress, confirmLeaveExercise, useActionLock } from '../../../components/exercise-ui';
import { Card, EmptyState, IconTile, PrimaryButton, SecondaryButton } from '../../../components/ui';
import { selectWordsForReview } from '../../../utils/spaced-repetition';
import { SELF_REPORTED_MAX_MASTERY } from '../../../utils/mastery';

const SESSION_SIZE = 20;
// Özel pseudo-topic ID: "Kelimelerim" ekranından gelen, topicId filtresine
// bakılmaksızın TÜM kişisel kelimeleri tek çalışma seti olarak kullanan mod.
const PERSONAL_WORDS_ID = 'kelimelerim';

/** Tek kartın çevrilebilir yüzü. `key` ile yeniden bağlanır, böylece her yeni kart ön yüzle başlar. */
function FlipCard({ word, onFlip }: { word: Word; onFlip: () => void }) {
  const flip = useRef(new Animated.Value(0)).current;
  const [flipped, setFlipped] = useState(false);

  const toggle = () => {
    const next = !flipped;
    setFlipped(next);
    if (next) onFlip();
    Animated.timing(flip, {
      toValue: next ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const front = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const back = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  return (
    <TouchableOpacity
      onPress={toggle}
      activeOpacity={0.95}
      style={styles.cardTouch}
      accessibilityRole="button"
      accessibilityLabel={flipped ? `Türkçe anlamı: ${word.turkish}. Almancaya dönmek için dokun` : `${word.article} ${word.german}. Türkçe anlamı için kartı çevir`}
    >
      <Animated.View
        style={[styles.face, { transform: [{ perspective: 1000 }, { rotateY: front }] }]}
        accessibilityElementsHidden={flipped}
        importantForAccessibility={flipped ? 'no-hide-descendants' : 'auto'}
      >
        <Text style={styles.faceHint}>ALMANCA</Text>
        <ColoredGermanWord
          article={word.article}
          german={word.german}
          style={styles.german}
          articleStyle={styles.article}
        />
        {!!word.plural && <ColoredGermanPlural plural={word.plural} style={styles.plural} />}
        <View style={styles.tapHint}>
          <AppIcon name="arrow.clockwise" size={13} color={Colors.outline} />
          <Text style={styles.tapHintText}>Anlamı görmek için kartı çevir</Text>
        </View>
      </Animated.View>

      <Animated.View
        style={[styles.face, styles.faceBack, { transform: [{ perspective: 1000 }, { rotateY: back }] }]}
        accessibilityElementsHidden={!flipped}
        importantForAccessibility={flipped ? 'auto' : 'no-hide-descendants'}
      >
        <Text style={[styles.faceHint, styles.faceHintBack]}>TÜRKÇE</Text>
        <Text style={styles.turkish}>{word.turkish}</Text>
        {!!word.example && (
          <View style={styles.exampleBox}>
            <Text style={styles.exampleDe}>{word.example}</Text>
            {!!word.exampleTurkish && <Text style={styles.exampleTr}>{word.exampleTurkish}</Text>}
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function FlashcardScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { words: customWords, reviewStates, updateMastery } = useWordStore();
  const { startSession, saveSession } = useSessionStore();
  const updateStreak = useUserStore(state => state.updateStreak);

  const isPersonalMode = id === PERSONAL_WORDS_ID;
  const topic = isPersonalMode ? undefined : getTopicById(id);
  const words: Word[] = isPersonalMode
    ? customWords.filter(w => w.isCustom)
    : topic ? topic.words : customWords.filter(w => w.topicId === id);
  const [sessionVersion, setSessionVersion] = useState(0);

  // Oturum başına: tekrar zamanı gelen ve seviyesi düşük kelimelere öncelik
  // veren, en fazla SESSION_SIZE kelimelik sabit bir alt küme.
  // sessionVersion yalnızca "Tekrar Çalış" ile artar; böylece oturum içinde sıra
  // sabit kalır, yeni oturum başlatıldığında ise kelimeler yeniden karıştırılır.
  const sessionWords = useMemo(
    () => selectWordsForReview(words, SESSION_SIZE, reviewStates),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, words.length, sessionVersion],
  );

  useEffect(() => {
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
  // Cevap düğmeleri kart çevrilip anlam görülmeden açılmaz: "Biliyorum" ancak kontrol
  // edildikten sonra seviyeyi artırabilir.
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<{ id: string; knew: boolean }[]>([]);
  const [finished, setFinished] = useState(false);
  const lock = useActionLock();

  // Aynı kart iki kez işlenmesin (hızlı çift dokunuş); yeni kart render edilince kilit açılır.
  useEffect(() => {
    lock.release();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, sessionVersion]);

  const currentWord = sessionWords[currentIndex];

  const handleResult = (knew: boolean) => {
    if (!revealed || !currentWord || !lock.acquire()) return;
    // Kendi işaretin olduğu için "Biliyorum" seviyeyi en fazla "Bilinçli"ye çıkarır.
    void updateMastery(currentWord.id, knew, { maxLevel: SELF_REPORTED_MAX_MASTERY });
    const newResults = [...results, { id: currentWord.id, knew }];
    setResults(newResults);
    setRevealed(false);

    if (currentIndex + 1 >= sessionWords.length) {
      setFinished(true);
      void updateStreak();
      void saveSession({
        id: Date.now().toString(36),
        date: Date.now(),
        type: 'flashcard',
        wordIds: sessionWords.map(w => w.id),
        score: newResults.filter(r => r.knew).length,
        total: sessionWords.length,
        topicId: isPersonalMode ? undefined : id,
      });
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const restart = () => {
    setCurrentIndex(0);
    setResults([]);
    setRevealed(false);
    setFinished(false);
    setSessionVersion(version => version + 1);
  };

  const close = () => confirmLeaveExercise(results.length > 0 && !finished, () => router.back());

  if (!words.length) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <EmptyState
            icon="tray"
            title="Bu konuda kelime bulunamadı"
            actionLabel="Geri Dön"
            onAction={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (finished) {
    const knewCount = results.filter(r => r.knew).length;
    const total = sessionWords.length;
    const percent = total > 0 ? Math.round((knewCount / total) * 100) : 0;
    const message = percent >= 80
      ? 'Çok iyi. Bu kelimeleri düzenli tekrarla pekiştir.'
      : percent >= 50
        ? 'İyi gidiyorsun. Bilmediklerini tekrar çalışmak faydalı olur.'
        : 'Bilmediğin kelimeler tekrar listende öne çıkacak.';
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <IconTile name={percent >= 80 ? 'trophy.fill' : 'rectangle.on.rectangle.angled'} size={72} />
          <Text style={styles.resultTitle}>Flashcard tamamlandı</Text>
          <Text style={styles.resultMessage}>{message}</Text>
          <Card style={styles.resultCard}>
            <View style={styles.resultStat}>
              <Text style={styles.resultNumber}>{knewCount}</Text>
              <Text style={styles.resultLabel}>Biliyorum</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultStat}>
              <Text style={styles.resultNumber}>{total - knewCount}</Text>
              <Text style={styles.resultLabel}>Bilmiyorum</Text>
            </View>
            <View style={styles.resultDivider} />
            <View style={styles.resultStat}>
              <Text style={styles.resultNumber}>%{percent}</Text>
              <Text style={styles.resultLabel}>Kendi değerlendirmen</Text>
            </View>
          </Card>
          <View style={styles.resultActions}>
            <PrimaryButton label="Tekrar Çalış" onPress={restart} />
            <SecondaryButton label="Konuya Dön" onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ExerciseHeader
        title={isPersonalMode ? 'Kelimelerim' : (topic?.title || 'Flashcard')}
        current={currentIndex + 1}
        total={sessionWords.length}
        onClose={close}
      />
      <ExerciseProgress current={currentIndex + 1} total={sessionWords.length} />

      <View style={styles.cardContainer}>
        <FlipCard key={`${sessionVersion}-${currentWord.id}`} word={currentWord} onFlip={() => setRevealed(true)} />
      </View>

      <Text style={styles.instruction} accessibilityLiveRegion="polite">
        {revealed ? 'Bu kelimeyi ne kadar iyi biliyordun?' : 'Önce kartı çevirip anlamı kontrol et.'}
      </Text>
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.resultBtn, styles.wrongBtn, !revealed && styles.resultBtnDisabled]}
          onPress={() => handleResult(false)}
          disabled={!revealed}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Bilmiyorum"
          accessibilityState={{ disabled: !revealed }}
        >
          <AppIcon name="xmark" size={20} color={Colors.onErrorContainer} />
          <Text style={[styles.resultBtnText, { color: Colors.onErrorContainer }]}>Bilmiyorum</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.resultBtn, styles.rightBtn, !revealed && styles.resultBtnDisabled]}
          onPress={() => handleResult(true)}
          disabled={!revealed}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Biliyorum"
          accessibilityState={{ disabled: !revealed }}
        >
          <AppIcon name="checkmark" size={20} color={Colors.success} />
          <Text style={[styles.resultBtnText, { color: Colors.success }]}>Biliyorum</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.marginMain, gap: Spacing.md },
  cardContainer: { flex: 1, paddingHorizontal: Spacing.marginMain, justifyContent: 'center' },
  cardTouch: { width: '100%', minHeight: 300 },
  face: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.xxl, borderCurve: 'continuous',
    padding: Spacing.xl, alignItems: 'center', justifyContent: 'center', gap: 6,
    backfaceVisibility: 'hidden', boxShadow: '0 8px 24px rgba(26, 31, 43, 0.12)',
    borderWidth: 1, borderColor: 'rgba(26, 31, 43, 0.07)',
  },
  faceBack: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  faceHint: { fontSize: 11, fontWeight: '700', color: Colors.secondary, letterSpacing: 1.2, marginBottom: Spacing.sm },
  faceHintBack: { color: Colors.golden },
  article: { fontSize: 22, fontWeight: '600' },
  german: { fontSize: 36, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  plural: { fontSize: 14, color: Colors.onSurfaceVariant },
  tapHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.lg },
  tapHintText: { fontSize: 12, color: Colors.onSurfaceVariant },
  turkish: { fontSize: 32, fontWeight: '700', color: Colors.golden, textAlign: 'center' },
  exampleBox: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: BorderRadius.md,
    padding: Spacing.md, marginTop: Spacing.md, width: '100%', gap: 4,
  },
  exampleDe: { fontSize: 14, fontWeight: '600', color: Colors.onPrimary, textAlign: 'center' },
  exampleTr: { fontSize: 13, color: '#B8BCC8', textAlign: 'center' },
  instruction: { fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center', marginBottom: Spacing.sm, paddingHorizontal: Spacing.marginMain },
  buttonRow: { flexDirection: 'row', paddingHorizontal: Spacing.marginMain, paddingBottom: Spacing.md, gap: Spacing.md },
  resultBtn: {
    flex: 1, minHeight: 60, borderRadius: BorderRadius.xl, borderCurve: 'continuous',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderWidth: 1.5,
  },
  wrongBtn: { backgroundColor: Colors.errorContainer, borderColor: 'rgba(186, 26, 26, 0.35)' },
  rightBtn: { backgroundColor: Colors.successContainer, borderColor: 'rgba(45, 106, 79, 0.35)' },
  resultBtnDisabled: { opacity: 0.4 },
  resultBtnText: { fontSize: 16, fontWeight: '700' },
  resultTitle: { fontSize: 24, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  resultMessage: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  resultCard: { flexDirection: 'row', alignItems: 'center', width: '100%', paddingVertical: Spacing.md },
  resultStat: { flex: 1, alignItems: 'center', gap: 2 },
  resultNumber: { fontSize: 24, fontWeight: '700', color: Colors.primary },
  resultLabel: { fontSize: 11, color: Colors.onSurfaceVariant, textAlign: 'center' },
  resultDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(26, 31, 43, 0.07)' },
  resultActions: { width: '100%', gap: Spacing.sm, marginTop: Spacing.sm },
});
