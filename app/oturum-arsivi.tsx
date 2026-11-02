import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card } from '../components/ui';
import { Spacing } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import { loadArchivedSessions } from '../store';
import { useAuthStore } from '../store/auth';
import { QuizSession } from '../types';
import { paginate } from '../utils/legacy-restore';
import { goBack } from '../utils/safe-back';

const PAGE_SIZE = 20;

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Cihazdaki 100 kayıt sınırına sığmayan, kullanıcının KENDİ onayıyla hesabına bağladığı eski çalışma kayıtları.
 * Salt okunur: yalnızca bu hesabın arşivi gösterilir; hiçbir şey eklenmez/silinmez; istatistik, görev ve rozetlere sayılmaz.
 */
export default function SessionArchiveScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const userId = useAuthStore(state => state.session?.user?.id ?? null);
  const [items, setItems] = useState<QuizSession[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setFailed(false);
    if (!userId) { setItems([]); return; }
    try {
      setItems(await loadArchivedSessions(userId));
    } catch {
      setFailed(true);
      setItems([]);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const view = paginate(items ?? [], page, PAGE_SIZE);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => goBack(router, '/profile')} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Geri">
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title} accessibilityRole="header">Arşivlenmiş çalışma kayıtları</Text>
        <Text style={styles.subtitle}>
          Cihazdaki 100 kayıt sınırı nedeniyle listene sığmayan eski kayıtların burada güvende. Yalnızca bu hesabın kayıtları gösterilir; istatistik, günlük görev ve rozetlere sayılmazlar.
        </Text>

        {items === null && <ActivityIndicator color={colors.primary} />}
        {failed && <Text style={styles.error} accessibilityLiveRegion="polite">Arşiv okunamadı. Kayıtların silinmedi; lütfen tekrar dene.</Text>}
        {items !== null && !failed && items.length === 0 && (
          <Text style={styles.subtitle} accessibilityLiveRegion="polite">Arşivde kayıt yok.</Text>
        )}

        {view.items.map(item => (
          <Card key={item.id} style={styles.item}>
            <Text style={styles.itemTitle}>{item.type}</Text>
            <Text style={styles.itemMeta}>{formatDate(item.date)} · {item.score}/{item.total}</Text>
          </Card>
        ))}

        {view.hasMore && (
          <TouchableOpacity style={styles.more} onPress={() => setPage(current => current + 1)} accessibilityRole="button">
            <Text style={styles.moreText}>Daha fazla göster ({view.total - view.items.length} kayıt daha)</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  topBar: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  backButton: { minHeight: Spacing.touchTargetMin, justifyContent: 'center', alignSelf: 'flex-start' },
  backText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  subtitle: { fontSize: 13, color: Colors.onSurfaceVariant, lineHeight: 19 },
  error: { fontSize: 13, color: Colors.error, fontWeight: '600' },
  item: { padding: Spacing.md, gap: 2 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  itemMeta: { fontSize: 12, color: Colors.onSurfaceVariant },
  more: { minHeight: Spacing.touchTargetMin, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
}));
