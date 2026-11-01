import { useRef } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, Colors, Spacing } from '../constants/theme';
import { AppIcon } from './app-icon';

// Tüm alıştırma ekranlarının ortak üst çubuğu, ilerleme göstergesi ve yardımcıları.

/**
 * Hızlı çift dokunuşta aynı işlemin iki kez çalışmasını engeller. State asenkron
 * güncellendiği için ardışık iki dokunuş aynı render'daki "henüz cevaplanmadı" değerini
 * görebilir; ref ise anında güncellenir.
 */
export function useActionLock() {
  const locked = useRef(false);
  return {
    /** Kilit alınabildiyse true döner; zaten alınmışsa false. */
    acquire(): boolean {
      if (locked.current) return false;
      locked.current = true;
      return true;
    },
    release() {
      locked.current = false;
    },
  };
}

/** Yarıda bırakmadan önce onay ister; ilerleme yoksa doğrudan çıkar. */
export function confirmLeaveExercise(hasProgress: boolean, onLeave: () => void) {
  if (!hasProgress) {
    onLeave();
    return;
  }
  Alert.alert(
    'Çalışmayı bırak?',
    'Cevapladığın kelimelerin ilerlemesi kaydedildi. Bu çalışmanın sonuç özeti kaydedilmeyecek.',
    [
      { text: 'Devam et', style: 'cancel' },
      { text: 'Çık', style: 'destructive', onPress: onLeave },
    ],
  );
}

export function ExerciseHeader({
  title, current, total, onClose,
}: { title: string; current: number; total: number; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onClose}
        style={styles.closeBtn}
        accessibilityRole="button"
        accessibilityLabel="Çalışmayı kapat"
      >
        <AppIcon name="xmark" size={18} color={Colors.onSurfaceVariant} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
      <Text
        style={styles.counter}
        accessibilityLabel={`${total} sorudan ${Math.min(current, total)}. soru`}
        maxFontSizeMultiplier={1.3}
      >
        {Math.min(current, total)}/{total}
      </Text>
    </View>
  );
}

export function ExerciseProgress({ current, total }: { current: number; total: number }) {
  // `current` 1 tabanlı sıra numarasıdır; çubuk tamamlanan soru oranını gösterir.
  const done = total > 0 ? Math.max(0, Math.min(1, (current - 1) / total)) : 0;
  const filled = total > 0 ? Math.max(done, 0.04) : 0;
  return (
    <View
      style={styles.track}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Çalışma ilerlemesi"
      accessibilityValue={{ min: 0, max: total, now: Math.max(0, current - 1) }}
    >
      <View style={[styles.fill, { width: `${filled * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.sm, paddingBottom: Spacing.sm,
  },
  closeBtn: {
    width: Spacing.touchTargetMin, height: Spacing.touchTargetMin, borderRadius: 22,
    backgroundColor: Colors.surfaceContainer, alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  counter: {
    minWidth: Spacing.touchTargetMin, textAlign: 'right',
    fontSize: 14, fontWeight: '700', color: Colors.onSurfaceVariant, fontVariant: ['tabular-nums'],
  },
  track: {
    height: 6, backgroundColor: Colors.surfaceContainer, borderRadius: BorderRadius.full,
    marginHorizontal: Spacing.marginMain, marginBottom: Spacing.md, overflow: 'hidden',
  },
  fill: { height: 6, backgroundColor: Colors.golden, borderRadius: BorderRadius.full },
});
