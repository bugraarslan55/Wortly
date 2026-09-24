import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useUserStore } from '../../store';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { AppIcon } from '../../components/app-icon';

const TYPE_LABELS: Record<string, string> = {
  flashcard: 'Flashcard',
  yazma: 'Yazarak Tekrar',
  'dogru-yanlis': 'Doğru / Yanlış',
  'dinle-sec': 'Dinle ve Seç',
  'dinle-yaz': 'Dinle ve Yaz',
  cumle: 'Cümle Yazma',
  bosluk: 'Boşluk Doldurma',
};

export default function SonucScreen() {
  const router = useRouter();
  const { score, total, type } = useLocalSearchParams<{ score: string; total: string; type: string }>();
  const { profile, updateStreak } = useUserStore();

  const scoreNum = parseInt(score || '0');
  const totalNum = parseInt(total || '1');
  const percentage = totalNum > 0 ? (scoreNum / totalNum) * 100 : 0;

  useEffect(() => {
    updateStreak();
  }, []);

  const resultIcon = percentage >= 80 ? 'trophy.fill' : percentage >= 50 ? 'hand.thumbsup.fill' : 'arrow.clockwise';

  const getMessage = () => {
    if (percentage >= 80) return 'Mükemmel! Harika iş çıkardın.';
    if (percentage >= 50) return 'İyi gidiyorsun! Biraz daha pratik yap.';
    return 'Vazgeçme! Tekrar dene.';
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.resultIconBox}>
          <AppIcon name={resultIcon} size={38} color={Colors.secondary} />
        </View>

        {/* Alıştırma tipi */}
        <Text style={styles.typeLabel}>{TYPE_LABELS[type || ''] || 'Alıştırma'} Tamamlandı!</Text>

        {/* Score */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreNumber}>{scoreNum}</Text>
            <Text style={styles.scoreDivider}>/{totalNum}</Text>
          </View>
          <View style={styles.scoreRight}>
            <Text style={styles.scorePercent}>{Math.round(percentage)}%</Text>
            <Text style={styles.scoreMessage}>{getMessage()}</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <AppIcon name="checkmark.circle.fill" size={20} color={Colors.success} />
            <Text style={styles.statNumber}>{scoreNum}</Text>
            <Text style={styles.statLabel}>Doğru</Text>
          </View>
          <View style={styles.statBox}>
            <AppIcon name="xmark.circle.fill" size={20} color={Colors.error} />
            <Text style={styles.statNumber}>{totalNum - scoreNum}</Text>
            <Text style={styles.statLabel}>Yanlış</Text>
          </View>
          <View style={styles.statBox}>
            <AppIcon name="flame.fill" size={20} color={Colors.secondary} />
            <Text style={styles.statNumber}>{profile?.streak || 0}</Text>
            <Text style={styles.statLabel}>Seri</Text>
          </View>
        </View>

        {/* Message */}
        {percentage < 80 && (
          <View style={styles.tipBox}>
            <Text style={styles.tipText}>
              {totalNum - scoreNum} kelimeyi tekrar çalışmanı öneririz.
            </Text>
          </View>
        )}

        {/* Buttons */}
        <View style={styles.buttonGroup}>
          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => router.replace('/(tabs)' as any)}
            activeOpacity={0.85}
          >
            <Text style={styles.homeBtnText}>Ana Sayfaya Dön</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topicsBtn}
            onPress={() => router.replace('/(tabs)/konular' as any)}
            activeOpacity={0.8}
          >
            <Text style={styles.topicsBtnText}>Konulara Git</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.marginMain, gap: Spacing.lg },
  resultIconBox: {
    width: 72, height: 72, borderRadius: BorderRadius.xxl,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center', justifyContent: 'center',
  },
  typeLabel: { fontSize: 20, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  scoreCard: {
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: 24, padding: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, width: '100%', ...Shadows.level2,
  },
  scoreCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.golden, alignItems: 'center', justifyContent: 'center' },
  scoreNumber: { fontSize: 28, fontWeight: '700', color: Colors.primary },
  scoreDivider: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  scoreRight: { flex: 1 },
  scorePercent: { fontSize: 32, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  scoreMessage: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: Spacing.md, width: '100%' },
  statBox: {
    flex: 1, backgroundColor: Colors.surfaceContainerLowest, borderRadius: 16, padding: Spacing.md,
    alignItems: 'center', ...Shadows.level1,
  },
  statNumber: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 2 },
  tipBox: { backgroundColor: Colors.surfaceContainerLow, borderRadius: 12, padding: Spacing.md, width: '100%' },
  tipText: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 20 },
  buttonGroup: { width: '100%', gap: Spacing.sm },
  homeBtn: { backgroundColor: Colors.golden, borderRadius: BorderRadius.lg, height: 54, alignItems: 'center', justifyContent: 'center' },
  homeBtnText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  topicsBtn: { borderRadius: BorderRadius.lg, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.outlineVariant },
  topicsBtnText: { fontSize: 15, color: Colors.onSurfaceVariant, fontWeight: '600' },
});
