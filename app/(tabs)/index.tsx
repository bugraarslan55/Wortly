import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUserStore, useWordStore } from '../../store';
import { getTopicsForLevel } from '../../constants/topics';
import { topicSymbol } from '../../constants/symbols';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { AppIcon } from '../../components/app-icon';

export default function HomeScreen() {
  const router = useRouter();
  const { profile } = useUserStore();
  const { words } = useWordStore();

  const topics = useMemo(() => getTopicsForLevel(profile?.level || 'A1'), [profile?.level]);

  // Günlük ilerleme: bugün tekrar edilen (lastReviewed=bugün) benzersiz kişisel kelime sayısı.
  const todayCount = useMemo(() => {
    const todayStr = new Date().toDateString();
    const seen = new Set<string>();
    for (const w of words) {
      if (w.isCustom && w.lastReviewed && new Date(w.lastReviewed).toDateString() === todayStr) {
        seen.add(w.id);
      }
    }
    return seen.size;
  }, [words]);
  const dailyGoal = profile?.dailyGoal || 10;
  const progress = dailyGoal > 0 ? Math.min(todayCount / dailyGoal, 1) : 0;

  const customWordCount = words.filter(w => w.isCustom).length;
  const greeting = getGreeting();
  const firstName = profile?.name?.split(' ')[0] || 'Öğrenci';

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Günaydın';
    if (h < 18) return 'İyi günler';
    return 'İyi akşamlar';
  }

  const dailyTopics = topics.slice(0, 3);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>{greeting}, {firstName}</Text>
          <Text style={styles.greetingSubtext}>Bugün Almanca için güzel bir gün.</Text>
        </View>
        <View style={styles.levelBadge}>
          <Text style={styles.levelBadgeText}>{profile?.level || 'A1'}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress Card */}
        <View style={styles.card}>
          <View style={styles.progressRow}>
            {/* Progress Ring */}
            <View style={styles.ringContainer}>
              <View style={styles.ringCenter}>
                <Text style={styles.ringNumber}>{todayCount}</Text>
                <Text style={styles.ringLabel}>/ {dailyGoal}</Text>
              </View>
              {/* Visual ring via border trick */}
              <View style={[
                styles.ringOuter,
                { borderColor: Colors.secondaryFixedDim }
              ]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.progressTitle}>Günlük Hedef</Text>
              <View style={styles.streakRow}>
                <AppIcon name="flame.fill" size={14} color={Colors.secondary} />
                <Text style={styles.streakText}>{profile?.streak || 0} günlük seri</Text>
              </View>
              <Text style={styles.progressDesc}>
                Bugün {todayCount} kelime tekrar ettin.
              </Text>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => router.push('/konular' as any)}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.startBtnText}>Bugünkü Çalışmaya Başla</Text>
          </TouchableOpacity>
        </View>

        {/* Kelimelerimle Çalış */}
        {customWordCount > 0 && (
          <TouchableOpacity
            style={styles.customCard}
            onPress={() => router.push('/kelime/calis' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.customLeft}>
              <View style={styles.customIconBox}>
                <AppIcon name="text.book.closed.fill" size={18} color={Colors.secondary} />
              </View>
              <View>
                <Text style={styles.customTitle}>Kelimelerimle Çalış</Text>
                <Text style={styles.customDesc}>{customWordCount} kişisel kelimenle alıştırma yap</Text>
              </View>
            </View>
            <AppIcon name="chevron.right" size={14} color={Colors.outline} />
          </TouchableOpacity>
        )}

        {/* Bugünün Konuları */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Konular — {profile?.level}</Text>
          <View style={styles.topicsGrid}>
            {dailyTopics.map((topic) => (
              <TouchableOpacity
                key={topic.id}
                style={styles.topicCard}
                onPress={() => router.push(`/konu/${topic.id}/alistirma` as any)}
                activeOpacity={0.85}
              >
                <View style={styles.topicIconBox}>
                  <AppIcon name={topicSymbol(topic.id)} size={22} color={Colors.secondary} />
                </View>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                <Text style={styles.topicCount}>{topic.wordCount} kelime</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Seviye Bilgisi */}
        <View style={styles.levelCard}>
          <Text style={styles.levelCardTitle}>Seviyeni Keşfet</Text>
          <Text style={styles.levelCardDesc}>
            {profile?.level === 'A1' && 'Temel kelimelerden başlıyorsun. Harika bir yolculuk!'}
            {profile?.level === 'A2' && 'Günlük konuşmaya hazır kelimeler öğreniyorsun.'}
          </Text>
          <View style={styles.levelDots}>
            {['A1', 'A2'].map(l => (
              <View
                key={l}
                style={[
                  styles.levelDot,
                  l === profile?.level && styles.levelDotActive,
                ]}
              >
                <Text style={[
                  styles.levelDotText,
                  l === profile?.level && styles.levelDotTextActive,
                ]}>{l}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  greeting: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  greetingSubtext: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  levelBadge: {
    backgroundColor: Colors.navy, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  levelBadgeText: { color: Colors.golden, fontWeight: '700', fontSize: 13 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingBottom: 100, gap: Spacing.md },

  // Progress Card
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24, padding: Spacing.lg, ...Shadows.level1, gap: Spacing.md,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  ringContainer: { width: 80, height: 80, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  ringOuter: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    borderWidth: 8, borderColor: Colors.secondaryFixedDim,
  },
  ringCenter: { alignItems: 'center' },
  ringNumber: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  ringLabel: { fontSize: 10, color: Colors.onSurfaceVariant },
  progressTitle: { fontSize: 16, fontWeight: '600', color: Colors.primary, marginBottom: 4 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  streakText: { fontSize: 12, fontWeight: '600', color: Colors.onSurfaceVariant },
  progressDesc: { fontSize: 13, color: Colors.onSurfaceVariant, marginBottom: 6 },
  progressBarTrack: { height: 6, borderRadius: 3, backgroundColor: Colors.surfaceContainer, overflow: 'hidden' },
  progressBarFill: { height: 6, borderRadius: 3, backgroundColor: Colors.secondaryFixedDim },
  startBtn: {
    backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, height: 50,
    alignItems: 'center', justifyContent: 'center',
  },
  startBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  // Custom Card
  customCard: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: 20, padding: Spacing.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    ...Shadows.level1, borderWidth: 1, borderColor: `${Colors.primary}0D`,
  },
  customLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  customIconBox: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryContainer, alignItems: 'center', justifyContent: 'center',
  },
  customTitle: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  customDesc: { fontSize: 12, color: Colors.onSurfaceVariant },
  arrow: { fontSize: 24, color: Colors.outlineVariant },

  // Section
  section: { gap: Spacing.sm },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  topicsGrid: { flexDirection: 'row', gap: Spacing.sm },
  topicCard: {
    flex: 1, backgroundColor: Colors.surfaceContainerLowest, borderRadius: 16,
    padding: Spacing.md, alignItems: 'center', ...Shadows.level1,
  },
  topicIconBox: {
    width: 40, height: 40, borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  topicTitle: { fontSize: 12, fontWeight: '600', color: Colors.primary, textAlign: 'center' },
  topicCount: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 2 },

  // Level card
  levelCard: {
    backgroundColor: Colors.primaryContainer, borderRadius: 20, padding: Spacing.lg,
  },
  levelCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.golden, marginBottom: 6 },
  levelCardDesc: { fontSize: 13, color: Colors.onPrimaryContainer, lineHeight: 20, marginBottom: Spacing.md },
  levelDots: { flexDirection: 'row', gap: Spacing.sm },
  levelDot: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: BorderRadius.full,
    borderWidth: 1.5, borderColor: Colors.onPrimaryContainer,
  },
  levelDotActive: { backgroundColor: Colors.golden, borderColor: Colors.golden },
  levelDotText: { fontSize: 12, fontWeight: '600', color: Colors.onPrimaryContainer },
  levelDotTextActive: { color: Colors.primary },
});
