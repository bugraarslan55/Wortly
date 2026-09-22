import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getTopicById } from '../../../constants/topics';
import { Colors, BorderRadius, Shadows, Spacing } from '../../../constants/theme';
import { Word } from '../../../types';
import { AppIcon } from '../../../components/app-icon';
import { ColoredGermanPlural, ColoredGermanWord } from '../../../components/colored-german-word';

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('de-DE');
}

function getAlphabeticalKey(word: Word): string {
  return word.german.replace(/^\(sich\)\s+/i, '');
}

export default function KonuKelimeleriScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [search, setSearch] = useState('');
  const topic = getTopicById(id);

  const filteredWords = useMemo(() => {
    if (!topic) return [];
    const sortedWords = [...topic.words].sort((first, second) =>
      getAlphabeticalKey(first).localeCompare(
        getAlphabeticalKey(second),
        'de-DE',
        { sensitivity: 'base' },
      )
    );
    const query = normalizeSearch(search);
    if (!query) return sortedWords;

    return sortedWords.filter(word => normalizeSearch([
      word.article,
      word.german,
      word.turkish,
      word.plural || '',
    ].join(' ')).includes(query));
  }, [search, topic]);

  const renderWord = ({ item }: { item: Word }) => (
    <TouchableOpacity
      style={styles.wordCard}
      onPress={() => router.push(`/kelime/${item.id}` as any)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${item.article ? `${item.article} ` : ''}${item.german}, ${item.turkish}`}
    >
      <View style={styles.wordContent}>
        <ColoredGermanWord
          article={item.article}
          german={item.german}
          style={styles.german}
          articleStyle={styles.article}
        />
        <Text style={styles.turkish}>{item.turkish}</Text>
        {item.plural ? (
          <ColoredGermanPlural plural={item.plural} style={styles.plural} />
        ) : null}
      </View>
      <AppIcon name="chevron.right" size={14} color={Colors.outline} />
    </TouchableOpacity>
  );

  if (!topic) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Konu bulunamadı</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Geri Dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBack}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <AppIcon name="chevron.left" size={18} color={Colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>{topic.title}</Text>
          <Text style={styles.subtitle}>{topic.words.length} kelime</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchWrapper}>
        <AppIcon name="magnifyingglass" size={17} color={Colors.outline} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Almanca veya Türkçe ara"
          placeholderTextColor={Colors.outlineVariant}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && Platform.OS !== 'ios' ? (
          <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Aramayı temizle">
            <AppIcon name="xmark.circle.fill" size={18} color={Colors.outlineVariant} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.resultCount}>
        {search.trim() ? `${filteredWords.length} sonuç` : 'Tüm kelimeler'}
      </Text>

      <FlatList
        data={filteredWords}
        renderItem={renderWord}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          filteredWords.length === 0 && styles.emptyListContent,
        ]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <AppIcon name="magnifyingglass" size={28} color={Colors.outlineVariant} />
            <Text style={styles.emptyTitle}>Kelime bulunamadı</Text>
            <Text style={styles.emptyText}>Farklı bir Almanca veya Türkçe arama deneyin.</Text>
          </View>
        )}
        initialNumToRender={16}
        maxToRenderPerBatch={20}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== 'web'}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.marginMain, paddingVertical: Spacing.md,
  },
  headerBack: {
    width: Spacing.touchTargetMin, height: Spacing.touchTargetMin,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceContainer,
    alignItems: 'center', justifyContent: 'center',
  },
  headerText: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.sm },
  headerSpacer: { width: Spacing.touchTargetMin },
  title: { fontSize: 17, fontWeight: '700', color: Colors.primary, maxWidth: '100%' },
  subtitle: { marginTop: 2, fontSize: 12, color: Colors.onSurfaceVariant },
  searchWrapper: {
    minHeight: 48, marginHorizontal: Spacing.marginMain,
    paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: BorderRadius.lg, backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1, borderColor: Colors.outlineVariant, ...Shadows.level1,
  },
  searchInput: { flex: 1, minHeight: 46, fontSize: 15, color: Colors.primary },
  resultCount: {
    paddingHorizontal: Spacing.marginMain, marginTop: Spacing.md, marginBottom: Spacing.sm,
    fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant,
  },
  listContent: {
    marginHorizontal: Spacing.marginMain, paddingBottom: Spacing.xxl,
    borderRadius: BorderRadius.xl, backgroundColor: Colors.surfaceContainerLowest,
    overflow: 'hidden', ...Shadows.level1,
  },
  wordCard: {
    minHeight: 76, paddingHorizontal: Spacing.md, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  wordContent: { flex: 1 },
  german: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  article: { fontSize: 17, fontWeight: '700' },
  turkish: { marginTop: 3, fontSize: 14, color: Colors.onSurfaceVariant },
  plural: { marginTop: 4, fontSize: 12, color: Colors.outline },
  separator: { height: 1, marginLeft: Spacing.md, backgroundColor: Colors.surfaceContainer },
  emptyListContent: { flexGrow: 1, backgroundColor: 'transparent', overflow: 'visible' },
  empty: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyTitle: { marginTop: Spacing.sm, fontSize: 17, fontWeight: '700', color: Colors.primary },
  emptyText: { marginTop: Spacing.xs, fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  backButton: {
    marginTop: Spacing.md, paddingHorizontal: Spacing.lg, minHeight: 44,
    borderRadius: BorderRadius.lg, backgroundColor: Colors.golden,
    alignItems: 'center', justifyContent: 'center',
  },
  backButtonText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
});
