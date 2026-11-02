import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useWordStore } from '../store';
import { IconTile } from './ui';
import { Cards, Colors, Spacing } from '../constants/theme';
import {
  cleanupKeptRecordings, cleanupOrphanRecordings, scanOrphanRecordings,
} from '../utils/pronunciation-storage';
import { EMPTY_REPORT, formatBytes, type OrphanReport } from '../utils/pronunciation-cleanup';
import { makeIsKnownWordId } from '../utils/known-words';
import { isStaticWordId } from '../utils/static-word-ids';

/**
 * Profil > Kayıt depolama. Yalnızca kullanılmayan telaffuz kaydı varsa görünür ve hiçbir şeyi KENDİLİĞİNDEN silmez:
 * tarama yalnızca raporlar, silme açık kullanıcı onayıyla yapılır. Başka kullanıcıların kayıtları listelenmez/silinmez.
 */
export function RecordingStorageCard({ userId }: { userId: string | null }) {
  const words = useWordStore(state => state.words);
  const wordsLoaded = useWordStore(state => state.isLoaded);
  const [report, setReport] = useState<OrphanReport>(EMPTY_REPORT);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const scan = useCallback(async () => {
    if (!userId || Platform.OS === 'web') return;
    try {
      const next = await scanOrphanRecordings({
        userId,
        isKnownWordId: makeIsKnownWordId(words, isStaticWordId),
        wordsReliable: wordsLoaded,
      });
      setReport(next);
    } catch {
      setReport(EMPTY_REPORT);
    }
  }, [userId, words, wordsLoaded]);

  useFocusEffect(useCallback(() => { void scan(); }, [scan]));
  useEffect(() => { setMessage(''); }, [userId]);

  if (!userId || Platform.OS === 'web' || (report.count === 0 && report.keptCount === 0 && !message)) return null;

  const confirmCleanup = () => {
    if (busy || report.count === 0) return;
    Alert.alert(
      'Kullanılmayan kayıtları sil',
      `${report.count} telaffuz kaydı (${formatBytes(report.bytes)}) silinecek. Bunlar silinmiş kelimelere ait ya da hiçbir kelimeyle ilişkili olmayan, yalnızca bu cihazda saklanan kayıtlardır. Bu işlem geri alınamaz.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void cleanupOrphanRecordings(userId, report)
              .then((deleted) => setMessage(`${deleted} kayıt silindi.`))
              .catch(() => setMessage('Kayıtlar silinemedi. Lütfen tekrar dene.'))
              .finally(() => { setBusy(false); void scan(); });
          },
        },
      ],
    );
  };

  const confirmKeptCleanup = () => {
    if (busy || report.keptCount === 0) return;
    Alert.alert(
      'Sakladığın kayıtları sil',
      `Kelimesini sildiğin halde sakladığın ${report.keptCount} telaffuz kaydı (${formatBytes(report.keptBytes)}) silinecek. Bu işlem geri alınamaz.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sakladıklarımı sil',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void cleanupKeptRecordings(userId, report)
              .then((deleted) => setMessage(`${deleted} kayıt silindi.`))
              .catch(() => setMessage('Kayıtlar silinemedi. Lütfen tekrar dene.'))
              .finally(() => { setBusy(false); void scan(); });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <IconTile name="mic.fill" size={40} />
        <View style={styles.textBox}>
          <Text style={styles.label}>Kayıt depolama</Text>
          {report.count > 0 ? (
            <Text style={styles.hint}>
              {report.count} kullanılmayan telaffuz kaydı ({formatBytes(report.bytes)}) yer kaplıyor. Hiçbiri sen onaylamadan silinmez.
            </Text>
          ) : null}
        </View>
      </View>
      {report.count > 0 && (
        <TouchableOpacity
          style={[styles.btn, busy && styles.disabled]}
          onPress={confirmCleanup}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Kullanılmayan telaffuz kayıtlarını sil"
        >
          <Text style={styles.btnText}>Temizle</Text>
        </TouchableOpacity>
      )}
      {report.keptCount > 0 && (
        <View style={styles.keptBox}>
          <Text style={styles.label}>Sakladığın kayıtlar</Text>
          <Text style={styles.hint}>
            Kelimesini sildiğin halde bilerek sakladığın {report.keptCount} kayıt ({formatBytes(report.keptBytes)}).
            Bunlar otomatik silinmez ve yukarıdaki temizliğe dahil edilmez.
          </Text>
          <TouchableOpacity
            style={[styles.btnOutline, busy && styles.disabled]}
            onPress={confirmKeptCleanup}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Sakladığım telaffuz kayıtlarını sil"
          >
            <Text style={styles.btnOutlineText}>Sakladıklarımı sil</Text>
          </TouchableOpacity>
        </View>
      )}
      {!!message && <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...Cards.surface, width: '100%', padding: Spacing.md, gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  textBox: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  hint: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
  btn: { alignSelf: 'flex-start', minHeight: Spacing.touchTargetMin, paddingHorizontal: 20, borderRadius: 999, backgroundColor: Colors.golden, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  disabled: { opacity: 0.55 },
  keptBox: { gap: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.outlineVariant },
  btnOutline: { alignSelf: 'flex-start', minHeight: Spacing.touchTargetMin, paddingHorizontal: 20, borderRadius: 999, borderWidth: 1.5, borderColor: Colors.errorContainer, alignItems: 'center', justifyContent: 'center' },
  btnOutlineText: { fontSize: 14, fontWeight: '600', color: Colors.error },
  message: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '600' },
});
