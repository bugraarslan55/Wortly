import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/ui';
import { getGrammarLesson, isGrammarLevelLocked } from '../../constants/grammar';
import { BorderRadius, Spacing } from '../../constants/theme';
import { makeStyles } from '../../hooks/use-theme';
import { useUserStore } from '../../store';
import type { Level } from '../../types';
import { GrammarQuizState, nextGrammarQuestion, selectGrammarAnswer, startGrammarQuiz } from '../../utils/grammar-quiz';

const LEVELS: Level[] = ['A1', 'A2', 'B1'];

export default function GrammarLessonScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const lessonId = typeof id === 'string' ? id : '';
  const lesson = getGrammarLesson(lessonId);
  const profileLevel = useUserStore(state => state.profile?.level);
  const userLevel: Level = LEVELS.includes(profileLevel as Level) ? profileLevel as Level : 'A1';
  const [quiz, setQuiz] = useState<GrammarQuizState | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { setQuiz(null); }, [lessonId]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/gramer' as any);
  };
  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  if (!lesson || isGrammarLevelLocked(lesson.level, userLevel)) {
    return (
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Geri">
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={styles.title}>{lesson ? 'Bu ders kilitli' : 'Ders bulunamadı'}</Text>
          <Text style={styles.subtitle}>{lesson ? `Bu derse erişmek için profil seviyen ${lesson.level} olmalı.` : 'Gramer listesinden başka bir ders seçebilirsin.'}</Text>
          <PrimaryButton label="Gramer Rehberine Dön" onPress={() => router.replace('/gramer' as any)} />
        </View>
      </SafeAreaView>
    );
  }

  const question = quiz && !quiz.finished ? lesson.questions[quiz.questionIndex] : null;
  const answered = quiz != null && quiz.selectedIndex !== null;

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableOpacity onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Geri">
        <Text style={styles.backText}>← Geri</Text>
      </TouchableOpacity>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onContentSizeChange={() => {
          if (quiz && !quiz.finished && quiz.selectedIndex !== null) scrollRef.current?.scrollToEnd({ animated: true });
        }}
      >
        <Text style={styles.eyebrow}>{lesson.level} · {lesson.topic === 'adjective' ? 'SIFATLAR' : 'EDATLAR'}</Text>
        {(!quiz || quiz.finished) && <Text style={styles.title} accessibilityRole="header">{lesson.title}</Text>}
        {!quiz && <Text style={styles.subtitle}>{lesson.summary}</Text>}

        {!quiz && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>KURAL</Text>
              <Text style={styles.body}>{lesson.rule}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>ÖRNEKLER</Text>
              {lesson.examples.map(example => (
                <View key={example.german} style={styles.example}>
                  <Text style={styles.german}>{example.german}</Text>
                  <Text style={styles.turkish}>{example.turkish}</Text>
                </View>
              ))}
            </View>
            <View style={styles.tipCard}>
              <Text style={styles.cardLabel}>İPUCU</Text>
              <Text style={styles.body}>{lesson.tip}</Text>
            </View>
            <Text style={styles.disclaimer}>Kısa kontrol sonucu günlük kelime hedefini ve serini değiştirmez.</Text>
            <PrimaryButton label={`${lesson.questions.length} Soruluk Kontrole Başla`} onPress={() => { setQuiz(startGrammarQuiz()); scrollTop(); }} />
          </>
        )}

        {question && quiz && (
          <>
            <Text style={styles.progressText}>Soru {quiz.questionIndex + 1} / {lesson.questions.length}</Text>
            <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: lesson.questions.length, now: quiz.questionIndex + 1 }}>
              <View style={[styles.progressFill, { width: `${((quiz.questionIndex + 1) / lesson.questions.length) * 100}%` }]} />
            </View>
            <View style={styles.card}>
              <Text style={styles.prompt}>{question.prompt}</Text>
            </View>
            <View style={styles.options}>
              {question.options.map((option, index) => {
                const correct = answered && index === question.correctIndex;
                const wrong = answered && index === quiz.selectedIndex && !correct;
                return (
                  <TouchableOpacity
                    key={`${index}-${option}`}
                    onPress={() => setQuiz(current => current && selectGrammarAnswer(current, index, question.correctIndex, question.options.length))}
                    disabled={answered}
                    style={[styles.option, correct && styles.correctOption, wrong && styles.wrongOption]}
                    accessibilityRole="button"
                    accessibilityLabel={`${option}${correct ? ', doğru cevap' : wrong ? ', seçtiğin yanlış cevap' : ''}`}
                    accessibilityState={{ disabled: answered, selected: index === quiz.selectedIndex }}
                  >
                    <Text style={[styles.optionText, correct && styles.correctText, wrong && styles.wrongText]}>
                      {option}{correct ? '  ✓ Doğru' : wrong ? '  ✕ Yanlış' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {answered && (
              <View style={styles.feedback} accessibilityLiveRegion="polite">
                <Text style={styles.feedbackTitle}>{quiz.selectedIndex === question.correctIndex ? 'Doğru!' : `Yanlış. Doğru cevap: ${question.options[question.correctIndex]}`}</Text>
                <Text style={styles.body}>{question.explanation}</Text>
              </View>
            )}
            <PrimaryButton
              label={quiz.questionIndex === lesson.questions.length - 1 ? 'Sonucu Gör' : 'Sonraki Soru'}
              disabled={!answered}
              onPress={() => { setQuiz(current => current && nextGrammarQuestion(current, lesson.questions.length)); scrollTop(); }}
            />
          </>
        )}

        {quiz?.finished && (
          <View style={styles.result}>
            <Text style={styles.title} accessibilityRole="header">Kısa kontrol tamamlandı</Text>
            <Text style={styles.score}>{quiz.correctCount} / {lesson.questions.length}</Text>
            <Text style={styles.subtitle}>Doğru cevap</Text>
            <PrimaryButton label="Tekrar Dene" onPress={() => { setQuiz(startGrammarQuiz()); scrollTop(); }} />
            <SecondaryButton label="Derse Dön" onPress={() => { setQuiz(null); scrollTop(); }} />
            <SecondaryButton label="Gramer Rehberine Dön" onPress={() => router.replace('/gramer' as any)} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  back: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: Spacing.marginMain },
  backText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  scroll: { flex: 1 },
  content: { padding: Spacing.marginMain, paddingBottom: Spacing.xl, gap: Spacing.md },
  center: { flex: 1, justifyContent: 'center', padding: Spacing.marginMain, gap: Spacing.md },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: Colors.secondary },
  title: { fontSize: 25, fontWeight: '800', color: Colors.onSurface },
  subtitle: { fontSize: 14, lineHeight: 21, color: Colors.onSurfaceVariant },
  card: { padding: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.outlineVariant },
  tipCard: { padding: Spacing.md, gap: Spacing.sm, backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.lg },
  cardLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: Colors.secondary },
  body: { fontSize: 15, lineHeight: 23, color: Colors.onSurface },
  example: { paddingVertical: Spacing.sm, borderTopWidth: 1, borderColor: Colors.divider, gap: 3 },
  german: { fontSize: 16, fontWeight: '700', color: Colors.onSurface },
  turkish: { fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant },
  disclaimer: { fontSize: 12, lineHeight: 18, color: Colors.onSurfaceVariant },
  progressText: { fontSize: 14, fontWeight: '700', color: Colors.onSurface },
  progressTrack: { height: 7, borderRadius: 4, backgroundColor: Colors.surfaceContainerHigh, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 4, backgroundColor: Colors.secondary },
  prompt: { fontSize: 20, fontWeight: '700', lineHeight: 30, color: Colors.onSurface },
  options: { gap: Spacing.sm },
  option: { minHeight: 50, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.lg, borderColor: Colors.outlineVariant, backgroundColor: Colors.surfaceContainerLowest },
  optionText: { fontSize: 16, fontWeight: '600', color: Colors.onSurface },
  correctOption: { borderColor: Colors.success, backgroundColor: Colors.successContainer },
  wrongOption: { borderColor: Colors.error, backgroundColor: Colors.errorContainer },
  correctText: { color: Colors.success },
  wrongText: { color: Colors.error },
  feedback: { padding: Spacing.md, gap: Spacing.sm, borderRadius: BorderRadius.lg, backgroundColor: Colors.surfaceContainerLow },
  feedbackTitle: { fontSize: 15, fontWeight: '800', color: Colors.onSurface },
  result: { gap: Spacing.md },
  score: { fontSize: 48, fontWeight: '800', color: Colors.secondary },
}));
