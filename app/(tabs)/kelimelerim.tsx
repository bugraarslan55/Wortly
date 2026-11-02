import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWordStore } from '../../store';
import { Colors, Spacing, BorderRadius, Cards } from '../../constants/theme';
import { Word, MasteryLevel } from '../../types';
import { AppIcon } from '../../components/app-icon';
import { ColoredGermanPlural, ColoredGermanWord } from '../../components/colored-german-word';
import { EmptyState, FilterChip, IconTile, ScreenHeader, SearchField } from '../../components/ui';

const MASTERY_LABELS = ['Yeni', 'Öğreniliyor', 'Bilinçli', 'Öğrenildi'];
// Rozet metinleri arka planlarına göre >= 4.5:1 kontrast verecek koyu tonlardadır.
const MASTERY_COLORS = [Colors.onSurfaceVariant, Colors.secondary, Colors.secondary, Colors.success];
const MASTERY_BACKGROUNDS = [
  Colors.surfaceContainer, Colors.secondaryContainer, Colors.secondaryContainer, Colors.successContainer,
];
const FILTERS: ('all' | MasteryLevel)[] = ['all', 0, 1, 2, 3];

export default function KelimelerimScreen() {
  const router = useRouter();
  const { words, deleteWord } = useWordStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | MasteryLevel>('all');

  const customWords = useMemo(() => words.filter(w => w.isCustom), [words]);

  const filteredWords = useMemo(() => customWords.filter(w => {
    const query = search.trim().toLowerCase();
    const matchSearch =
      !query ||
      w.german.toLowerCase().includes(query) ||
      w.turkish.toLowerCase().includes(query);
    const matchFilter = filter === 'all' || w.masteryLevel === filter;
    return matchSearch && matchFilter;
  }), [customWords, search, filter]);

  const handleDelete = (word: Word) => {
    Alert.alert(
      'Kelimeyi Sil',
      `"${word.article ? word.article + ' ' : ''}${word.german}" kelimesini silmek istiyor musun?`,
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: () => deleteWord(word.id) },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title="Kelimelerim"
        subtitle={customWords.length === 0 ? 'Kendi kelime listen' : `${customWords.length} kişisel kelime`}
        right={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/kelime/ekle' as any)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Yeni kelime ekle"
          >
            <AppIcon name="plus" size={16} color={Colors.primary} />
            <Text style={styles.addBtnText}>Ekle</Text>
          </TouchableOpacity>
        }
      />

      <SearchField value={search} onChangeText={setSearch} placeholder="Kelime ara..." style={styles.search} />

      <ScrollView
        horizontal
        nestedScrollEnabled
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        {FILTERS.map((f) => {
          const count = f === 'all'
            ? customWords.length
            : customWords.filter(word => word.masteryLevel === f).length;
          const label = f === 'all' ? 'Tümü' : MASTERY_LABELS[f];
          return (
            <FilterChip
              key={String(f)}
              label={label}
              count={count}
              selected={filter === f}
              onPress={() => setFilter(f)}
              accessibilityLabel={`${label}, ${count} kelime`}
            />
          );
        })}
      </ScrollView>

      {/* Büyük listelerde yalnızca ekrandaki kartlar çizilir (ScrollView + map tüm kelimeleri çizerdi). */}
      <FlatList
        style={styles.scroll}
        contentContainerStyle={styles.content}
        data={filteredWords}
        keyExtractor={(word) => word.id}
        renderItem={({ item: word }) => (
          <WordCard
            word={word}
            onPress={() => router.push(`/kelime/${word.id}` as any)}
            onDelete={() => handleDelete(word)}
          />
        )}
        ListHeaderComponent={customWords.length >= 1 ? (
          <TouchableOpacity
            style={styles.quizBanner}
            onPress={() => router.push('/kelime/calis' as any)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Kelimelerimle Çalış"
          >
            <IconTile name="scope" size={36} tone="gold" />
            <Text style={styles.quizBannerText}>Kelimelerimle Çalış</Text>
            <AppIcon name="chevron.right" size={14} color={Colors.golden} />
          </TouchableOpacity>
        ) : null}
        ListEmptyComponent={customWords.length === 0 ? (
          <EmptyState
            icon="square.and.pencil"
            eyebrow="KENDİ LİSTENİ OLUŞTUR"
            title="Henüz kelime eklemedin"
            description="Öğrenmek istediğin Almanca kelimeleri ekle; Wortly senin için çalışma listene dönüştürsün."
            actionLabel="İlk Kelimeni Ekle"
            onAction={() => router.push('/kelime/ekle' as any)}
          />
        ) : (
          <EmptyState
            icon="magnifyingglass"
            title="Kelime bulunamadı"
            description="Arama veya filtreyi değiştirmeyi dene."
          />
        )}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        windowSize={7}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />
    </SafeAreaView>
  );
}

function WordCard({
  word, onPress, onDelete
}: { word: Word; onPress: () => void; onDelete: () => void }) {
  const mastery = word.masteryLevel;
  const fullWord = `${word.article ? word.article + ' ' : ''}${word.german}`;
  return (
    <TouchableOpacity
      style={styles.wordCard}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${fullWord}, ${word.turkish}, ${MASTERY_LABELS[mastery]}`}
    >
      <View style={styles.wordLeft}>
        <ColoredGermanWord
          article={word.article}
          german={word.german}
          style={styles.wordGerman}
          articleStyle={styles.wordArticle}
        />
        <Text style={styles.wordTurkish} numberOfLines={2}>{word.turkish}</Text>
        {word.plural && (
          <ColoredGermanPlural plural={word.plural} style={styles.wordPlural} />
        )}
      </View>
      <View style={styles.wordRight}>
        <View style={[styles.masteryBadge, { backgroundColor: MASTERY_BACKGROUNDS[mastery] }]}>
          <Text style={[styles.masteryText, { color: MASTERY_COLORS[mastery] }]} numberOfLines={1}>
            {MASTERY_LABELS[mastery]}
          </Text>
        </View>
        <TouchableOpacity
          onPress={onDelete}
          style={styles.deleteBtn}
          accessibilityRole="button"
          accessibilityLabel={`${word.german} kelimesini sil`}
        >
          <AppIcon name="trash" size={17} color={Colors.error} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  addBtn: {
    minHeight: Spacing.touchTargetMin, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.golden, borderRadius: BorderRadius.full,
    boxShadow: '0 2px 10px rgba(244, 211, 94, 0.45)',
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  search: { marginHorizontal: Spacing.marginMain, marginBottom: Spacing.md },
  filterScroll: { flexGrow: 0, marginBottom: Spacing.md },
  filterRow: { paddingHorizontal: Spacing.marginMain, gap: Spacing.sm },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: 100, gap: Spacing.sm + 2 },
  quizBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.sm + 4,
    backgroundColor: Colors.navy, borderRadius: BorderRadius.xl, borderCurve: 'continuous',
  },
  quizBannerText: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.onPrimary },
  wordCard: {
    ...Cards.surface, padding: Spacing.md, paddingRight: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 72,
  },
  wordLeft: { flex: 1 },
  wordGerman: { fontSize: 18, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  wordArticle: { fontSize: 15, fontWeight: '700' },
  wordTurkish: { fontSize: 14, color: Colors.onSurfaceVariant },
  wordPlural: { fontSize: 11, color: Colors.outline, marginTop: 2 },
  wordRight: { alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 },
  masteryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  masteryText: { fontSize: 11, fontWeight: '700' },
  deleteBtn: { width: Spacing.touchTargetMin, height: Spacing.touchTargetMin, alignItems: 'center', justifyContent: 'center' },
});
