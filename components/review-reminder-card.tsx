import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from './app-icon';
import { BorderRadius, Colors, Shadows, Spacing } from '../constants/theme';
import {
  applyReminder,
  DEFAULT_REMINDER,
  ensureNotificationPermission,
  hasNotificationPermission,
  isReminderSupported,
  loadReminderSettings,
  ReminderSettings,
  saveReminderSettings,
} from '../utils/review-reminder';

const DENIED_MESSAGE =
  'Bildirim izni verilmedi. Günlük hatırlatma için Ayarlar > Wortly > Bildirimler bölümünden izin ver.';
const MINUTE_STEP = 5;

const pad = (value: number) => String(value).padStart(2, '0');

export function ReviewReminderCard({ userId }: { userId: string | null }) {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  useEffect(() => {
    if (!isReminderSupported || !userId) return;
    let active = true;
    setLoaded(false);
    setMessage('');

    void (async () => {
      const stored = await loadReminderSettings(userId);
      // Ayar açık ama izin sistem ayarlarından kapatılmışsa anahtar kapalı gösterilir.
      const allowed = stored.enabled ? await hasNotificationPermission() : true;
      if (!active) return;
      if (stored.enabled && !allowed) {
        const next = { ...stored, enabled: false };
        setSettings(next);
        setMessage(DENIED_MESSAGE);
        await saveReminderSettings(userId, next);
        await applyReminder(userId, next);
      } else {
        setSettings(stored);
      }
      if (active) setLoaded(true);
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  if (!isReminderSupported || !userId) return null;

  const commit = async (next: ReminderSettings) => {
    setSettings(next);
    await saveReminderSettings(userId, next);
    await applyReminder(userId, next);
  };

  const handleToggle = async (value: boolean) => {
    if (busy || !loaded) return;
    setMessage('');
    setBusy(true);
    try {
      if (value) {
        const granted = await ensureNotificationPermission();
        if (!granted) {
          setMessage(DENIED_MESSAGE);
          return;
        }
      }
      await commit({ ...settings, enabled: value });
    } catch {
      setMessage('Bildirim ayarı kaydedilemedi. Lütfen tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const changeTime = (hourDelta: number, minuteDelta: number) => {
    if (!loaded) return;
    const total = (settings.hour * 60 + settings.minute + hourDelta * 60 + minuteDelta + 24 * 60) % (24 * 60);
    void commit({ ...settings, hour: Math.floor(total / 60), minute: total % 60 });
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <AppIcon name="bell.fill" size={18} color={Colors.secondary} />
        <View style={styles.textBox}>
          <Text style={styles.label}>Günlük tekrar bildirimi</Text>
          <Text style={styles.hint}>Her gün seçtiğin saatte “Bugünkü kelime tekrarın hazır” bildirimi gelir.</Text>
        </View>
        <Switch
          value={settings.enabled}
          onValueChange={handleToggle}
          disabled={busy || !loaded}
          trackColor={{ true: Colors.golden }}
          accessibilityLabel="Günlük tekrar bildirimi"
        />
      </View>

      {settings.enabled && (
        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>Bildirim saati</Text>
          <View style={styles.stepper}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeTime(-1, 0)} accessibilityLabel="Saati azalt">
              <Text style={styles.stepText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.timeValue} accessibilityLabel={`Saat ${pad(settings.hour)}`}>{pad(settings.hour)}</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeTime(1, 0)} accessibilityLabel="Saati artır">
              <Text style={styles.stepText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.timeValue}>:</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeTime(0, -MINUTE_STEP)} accessibilityLabel="Dakikayı azalt">
              <Text style={styles.stepText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.timeValue} accessibilityLabel={`Dakika ${pad(settings.minute)}`}>{pad(settings.minute)}</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => changeTime(0, MINUTE_STEP)} accessibilityLabel="Dakikayı artır">
              <Text style={styles.stepText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!!message && <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginTop: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.level1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  textBox: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  hint: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeLabel: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.surfaceContainer, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 22 },
  timeValue: { fontSize: 17, fontWeight: '700', color: Colors.primary, minWidth: 22, textAlign: 'center' },
  message: { fontSize: 12, color: Colors.error, fontWeight: '600', lineHeight: 17 },
});
