import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getTopicById } from '../../../constants/topics';
import { useWordStore } from '../../../store';
import { Colors, Spacing, BorderRadius, Cards } from '../../../constants/theme';
import { AppIcon } from '../../../components/app-icon';
import { SecondaryButton } from '../../../components/ui';
import { EXERCISE_SYMBOLS } from '../../../constants/symbols';

export default function AlistirmaSecimScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { words: customWords } = useWordStore();

  const topic = getTopicById(id);
  const words = topic ? topic.words : customWords.filter(w => w.topicId === id);
  const wordIds = words.map(w => w.id).join(',');

  const exampleCount = useMemo(
    () => words.filter(w =>
      w.example && w.example.trim().length > 0 &&
      w.exampleTurkish && w.exampleTurkish.trim().length > 0
    ).length,
    [words]
  );

  const handleCancel = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/konular' as any);
  };

  const EXERCISE_TYPES = [
    {
      id: 'kelimeler',
      icon: 'list.bullet',
      title: 'Kelime Listesi',
      desc: 'Kelimeleri ara ve ayrıntılarını incele',
      color: Colors.surfaceContainerLow,
      path: 'kelimeler',
      disabled: false,
    },
    {
      id: 'flashcard',
      icon: EXERCISE_SYMBOLS.flashcard,
      title: 'Flashcard',
      desc: 'Kartları çevirerek kelimeleri öğren',
      color: '#EFF4FF',
      path: 'flashcard',
      disabled: false,
    },
    ...(topic?.level === 'A1' || topic?.level === 'A2' || topic?.level === 'B1' ? [{
      id: 'dinle-sec',
      icon: EXERCISE_SYMBOLS['dinle-sec'],
      title: 'Dinle ve Seç',
      desc: 'Kelimeyi dinle, doğru Türkçe anlamı seç',
      color: '#E8F0FF',
      path: 'dinle-sec',
      disabled: false,
    }, {
      id: 'dinle-yaz',
      icon: EXERCISE_SYMBOLS['dinle-yaz'],
      title: 'Dinle ve Yaz',
      desc: 'Kelimeyi dinle, Almancasını yaz',
      color: '#F1ECFF',
      path: 'dinle-yaz',
      disabled: false,
    }] : []),
    {
      id: 'dogru-yanlis',
      icon: EXERCISE_SYMBOLS['dogru-yanlis'],
      title: 'Doğru / Yanlış',
      desc: 'Hızlı bilgi yoklaması',
      color: '#D8F3DC',
      path: 'dogru-yanlis',
      disabled: false,
    },
    {
      id: 'yazma',
      icon: EXERCISE_SYMBOLS.yazma,
      title: 'Yazarak Tekrar',
      desc: 'Türkçeye bakarak Almancayı yaz',
      color: '#FFF8E7',
      path: 'yazma',
      disabled: false,
    },
    {
      id: 'cumle',
      icon: EXERCISE_SYMBOLS.cumle,
      title: 'Cümle Yazma',
      desc: exampleCount > 0
        ? `Türkçe cümleyi Almanca olarak yaz · ${exampleCount} uygun kelime`
        : 'Bu konuda iki dilde örnek cümle yok',
      color: '#FCE8D5',
      path: 'cumle',
      disabled: exampleCount === 0,
    },
  ];

  const handleExercise = (exerciseId: string, path: string, disabled: boolean) => {
    if (disabled) return;
    if (path === 'kelimeler') {
      router.push(`/konu/${id}/kelimeler` as any);
    } else if (path === 'flashcard') {
      router.push(`/konu/${id}/flashcard` as any);
    } else {
      const params = topic
        ? `topicId=${id}`
        : `wordIds=${wordIds}&topicId=${id}`;
      router.push(`/alistirma/${path}?${params}` as any);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.handleBar} />

      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
          {topic?.title || 'Alıştırma Seç'}
        </Text>
        <Text style={styles.subtitle}>{words.length} kelime · Nasıl çalışmak istersin?</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {EXERCISE_TYPES.map((ex) => (
          <TouchableOpacity
            key={ex.id}
            style={[
              styles.exerciseCard,
              ex.disabled ? styles.exerciseCardDisabled : { backgroundColor: ex.color },
            ]}
            onPress={() => handleExercise(ex.id, ex.path, ex.disabled)}
            disabled={ex.disabled}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={ex.title}
            accessibilityHint={ex.disabled ? undefined : ex.desc}
            accessibilityState={{ disabled: ex.disabled }}
          >
            <View style={[styles.exerciseIconBox, ex.disabled ? styles.exerciseIconBoxDisabled : styles.exerciseIconBoxEnabled]}>
              <AppIcon name={ex.icon} size={22} color={ex.disabled ? Colors.outline : Colors.secondary} />
            </View>
            <View style={styles.exerciseText}>
              <Text style={[styles.exerciseTitle, ex.disabled && styles.exerciseTextDisabled]}>{ex.title}</Text>
              <Text style={[styles.exerciseDesc, ex.disabled && styles.exerciseTextDisabled]}>{ex.desc}</Text>
            </View>
            {ex.disabled
              ? <AppIcon name="lock.fill" size={14} color={Colors.outline} />
              : <AppIcon name="chevron.right" size={15} color={Colors.outline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <SecondaryButton label="İptal" onPress={handleCancel} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  handleBar: {
    width: 36, height: 4, backgroundColor: Colors.outlineVariant,
    borderRadius: 2, alignSelf: 'center', marginTop: Spacing.sm,
  },
  header: { paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: Colors.primary, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, color: Colors.onSurfaceVariant, marginTop: 4 },
  content: { paddingHorizontal: Spacing.marginMain, gap: Spacing.sm + 2, paddingBottom: Spacing.md },
  exerciseCard: {
    borderRadius: BorderRadius.xl, borderCurve: 'continuous', padding: Spacing.md, minHeight: 80,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderWidth: 1, borderColor: Cards.borderColor,
  },
  exerciseCardDisabled: { backgroundColor: Colors.surfaceContainer, opacity: 0.8 },
  exerciseIconBox: {
    width: 46, height: 46, borderRadius: BorderRadius.lg, borderCurve: 'continuous',
    backgroundColor: Colors.surfaceContainerLowest, alignItems: 'center', justifyContent: 'center',
  },
  exerciseIconBoxEnabled: { boxShadow: '0 1px 6px rgba(26, 31, 43, 0.08)' },
  exerciseIconBoxDisabled: { backgroundColor: Colors.surfaceContainerHigh },
  exerciseText: { flex: 1 },
  exerciseTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  exerciseDesc: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 18 },
  // Devre dışı kartın açıklaması bilgi taşıdığı için okunur kontrast korunur.
  exerciseTextDisabled: { color: Colors.onSurfaceVariant },
  footer: {
    paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
    borderTopWidth: 1, borderTopColor: Cards.borderColor, backgroundColor: Colors.warmWhite,
  },
});
