import React from 'react';
import {
  StyleProp, StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View, ViewStyle,
} from 'react-native';
import { BorderRadius, Cards, Colors, Shadows, Spacing } from '../constants/theme';
import { AppIcon } from './app-icon';

// Wortly ortak arayüz bileşenleri: iOS ve Android'de aynı görünür (platforma özel dal yok).
// Ekranlar kartı, düğmeyi, segmentli kontrolü, arama ve form alanını buradan alır.

// ─── Başlıklar ──────────────────────────────────────────────────────────────

export function ScreenHeader({
  title, subtitle, right,
}: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.screenHeader}>
      <View style={styles.screenHeaderText}>
        <Text style={styles.screenTitle} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {!!subtitle && <Text style={styles.screenSubtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function SectionTitle({
  children, action,
}: { children: string; action?: { label: string; onPress: () => void; accessibilityLabel?: string } }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{children}</Text>
      {action && (
        <TouchableOpacity
          onPress={action.onPress}
          style={styles.sectionAction}
          accessibilityRole="link"
          accessibilityLabel={action.accessibilityLabel ?? action.label}
        >
          <Text style={styles.sectionActionText}>{action.label}</Text>
          <AppIcon name="chevron.right" size={12} color={Colors.secondary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Kart ve ikon kutusu ────────────────────────────────────────────────────

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[Cards.surface, styles.cardPadding, style]}>{children}</View>;
}

export function IconTile({
  name, size = 40, tone = 'soft',
}: { name: string; size?: number; tone?: 'soft' | 'navy' | 'gold' }) {
  const background = tone === 'navy' ? Colors.navy : tone === 'gold' ? Colors.golden : Colors.surfaceContainerLow;
  const color = tone === 'navy' ? Colors.golden : Colors.secondary;
  return (
    <View
      style={{
        width: size, height: size, borderRadius: Math.round(size * 0.32), borderCurve: 'continuous',
        backgroundColor: background, alignItems: 'center', justifyContent: 'center',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AppIcon name={name} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

// ─── Düğmeler ───────────────────────────────────────────────────────────────

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({ label, onPress, disabled, loading, icon, accessibilityHint, style }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      style={[styles.button, styles.primaryButton, inactive && styles.buttonInactive, style]}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
    >
      <Text style={styles.primaryButtonText} numberOfLines={1}>{label}</Text>
      {icon && <AppIcon name={icon} size={15} color={Colors.primary} />}
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  label, onPress, disabled, tone = 'neutral', accessibilityHint, style,
}: Omit<ButtonProps, 'loading' | 'icon'> & { tone?: 'neutral' | 'danger' }) {
  const color = tone === 'danger' ? Colors.error : Colors.onSurfaceVariant;
  const border = tone === 'danger' ? `${Colors.error}66` : Colors.outlineVariant;
  return (
    <TouchableOpacity
      style={[styles.button, styles.secondaryButton, { borderColor: border }, disabled && styles.buttonInactive, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={[styles.secondaryButtonText, { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Segmentli kontrol ve çipler ────────────────────────────────────────────

export type SegmentOption<T extends string | number> = {
  value: T;
  label: string;
  sublabel?: string;
  disabled?: boolean;
  /** Kilitli/devre dışı seçenekte gösterilen küçük ikon. */
  icon?: string;
  accessibilityLabel?: string;
  activeBackground?: string;
  activeColor?: string;
  activeBorder?: string;
};

export function SegmentedControl<T extends string | number>({
  options, value, onChange,
}: { options: SegmentOption<T>[]; value: T; onChange: (value: T) => void }) {
  return (
    <View style={styles.segmentTrack} accessibilityRole="radiogroup">
      {options.map(option => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={String(option.value)}
            style={[
              styles.segment,
              selected && {
                backgroundColor: option.activeBackground ?? Colors.golden,
                borderColor: option.activeBorder ?? 'transparent',
              },
              option.disabled && styles.segmentDisabled,
            ]}
            onPress={() => !option.disabled && onChange(option.value)}
            activeOpacity={option.disabled ? 1 : 0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !!option.disabled }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
          >
            <View style={styles.segmentRow}>
              <Text
                style={[styles.segmentLabel, selected && { color: option.activeColor ?? Colors.primary }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.6}
              >
                {option.label}
              </Text>
              {option.icon && <AppIcon name={option.icon} size={11} color={Colors.outline} />}
            </View>
            {!!option.sublabel && (
              <Text style={styles.segmentSub} numberOfLines={1} maxFontSizeMultiplier={1.4}>{option.sublabel}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function FilterChip({
  label, count, selected, onPress, accessibilityLabel,
}: { label: string; count?: number; selected: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} maxFontSizeMultiplier={1.6}>{label}</Text>
      {count !== undefined && (
        <View style={[styles.chipCount, selected && styles.chipCountSelected]}>
          <Text style={[styles.chipCountText, selected && styles.chipCountTextSelected]}>{count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Arama ve form ──────────────────────────────────────────────────────────

export function SearchField({
  value, onChangeText, placeholder, style,
}: { value: string; onChangeText: (text: string) => void; placeholder: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.search, style]}>
      <AppIcon name="magnifyingglass" size={16} color={Colors.outline} />
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={Colors.outline}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText('')}
          style={styles.searchClear}
          accessibilityRole="button"
          accessibilityLabel="Aramayı temizle"
        >
          <AppIcon name="xmark.circle.fill" size={18} color={Colors.outline} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export function FormField({
  label, optional, hint, error, children,
}: { label: string; optional?: boolean; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional && <Text style={styles.fieldOptional}>  İsteğe bağlı</Text>}
      </Text>
      {children}
      {!!hint && !error && <Text style={styles.fieldHint}>{hint}</Text>}
      {!!error && <Text style={styles.fieldError} selectable accessibilityLiveRegion="polite">{error}</Text>}
    </View>
  );
}

export const TextField = React.forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(
  function TextField({ invalid, style, onFocus, onBlur, ...props }, ref) {
    const [focused, setFocused] = React.useState(false);
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={Colors.outline}
        {...props}
        onFocus={(event) => { setFocused(true); onFocus?.(event); }}
        onBlur={(event) => { setFocused(false); onBlur?.(event); }}
        style={[
          styles.input,
          props.multiline && styles.inputMultiline,
          focused && !invalid && styles.inputFocused,
          invalid && styles.inputInvalid,
          style,
        ]}
      />
    );
  },
);

/** Şifre alanı: göster/gizle düğmesiyle (44 px dokunma alanı). */
export const PasswordField = React.forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(
  function PasswordField({ style, ...props }, ref) {
    const [visible, setVisible] = React.useState(false);
    return (
      <View style={styles.passwordWrap}>
        <TextField
          ref={ref}
          autoCapitalize="none"
          autoCorrect={false}
          {...props}
          secureTextEntry={!visible}
          style={[styles.passwordInput, style]}
        />
        <TouchableOpacity
          style={styles.passwordToggle}
          onPress={() => setVisible(value => !value)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Şifreyi gizle' : 'Şifreyi göster'}
        >
          <AppIcon name={visible ? 'eye.slash' : 'eye'} size={20} color={Colors.outline} />
        </TouchableOpacity>
      </View>
    );
  },
);

/** Hata veya başarı mesajı kutusu (ekran okuyucuya otomatik duyurulur). */
export function Notice({ type, children }: { type: 'error' | 'success'; children: string }) {
  const isError = type === 'error';
  return (
    <View
      style={[styles.notice, isError ? styles.noticeError : styles.noticeSuccess]}
      accessibilityRole={isError ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      <AppIcon
        name={isError ? 'circle.fill' : 'checkmark.circle.fill'}
        size={isError ? 8 : 16}
        color={isError ? Colors.error : Colors.success}
      />
      <Text style={[styles.noticeText, { color: isError ? Colors.onErrorContainer : Colors.success }]} selectable>
        {children}
      </Text>
    </View>
  );
}

/** Wortly marka alanı: lacivert monogram + yazı işareti. */
export function BrandMark() {
  return (
    <View style={styles.brand} accessible accessibilityRole="image" accessibilityLabel="Wortly">
      <View style={styles.brandTile}>
        <Text style={styles.brandLetter} maxFontSizeMultiplier={1.2}>W</Text>
      </View>
      <Text style={styles.brandName} maxFontSizeMultiplier={1.3}>Wortly</Text>
    </View>
  );
}

// ─── Boş durum ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon, eyebrow, title, description, actionLabel, onAction,
}: {
  icon: string; eyebrow?: string; title: string; description?: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <View style={[Cards.surface, styles.empty]}>
      <IconTile name={icon} size={60} />
      {!!eyebrow && <Text style={styles.emptyEyebrow}>{eyebrow}</Text>}
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!description && <Text style={styles.emptyDesc}>{description}</Text>}
      {actionLabel && onAction && (
        <PrimaryButton label={actionLabel} onPress={onAction} icon="arrow.right" style={styles.emptyAction} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screenHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md,
    paddingHorizontal: Spacing.marginMain, paddingTop: Spacing.md, paddingBottom: Spacing.md,
  },
  screenHeaderText: { flex: 1 },
  screenTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: Colors.primary, letterSpacing: -0.3 },
  screenSubtitle: { fontSize: 13, color: Colors.onSurfaceVariant, marginTop: 2 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.primary },
  sectionAction: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: Spacing.touchTargetMin, paddingLeft: Spacing.sm,
  },
  sectionActionText: { fontSize: 13, fontWeight: '700', color: Colors.secondary },

  cardPadding: { padding: Spacing.md },

  button: {
    minHeight: 52, borderRadius: BorderRadius.lg, borderCurve: 'continuous',
    paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
  },
  primaryButton: { backgroundColor: Colors.golden, ...Shadows.level1 },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  secondaryButton: { borderWidth: 1.5, backgroundColor: 'transparent' },
  secondaryButtonText: { fontSize: 15, fontWeight: '600' },
  buttonInactive: { opacity: 0.45 },

  segmentTrack: {
    flexDirection: 'row', gap: 4, padding: 4,
    backgroundColor: Colors.surfaceContainer, borderRadius: BorderRadius.lg, borderCurve: 'continuous',
  },
  segment: {
    flex: 1, minHeight: Spacing.touchTargetMin, paddingHorizontal: 4, paddingVertical: 6,
    borderRadius: BorderRadius.md, borderCurve: 'continuous', borderWidth: 1.5, borderColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  segmentDisabled: { opacity: 0.5 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  segmentLabel: { fontSize: 15, fontWeight: '700', color: Colors.onSurfaceVariant },
  segmentSub: { fontSize: 11, color: Colors.onSurfaceVariant, marginTop: 1 },

  chip: {
    minHeight: 40, paddingLeft: 14, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1, borderColor: Colors.outlineVariant,
  },
  chipSelected: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceVariant },
  chipTextSelected: { color: Colors.onPrimary },
  chipCount: {
    minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: BorderRadius.full,
    alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceContainer,
  },
  chipCountSelected: { backgroundColor: Colors.golden },
  chipCountText: { fontSize: 11, fontWeight: '700', color: Colors.onSurfaceVariant, fontVariant: ['tabular-nums'] },
  chipCountTextSelected: { color: Colors.primary },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 48,
    paddingLeft: Spacing.md, paddingRight: 2,
    borderRadius: BorderRadius.lg, borderCurve: 'continuous',
    backgroundColor: Colors.surfaceContainerLowest, borderWidth: 1, borderColor: Cards.borderColor,
  },
  searchInput: { flex: 1, fontSize: 15, color: Colors.primary, paddingVertical: 0 },
  searchClear: { width: Spacing.touchTargetMin, height: Spacing.touchTargetMin, alignItems: 'center', justifyContent: 'center' },

  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  fieldOptional: { fontSize: 12, fontWeight: '400', color: Colors.outline },
  fieldHint: { fontSize: 12, color: Colors.onSurfaceVariant, lineHeight: 17 },
  fieldError: { fontSize: 12, color: Colors.error, fontWeight: '600', lineHeight: 17 },
  input: {
    minHeight: 52, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: 16, color: Colors.primary,
    backgroundColor: Colors.surfaceContainerLowest, borderRadius: BorderRadius.lg, borderCurve: 'continuous',
    borderWidth: 1.5, borderColor: Colors.outlineVariant,
  },
  inputMultiline: { minHeight: 76, textAlignVertical: 'top' },
  inputFocused: { borderColor: Colors.secondary, boxShadow: '0 0 0 3px rgba(244, 211, 94, 0.4)' },
  inputInvalid: { borderColor: Colors.error, backgroundColor: Colors.errorContainer },
  passwordWrap: { justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  passwordToggle: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.md,
  },
  noticeError: { backgroundColor: Colors.errorContainer },
  noticeSuccess: { backgroundColor: Colors.successContainer },
  noticeText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm + 2 },
  brandTile: {
    width: 44, height: 44, borderRadius: 14, borderCurve: 'continuous', backgroundColor: Colors.navy,
    alignItems: 'center', justifyContent: 'center',
  },
  brandLetter: { fontSize: 24, fontWeight: '800', color: Colors.golden, lineHeight: 28 },
  brandName: { fontSize: 24, fontWeight: '700', color: Colors.primary, letterSpacing: -0.4 },

  empty: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.xl },
  emptyEyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: Colors.secondary, marginTop: Spacing.xs },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: Colors.onSurfaceVariant, textAlign: 'center', lineHeight: 21, maxWidth: 300 },
  emptyAction: { alignSelf: 'stretch', marginTop: Spacing.sm },
});
