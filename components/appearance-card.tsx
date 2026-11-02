import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppIcon } from './app-icon';
import { BorderRadius, Shadows, Spacing } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import { ThemePreference, useThemeStore } from '../store/theme';

const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'system', label: 'Sistem temasını kullan', icon: 'circle.lefthalf.filled' },
  { value: 'light', label: 'Açık tema', icon: 'sun.max.fill' },
  { value: 'dark', label: 'Koyu tema', icon: 'moon.fill' },
];

export function AppearanceCard() {
  const styles = useStyles();
  const colors = useColors();
  const preference = useThemeStore(state => state.preference);
  const setPreference = useThemeStore(state => state.setPreference);

  return (
    <View style={styles.card} accessibilityRole="radiogroup">
      <View style={styles.header}>
        <Text style={styles.title}>Görünüm</Text>
        <Text style={styles.hint}>Seçimin yalnızca bu cihazda saklanır.</Text>
      </View>

      {OPTIONS.map(option => {
        const selected = preference === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.option, selected && styles.optionSelected]}
            onPress={() => { void setPreference(option.value); }}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
          >
            <View style={styles.iconBox}>
              <AppIcon name={option.icon} size={18} color={colors.secondary} />
            </View>
            <Text style={styles.optionLabel}>{option.label}</Text>
            <View style={[styles.radio, selected && styles.radioSelected]}>
              {selected && <AppIcon name="checkmark" size={14} color={colors.onGolden} />}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  card: {
    width: '100%',
    marginTop: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.level1,
  },
  header: { marginBottom: Spacing.xs },
  title: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  hint: { fontSize: 12, color: Colors.onSurfaceVariant, marginTop: 2, lineHeight: 17 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    minHeight: Spacing.touchTargetMin + 8, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: 'transparent',
    backgroundColor: Colors.surfaceContainerLow,
  },
  optionSelected: { borderColor: Colors.golden },
  iconBox: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surfaceContainerLowest, alignItems: 'center', justifyContent: 'center',
  },
  optionLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.primary },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.outlineVariant,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { backgroundColor: Colors.golden, borderColor: Colors.golden },
}));
