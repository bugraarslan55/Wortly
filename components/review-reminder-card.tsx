import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { FilterChip, IconTile } from './ui';
import { Spacing, getCards } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import {
  DEFAULT_REMINDER,
  ensureNotificationPermission,
  getNotificationPermissionState,
  isReminderSupported,
  loadReminderSettings,
  ReminderSettings,
  saveReminderSettings,
} from '../utils/review-reminder';
import { replanReminders } from '../utils/reminder-sync';

const DENIED_MESSAGE =
  'Bildirim izni kapalı. Hatırlatmaları almak için cihaz ayarlarından Wortly bildirimlerine izin ver.';
const MINUTE_STEP = 5;
const PRESETS: { hour: number; minute: number }[] = [
  { hour: 8, minute: 0 }, { hour: 12, minute: 0 }, { hour: 18, minute: 0 },
  { hour: 20, minute: 0 }, { hour: 21, minute: 30 },
];

const pad = (value: number) => String(value).padStart(2, '0');
const timeText = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;

function SettingRow({
  icon, label, hint, value, onChange, disabled,
}: {
  icon?: boolean; label: string; hint: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      {icon ? <IconTile name="bell.fill" size={40} /> : null}
      <View style={styles.textBox}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.outlineVariant, true: colors.golden }}
        thumbColor={colors.warmWhite}
        ios_backgroundColor={colors.outlineVariant}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function ReviewReminderCard({ userId }: { userId: string | null }) {
  const styles = useStyles();
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // İzin kalıcı reddedildiyse (tekrar sorulamaz) kullanıcı cihaz ayarlarına yönlendirilir.
  const [needsSettings, setNeedsSettings] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const needsSettingsRef = useRef(needsSettings);
  needsSettingsRef.current = needsSettings;

  useEffect(() => {
    if (!isReminderSupported || !userId) return;
    let active = true;
    setLoaded(false);
    setMessage('');
    setNeedsSettings(false);

    void (async () => {
      const stored = await loadReminderSettings(userId);
      // Ayar açık ama izin sistem ayarlarından kapatılmışsa anahtar kapalı gösterilir (çalışıyormuş gibi gösterilmez).
      const permission = stored.enabled ? await getNotificationPermissionState() : null;
      if (!active) return;
      if (stored.enabled && permission?.state !== 'granted') {
        const next = { ...stored, enabled: false };
        setSettings(next);
        setMessage(DENIED_MESSAGE);
        setNeedsSettings(true);
        await saveReminderSettings(userId, next);
        await replanReminders(userId);
      } else {
        setSettings(stored);
      }
      if (active) setLoaded(true);
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  // Uygulama öne gelince izin durumunu yeniden okur (kullanıcı cihaz ayarlarından dönmüş olabilir):
  // - Hatırlatıcı açıkken izin sonradan kapatıldıysa anahtar kapalıya çekilir ve uyarı gösterilir.
  // - Uyarı açıkken izin verildiyse uyarı kalkar (hatırlatıcı kendiliğinden açılmaz).
  useEffect(() => {
    if (!isReminderSupported || !userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getNotificationPermissionState().then(async (permission) => {
        const current = settingsRef.current;
        if (current.enabled && permission.state !== 'granted') {
          const next = { ...current, enabled: false };
          setSettings(next);
          setMessage(DENIED_MESSAGE);
          setNeedsSettings(true);
          await saveReminderSettings(userId, next);
          await replanReminders(userId);
        } else if (needsSettingsRef.current && permission.state === 'granted') {
          setMessage('Bildirim izni verildi. Hatırlatıcıyı açabilirsin.');
          setNeedsSettings(false);
        }
      });
    });
    return () => subscription.remove();
  }, [userId]);

  const commit = useCallback(async (next: ReminderSettings) => {
    if (!userId) return;
    setSettings(next);
    await saveReminderSettings(userId, next);
    await replanReminders(userId);
  }, [userId]);

  if (!isReminderSupported || !userId) return null;

  const handleToggle = async (value: boolean) => {
    if (busy || !loaded) return;
    setMessage('');
    setNeedsSettings(false);
    setBusy(true);
    try {
      if (value) {
        // İzin yalnızca kullanıcı özelliği açtığında istenir.
        const granted = await ensureNotificationPermission();
        if (!granted) {
          const permission = await getNotificationPermissionState();
          setMessage(DENIED_MESSAGE);
          setNeedsSettings(!permission.canAskAgain || permission.state === 'denied');
          return;
        }
      }
      await commit({ ...settingsRef.current, enabled: value });
    } catch {
      setMessage('Bildirim ayarı kaydedilemedi. Lütfen tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const setFlag = (key: 'review' | 'goal' | 'streak') => (value: boolean) => {
    if (!loaded) return;
    void commit({ ...settingsRef.current, [key]: value });
  };

  const setTime = (hour: number, minute: number) => {
    if (!loaded) return;
    void commit({ ...settingsRef.current, hour, minute });
  };

  const changeTime = (hourDelta: number, minuteDelta: number) => {
    const current = settingsRef.current;
    const total = (current.hour * 60 + current.minute + hourDelta * 60 + minuteDelta + 24 * 60) % (24 * 60);
    setTime(Math.floor(total / 60), total % 60);
  };

  const disabled = busy || !loaded;
  const off = !settings.enabled;

  return (
    <View style={styles.card}>
      <SettingRow
        icon
        label="Günlük hatırlatıcı"
        hint="Her gün seçtiğin saatte kısa bir çalışma hatırlatması alırsın; bazı bildirimler dokununca açılan bir mini sorudur. Kilit ekranında kelime, çeviri veya sayı gösterilmez."
        value={settings.enabled}
        onChange={handleToggle}
        disabled={disabled}
      />

      {settings.enabled && (
        <View style={styles.timeBox}>
          <View style={styles.timeHeader}>
            <Text style={styles.timeLabel}>Bildirim saati</Text>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => changeTime(-1, 0)} accessibilityRole="button" accessibilityLabel="Saati azalt">
                <Text maxFontSizeMultiplier={1.4} style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text maxFontSizeMultiplier={1.4} style={styles.timeValue} accessibilityLabel={`Saat ${pad(settings.hour)}`}>{pad(settings.hour)}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => changeTime(1, 0)} accessibilityRole="button" accessibilityLabel="Saati artır">
                <Text maxFontSizeMultiplier={1.4} style={styles.stepText}>+</Text>
              </TouchableOpacity>
              <Text maxFontSizeMultiplier={1.4} style={styles.timeValue}>:</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => changeTime(0, -MINUTE_STEP)} accessibilityRole="button" accessibilityLabel="Dakikayı azalt">
                <Text maxFontSizeMultiplier={1.4} style={styles.stepText}>−</Text>
              </TouchableOpacity>
              <Text maxFontSizeMultiplier={1.4} style={styles.timeValue} accessibilityLabel={`Dakika ${pad(settings.minute)}`}>{pad(settings.minute)}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => changeTime(0, MINUTE_STEP)} accessibilityRole="button" accessibilityLabel="Dakikayı artır">
                <Text maxFontSizeMultiplier={1.4} style={styles.stepText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.presets}>
            {PRESETS.map(preset => (
              <FilterChip
                key={timeText(preset.hour, preset.minute)}
                label={timeText(preset.hour, preset.minute)}
                selected={settings.hour === preset.hour && settings.minute === preset.minute}
                onPress={() => setTime(preset.hour, preset.minute)}
                accessibilityLabel={`Saat ${timeText(preset.hour, preset.minute)} olarak ayarla`}
              />
            ))}
          </View>
        </View>
      )}

      <View style={styles.divider} />

      <SettingRow
        label="Kelime tekrarı"
        hint="Tekrar zamanı gelen kelime varsa bunu hatırlatır. Bekleyen yoksa bu mesaj gelmez."
        value={settings.review}
        onChange={setFlag('review')}
        disabled={disabled || off}
      />
      <SettingRow
        label="Günlük hedef"
        hint="Bugünkü hedefin tamamlanmadıysa hatırlatır. Hedefini tamamladığın gün bildirim gelmez."
        value={settings.goal}
        onChange={setFlag('goal')}
        disabled={disabled || off}
      />
      <SettingRow
        label="Çalışma serisi"
        hint="Serin devam ederken, korumak için çalışmanı hatırlatır."
        value={settings.streak}
        onChange={setFlag('streak')}
        disabled={disabled || off}
      />

      {!!message && (
        <View style={styles.warning} accessibilityLiveRegion="polite">
          <Text style={styles.message}>{message}</Text>
          {needsSettings && (
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => { void Linking.openSettings(); }}
              accessibilityRole="button"
              accessibilityLabel="Cihaz ayarlarını aç"
            >
              <Text style={styles.settingsBtnText}>Ayarları aç</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.footnote}>
        Günde en fazla bir bildirim gelir. Hatırlatmalar bu cihazda planlanır; uygulamayı yaklaşık iki haftadır
        açmadıysan durabilir. Pil tasarrufu modunda bildirimler birkaç dakika gecikebilir.
      </Text>
    </View>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  card: {
    ...getCards(Colors).surface,
    width: '100%',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: Spacing.touchTargetMin },
  rowDisabled: { opacity: 0.5 },
  textBox: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  hint: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
  divider: { height: 1, backgroundColor: Colors.outlineVariant, opacity: 0.6 },
  timeBox: { backgroundColor: Colors.surfaceContainerLow, borderRadius: 12, padding: Spacing.md, gap: Spacing.md },
  timeHeader: { gap: Spacing.sm },
  timeLabel: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  stepBtn: { width: Spacing.touchTargetMin, height: Spacing.touchTargetMin, borderRadius: Spacing.touchTargetMin / 2, backgroundColor: Colors.surfaceContainerLowest, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontWeight: '700', color: Colors.primary, lineHeight: 22 },
  timeValue: { fontSize: 17, fontWeight: '700', color: Colors.primary, minWidth: 22, textAlign: 'center' },
  warning: { gap: Spacing.sm, padding: Spacing.md, borderRadius: 12, backgroundColor: Colors.surfaceContainerLow },
  message: { fontSize: 13, color: Colors.error, fontWeight: '600', lineHeight: 18 },
  settingsBtn: { alignSelf: 'flex-start', minHeight: Spacing.touchTargetMin, paddingHorizontal: 16, borderRadius: 999, backgroundColor: Colors.golden, alignItems: 'center', justifyContent: 'center' },
  settingsBtnText: { fontSize: 14, fontWeight: '700', color: Colors.onGolden },
  footnote: { fontSize: 11, color: Colors.onSurfaceVariant, lineHeight: 16 },
}));
