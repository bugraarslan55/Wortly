import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useUserStore, useSessionStore, useWordStore } from '../../store';
import { Colors, Spacing, BorderRadius } from '../../constants/theme';
import { AppIcon } from '../../components/app-icon';
import { Card, IconTile, PrimaryButton, SecondaryButton } from '../../components/ui';
import { getActiveStreak } from '../../utils/progress-stats';
import { getReviewState } from '../../utils/spaced-repetition';
import { ALL_TOPICS } from '../../constants/topics';

const TYPE_LABELS: Record<string, string> = {
  flashcard: 'Flashcard',
  yazma: 'Yazarak Tekrar',
  'dogru-yanlis': 'Doğru / Yanlış',
  'dinle-sec': 'Dinle ve Seç',
  'dinle-yaz': 'Dinle ve Yaz',
  cumle: 'Cümle Yazma',
  bosluk: 'Boşluk Doldurma',
};

// Aynı alıştırmayı yeniden başlatabilen türler ve rotaları.
const RESTART_ROUTES: Record<string, string> = {
  yazma: '/alistirma/yazma',
  'dogru-yanlis': '/alistirma/dogru-yanlis',
  'dinle-sec': '/alistirma/dinle-sec',
  'dinle-yaz': '/alistirma/dinle-yaz',
  cumle: '/alistirma/cumle',
};
const RETRY_WRONG_TYPES = new Set(['dinle-sec', 'dinle-yaz', 'yazma', 'dogru-yanlis', 'cumle']);

function getMessage(percentage: number) {
  if (percentage >= 90) return 'Harika bir sonuç. Bu kelimeler artık yerine oturuyor.';
  if (percentage >= 70) return 'İyi iş. Küçük bir tekrarla pekiştirebilirsin.';
  if (percentage >= 50) return 'Fena değil. Yanlışları tekrar çalışmak işe yarar.';
  return 'Zor bir tur oldu. Kelimeleri biraz daha tekrar edip yeniden dene.';
}

