import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUserStore } from '../../store';
import { getTopicsForLevel } from '../../constants/topics';
import { topicSymbol } from '../../constants/symbols';
import { Spacing, getCards } from '../../constants/theme';
import { makeStyles, useColors } from '../../hooks/use-theme';
import { Level, Topic } from '../../types';
import { AppIcon } from '../../components/app-icon';
import { EmptyState, IconTile, ScreenHeader, SearchField, SegmentedControl } from '../../components/ui';

const LEVEL_TABS: Level[] = ['A1', 'A2', 'B1'];

export default function KonularScreen() {
  const styles = useStyles();
  const router = useRouter();
  const { profile } = useUserStore();
  // Güvenlik: profile.level her ne olursa olsun (eski/geçersiz veri dahil),
  // yayın kapsamındaki sekmelerden biri değilse A1'e düş.
  const safeInitialLevel: Level = LEVEL_TABS.includes(profile?.level as Level)
    ? (profile!.level as Level)
    : 'A1';
  const [activeLevel, setActiveLevel] = useState<Level>(safeInitialLevel);
  // Sekme ekranı bellekte kalır; Profil'den seviye değişince seçili sekme kilitli kalmasın.
  useEffect(() => {
    setActiveLevel(safeInitialLevel);
  }, [safeInitialLevel]);
  const [search, setSearch] = useState('');

  const allTopics = useMemo(() => getTopicsForLevel('B1'), []); // A1 + A2 + B1 (yayın kapsamı)

  const filteredTopics = useMemo(() => {
    const levelTopics = allTopics.filter(t => t.level === activeLevel);
    if (!search.trim()) return levelTopics;
    return levelTopics.filter(t =>
      t.title.toLowerCase().includes(search.toLowerCase())
    );
  }, [allTopics, activeLevel, search]);

  const isLevelLocked = (level: Level) => {
    const order: Level[] = ['A1', 'A2', 'B1'];
    return order.indexOf(level) > order.indexOf(profile?.level || 'A1');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Konular" subtitle="Seviyene göre kelime konuları" />

      <SearchField value={search} onChangeText={setSearch} placeholder="Konu ara..." style={styles.search} />

      <View style={styles.levelTabs}>
        <SegmentedControl
          options={LEVEL_TABS.map(lvl => {
            const locked = isLevelLocked(lvl);
            return {
              value: lvl,
              label: lvl,
              disabled: locked,
              icon: locked ? 'lock.fill' : undefined,
              accessibilityLabel: locked ? `Seviye ${lvl}, kilitli` : `Seviye ${lvl}`,
            };
          })}
          value={activeLevel}
          onChange={setActiveLevel}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {filteredTopics.length === 0 ? (
          <EmptyState
            icon="magnifyingglass"
            title="Konu bulunamadı"
            description="Aramayı değiştirmeyi dene."
          />
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
  const styles = useStyles();
  const colors = useColors();
  return (
    <TouchableOpacity
      style={styles.topicCard}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${topic.title}, ${topic.wordCount} kelime, ${topic.level}`}
      accessibilityHint="Alıştırma türlerini açar"
    >
      <IconTile name={topicSymbol(topic.id)} size={48} />
      <View style={styles.topicText}>
        <Text style={styles.topicTitle} numberOfLines={2}>{topic.title}</Text>
        <Text style={styles.topicMeta}>{topic.wordCount} kelime · {topic.level}</Text>
      </View>
      <AppIcon name="chevron.right" size={15} color={colors.outline} />
    </TouchableOpacity>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  search: { marginHorizontal: Spacing.marginMain, marginBottom: Spacing.md },
  levelTabs: { paddingHorizontal: Spacing.marginMain, marginBottom: Spacing.md },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: 100, gap: Spacing.sm + 2 },
  topicCard: {
    ...getCards(Colors).surface, padding: Spacing.md, minHeight: 76,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
  },
  topicText: { flex: 1 },
  topicTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  topicMeta: { fontSize: 12, color: Colors.onSurfaceVariant },
}));
