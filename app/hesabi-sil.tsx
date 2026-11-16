import React, { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppIcon } from '../components/app-icon';
import { Card, SecondaryButton } from '../components/ui';
import { BorderRadius, Spacing } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import { useAuthStore } from '../store/auth';
import { ACCOUNT_DELETED_LOCAL_INCOMPLETE_MESSAGE } from '../utils/account-deletion';
import { replanReminders } from '../utils/reminder-sync';
import { goBack } from '../utils/safe-back';

const DELETED_ITEMS = [
  'Hesabın ve e-posta adresin',
  'Profilin, seviyen ve günlük hedefin',
  'Eklediğin kelimeler ve kelime ilerlemen',
  'Çalışma geçmişin ve senaryo sonuçların',
  'İfade Defterim ve kazandığın rozetler',
  'Cihazdaki telaffuz kayıtların ve hatırlatmaların',
];

/**
 * Hesabı kalıcı silme. İşlem GERİ ALINAMAZ: onay kutusu + son uyarı gerekir. Çevrimdışıyken başlamaz; başarısız olursa
 * hesap, veriler ve oturum olduğu gibi kalır (store/auth.ts → utils/account-deletion.ts).
 */
export default function DeleteAccountScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const session = useAuthStore(state => state.session);
  const deleteAccount = useAuthStore(state => state.deleteAccount);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const email = session?.user?.email ?? '';

  const performDelete = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const userId = session?.user?.id;
    try {
      const result = await deleteAccount();
      if (!result.ok) {
        // Hesap ve veriler silinmedi: bildirim planını yeniden kur ve kullanıcıyı bilgilendir.
        if (userId) void replanReminders(userId);
        Alert.alert('Hesap silinemedi', result.message);
        return;
      }
      router.replace('/auth' as any);
      Alert.alert(
        'Hesabın silindi',
        result.localCleanupFailed
          ? ACCOUNT_DELETED_LOCAL_INCOMPLETE_MESSAGE
          : 'Hesabın ve tüm verilerin kalıcı olarak silindi.',
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleDelete = () => {
    if (!acknowledged || busyRef.current) return;
    Alert.alert(
      'Hesabı kalıcı olarak sil?',
      'Hesabın ve tüm verilerin silinecek. Bu işlem geri alınamaz. İnternet bağlantısı gerekir.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Hesabı Kalıcı Olarak Sil', style: 'destructive', onPress: () => { void performDelete(); } },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBack(router)}
          disabled={busy}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Geri"
          accessibilityState={{ disabled: busy }}
        >
          <AppIcon name="chevron.left" size={16} color={colors.onSurfaceVariant} />
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hesabı Sil</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.warning}>
          <Text style={styles.warningTitle} accessibilityRole="header">Bu işlem geri alınamaz</Text>
          <Text style={styles.body}>
            Hesabını sildiğinde aşağıdakiler kalıcı olarak silinir ve hiçbir şekilde geri getirilemez.
          </Text>
          {DELETED_ITEMS.map(item => (
            <View key={item} style={styles.itemRow}>
              <AppIcon name="xmark" size={12} color={colors.error} />
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
          <Text style={styles.body}>
            Aynı hesapla başka bir cihazda giriş yapmış olsan bile oradan da erişemezsin. Silme sunucuda yapılır; bunun
            için internet bağlantısı gerekir.
          </Text>
          {!!email && <Text style={styles.account} numberOfLines={1}>Silinecek hesap: {email}</Text>}
        </Card>

        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setAcknowledged(value => !value)}
          disabled={busy}
          activeOpacity={0.8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged, disabled: busy }}
          accessibilityLabel="Hesabımın ve tüm verilerimin kalıcı olarak silineceğini, bunun geri alınamayacağını anlıyorum"
        >
          <View style={[styles.checkBox, acknowledged && styles.checkBoxOn]}>
            {acknowledged && <AppIcon name="checkmark" size={14} color={colors.onError} />}
          </View>
          <Text style={styles.checkText}>
            Hesabımın ve tüm verilerimin kalıcı olarak silineceğini, bunun geri alınamayacağını anlıyorum.
          </Text>
        </TouchableOpacity>

        <SecondaryButton
          label={busy ? 'Siliniyor…' : 'Hesabımı Sil'}
          onPress={handleDelete}
          disabled={!acknowledged || busy}
          tone="danger"
          accessibilityHint="Son bir onay istenir; ardından hesabın kalıcı olarak silinir"
        />
        {busy && <Text style={styles.busyText} accessibilityLiveRegion="polite">Hesabın siliniyor… Lütfen uygulamayı kapatma.</Text>}
        <Text style={styles.footnote}>
          Vazgeçersen Geri'ye dokun. Silme başarısız olursa hesabın ve verilerin olduğu gibi kalır.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.warmWhite },
  header: {
    minHeight: 56, paddingHorizontal: Spacing.marginMain, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backButton: { minWidth: 72, minHeight: Spacing.touchTargetMin, flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceVariant },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm, paddingBottom: Spacing.xl, gap: Spacing.md },
  warning: { gap: Spacing.sm, borderWidth: 1.5, borderColor: Colors.error },
  warningTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: Colors.error },
  body: { fontSize: 14, lineHeight: 20, color: Colors.onSurfaceVariant },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  itemText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.primary },
  account: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, minHeight: Spacing.touchTargetMin, paddingVertical: Spacing.xs },
  checkBox: {
    width: 24, height: 24, borderRadius: BorderRadius.sm, borderWidth: 2, borderColor: Colors.outline,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkBoxOn: { backgroundColor: Colors.error, borderColor: Colors.error },
  checkText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.primary },
  busyText: { fontSize: 13, lineHeight: 18, color: Colors.onSurfaceVariant, textAlign: 'center' },
  footnote: { fontSize: 12, lineHeight: 17, color: Colors.onSurfaceVariant, textAlign: 'center' },
}));
