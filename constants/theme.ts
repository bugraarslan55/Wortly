// Wortly Design System — Stitch tasarımından birebir alınmıştır
export const Colors = {
  // Core
  primary: '#1A1F2B',
  onPrimary: '#FFFFFF',
  primaryContainer: '#1a1f2b',
  onPrimaryContainer: '#828696',

  // Secondary (golden yellow — CTA)
  secondary: '#715c00',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#ffdd67',
  onSecondaryContainer: '#766100',
  secondaryFixed: '#ffe17a',
  secondaryFixedDim: '#e4c451',

  // Surface
  surface: '#f8f9ff',
  surfaceBright: '#f8f9ff',
  surfaceDim: '#cbdbf5',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#eff4ff',
  surfaceContainer: '#e5eeff',
  surfaceContainerHigh: '#dce9ff',
  surfaceContainerHighest: '#d3e4fe',
  onSurface: '#0b1c30',
  onSurfaceVariant: '#45464c',

  // Outline
  outline: '#76777c',
  outlineVariant: '#c6c6cc',

  // Error
  error: '#ba1a1a',
  onError: '#FFFFFF',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // Background
  background: '#f8f9ff',
  onBackground: '#0b1c30',

  // App specific
  warmWhite: '#FAF9F6',   // Ana arka plan
  golden: '#F4D35E',      // CTA buton rengi
  navy: '#1A1F2B',        // Ana metin

  // Success
  success: '#2D6A4F',
  successContainer: '#D8F3DC',
  onSuccess: '#FFFFFF',

  // German noun articles — consistent learning colors
  articleDer: '#2563EB',
  articleDerContainer: '#DBEAFE',
  articleDie: '#DC2626',
  articleDieContainer: '#FEE2E2',
  articleDas: '#16803C',
  articleDasContainer: '#DCFCE7',
  articlePlural: '#7C3AED',
  articlePluralContainer: '#EDE9FE',
};

export const Typography = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const, letterSpacing: -0.68 },
  headlineLg: { fontSize: 28, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.28 },
  headlineLgMobile: { fontSize: 24, lineHeight: 30, fontWeight: '700' as const },
  headlineMd: { fontSize: 20, lineHeight: 25, fontWeight: '600' as const },
  bodyLg: { fontSize: 17, lineHeight: 24, fontWeight: '400' as const },
  bodyMd: { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
  labelMd: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, letterSpacing: 0.26 },
  labelSm: { fontSize: 11, lineHeight: 13, fontWeight: '500' as const },
};

export const Spacing = {
  unit: 4,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  marginMain: 20,
  gutter: 16,
  touchTargetMin: 44,
};

export const BorderRadius = {
  sm: 4,
  DEFAULT: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
};

export const Shadows = {
  level1: {
    boxShadow: '0 2px 12px rgba(26, 31, 43, 0.06)',
  },
  level2: {
    boxShadow: '0 6px 22px rgba(26, 31, 43, 0.12)',
  },
};

export const Fonts = {
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semiBold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
};
