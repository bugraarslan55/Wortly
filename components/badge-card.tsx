import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BorderRadius, Cards, Colors, Spacing } from '../constants/theme';
import { formatTurkishDate } from '../utils/achievements';
import { AppIcon } from './app-icon';
import { IconTile, ProgressBar } from './ui';
import type { BadgeView } from './use-achievements';

/** Tek rozet kartı: kazanıldı / kilitli durumları, koşul, gerçek ilerleme (hesaplanabiliyorsa). */
export function BadgeCard({ badge }: { badge: BadgeView }) {
  const hasProgress = badge.current !== null && badge.target !== null;
  // Tarih, rozetin bu cihazda İLK DOĞRULANDIĞI gündür; gerçek kazanılma anı olarak sunulmaz.
  const verifiedText = badge.verifiedAt ? `Bu cihazda ilk doğrulama: ${formatTurkishDate(badge.verifiedAt)}` : '';
  const statusText = badge.earned ? 'Kazanıldı' : 'Kilitli';

  return (
    <View
      style={[styles.card, badge.earned ? styles.cardEarned : styles.cardLocked]}
      accessible
      accessibilityLabel={
        `${badge.title}. ${statusText}. ${badge.condition}` +
        (badge.earned && verifiedText ? ` ${verifiedText}.` : '') +
        (!badge.earned && hasProgress ? ` İlerleme: ${badge.current}/${badge.target}.` : '') +
        (badge.detail ? ` ${badge.detail}.` : '')
      }
    >
      <View style={styles.tileWrap}>
        <IconTile name={badge.icon} size={52} tone={badge.earned ? 'gold' : 'soft'} />
        {!badge.earned && (
          <View style={styles.lock}>
            <AppIcon name="lock.fill" size={11} color={Colors.onPrimary} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, !badge.earned && styles.titleLocked]} numberOfLines={2}>{badge.title}</Text>
          <View style={[styles.chip, badge.earned ? styles.chipEarned : styles.chipLocked]}>
            {badge.earned && <AppIcon name="checkmark" size={11} color={Colors.success} />}
            <Text style={[styles.chipText, badge.earned ? styles.chipTextEarned : styles.chipTextLocked]} maxFontSizeMultiplier={1.3}>
              {badge.earned ? 'Kazanıldı' : 'Kilitli'}
            </Text>
          </View>
        </View>

        <Text style={styles.description}>{badge.earned ? badge.description : badge.condition}</Text>
        {badge.earned && verifiedText ? <Text style={styles.meta}>{verifiedText}</Text> : null}

        {!badge.earned && hasProgress && (
          <View style={styles.progress}>
            <View style={styles.progressBar}>
              <ProgressBar value={badge.current as number} max={badge.target as number} label={`${badge.title}: ${badge.current}/${badge.target}`} />
            </View>
            <Text style={styles.progressText} maxFontSizeMultiplier={1.4}>{badge.current}/{badge.target}</Text>
          </View>
        )}
        {!!badge.detail && !badge.earned && <Text style={styles.meta}>{badge.detail}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...Cards.surface, flexDirection: 'row', gap: Spacing.md, padding: Spacing.md },
  cardEarned: { borderColor: 'rgba(244, 211, 94, 0.7)' },
  cardLocked: { backgroundColor: Colors.surfaceContainerLowest },
  tileWrap: { alignSelf: 'flex-start' },
  lock: {
    position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.surfaceContainerLowest,
  },
  body: { flex: 1, gap: 6 },
  titleLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: Spacing.sm },
  title: { flexGrow: 1, flexShrink: 1, minWidth: 120, fontSize: 16, fontWeight: '700', color: Colors.primary },
  titleLocked: { color: Colors.onSurfaceVariant },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full,
  },
  chipEarned: { backgroundColor: Colors.successContainer },
  chipLocked: { backgroundColor: Colors.surfaceContainer },
  chipText: { fontSize: 11, fontWeight: '700' },
  chipTextEarned: { color: Colors.success },
  chipTextLocked: { color: Colors.onSurfaceVariant },
  description: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 18 },
  meta: { fontSize: 12, color: Colors.secondary, fontWeight: '600' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progressBar: { flex: 1 },
  progressText: { fontSize: 12, fontWeight: '700', color: Colors.onSurfaceVariant, minWidth: 36, textAlign: 'right' },
});
