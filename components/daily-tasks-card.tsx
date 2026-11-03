import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BorderRadius, Colors, Spacing } from '../constants/theme';
import { AppIcon } from './app-icon';
import { Card, IconTile, ProgressBar } from './ui';
import { useDailyTasks } from './use-achievements';

/** Ana Sayfa "Günlük Görevler": yalnızca gerçek öğrenme verisinden hesaplanır, Türkiye gününe göre yenilenir. */
export function DailyTasksCard() {
  const router = useRouter();
  const tasks = useDailyTasks();
  const doneCount = tasks.filter(task => task.completed).length;
  const allDone = doneCount === tasks.length;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>GÜNLÜK GÖREVLER</Text>
          <Text style={styles.title} accessibilityRole="header">
            {allDone ? 'Bugünkü görevlerin tamam!' : `${doneCount}/${tasks.length} görev tamamlandı`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.link}
          onPress={() => router.push('/basarilarim' as any)}
          activeOpacity={0.8}
          accessibilityRole="link"
          accessibilityLabel="Başarılarım"
          accessibilityHint="Rozetlerini ve ilerlemeni gösterir"
        >
          <AppIcon name="medal" size={15} color={Colors.secondary} />
          <Text style={styles.linkText}>Başarılarım</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {tasks.map(task => (
          <View
            key={task.id}
            style={[styles.row, task.completed && styles.rowDone]}
            accessible
            accessibilityLabel={
              `${task.title}. ${task.completed ? 'Tamamlandı' : `${task.current}/${task.target} tamamlandı`}. ${task.description}`
            }
          >
            <IconTile name={task.completed ? 'checkmark.circle.fill' : task.icon} size={40} tone={task.completed ? 'gold' : 'soft'} />
            <View style={styles.rowBody}>
              <View style={styles.rowTitleLine}>
                <Text style={[styles.rowTitle, task.completed && styles.rowTitleDone]}>{task.title}</Text>
                <Text style={styles.rowCount} maxFontSizeMultiplier={1.4}>{task.current}/{task.target}</Text>
              </View>
              <Text style={styles.rowDescription}>{task.description}</Text>
              {!!task.detail && <Text style={styles.rowDetail}>{task.detail}</Text>}
              <ProgressBar
                value={task.current}
                max={task.target}
                tone={task.completed ? 'success' : 'gold'}
                label={`${task.title}: ${task.current}/${task.target}`}
              />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.sm + 2 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: Spacing.sm },
  headerText: { flexGrow: 1, flexShrink: 1, minWidth: 160, gap: 2 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: Colors.secondary },
  title: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  link: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: Spacing.touchTargetMin, paddingLeft: Spacing.sm,
  },
  linkText: { fontSize: 13, fontWeight: '700', color: Colors.secondary },
  list: { gap: Spacing.sm },
  row: {
    flexDirection: 'row', gap: Spacing.sm + 4, padding: Spacing.sm + 4,
    backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.lg, borderCurve: 'continuous',
  },
  rowDone: { backgroundColor: Colors.successContainer },
  rowBody: { flex: 1, gap: 6 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.primary },
  rowTitleDone: { color: Colors.success },
  rowCount: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceVariant, fontVariant: ['tabular-nums'] },
  rowDescription: { fontSize: 12, color: Colors.onSurfaceVariant, lineHeight: 17 },
  rowDetail: { fontSize: 12, fontWeight: '600', color: Colors.secondary },
});
