import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUserStore } from '../../store';
import { getTopicsForLevel } from '../../constants/topics';
import { topicSymbol } from '../../constants/symbols';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Level, Topic } from '../../types';
import { AppIcon } from '../../components/app-icon';

const LEVEL_TABS: Level[] = ['A1', 'A2'];

export default function KonularScreen() {
  const router = useRouter();
  const { profile } = useUserStore();
  // Güvenlik: profile.level her ne olursa olsun (eski/geçersiz veri dahil),
  // yayın kapsamındaki sekmelerden biri değilse A1'e düş.
  const safeInitialLevel: Level = LEVEL_TABS.includes(profile?.level as Level)
    ? (profile!.level as Level)
    : 'A1';
  const [activeLevel, setActiveLevel] = useState<Level>(safeInitialLevel);
  const [search, setSearch] = useState('');

  const allTopics = useMemo(() => getTopicsForLevel('A2'), []); // A1 + A2 (yayın kapsamı)

  const filteredTopics = useMemo(() => {
    const levelTopics = allTopics.filter(t => t.level === activeLevel);
    if (!search.trim()) return levelTopics;
    return levelTopics.filter(t =>
      t.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [allTopics, activeLevel, search]);

  const isLevelLocked = (level: Level) => {
    const order: Level[] = ['A1', 'A2'];
    return order.indexOf(level) > order.indexOf(profile?.level || 'A1');
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Konular</Text>
        <Text style={styles.subtitle}>Seviyene göre kelime konuları</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrapper}>
        <AppIcon name="magnifyingglass" size={16} color={Colors.outline} />
        <TextInput
          style={styles.searchInput}
          placeholder="Konu ara..."
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

      {/* Level Tabs */}
      <View style={styles.levelTabs}>
        {LEVEL_TABS.map((lvl) => {
          const locked = isLevelLocked(lvl);
          return (
            <TouchableOpacity
              key={lvl}
              style={[
                styles.levelTab,
                activeLevel === lvl && styles.levelTabActive,
                locked && styles.levelTabLocked,
              ]}
              onPress={() => !locked && setActiveLevel(lvl)}
              activeOpacity={locked ? 1 : 0.8}
            >
              <Text style={[
                styles.levelTabText,
                activeLevel === lvl && styles.levelTabTextActive,
                locked && styles.levelTabTextLocked,
              ]}>
                {lvl}
              </Text>
              {locked && <AppIcon name="lock.fill" size={11} color={Colors.outline} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Topics List */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {filteredTopics.length === 0 ? (
          <View style={styles.empty}>
            <AppIcon name="magnifyingglass" size={34} color={Colors.outlineVariant} />
            <Text style={styles.emptyText}>Konu bulunamadı</Text>
          </View>
        ) : (
          filteredTopics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              onPress={() => router.push(`/konu/${topic.id}/alistirma` as any)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TopicCard({ topic, onPress }: { topic: Topic; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.topicCard}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${topic.title}, ${topic.wordCount} kelime, ${topic.level}`}
      accessibilityHint="Alıştırma türlerini açar"
    >
      <View style={styles.topicLeft}>
        <View style={styles.topicEmojiBox}>
          <AppIcon name={topicSymbol(topic.id)} size={22} color={Colors.secondary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.topicTitle}>{topic.title}</Text>
          <Text style={styles.topicMeta}>{topic.wordCount} kelime · {topic.level}</Text>
        </View>
      </View>
      <AppIcon name="chevron.right" size={15} color={Colors.outline} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: { paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { fontSize: 24, fontWeight: '700', color: Colors.primary },
  subtitle: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  searchWrapper: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: Spacing.marginMain, marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, height: 44,
    gap: Spacing.sm, ...Shadows.level1,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.primary },
  clearButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  levelTabs: {
    flexDirection: 'row', paddingHorizontal: Spacing.marginMain,
    gap: Spacing.sm, marginBottom: Spacing.md,
  },
  levelTab: {
    flex: 1, minHeight: Spacing.touchTargetMin, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: Spacing.xs,
    borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceContainer,
  },
  levelTabActive: { backgroundColor: Colors.primary },
  levelTabLocked: { opacity: 0.5 },
  levelTabText: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  levelTabTextActive: { color: Colors.golden },
  levelTabTextLocked: { color: Colors.outlineVariant },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: 100, gap: Spacing.sm },
  topicCard: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.xl,
    padding: Spacing.md, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', ...Shadows.level1,
  },
  topicLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  topicEmojiBox: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
  },
  topicTitle: { fontSize: 15, fontWeight: '600', color: Colors.primary, marginBottom: 2 },
  topicMeta: { fontSize: 12, color: Colors.onSurfaceVariant },
  empty: { alignItems: 'center', marginTop: 60, gap: Spacing.md },
  emptyText: { fontSize: 15, color: Colors.onSurfaceVariant },
});
