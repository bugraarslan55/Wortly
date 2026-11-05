import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useUserStore, useWordStore } from '../../store';
import { getTopicsForLevel } from '../../constants/topics';
import { topicSymbol } from '../../constants/symbols';
import { Spacing, BorderRadius, getCards } from '../../constants/theme';
import { makeStyles, useColors } from '../../hooks/use-theme';
import { AppIcon } from '../../components/app-icon';
import { DailyPlanCard } from '../../components/daily-plan-card';
import { DailyTasksCard } from '../../components/daily-tasks-card';
import { useDayTick } from '../../components/use-achievements';
import { ProgressRing } from '../../components/progress-ring';
import { Card, IconTile, SectionTitle } from '../../components/ui';
import { countReviewedToday, getActiveStreak, normalizeDailyGoal } from '../../utils/progress-stats';
import { freshNow } from '../../utils/timestamps';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

export default function HomeScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const { profile } = useUserStore();
  const { words, reviewStates } = useWordStore();
  // Günlük Görevler ile aynı gün sınırı ve aynı "şimdi" kaynağı: gece yarısında ve arka plandan dönünce
  // halka, seri ve görevler birlikte yeni güne geçer.
  const now = useDayTick();

  const level = profile?.level || 'A1';
  const topics = useMemo(() => getTopicsForLevel(level), [level]);

  // Günlük ilerleme: bugün tekrar edilen benzersiz kelime (konu + kişisel kelimeler).
  // `now` açılışta/öne gelişte/gece yarısında yenilenir; cevap sonrası yazılan damgalar sayılsın diye gerçek saat.
  const todayCount = useMemo(
    () => countReviewedToday(reviewStates, words, new Date(freshNow(now))),
    [reviewStates, words, now],
  );
  const dailyGoal = normalizeDailyGoal(profile?.dailyGoal);
  const progress = Math.min(todayCount / dailyGoal, 1);
  const goalReached = todayCount >= dailyGoal;
  const streak = getActiveStreak(profile?.streak, profile?.lastStudyDate, new Date(now));

  const customWordCount = words.filter(w => w.isCustom).length;
  const firstName = profile?.name?.trim().split(/\s+/)[0] || 'Öğrenci';
  const dailyTopics = topics.slice(0, 3);

  const goalMessage = goalReached
    ? 'Bugünkü hedefini tamamladın. Harika!'
    : todayCount > 0
      ? `Hedefe ${dailyGoal - todayCount} kelime kaldı.`
      : 'Bugün henüz kelime tekrar etmedin.';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <View style={styles.topBarText}>
          <Text style={styles.greeting} numberOfLines={1}>{getGreeting()}, {firstName}</Text>
          <Text style={styles.greetingSubtext} numberOfLines={1}>Bugün Almanca için güzel bir gün.</Text>
        </View>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push('/profile' as any)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Profil, seviye ${level}`}
        >
          <AppIcon name="person.crop.circle.fill" size={24} color={colors.primary} />
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{level}</Text>
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Günlük hedef */}
        <Card style={styles.goalCard}>
          <View style={styles.goalRow}>
            <ProgressRing progress={progress} value={todayCount} total={dailyGoal} size={92} />
            <View style={styles.goalText}>
              <Text style={styles.cardEyebrow}>GÜNLÜK HEDEF</Text>
              <Text style={styles.goalMessage}>{goalMessage}</Text>
              <View style={[styles.streakChip, streak > 0 && styles.streakChipActive]}>
                <AppIcon name="flame.fill" size={13} color={streak > 0 ? colors.secondary : colors.outline} />
                <Text style={styles.streakText}>
                  {streak > 0 ? `${streak} günlük seri` : 'Seri başlamadı'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.goalDivider} />
          <TouchableOpacity
            style={styles.goalAdjust}
            onPress={() => router.push('/profile' as any)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Günlük hedef ${dailyGoal} kelime. Hedefi değiştir`}
            accessibilityHint="Profil ekranında günlük hedef ayarını açar"
          >
            <Text style={styles.goalAdjustLabel}>Hedef: {dailyGoal} kelime / gün</Text>
            <View style={styles.goalAdjustAction}>
              <Text style={styles.goalAdjustText}>Değiştir</Text>
              <AppIcon name="chevron.right" size={12} color={colors.secondary} />
            </View>
          </TouchableOpacity>
        </Card>

        {/* Günlük görevler: gerçek öğrenme verisinden, Türkiye gününe göre */}
        <DailyTasksCard />

        {/* Bugünkü plan: tek ana "Çalışmaya Başla" eylemi burada */}
        <DailyPlanCard />

        {/* Gerçek hayat senaryoları: öne çıkan çağrı kartı */}
        <TouchableOpacity
          style={styles.scenarioCard}
          onPress={() => router.push('/senaryolar' as any)}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Gerçek Hayat Senaryoları"
          accessibilityHint="Günlük konuşma senaryolarını açar"
        >
          <IconTile name="bubble.left.and.bubble.right.fill" size={44} tone="gold" />
          <View style={styles.scenarioText}>
            <Text style={styles.scenarioTitle}>Gerçek Hayat Senaryoları</Text>
            <Text style={styles.scenarioSubtitle}>Almancayı günlük konuşmalarla pratiğe dök.</Text>
          </View>
          <AppIcon name="chevron.right" size={14} color={colors.golden} />
        </TouchableOpacity>

        {customWordCount > 0 && (
          <TouchableOpacity
            style={styles.linkCard}
            onPress={() => router.push('/kelime/calis' as any)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Kelimelerimle Çalış"
          >
            <IconTile name="text.book.closed.fill" size={40} />
            <View style={styles.linkText}>
              <Text style={styles.linkTitle}>Kelimelerimle Çalış</Text>
              <Text style={styles.linkSubtitle}>{customWordCount} kişisel kelimenle alıştırma yap</Text>
            </View>
            <AppIcon name="chevron.right" size={14} color={colors.outline} />
          </TouchableOpacity>
        )}

        {/* Konular */}
        <View style={styles.section}>
          <SectionTitle
            action={{ label: 'Tümü', onPress: () => router.push('/konular' as any), accessibilityLabel: 'Tüm konuları gör' }}
          >
            {`Konular · ${level}`}
          </SectionTitle>
          {dailyTopics.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Bu seviye için henüz konu yok.</Text>
            </View>
          ) : (
            <View style={styles.topicsGrid}>
              {dailyTopics.map((topic) => (
                <TouchableOpacity
                  key={topic.id}
                  style={styles.topicCard}
                  onPress={() => router.push(`/konu/${topic.id}/alistirma` as any)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`${topic.title}, ${topic.wordCount} kelime`}
                >
                  <IconTile name={topicSymbol(topic.id)} size={44} />
                  <Text style={styles.topicTitle} numberOfLines={2}>{topic.title}</Text>
                  <Text style={styles.topicCount}>{topic.wordCount} kelime</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: Spacing.md, paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  topBarText: { flex: 1 },
  greeting: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: Colors.primary, letterSpacing: -0.3 },
  greetingSubtext: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },
  profileButton: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: getCards(Colors).borderColor,
    alignItems: 'center', justifyContent: 'center',
  },
  levelBadge: {
    position: 'absolute', right: -6, bottom: -4,
    backgroundColor: Colors.navy, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BorderRadius.full, borderWidth: 2, borderColor: Colors.warmWhite,
  },
  levelBadgeText: { color: Colors.golden, fontWeight: '700', fontSize: 10 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm, paddingBottom: 100, gap: Spacing.md },

  goalCard: { padding: 0, overflow: 'hidden' },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  goalText: { flex: 1, gap: 4 },
  cardEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: Colors.secondary },
  goalMessage: { fontSize: 15, fontWeight: '600', color: Colors.primary, lineHeight: 21 },
  streakChip: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  streakChipActive: { backgroundColor: Colors.secondaryContainer },
  streakText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  goalDivider: { height: 1, backgroundColor: getCards(Colors).borderColor },
  goalAdjust: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: Spacing.touchTargetMin, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow,
  },
  goalAdjustLabel: { fontSize: 13, color: Colors.onSurfaceVariant },
  goalAdjustAction: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  goalAdjustText: { fontSize: 13, fontWeight: '700', color: Colors.secondary },

  scenarioCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, minHeight: 76,
    backgroundColor: Colors.navy, borderRadius: BorderRadius.xl, borderCurve: 'continuous',
    boxShadow: '0 6px 18px rgba(26, 31, 43, 0.18)',
  },
  scenarioText: { flex: 1 },
  scenarioTitle: { fontSize: 16, fontWeight: '700', color: Colors.onNavy },
  scenarioSubtitle: { fontSize: 12, color: '#B8BCC8', marginTop: 2, lineHeight: 17 },

  linkCard: { ...getCards(Colors).surface, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, minHeight: 64 },
  linkText: { flex: 1 },
  linkTitle: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  linkSubtitle: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 1 },

  section: { gap: Spacing.xs },
  topicsGrid: { flexDirection: 'row', gap: Spacing.sm },
  topicCard: {
    ...getCards(Colors).surface, flex: 1, minHeight: 124,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  topicTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  topicCount: { fontSize: 11, color: Colors.onSurfaceVariant },
  emptyBox: { ...getCards(Colors).surface, padding: Spacing.lg, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.onSurfaceVariant },
}));
