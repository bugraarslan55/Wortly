import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUserStore } from '../../store';
import {
  getScenariosForLevel, isScenarioLevelLocked, Scenario, SCENARIO_LEVELS,
} from '../../constants/scenarios';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Level } from '../../types';
import { AppIcon } from '../../components/app-icon';

export default function ScenariosScreen() {
  const router = useRouter();
  const { profile } = useUserStore();
  const userLevel: Level = SCENARIO_LEVELS.includes(profile?.level as Level) ? (profile!.level as Level) : 'A1';
  const [activeLevel, setActiveLevel] = useState<Level>(userLevel);
  const [lockedNotice, setLockedNotice] = useState('');

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const handleLevelPress = (level: Level) => {
    if (isScenarioLevelLocked(level, userLevel)) {
      setLockedNotice(`${level} senaryoları kilitli. Önce seviyeni ${level} olarak yükseltmelisin.`);
      return;
    }
    setLockedNotice('');
    setActiveLevel(level);
  };

  const shownLevel = isScenarioLevelLocked(activeLevel, userLevel) ? userLevel : activeLevel;
  const scenarios = getScenariosForLevel(shownLevel);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Gerçek Hayat</Text>
        <Text style={styles.subtitle}>Almancayı gerçek konuşmalarla pratik et.</Text>
      </View>

      <View style={styles.levelTabs}>
        {SCENARIO_LEVELS.map(level => {
          const locked = isScenarioLevelLocked(level, userLevel);
          const active = shownLevel === level;
          return (
            <TouchableOpacity
              key={level}
              style={[styles.levelTab, active && styles.levelTabActive, locked && styles.levelTabLocked]}
              onPress={() => handleLevelPress(level)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: locked }}
              accessibilityLabel={locked ? `${level} seviyesi kilitli` : `${level} seviyesi`}
            >
              <Text style={[styles.levelTabText, active && styles.levelTabTextActive, locked && styles.levelTabTextLocked]}>
                {level}
              </Text>
              {locked && <AppIcon name="lock.fill" size={11} color={Colors.outline} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {!!lockedNotice && (
        <Text style={styles.notice} accessibilityLiveRegion="polite">{lockedNotice}</Text>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {scenarios.map(scenario => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            onPress={() => router.push(`/senaryolar/${scenario.id}` as any)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ScenarioCard({ scenario, onPress }: { scenario: Scenario; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${scenario.title}, ${scenario.place}, ${scenario.level}, ${scenario.steps.length} adım`}
    >
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{scenario.title}</Text>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{scenario.level}</Text>
          </View>
        </View>
        <Text style={styles.cardDesc}>{scenario.description}</Text>
        <View style={styles.metaRow}>
          <AppIcon name="mappin.and.ellipse" size={12} color={Colors.secondary} />
          <Text style={styles.metaText}>{scenario.place}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{scenario.steps.length} adım</Text>
        </View>
      </View>
      <AppIcon name="chevron.right" size={14} color={Colors.outline} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  topBar: { paddingHorizontal: Spacing.marginMain, height: 48, justifyContent: 'center' },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  header: { paddingHorizontal: Spacing.marginMain, paddingBottom: Spacing.md },
  title: { fontSize: 24, fontWeight: '700', color: Colors.primary },
  subtitle: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
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
  notice: {
    marginHorizontal: Spacing.marginMain, marginBottom: Spacing.sm,
    fontSize: 12, fontWeight: '600', color: Colors.error, lineHeight: 17,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: 40, gap: Spacing.sm },
  card: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.xl,
    padding: Spacing.md, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: Spacing.md, ...Shadows.level1,
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: Colors.primary },
  levelBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.md,
    backgroundColor: Colors.secondaryContainer,
  },
  levelBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.onSecondaryContainer },
  cardDesc: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metaText: { fontSize: 12, color: Colors.onSurfaceVariant },
  metaDot: { fontSize: 12, color: Colors.outlineVariant },
});
