import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '../components/app-icon';
import { usePhrasebook } from '../components/use-phrasebook';
import { BorderRadius, Shadows, Spacing } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import {
  PHRASEBOOK_LOCKED_MESSAGE, PHRASE_LEVELS, deleteLabel, filterPhrases, levelCounts, type LevelFilter, type Phrase,
} from '../utils/phrasebook';
import { goBack } from '../utils/safe-back';
import { useGermanSpeech } from '../utils/use-german-speech';

const LEVEL_FILTERS: readonly LevelFilter[] = ['all', ...PHRASE_LEVELS];

/**
 * İfade Defterim: senaryolardan kaydedilen ifadeler. Tamamen yerel ve çevrimdışıdır; metinler kaydedildiği hâliyle
 * (senaryodan bağımsız) gösterilir.
 */
export default function PhrasebookScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { items, isLoaded, isLocked, remove } = usePhrasebook();
  const { speak, speakingRate } = useGermanSpeech();
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<LevelFilter>('all');
  // Türkçe gösterimi: tümü için genel anahtar + ifade başına değiştirme.
  const [showAll, setShowAll] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);

  const counts = useMemo(() => levelCounts(items), [items]);
  const visible = useMemo(() => filterPhrases(items, { query, level }), [items, query, level]);
  const filtering = query.trim().length > 0 || level !== 'all';

  const isShown = (id: string) => overrides[id] ?? showAll;

  const toggleAll = () => {
    setShowAll(value => !value);
    setOverrides({});
  };

  const handleListen = (phrase: Phrase) => {
    setPlayingId(phrase.id);
    void speak(phrase.german, 'normal');
  };

  const confirmDelete = (phrase: Phrase) => {
    Alert.alert('İfadeyi Sil', `"${phrase.german}" ifadesini İfade Defterim'den silmek istiyor musun?`, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => { void remove(phrase.id); } },
    ]);
  };

  const clearFilters = () => {
    setQuery('');
    setLevel('all');
  };

  const renderPhrase = ({ item }: { item: Phrase }) => {
    const showTurkish = isShown(item.id);
    const playing = !!speakingRate && playingId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.meta} numberOfLines={1}>
            {item.speaker ? `${item.speaker} · ` : ''}{item.scenarioTitle}
          </Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{item.level}</Text>
          </View>
        </View>
        <Text style={styles.german}>{item.german}</Text>
        {showTurkish && <Text style={styles.turkish}>{item.turkish}</Text>}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.textAction}
            onPress={() => setOverrides(current => ({ ...current, [item.id]: !showTurkish }))}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={showTurkish ? `Türkçeyi gizle: ${item.german}` : `Türkçeyi göster: ${item.german}`}
          >
            <Text style={styles.textActionLabel}>{showTurkish ? 'Türkçeyi gizle' : 'Türkçeyi göster'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconAction, playing && styles.iconActionActive]}
            onPress={() => handleListen(item)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`İfadeyi dinle: ${item.german}`}
          >
            <AppIcon name="speaker.wave.2.fill" size={17} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconAction}
            onPress={() => confirmDelete(item)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={deleteLabel(item.german)}
          >
            <AppIcon name="trash" size={17} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmpty = () => {
    if (!isLoaded) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyText} accessibilityLiveRegion="polite">İfade Defterim yükleniyor…</Text>
        </View>
      );
    }
    if (isLocked) {
      return (
        <View style={styles.empty}>
          <AppIcon name="lock.fill" size={28} color={colors.outlineVariant} />
          <Text style={styles.emptyText} accessibilityLiveRegion="polite">{PHRASEBOOK_LOCKED_MESSAGE}</Text>
        </View>
      );
    }
    if (items.length === 0) {
      return (
        <View style={styles.empty}>
          <AppIcon name="bookmark" size={28} color={colors.outlineVariant} />
          <Text style={styles.emptyTitle}>İfade Defterin boş</Text>
          <Text style={styles.emptyText}>
            Bir senaryoda beğendiğin cümlenin yanındaki yer imi düğmesine dokun; ifade burada, internet olmadan da durur.
          </Text>
        </View>
      );
    }
    return (
      <View style={styles.empty}>
        <AppIcon name="magnifyingglass" size={28} color={colors.outlineVariant} />
        <Text style={styles.emptyTitle}>İfade bulunamadı</Text>
        <Text style={styles.emptyText}>Aramana ve seçtiğin seviyeye uyan ifade yok.</Text>
        {filtering && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={clearFilters}
            accessibilityRole="button"
            accessibilityLabel="Aramayı ve seviye filtresini temizle"
          >
            <Text style={styles.clearButtonText}>Filtreleri temizle</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBack(router)}
          style={styles.headerBack}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <AppIcon name="chevron.left" size={18} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">İfade Defterim</Text>
          <Text style={styles.subtitle}>{isLoaded && !isLocked ? `${items.length} ifade` : 'Kayıtlı ifadelerin'}</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.searchWrapper}>
        <AppIcon name="magnifyingglass" size={17} color={colors.outline} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Almanca, Türkçe veya senaryo ara"
          placeholderTextColor={colors.outlineVariant}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="İfade ara"
        />
        {query.length > 0 && Platform.OS !== 'ios' ? (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Aramayı temizle">
            <AppIcon name="xmark.circle.fill" size={18} color={colors.outlineVariant} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.levelRow} accessibilityLabel="Seviye filtresi">
        {LEVEL_FILTERS.map((option) => {
          const active = level === option;
          const label = option === 'all' ? 'Tümü' : option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.levelChip, active && styles.levelChipActive]}
              onPress={() => setLevel(option)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${option === 'all' ? 'Tüm seviyeler' : `${option} seviyesi`}, ${counts[option]} ifade`}
            >
              <Text style={[styles.levelChipText, active && styles.levelChipTextActive]}>{label} · {counts[option]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoaded && !isLocked && items.length > 0 && (
        <View style={styles.listHeader}>
          <Text style={styles.resultCount} accessibilityLiveRegion="polite">
            {filtering ? `${visible.length} sonuç` : 'Tüm ifadeler'}
          </Text>
          <TouchableOpacity
            style={styles.toggleAll}
            onPress={toggleAll}
            accessibilityRole="button"
            accessibilityLabel={showAll ? 'Tüm Türkçe anlamları gizle' : 'Tüm Türkçe anlamları göster'}
          >
            <Text style={styles.toggleAllText}>{showAll ? 'Türkçeleri gizle' : 'Türkçeleri göster'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={visible}
        renderItem={renderPhrase}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.listContent, visible.length === 0 && styles.emptyListContent]}
        ListEmptyComponent={renderEmpty()}
        initialNumToRender={12}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.marginMain, paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  headerBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 44 },
  title: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  subtitle: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 1 },
  searchWrapper: {
    minHeight: 48, marginHorizontal: Spacing.marginMain, paddingHorizontal: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: BorderRadius.lg, backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1, borderColor: Colors.outlineVariant, ...Shadows.level1,
  },
  searchInput: { flex: 1, minHeight: 46, fontSize: 15, color: Colors.primary },
  levelRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm,
    paddingHorizontal: Spacing.marginMain, marginTop: Spacing.md,
  },
  levelChip: {
    minHeight: 44, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.lg, justifyContent: 'center',
    backgroundColor: Colors.surfaceContainer, borderWidth: 1.5, borderColor: 'transparent',
  },
  levelChipActive: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
  levelChipText: { fontSize: 14, fontWeight: '600', color: Colors.onSurfaceVariant },
  levelChipTextActive: { color: Colors.primary },
  listHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.marginMain, marginTop: Spacing.sm,
  },
  resultCount: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  toggleAll: { minHeight: 44, justifyContent: 'center' },
  toggleAllText: { fontSize: 14, fontWeight: '600', color: Colors.secondary },
  listContent: { paddingHorizontal: Spacing.marginMain, paddingBottom: Spacing.xxl, gap: Spacing.sm },
  // Üste hizalı: ortalanırsa klavye açıkken boş durum ve "Filtreleri temizle" düğmesi klavyenin arkasında kalır.
  emptyListContent: { flexGrow: 1, justifyContent: 'flex-start', paddingTop: Spacing.xl },
  card: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.xl, padding: Spacing.md, gap: Spacing.sm,
    ...Shadows.level1,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  meta: { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.secondary },
  levelBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.lg, backgroundColor: Colors.secondaryContainer,
  },
  levelBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.onSecondaryContainer },
  german: { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 25 },
  turkish: { fontSize: 15, color: Colors.onSurfaceVariant, lineHeight: 21 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  textAction: { flex: 1, minHeight: 44, justifyContent: 'center' },
  textActionLabel: { fontSize: 14, fontWeight: '600', color: Colors.secondary },
  iconAction: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surfaceContainer, borderWidth: 1.5, borderColor: 'transparent',
  },
  iconActionActive: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
  empty: { alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant, textAlign: 'center' },
  clearButton: {
    minHeight: 44, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.lg, justifyContent: 'center',
    backgroundColor: Colors.surfaceContainer, marginTop: Spacing.sm,
  },
  clearButtonText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
}));
