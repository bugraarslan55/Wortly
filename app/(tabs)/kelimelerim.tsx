import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWordStore } from '../../store';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Word, MasteryLevel } from '../../types';
import { AppIcon } from '../../components/app-icon';
import { ColoredGermanPlural, ColoredGermanWord } from '../../components/colored-german-word';

const MASTERY_LABELS = ['Yeni', 'Öğreniliyor', 'Bilinçli', 'Öğrenildi'];
const MASTERY_COLORS = [Colors.outlineVariant, Colors.secondary, Colors.secondaryFixedDim, Colors.success];

export default function KelimelerimScreen() {
  const router = useRouter();
  const { words, deleteWord } = useWordStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | MasteryLevel>('all');

  const customWords = words.filter(w => w.isCustom);

  const filteredWords = customWords.filter(w => {
    const matchSearch =
      !search.trim() ||
      w.german.toLowerCase().includes(search.toLowerCase()) ||
      w.turkish.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || w.masteryLevel === filter;
    return matchSearch && matchFilter;
  });

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
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Kelimelerim</Text>
          <Text style={styles.subtitle}>{customWords.length} kişisel kelime</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/kelime/ekle' as any)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Yeni kelime ekle"
        >
          <Text style={styles.addBtnText}>+ Ekle</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <AppIcon name="magnifyingglass" size={16} color={Colors.outline} />
        <TextInput
          style={styles.searchInput}
          placeholder="Kelime ara..."
          placeholderTextColor={Colors.outlineVariant}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch('')}
            style={styles.clearButton}
            accessibilityRole="button"
            accessibilityLabel="Aramayı temizle"
          >
            <AppIcon name="xmark.circle.fill" size={18} color={Colors.outline} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        keyboardShouldPersistTaps="handled"
      >
        {(['all', 0, 1, 2, 3] as ('all' | MasteryLevel)[]).map((f) => {
          const isActive = filter === f;
          const count = f === 'all'
            ? customWords.length
            : customWords.filter(word => word.masteryLevel === f).length;

          return (
            <TouchableOpacity
              key={String(f)}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setFilter(f)}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${f === 'all' ? 'Tümü' : MASTERY_LABELS[f as number]}, ${count} kelime`}
            >
              <Text style={[styles.filterTabText, isActive && styles.filterTabTextActive]}>
                {f === 'all' ? 'Tümü' : MASTERY_LABELS[f as number]}
              </Text>
              <View style={[styles.filterCount, isActive && styles.filterCountActive]}>
                <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Quiz CTA */}
      {customWords.length >= 1 && (
        <TouchableOpacity
          style={styles.quizBanner}
          onPress={() => router.push('/kelime/calis' as any)}
          activeOpacity={0.85}
        >
          <View style={styles.quizBannerTitle}>
            <AppIcon name="scope" size={18} color={Colors.golden} />
            <Text style={styles.quizBannerText}>Kelimelerimle Çalış</Text>
          </View>
          <AppIcon name="chevron.right" size={14} color={Colors.golden} />
        </TouchableOpacity>
      )}

      {/* Word List */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {customWords.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconBox}>
              <AppIcon name="square.and.pencil" size={30} color={Colors.secondary} />
            </View>
            <Text style={styles.emptyEyebrow}>KENDİ LİSTENİ OLUŞTUR</Text>
            <Text style={styles.emptyTitle}>Henüz kelime eklemedin</Text>
            <Text style={styles.emptyDesc}>
              Öğrenmek istediğin Almanca kelimeleri ekle; Wortly senin için çalışma listene dönüştürsün.
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/kelime/ekle' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="İlk kelimeni ekle"
            >
              <Text style={styles.emptyBtnText}>İlk Kelimeni Ekle</Text>
              <AppIcon name="arrow.right" size={15} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        ) : filteredWords.length === 0 ? (
          <View style={styles.emptyState}>
            <AppIcon name="magnifyingglass" size={34} color={Colors.outlineVariant} />
            <Text style={styles.emptyTitle}>Kelime bulunamadı</Text>
          </View>
        ) : (
          filteredWords.map((word) => (
            <WordCard
              key={word.id}
              word={word}
              onPress={() => router.push(`/kelime/${word.id}` as any)}
              onDelete={() => handleDelete(word)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function WordCard({
  word, onPress, onDelete
}: { word: Word; onPress: () => void; onDelete: () => void }) {
  const mastery = word.masteryLevel;
  return (
    <TouchableOpacity style={styles.wordCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.wordLeft}>
        <ColoredGermanWord
          article={word.article}
          german={word.german}
          style={styles.wordGerman}
          articleStyle={styles.wordArticle}
        />
        <Text style={styles.wordTurkish}>{word.turkish}</Text>
        {word.plural && (
          <ColoredGermanPlural plural={word.plural} style={styles.wordPlural} />
        )}
      </View>
      <View style={styles.wordRight}>
        <View style={[styles.masteryBadge, { backgroundColor: `${MASTERY_COLORS[mastery]}22` }]}> 
          <AppIcon
            name={mastery === 3 ? 'checkmark' : 'circle.fill'}
            size={mastery === 3 ? 14 : 9}
            color={MASTERY_COLORS[mastery]}
          />
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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  title: { fontSize: 24, fontWeight: '700', color: Colors.primary },
  subtitle: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  addBtn: {
    backgroundColor: Colors.golden, paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  searchWrapper: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.marginMain, marginBottom: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xl, borderCurve: 'continuous', paddingHorizontal: Spacing.md, height: 48,
    gap: Spacing.sm, ...Shadows.level1,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.primary },
  clearButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  filterScroll: { flexGrow: 0, marginBottom: Spacing.md },
  filterRow: {
    paddingHorizontal: Spacing.marginMain, gap: Spacing.sm,
  },
  filterTab: {
    minHeight: 40, paddingLeft: 14, paddingRight: 8,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceContainer,
    borderWidth: 1, borderColor: Colors.surfaceContainerHigh,
  },
  filterTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterTabText: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  filterTabTextActive: { color: Colors.onPrimary },
  filterCount: {
    minWidth: 24, height: 24, paddingHorizontal: 6,
    borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
  },
  filterCountActive: { backgroundColor: Colors.golden },
  filterCountText: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant, fontVariant: ['tabular-nums'] },
  filterCountTextActive: { color: Colors.primary },
  quizBanner: {
    marginHorizontal: Spacing.marginMain, marginBottom: Spacing.sm,
    backgroundColor: Colors.primaryContainer, borderRadius: 16, padding: Spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  quizBannerText: { fontSize: 14, fontWeight: '600', color: Colors.golden },
  quizBannerTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: 100, gap: Spacing.sm },
  wordCard: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.xl,
    padding: Spacing.md, flexDirection: 'row', alignItems: 'center', ...Shadows.level1,
  },
  wordLeft: { flex: 1 },
  wordGerman: { fontSize: 17, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  wordArticle: { fontSize: 14, fontWeight: '700' },
  wordTurkish: { fontSize: 14, color: Colors.onSurfaceVariant },
  wordPlural: { fontSize: 11, color: Colors.outlineVariant, marginTop: 2 },
  wordRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  masteryBadge: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  emptyState: {
    alignItems: 'center', marginTop: Spacing.lg, paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl, gap: Spacing.sm,
    borderRadius: BorderRadius.xxl, borderCurve: 'continuous',
    backgroundColor: Colors.surfaceContainerLowest, ...Shadows.level1,
  },
  emptyIconBox: {
    width: 60, height: 60, borderRadius: BorderRadius.xl, borderCurve: 'continuous',
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  emptyEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: Colors.secondary },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 21, maxWidth: 300 },
  emptyBtn: {
    backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, borderCurve: 'continuous', height: 48,
    paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
    gap: Spacing.sm, marginTop: Spacing.sm,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
});
