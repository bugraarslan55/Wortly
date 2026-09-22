import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getTopicById } from '../../../constants/topics';
import { useWordStore } from '../../../store';
import { Colors, Spacing, BorderRadius, Shadows } from '../../../constants/theme';
import { AppIcon } from '../../../components/app-icon';
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
    ...(topic?.level === 'A1' || topic?.level === 'A2' ? [{
      id: 'dinle-sec',
      icon: EXERCISE_SYMBOLS['dinle-sec'],
      title: 'Dinle ve Seç',
      desc: 'Kelimeyi dinle, doğru Türkçe anlamı seç',
      color: '#E8F0FF',
      path: 'dinle-sec',
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
      {/* Handle bar */}
      <View style={styles.handleBar} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>
          {topic?.title || 'Alıştırma Seç'}
        </Text>
        <Text style={styles.subtitle}>{words.length} kelime · Nasıl çalışmak istersin?</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {EXERCISE_TYPES.map((ex) => (
          <TouchableOpacity
            key={ex.id}
            style={[
              styles.exerciseCard,
              { backgroundColor: ex.color },
              ex.disabled && styles.exerciseCardDisabled,
            ]}
            onPress={() => handleExercise(ex.id, ex.path, ex.disabled)}
            disabled={ex.disabled}
            activeOpacity={0.85}
          >
            <View style={styles.exerciseIconBox}>
              <AppIcon name={ex.icon} size={22} color={Colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.exerciseTitle}>{ex.title}</Text>
              <Text style={styles.exerciseDesc}>{ex.desc}</Text>
            </View>
            {!ex.disabled && <AppIcon name="chevron.right" size={15} color={Colors.outline} />}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.7}>
        <Text style={styles.cancelBtnText}>İptal</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  handleBar: {
    width: 36, height: 4, backgroundColor: Colors.outlineVariant,
    borderRadius: 2, alignSelf: 'center', marginTop: Spacing.sm,
  },
  header: { padding: Spacing.marginMain, paddingBottom: Spacing.sm },
  title: { fontSize: 22, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: Colors.onSurfaceVariant },
  content: { paddingHorizontal: Spacing.marginMain, gap: Spacing.sm, paddingBottom: 24 },
  exerciseCard: {
    borderRadius: 20, padding: Spacing.md, minHeight: 76,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, ...Shadows.level1,
  },
  exerciseCardDisabled: { opacity: 0.5 },
  exerciseIconBox: {
    width: 44, height: 44, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center', justifyContent: 'center',
  },
  exerciseTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  exerciseDesc: { fontSize: 13, color: Colors.onSurfaceVariant },
  cancelBtn: {
    margin: Spacing.marginMain, height: 50, alignItems: 'center', justifyContent: 'center',
    borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.outlineVariant,
  },
  cancelBtnText: { fontSize: 15, color: Colors.onSurfaceVariant, fontWeight: '600' },
});
