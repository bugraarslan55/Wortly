import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { IconTile } from './ui';
import { Cards, Colors, Spacing } from '../constants/theme';
import { getLegacyOffer, LegacyOfferInfo, restoreLegacyRecords } from '../store';
import {
  describeRestoreOutcome, describeWaiting, HOLD_MESSAGE, OFFER_CAVEAT, OutcomeTone,
} from '../utils/legacy-restore';

/**
 * Sahibi doğrulanamadığı için güvenli şekilde ayrı tutulan (park edilen) eski cihaz kayıtları.
 *
 * - Kayıtların kime ait olduğu teknik olarak DOĞRULANAMAZ; "bana ait" onayı kanıt değil, kullanıcı beyanıdır.
 * - Bu cihazda birden fazla hesap kullanıldıysa hiçbir aktarım sunulmaz (yalnızca "güvenle bekletiliyor" bilgisi).
 * - Tek hesap kullanıldıysa: hesap e-postası, kayıt türleri ve SAYILAR gösterilir (içerik gösterilmez); aktarım yalnızca
 *   açık "Bana ait, ekle" onayıyla yapılır.
 * - Cihazdaki 100 kayıt sınırına sığmayan çalışma kayıtları silinmez; onaydan sonra bu hesabın salt okunur arşivinde
 *   durur ve istatistik/görev/rozetlere katılmaz.
 */
export function LegacyRecordsCard({ userId, email }: { userId: string | null; email?: string | null }) {
  const router = useRouter();
  const [info, setInfo] = useState<LegacyOfferInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: OutcomeTone | 'error'; text: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) { setInfo(null); return; }
    try {
      setInfo(await getLegacyOffer(userId));
    } catch {
      setInfo(null);
    }
  }, [userId]);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const state = info?.state ?? 'none';
  const summary = info?.summary;
  const archived = info?.archived ?? 0;
  const addable = summary?.total ?? 0;
  const waiting = summary?.waiting ?? 0;
  if (!userId || (state === 'none' && archived === 0 && !message)) return null;

  const account = email ? `Hesap: ${email}` : 'Giriş yaptığın hesap';

  const confirmRestore = () => {
    if (busy || !summary || state !== 'offer') return;
    Alert.alert(
      'Eski kayıtları hesabına ekle',
      `${account}\n\nBu hesaba eklenecek: ${summary.words} kelime, ${summary.sessions} çalışma kaydı, ${summary.reviewStates} kelime ilerlemesi.`
      + (waiting > 0 ? `\n\n${describeWaiting(waiting)} Bunlar bu hesabın salt okunur arşivinde saklanır.` : '')
      + `\n\n${OFFER_CAVEAT}\n\nEklenmezse hiçbir kayıt silinmez, güvenle saklanır.`,
      [
        { text: 'Şimdi değil', style: 'cancel' },
        {
          text: 'Bana ait, ekle',
          onPress: () => {
            setBusy(true);
            setMessage(null);
            void restoreLegacyRecords(userId)
              .then((restored) => {
                if (restored.blocked) {
                  setMessage({ tone: 'nothing', text: HOLD_MESSAGE });
                  return;
                }
                const outcome = describeRestoreOutcome({ restored: restored.total, waiting: restored.waiting });
                setMessage({ tone: outcome.tone, text: outcome.text });
              })
              .catch(() => setMessage({ tone: 'error', text: 'Kayıtlar eklenemedi. Hiçbir kayıt silinmedi; lütfen tekrar dene.' }))
              .finally(() => { setBusy(false); void refresh(); });
          },
        },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <IconTile name="tray" size={40} />
        <View style={styles.textBox}>
          <Text style={styles.label}>Sahibi doğrulanamayan eski kayıtlar</Text>
          {state === 'offer' && (
            <>
              <Text style={styles.hint}>
                Bu cihazda eski bir sürümden kalan {summary?.words ?? 0} kelime, {summary?.sessions ?? 0} çalışma kaydı ve {summary?.reviewStates ?? 0} kelime
                ilerlemesi var. Sen onaylamadan hiçbir hesapta gösterilmez ve silinmez.
              </Text>
              <Text style={styles.account}>{account}</Text>
              <Text style={styles.hint}>{OFFER_CAVEAT}</Text>
            </>
          )}
          {state === 'hold' && <Text style={styles.hint}>{HOLD_MESSAGE}</Text>}
          {state !== 'none' && waiting > 0 && (
            <Text style={styles.waiting} accessibilityLiveRegion="polite">{describeWaiting(waiting)}</Text>
          )}
          {archived > 0 && (
            <Text style={styles.hint}>
              Bu hesabın arşivinde cihaz sınırı nedeniyle listeye sığmayan {archived} çalışma kaydı güvende. İstatistik, görev ve rozetlere sayılmaz.
            </Text>
          )}
        </View>
      </View>
      {state === 'offer' && addable > 0 && (
        <TouchableOpacity
          style={[styles.btn, busy && styles.disabled]}
          onPress={confirmRestore}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Eski kayıtları ${email ?? 'hesabıma'} ekle`}
        >
          <Text style={styles.btnText}>İncele ve hesabıma ekle</Text>
        </TouchableOpacity>
      )}
      {archived > 0 && (
        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.push('/oturum-arsivi' as any)}
          accessibilityRole="button"
          accessibilityLabel="Arşivlenmiş çalışma kayıtlarını görüntüle"
        >
          <Text style={styles.linkText}>Arşivdeki kayıtları gör</Text>
        </TouchableOpacity>
      )}
      {!!message && (
        <Text
          style={[styles.message, message.tone === 'success' && styles.messageSuccess, message.tone === 'error' && styles.messageError]}
          accessibilityLiveRegion="polite"
        >
          {message.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { ...Cards.surface, width: '100%', padding: Spacing.md, gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  textBox: { flex: 1, gap: 4 },
  label: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  hint: { fontSize: 12, color: Colors.onSurfaceVariant, lineHeight: 17 },
  waiting: { fontSize: 12, fontWeight: '600', color: Colors.secondary, lineHeight: 17 },
  account: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  btn: { alignSelf: 'flex-start', minHeight: Spacing.touchTargetMin, paddingHorizontal: 20, borderRadius: 999, backgroundColor: Colors.golden, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  linkBtn: { alignSelf: 'flex-start', minHeight: Spacing.touchTargetMin, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '700', color: Colors.primary, textDecorationLine: 'underline' },
  disabled: { opacity: 0.55 },
  message: { fontSize: 13, color: Colors.onSurfaceVariant, fontWeight: '600', lineHeight: 18 },
  messageSuccess: { color: Colors.success },
  messageError: { color: Colors.error },
});
