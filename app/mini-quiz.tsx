import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppIcon } from '../components/app-icon';
import { ColoredGermanWord } from '../components/colored-german-word';
import { Spacing, BorderRadius, Shadows } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import { useSessionStore, useUserStore, useWordStore } from '../store';
import { useAuthStore } from '../store/auth';
import {
  buildMiniQuizQuestion, findMiniQuizWord, getMiniQuizCandidates, MiniQuizQuestion, pickMiniQuizQuestion,
} from '../utils/mini-quiz';
import { syncReminderForUser } from '../utils/review-reminder';

export default function MiniQuizScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { wordId } = useLocalSearchParams<{ wordId?: string }>();
  const profile = useUserStore(state => state.profile);
  const updateStreak = useUserStore(state => state.updateStreak);
  const words = useWordStore(state => state.words);
  const reviewStates = useWordStore(state => state.reviewStates);
  const updateMastery = useWordStore(state => state.updateMastery);
  const saveSession = useSessionStore(state => state.saveSession);
  const userId = useAuthStore(state => state.session?.user.id ?? null);

  const shownIdsRef = useRef<string[]>([]);

  // Bildirimdeki kelime önce denenir; bulunamaz ya da soru kurulamazsa normal kelime seçimi yapılır.
  const createQuestion = (preferredWordId?: string): MiniQuizQuestion | null => {
    const preferred = findMiniQuizWord(preferredWordId, words);
    if (preferred && !shownIdsRef.current.includes(preferred.id)) {
      const candidates = getMiniQuizCandidates(profile?.level, words);
      const question = buildMiniQuizQuestion(preferred, candidates, words);
      if (question) return question;
    }
    return pickMiniQuizQuestion({
      level: profile?.level,
      customWords: words,
      reviewStates,
      excludeIds: shownIdsRef.current,
    });
  };

  const [question, setQuestion] = useState<MiniQuizQuestion | null>(() => createQuestion(wordId));
  if (question && shownIdsRef.current.length === 0) shownIdsRef.current.push(question.word.id);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const answered = selectedIndex !== null;
  const isCorrect = question !== null && selectedIndex === question.correctIndex;

  const handleClose = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleSelect = (index: number) => {
    if (!question || answered) return;
    const correct = index === question.correctIndex;
    setSelectedIndex(index);

    // Mevcut alıştırmalarla aynı kayıt: kelime seviyesi + çalışma oturumu (analiz bunları okur).
    const { word } = question;
    void updateMastery(word.id, correct).catch(() => undefined);
    void saveSession({
      id: Date.now().toString(36),
      date: Date.now(),
      type: 'dogru-yanlis',
      wordIds: [word.id],
      score: correct ? 1 : 0,
      total: 1,
      topicId: word.topicId,
    }).catch(() => undefined);
    void updateStreak().catch(() => undefined);
    // Kelime durumu değişti; yarınki bildirim için yeni kelime seçilsin.
    void syncReminderForUser(userId);
  };

  const handleContinue = () => {
    const next = createQuestion();
    if (!next) {
      handleClose();
      return;
    }
    shownIdsRef.current.push(next.word.id);
    setQuestion(next);
    setSelectedIndex(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        >
          <AppIcon name="xmark.circle.fill" size={26} color={colors.outline} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mini Quiz</Text>
        <View style={styles.closeButton} />
      </View>

      {question ? (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.wordCard}>
              <Text style={styles.wordLabel}>Almanca</Text>
              <ColoredGermanWord
                article={question.word.article}
                german={question.word.german}
                style={styles.wordGerman}
                articleStyle={styles.wordArticle}
              />
            </View>

            <Text style={styles.prompt}>Türkçesi hangisi?</Text>

            <View style={styles.options} accessibilityLabel="Türkçe cevap seçenekleri">
              {question.options.map((option, index) => {
                const isAnswer = answered && index === question.correctIndex;
                const isWrongPick = answered && index === selectedIndex && index !== question.correctIndex;
                const letter = String.fromCharCode(65 + index);
                return (
                  <TouchableOpacity
                    key={`${index}-${option}`}
                    style={[styles.option, isAnswer && styles.optionCorrect, isWrongPick && styles.optionWrong]}
                    onPress={() => handleSelect(index)}
                    disabled={answered}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${letter}, ${option}`}
                    accessibilityState={{ selected: index === selectedIndex, disabled: answered }}
                  >
                    <View style={[styles.optionLetter, isAnswer && styles.optionLetterCorrect, isWrongPick && styles.optionLetterWrong]}>
                      <Text style={[styles.optionLetterText, (isAnswer || isWrongPick) && styles.optionLetterTextAnswered]}>
                        {letter}
                      </Text>
                    </View>
                    <Text style={styles.optionText}>{option}</Text>
                    {isAnswer && <AppIcon name="checkmark.circle.fill" size={22} color={colors.success} />}
                    {isWrongPick && <AppIcon name="xmark.circle.fill" size={22} color={colors.error} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {answered && (
            <View style={styles.answerArea}>
              <View
                style={[styles.feedbackCard, isCorrect ? styles.feedbackCorrect : styles.feedbackWrong]}
                accessibilityLiveRegion="polite"
              >
                <Text style={styles.feedbackTitle}>{isCorrect ? 'Doğru' : 'Yanlış'}</Text>
                {!isCorrect && (
                  <Text style={styles.feedbackText}>Doğru anlam: {question.options[question.correctIndex]}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.continueButton}
                onPress={handleContinue}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Devam et"
              >
                <Text style={styles.continueButtonText}>Devam Et</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeAction}
                onPress={handleClose}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Kapat"
              >
                <Text style={styles.closeActionText}>Kapat</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Bugün için soru hazırlanamadı</Text>
          <Text style={styles.emptyText}>
            Seviyene uygun yeterli kelime bulunamadı. Biraz kelime ekleyip ya da konulardan çalışıp tekrar dene.
          </Text>
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleClose}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Kapat"
          >
            <Text style={styles.continueButtonText}>Kapat</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: {
    height: 56,
    paddingHorizontal: Spacing.marginMain,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  scroll: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.marginMain, paddingBottom: Spacing.xl, alignItems: 'center' },
  wordCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    marginTop: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.level2,
  },
  wordLabel: { fontSize: 11, fontWeight: '600', color: Colors.outline, letterSpacing: 1, textTransform: 'uppercase' },
  wordGerman: { fontSize: 36, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  wordArticle: { fontSize: 36, fontWeight: '700' },
  prompt: { fontSize: 20, fontWeight: '700', color: Colors.primary, textAlign: 'center', marginTop: Spacing.lg },
  options: { width: '100%', gap: Spacing.sm, marginTop: Spacing.md },
  option: {
    minHeight: 58, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.outlineVariant,
  },
  optionCorrect: { backgroundColor: Colors.successContainer, borderColor: Colors.success },
  optionWrong: { backgroundColor: Colors.errorContainer, borderColor: Colors.error },
  optionLetter: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
  },
  optionLetterCorrect: { backgroundColor: Colors.success },
  optionLetterWrong: { backgroundColor: Colors.error },
  optionLetterText: { fontSize: 13, fontWeight: '700', color: Colors.outline },
  optionLetterTextAnswered: { color: Colors.onPrimary },
  optionText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.primary },
  answerArea: {
    width: '100%', flexShrink: 0, paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm,
    paddingBottom: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.warmWhite,
  },
  feedbackCard: { width: '100%', paddingHorizontal: Spacing.md, paddingVertical: 12, borderRadius: BorderRadius.lg, borderWidth: 1.5 },
  feedbackCorrect: { backgroundColor: Colors.successContainer, borderColor: Colors.success },
  feedbackWrong: { backgroundColor: Colors.errorContainer, borderColor: Colors.error },
  feedbackTitle: { fontSize: 15, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  feedbackText: { marginTop: 2, fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center' },
  continueButton: {
    width: '100%', height: 50, borderRadius: BorderRadius.lg, backgroundColor: Colors.golden,
    alignItems: 'center', justifyContent: 'center',
  },
  continueButtonText: { fontSize: 15, fontWeight: '700', color: Colors.onGolden },
  closeAction: {
    width: '100%', height: 50, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  closeActionText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant, textAlign: 'center' },
}));
