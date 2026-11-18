import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../components/app-icon';
import { GRAMMAR_LESSONS, isGrammarLevelLocked } from '../../constants/grammar';
import { BorderRadius, Spacing } from '../../constants/theme';
import { makeStyles, useColors } from '../../hooks/use-theme';
import { useUserStore } from '../../store';
import type { Level } from '../../types';

const LEVELS: Level[] = ['A1', 'A2', 'B1'];

export default function GrammarIndexScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const profileLevel = useUserStore(state => state.profile?.level);
  const userLevel: Level = LEVELS.includes(profileLevel as Level) ? profileLevel as Level : 'A1';
  const [activeLevel, setActiveLevel] = useState<Level>(userLevel);
  const [notice, setNotice] = useState('');
  const shownLevel = isGrammarLevelLocked(activeLevel, userLevel) ? userLevel : activeLevel;
  const lessons = GRAMMAR_LESSONS.filter(lesson => lesson.level === shownLevel);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableOpacity onPress={goBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Geri">
        <Text style={styles.backText}>← Geri</Text>
      </TouchableOpacity>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">Gramer Rehberi</Text>
        <Text style={styles.subtitle}>Sıfatları ve edatları kısa derslerle öğren.</Text>
      </View>
      <View style={styles.levelRow}>
        {LEVELS.map(level => {
          const locked = isGrammarLevelLocked(level, userLevel);
          const selected = shownLevel === level;
          return (
            <TouchableOpacity
              key={level}
              style={[styles.levelButton, selected && styles.levelSelected]}
              onPress={() => {
                if (locked) setNotice(`${level} dersleri kilitli. Önce profil seviyeni yükseltmelisin.`);
                else { setActiveLevel(level); setNotice(''); }
              }}
              accessibilityRole="button"
              accessibilityLabel={locked ? `${level} seviyesi kilitli` : `${level} seviyesi`}
              accessibilityState={{ selected, disabled: locked }}
            >
              <Text style={[styles.levelText, selected && styles.levelTextSelected, locked && styles.levelTextLocked]}>{level}</Text>
              {locked && <AppIcon name="lock.fill" size={12} color={colors.outline} />}
            </TouchableOpacity>
          );
        })}
      </View>
      {!!notice && <Text style={styles.notice} accessibilityLiveRegion="polite">{notice}</Text>}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {lessons.map(lesson => (
          <TouchableOpacity
            key={lesson.id}
            style={styles.card}
            onPress={() => router.push(`/gramer/${lesson.id}` as any)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${lesson.title}, ${lesson.level}, ${lesson.topic === 'adjective' ? 'sıfatlar' : 'edatlar'}, ${lesson.questions.length} soru`}
          >
            <View style={styles.cardText}>
              <Text style={styles.eyebrow}>{lesson.topic === 'adjective' ? 'SIFATLAR' : 'EDATLAR'} · {lesson.level}</Text>
              <Text style={styles.cardTitle}>{lesson.title}</Text>
              <Text style={styles.cardSummary}>{lesson.summary}</Text>
              <Text style={styles.questionCount}>{lesson.questions.length} soruluk kısa kontrol</Text>
            </View>
            <AppIcon name="chevron.right" size={17} color={colors.outline} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  back: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: Spacing.marginMain },
  backText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  header: { paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: 5 },
  title: { fontSize: 27, fontWeight: '800', color: Colors.onSurface },
  subtitle: { fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant },
  levelRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.marginMain, paddingBottom: Spacing.md },
  levelButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: BorderRadius.lg, backgroundColor: Colors.surfaceContainerLow, borderWidth: 1, borderColor: Colors.outlineVariant },
  levelSelected: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.secondary },
  levelText: { color: Colors.onSurface, fontSize: 15, fontWeight: '700' },
  levelTextSelected: { color: Colors.onSecondaryContainer },
  levelTextLocked: { color: Colors.outline },
  notice: { marginHorizontal: Spacing.marginMain, marginBottom: Spacing.sm, color: Colors.onErrorContainer, backgroundColor: Colors.errorContainer, padding: Spacing.sm, borderRadius: BorderRadius.md, fontSize: 13 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: Spacing.xl, gap: Spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm, borderRadius: BorderRadius.lg, backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: Colors.outlineVariant },
  cardText: { flex: 1, gap: 5 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: Colors.secondary },
  cardTitle: { fontSize: 17, fontWeight: '700', color: Colors.onSurface },
  cardSummary: { fontSize: 13, lineHeight: 19, color: Colors.onSurfaceVariant },
  questionCount: { fontSize: 12, fontWeight: '600', color: Colors.primary, marginTop: 3 },
}));
