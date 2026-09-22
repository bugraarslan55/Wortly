import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useWordStore } from '../../store';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { AppIcon } from '../../components/app-icon';
import { EXERCISE_SYMBOLS } from '../../constants/symbols';

// Kelimelerim ekranındaki tüm kişisel kelimeler tek bir çalışma seti olarak
// kullanılır — konu (topicId) filtresine bakılmaz.
export default function KelimelerimleCalisScreen() {
  const router = useRouter();
  const { words } = useWordStore();

  const customWords = useMemo(() => words.filter(w => w.isCustom), [words]);
  const wordsWithExample = useMemo(
    () => customWords.filter(w =>
      w.example && w.example.trim().length > 0 &&
      w.exampleTurkish && w.exampleTurkish.trim().length > 0
    ),
    [customWords]
  );
  const wordIds = customWords.map(w => w.id).join(',');

  const EXERCISE_TYPES = [
    {
      id: 'flashcard',
      icon: EXERCISE_SYMBOLS.flashcard,
      title: 'Flashcard',
      desc: 'Kartları çevirerek kelimeleri öğren',
      color: '#EFF4FF',
      disabled: false,
      onPress: () => router.push('/konu/kelimelerim/flashcard' as any),
    },
    {
      id: 'dogru-yanlis',
      icon: EXERCISE_SYMBOLS['dogru-yanlis'],
      title: 'Doğru / Yanlış',
      desc: customWords.length >= 2
        ? 'Hızlı bilgi yoklaması'
        : 'En az 2 kişisel kelime gerekli',
      color: '#D8F3DC',
      disabled: customWords.length < 2,
      onPress: () => router.push(`/alistirma/dogru-yanlis?wordIds=${wordIds}` as any),
    },
    {
      id: 'yazma',
      icon: EXERCISE_SYMBOLS.yazma,
      title: 'Yazarak Tekrar',
      desc: 'Türkçeye bakarak Almancayı yaz',
      color: '#FFF8E7',
      disabled: false,
      onPress: () => router.push(`/alistirma/yazma?wordIds=${wordIds}` as any),
    },
    {
      id: 'cumle',
      icon: EXERCISE_SYMBOLS.cumle,
      title: 'Cümle Yazma',
      desc: wordsWithExample.length > 0
        ? `Türkçe cümleyi Almanca olarak yaz · ${wordsWithExample.length} uygun kelime`
        : 'İki dilde örnek cümlesi olan kelimen yok',
      color: '#FCE8D5',
      disabled: wordsWithExample.length === 0,
      onPress: () => router.push(`/alistirma/cumle?wordIds=${wordIds}` as any),
    },
  ];

  if (customWords.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.handleBar} />
        <View style={styles.center}>
          <View style={styles.emptyIconBox}>
            <AppIcon name="square.and.pencil" size={30} color={Colors.secondary} />
          </View>
          <Text style={styles.emptyText}>Henüz kişisel kelime eklemedin.</Text>
          <Text style={styles.emptySubtext}>
            Önce "Kelimelerim" sekmesinden birkaç kelime ekle, sonra buraya dön.
          </Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.backBtnText}>Geri</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.handleBar} />

      <View style={styles.header}>
        <Text style={styles.title}>Kelimelerimle Çalış</Text>
        <Text style={styles.subtitle}>{customWords.length} kişisel kelime · Nasıl çalışmak istersin?</Text>
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
            onPress={ex.disabled ? undefined : ex.onPress}
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

      <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} activeOpacity={0.7}>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  emptyIconBox: {
    width: 64, height: 64, borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyText: { fontSize: 16, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 18 },
  backBtn: { backgroundColor: Colors.golden, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: Spacing.sm },
  backBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
});