export default function SonucScreen() {
  const router = useRouter();
  const { score, total, type, topicId, wrongIds } = useLocalSearchParams<{
    score: string;
    total: string;
    type: string;
    topicId?: string;
    wrongIds?: string;
  }>();
  const { profile, updateStreak } = useUserStore();
  const { reviewStates, words } = useWordStore();
  const sessions = useSessionStore(state => state.sessions);

  const totalNum = Math.max(0, parseInt(total || '0', 10) || 0);
  const scoreNum = Math.min(totalNum, Math.max(0, parseInt(score || '0', 10) || 0));
  const wrongNum = totalNum - scoreNum;
  const percentage = totalNum > 0 ? Math.round((scoreNum / totalNum) * 100) : 0;
  const typeKey = type || '';
  const canRetryWrongAnswers = RETRY_WRONG_TYPES.has(typeKey) && Boolean(wrongIds);
  const restartRoute = RESTART_ROUTES[typeKey];
  const hasTopic = Boolean(topicId);

  useEffect(() => {
    void updateStreak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Öğrenme ilerlemesi: bu çalışmanın kelimelerinden kaçı "Bilinçli" (2) veya "Öğrenildi" (3)
  // düzeyinde. Yalnızca bu sonuca ait kayıtlı oturumdan ve gerçek mastery verisinden hesaplanır.
  const progress = useMemo(() => {
    const session = sessions.find(
      item => item.type === typeKey && item.score === scoreNum && item.total === totalNum,
    );
    if (!session) return null;
    const pool = new Map(ALL_TOPICS.flatMap(topic => topic.words).map(word => [word.id, word]));
    for (const word of words) pool.set(word.id, word);
    const sessionWords = Array.from(new Set(session.wordIds))
      .map(id => pool.get(id))
      .filter((word): word is NonNullable<typeof word> => Boolean(word));
    if (sessionWords.length === 0) return null;
    const strong = sessionWords.filter(word => getReviewState(word, reviewStates).masteryLevel >= 2).length;
    return { strong, count: sessionWords.length };
  }, [sessions, words, reviewStates, typeKey, scoreNum, totalNum]);

  const streak = getActiveStreak(profile?.streak, profile?.lastStudyDate);
  const resultIcon = percentage >= 80 ? 'trophy.fill' : percentage >= 50 ? 'hand.thumbsup.fill' : 'arrow.clockwise';

  const retryWrongAnswers = () => {
    if (!canRetryWrongAnswers) return;
    router.replace({
      pathname: RESTART_ROUTES[typeKey],
      params: { ...(topicId ? { topicId } : {}), wordIds: wrongIds },
    } as any);
  };

  const restart = () => {
    if (!restartRoute) return;
    router.replace({ pathname: restartRoute, params: topicId ? { topicId } : {} } as any);
  };

  const goBackToTopic = () => {
    router.replace((hasTopic ? `/konu/${topicId}/alistirma` : '/(tabs)/kelimelerim') as any);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <IconTile name={resultIcon} size={72} />
        <Text style={styles.typeLabel} accessibilityRole="header">
          {TYPE_LABELS[typeKey] || 'Alıştırma'} tamamlandı
        </Text>

        <Card style={styles.scoreCard}>
          <View style={styles.scoreCircle} accessible accessibilityLabel={`${totalNum} sorudan ${scoreNum} doğru`}>
            <Text style={styles.scoreNumber} maxFontSizeMultiplier={1.2}>{scoreNum}</Text>
            <Text style={styles.scoreOf} maxFontSizeMultiplier={1.2}>/{totalNum}</Text>
          </View>
          <View style={styles.scoreRight}>
            <Text style={styles.scorePercent} accessibilityLabel={`Başarı yüzde ${percentage}`}>%{percentage}</Text>
            <Text style={styles.scoreMessage}>{getMessage(percentage)}</Text>
          </View>
        </Card>

        <View style={styles.statsRow}>
          <Card style={styles.statBox}>
            <AppIcon name="checkmark.circle.fill" size={20} color={Colors.success} />
            <Text style={styles.statNumber}>{scoreNum}</Text>
            <Text style={styles.statLabel}>Doğru</Text>
          </Card>
          <Card style={styles.statBox}>
            <AppIcon name="xmark.circle.fill" size={20} color={Colors.error} />
            <Text style={styles.statNumber}>{wrongNum}</Text>
            <Text style={styles.statLabel}>Yanlış</Text>
          </Card>
          <Card style={styles.statBox}>
            <AppIcon name="flame.fill" size={20} color={Colors.secondary} />
            <Text style={styles.statNumber}>{streak}</Text>
            <Text style={styles.statLabel}>Günlük seri</Text>
          </Card>
        </View>

        {progress && (
          <View style={styles.progressBox} accessibilityLiveRegion="polite">
            <Text style={styles.progressTitle}>Öğrenme ilerlemesi</Text>
            <Text style={styles.progressText}>
              Bu çalışmadaki {progress.count} kelimeden {progress.strong} tanesi “Bilinçli” veya “Öğrenildi” düzeyinde.
            </Text>
          </View>
        )}

        {wrongNum > 0 && percentage < 80 && (
          <View style={styles.tipBox}>
            <Text style={styles.tipText}>{wrongNum} kelimeyi tekrar çalışmanı öneririz.</Text>
          </View>
        )}

        <View style={styles.buttonGroup}>
          {canRetryWrongAnswers && (
            <PrimaryButton label="Yanlışları Tekrarla" onPress={retryWrongAnswers} />
          )}
          {restartRoute && (
            canRetryWrongAnswers
              ? <SecondaryButton label="Baştan Çalış" onPress={restart} />
              : <PrimaryButton label="Tekrar Çalış" onPress={restart} />
          )}
          <SecondaryButton label={hasTopic ? 'Konuya Dön' : 'Kelimelerime Dön'} onPress={goBackToTopic} />
          <SecondaryButton label="Ana Sayfa" onPress={() => router.replace('/(tabs)' as any)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  container: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.marginMain, paddingVertical: Spacing.lg, gap: Spacing.md,
  },
  typeLabel: { fontSize: 22, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, width: '100%' },
  scoreCircle: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: Colors.golden,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row',
  },
  scoreNumber: { fontSize: 28, fontWeight: '700', color: Colors.primary },
  scoreOf: { fontSize: 13, color: Colors.primary, fontWeight: '600', marginTop: 8 },
  scoreRight: { flex: 1, gap: 2 },
  scorePercent: { fontSize: 30, fontWeight: '700', color: Colors.primary },
  scoreMessage: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: Spacing.sm, width: '100%' },
  statBox: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm },
  statNumber: { fontSize: 22, fontWeight: '700', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.onSurfaceVariant, textAlign: 'center' },
  progressBox: {
    width: '100%', backgroundColor: Colors.successContainer, borderRadius: BorderRadius.lg,
    padding: Spacing.md, gap: 2,
  },
  progressTitle: { fontSize: 13, fontWeight: '700', color: Colors.success },
  progressText: { fontSize: 13, color: Colors.primary, lineHeight: 19 },
  tipBox: { width: '100%', backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.lg, padding: Spacing.md },
  tipText: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 19 },
  buttonGroup: { width: '100%', gap: Spacing.sm, marginTop: Spacing.sm },
});
