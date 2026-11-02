import React, { useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  flushPendingChanges, getPendingChangeCount, useSessionStore, useUserStore, useWordStore,
} from '../store';
import { useAuthStore } from '../store/auth';
import { Colors, Spacing, BorderRadius, Cards } from '../constants/theme';
import { AppIcon } from '../components/app-icon';
import { Card, IconTile, SecondaryButton, SectionTitle, SegmentedControl } from '../components/ui';
import { useAchievementViews } from '../components/use-achievements';
import { ReviewReminderCard } from '../components/review-reminder-card';
import { isReminderSupported } from '../utils/review-reminder';
import { Level } from '../types';
import {
  countLearnedWords, DAILY_GOAL_OPTIONS, getActiveStreak, normalizeDailyGoal, summarizeCompletedExercises,
} from '../utils/progress-stats';

const LEVELS: Level[] = ['A1', 'A2', 'B1'];
const LEVEL_DESCRIPTIONS: Record<Level, string> = {
  A1: 'Başlangıç',
  A2: 'Temel',
  B1: 'Orta',
};

function getInitials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 0) return parts.slice(0, 2).map(part => part[0]!.toLocaleUpperCase('tr-TR')).join('');
  return (email[0] ?? '?').toLocaleUpperCase('tr-TR');
}

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useUserStore();
  const { session, signOut } = useAuthStore();
  const words = useWordStore(state => state.words);
  const reviewStates = useWordStore(state => state.reviewStates);
  const sessions = useSessionStore(state => state.sessions);
  const scenarioResults = useSessionStore(state => state.scenarioResults);
  const sessionTotal = useSessionStore(state => state.sessionTotal);

  const { badges, earnedCount } = useAchievementViews();
  const email = session?.user?.email ?? '';
  const level: Level = profile?.level ?? 'A1';
  const displayName = profile?.name?.trim() || email.split('@')[0] || 'Öğrenci';
  const dailyGoal = normalizeDailyGoal(profile?.dailyGoal);
  const goalOptions = (DAILY_GOAL_OPTIONS as readonly number[]).includes(dailyGoal)
    ? [...DAILY_GOAL_OPTIONS]
    : [...DAILY_GOAL_OPTIONS, dailyGoal].sort((a, b) => a - b);

  // Tüm sayılar yerel gerçek veriden hesaplanır; veri yoksa 0 görünür.
  const learnedCount = useMemo(() => countLearnedWords(reviewStates, words), [reviewStates, words]);
  // Gerçek toplam buluttan sayılır; bilinmiyorsa (çevrimdışı/ilk açılış) yerel sayı "N+" olarak gösterilir.
  const currentUserId = session?.user?.id;
  const exercises = useMemo(
    () => summarizeCompletedExercises(
      sessionTotal && sessionTotal.userId === currentUserId ? sessionTotal.count : null,
      sessions,
      scenarioResults,
    ),
    [sessionTotal, currentUserId, sessions, scenarioResults],
  );
  const streak = getActiveStreak(profile?.streak, profile?.lastStudyDate);

  const handleGoalChange = (goal: number) => {
    if (goal === dailyGoal) return;
    void updateProfile({ dailyGoal: goal });
  };

  const handleLevelChange = (next: Level) => {
    if (next === level) return;
    Alert.alert(
      `Seviyeyi ${next} yap`,
      'Konular ve önerilen plan yeni seviyeye göre değişir. Kelime ilerlemen silinmez.',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Değiştir', onPress: () => { void updateProfile({ level: next }); } },
      ]
    );
  };

  const signingOutRef = useRef(false);

  const performSignOut = async () => {
    await signOut();
    router.replace('/auth' as any);
  };

  // Çıkışta yerel veri silinir. Buluta ulaşmamış değişiklik varsa kullanıcıyı uyar,
  // önce senkronize etmeyi öner; senkronize edilemezse çıkış yapma.
  const syncThenSignOut = async (userId: string) => {
    const remaining = await flushPendingChanges(userId).catch(() => -1);
    if (remaining === 0) {
      await performSignOut();
      return;
    }
    Alert.alert(
      'Senkronize edilemedi',
      'Bağlantı kurulamadığı için değişikliklerin buluta gönderilemedi ve çıkış yapılmadı. İnternet bağlantını kontrol edip tekrar dene.',
      [
        { text: 'Tamam', style: 'cancel' },
        { text: 'Yine de çık', style: 'destructive', onPress: () => { void performSignOut(); } },
      ]
    );
  };

  const handleSignOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    try {
      const userId = session?.user?.id;
      const pending = userId ? await getPendingChangeCount(userId).catch(() => 0) : 0;

      if (!userId || pending === 0) {
        Alert.alert(
          'Çıkış Yap',
          'Hesabından çıkış yapmak istiyor musun?',
          [
            { text: 'İptal', style: 'cancel' },
            { text: 'Çıkış Yap', style: 'destructive', onPress: () => { void performSignOut(); } },
          ]
        );
        return;
      }

      Alert.alert(
        'Senkronize edilmemiş değişiklikler',
        `${pending} değişiklik henüz buluta gönderilmedi. Şimdi çıkış yaparsan bu değişiklikler kaybolur.`,
        [
          { text: 'İptal', style: 'cancel' },
          { text: 'Senkronize et ve çık', onPress: () => { void syncThenSignOut(userId); } },
          { text: 'Yine de çık', style: 'destructive', onPress: () => { void performSignOut(); } },
        ]
      );
    } finally {
      signingOutRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
        >
          <AppIcon name="chevron.left" size={16} color={Colors.onSurfaceVariant} />
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profil başlığı */}
        <View style={styles.hero}>
          <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text style={styles.avatarText} maxFontSizeMultiplier={1.2}>
              {getInitials(profile?.name ?? '', email)}
            </Text>
          </View>
          <View style={styles.heroText}>
            <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
            {!!email && <Text style={styles.email} numberOfLines={1}>{email}</Text>}
            <View style={styles.levelPill}>
              <Text style={styles.levelPillText}>Almanca · {level}</Text>
            </View>
          </View>
        </View>

        {/* Öğrenme istatistikleri */}
        <View style={styles.statsRow}>
          <StatBox icon="checkmark.seal.fill" value={learnedCount} label="Öğrenilen kelime" />
          <StatBox icon="flame.fill" value={streak} label="Günlük seri" />
          <StatBox icon="chart.bar.fill" value={exercises.exact ? exercises.count : `${exercises.count}+`} label="Tamamlanan alıştırma" />
        </View>

        {/* Başarılarım */}
        <TouchableOpacity
          style={[Cards.surface, styles.achievementsRow]}
          onPress={() => router.push('/basarilarim' as any)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Başarılarım, ${badges.length} rozetten ${earnedCount} tanesi kazanıldı`}
          accessibilityHint="Rozetlerini ve ilerlemeni gösterir"
        >
          <IconTile name="medal" size={40} tone="gold" />
          <View style={styles.achievementsText}>
            <Text style={styles.prefLabel}>Başarılarım</Text>
            <Text style={styles.prefHint}>{earnedCount} / {badges.length} rozet kazanıldı</Text>
          </View>
          <AppIcon name="chevron.right" size={14} color={Colors.outline} />
        </TouchableOpacity>

        {/* Öğrenme tercihleri */}
        <SectionTitle>Öğrenme tercihleri</SectionTitle>
        <Card style={styles.card}>
          <Text style={styles.prefLabel}>Günlük hedef</Text>
          <Text style={styles.prefHint}>Her gün tekrar etmek istediğin kelime sayısı.</Text>
          <SegmentedControl
            options={goalOptions.map(goal => ({
              value: goal,
              label: String(goal),
              accessibilityLabel: `Günlük hedef ${goal} kelime`,
            }))}
            value={dailyGoal}
            onChange={handleGoalChange}
          />

          <View style={styles.divider} />

          <Text style={styles.prefLabel}>Seviye</Text>
          <Text style={styles.prefHint}>Konular ve plan seçtiğin seviyeye göre hazırlanır.</Text>
          <SegmentedControl
            options={LEVELS.map(item => ({
              value: item,
              label: item,
              sublabel: LEVEL_DESCRIPTIONS[item],
              accessibilityLabel: `Seviye ${item}, ${LEVEL_DESCRIPTIONS[item]}`,
            }))}
            value={level}
            onChange={handleLevelChange}
          />
        </Card>

        {/* Bildirimler */}
        <SectionTitle>Bildirimler</SectionTitle>
        {isReminderSupported ? (
          <ReviewReminderCard userId={session?.user?.id ?? null} />
        ) : (
          <Card style={styles.card}>
            <View style={styles.infoRow}>
              <IconTile name="bell.fill" size={40} />
              <View style={styles.infoText}>
                <Text style={styles.prefLabel}>Günlük tekrar bildirimi</Text>
                <Text style={styles.prefHint}>
                  Bu ortamda (Android Expo Go) bildirimler desteklenmiyor. Development build veya mağaza sürümünde kullanılabilir.
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Hesap */}
        <SectionTitle>Hesap</SectionTitle>
        <SecondaryButton label="Çıkış Yap" onPress={handleSignOut} tone="danger" />
        {!!email && <Text style={styles.signedInAs} numberOfLines={1}>{email} olarak giriş yapıldı</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({ icon, value, label }: { icon: string; value: number | string; label: string }) {
  return (
    <View style={[Cards.surface, styles.statBox]} accessible accessibilityLabel={`${label}: ${value}`}>
      <IconTile name={icon} size={34} />
      <Text style={styles.statValue} maxFontSizeMultiplier={1.3}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: {
    minHeight: 56,
    paddingHorizontal: Spacing.marginMain,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: { minWidth: 72, minHeight: Spacing.touchTargetMin, flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm, paddingBottom: Spacing.xl, gap: Spacing.md },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.lg,
    backgroundColor: Colors.navy, borderRadius: BorderRadius.xxl, borderCurve: 'continuous',
    boxShadow: '0 8px 22px rgba(26, 31, 43, 0.2)',
  },
  heroText: { flex: 1, gap: 2 },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.golden,
    alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(244, 211, 94, 0.35)',
  },
  avatarText: { fontSize: 26, fontWeight: '700', color: Colors.navy },
  name: { fontSize: 21, lineHeight: 27, fontWeight: '700', color: Colors.onPrimary },
  email: { fontSize: 13, color: '#B8BCC8' },
  levelPill: {
    alignSelf: 'flex-start', marginTop: Spacing.sm, backgroundColor: 'rgba(244, 211, 94, 0.16)',
    paddingHorizontal: 12, paddingVertical: 4, borderRadius: BorderRadius.full,
  },
  levelPillText: { fontSize: 12, fontWeight: '700', color: Colors.golden },

  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statBox: { flex: 1, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: Colors.primary },
  // İki satıra inen etiket diğer kartlardaki sayıların hizasını bozmasın.
  statLabel: { fontSize: 11, lineHeight: 14, minHeight: 28, color: Colors.onSurfaceVariant, textAlign: 'center' },

  card: { gap: Spacing.sm },
  prefLabel: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  prefHint: { fontSize: 12, color: Colors.onSurfaceVariant, lineHeight: 17, marginBottom: 4 },
  divider: { height: 1, backgroundColor: Cards.borderColor, marginVertical: Spacing.sm },
  achievementsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, minHeight: 64 },
  achievementsText: { flex: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  infoText: { flex: 1, gap: 2 },
  signedInAs: { fontSize: 12, color: Colors.onSurfaceVariant, textAlign: 'center' },
});
