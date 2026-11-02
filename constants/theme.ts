// Wortly Design System — Stitch tasarımından birebir alınmıştır
export const LightColors = {
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
  onGolden: '#1A1F2B',    // Altın zemin üzerindeki metin/ikon (her temada koyu)
  navy: '#1A1F2B',        // Ana metin
  onNavy: '#FFFFFF',      // Koyu (navy) kartlar üzerindeki metin (her temada açık)

  // Success
  success: '#2D6A4F',
  successContainer: '#D8F3DC',
  onSuccess: '#FFFFFF',
  successSurface: '#F0FFF4',

  // Alıştırma kartı tonları ve ince ayırıcı çizgi
  tintBlue: '#E8F0FF',
  tintPurple: '#F1ECFF',
  tintAmber: '#FFF8E7',
  tintOrange: '#FCE8D5',
  divider: 'rgba(0, 0, 0, 0.08)',

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

export type ThemeColors = { [K in keyof typeof LightColors]: string };

// Koyu tema: aynı anlam rolleri, lacivert zemin üzerinde. Altın (CTA) aynı kalır;
// artikel renkleri aynı anlamı korur, yalnızca koyu zeminde okunacak şekilde açılır.
export const DarkColors: ThemeColors = {
  // Core
  primary: '#F3F1EC',
  onPrimary: '#1A1F2B',
  primaryContainer: '#2B3347',
  onPrimaryContainer: '#A9AFC4',

  // Secondary (golden yellow — CTA)
  secondary: '#E4C451',
  onSecondary: '#3A2F00',
  secondaryContainer: '#4D4012',
  onSecondaryContainer: '#FFE17A',
  secondaryFixed: '#ffe17a',
  secondaryFixedDim: '#e4c451',

  // Surface
  surface: '#12151F',
  surfaceBright: '#2B3347',
  surfaceDim: '#0D1019',
  surfaceContainerLowest: '#1B2030',
  surfaceContainerLow: '#232A3B',
  surfaceContainer: '#2B3347',
  surfaceContainerHigh: '#343D54',
  surfaceContainerHighest: '#3E4863',
  onSurface: '#E6E8F0',
  onSurfaceVariant: '#B4B7C4',

  // Outline
  outline: '#8D90A0',
  outlineVariant: '#454C60',

  // Error
  error: '#FF8A80',
  onError: '#690005',
  errorContainer: '#5C1F1B',
  onErrorContainer: '#FFDAD6',

  // Background
  background: '#12151F',
  onBackground: '#E6E8F0',

  // App specific
  warmWhite: '#12151F',
  golden: '#F4D35E',
  onGolden: '#1A1F2B',
  navy: '#2B3347',
  onNavy: '#F3F1EC',

  // Success
  success: '#6FD39A',
  successContainer: '#16382A',
  onSuccess: '#0B2A1B',
  successSurface: '#14291F',

  tintBlue: '#1F2A44',
  tintPurple: '#2B2646',
  tintAmber: '#3A3218',
  tintOrange: '#3D2B1B',
  divider: 'rgba(255, 255, 255, 0.1)',

  // German noun articles — aynı renk anlamı, koyu zeminde okunur tonlar
  articleDer: '#7DA9FF',
  articleDerContainer: '#1E2F57',
  articleDie: '#FF8585',
  articleDieContainer: '#4A1F24',
  articleDas: '#5ED68A',
  articleDasContainer: '#173D28',
  articlePlural: '#B79CFF',
  articlePluralContainer: '#33285C',
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

// Ortak kart yüzeyi: ince kenarlık + hafif gölge (tüm ekranlarda aynı yükseklik hissi).
export function getCards(colors: ThemeColors) {
  const dark = colors === DarkColors;
  const border = dark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(26, 31, 43, 0.07)';
  return {
    borderColor: border,
    surface: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: BorderRadius.xl,
      borderCurve: 'continuous' as const,
      borderWidth: 1,
      borderColor: border,
      boxShadow: dark ? '0 2px 12px rgba(0, 0, 0, 0.35)' : '0 2px 12px rgba(26, 31, 43, 0.06)',
    },
  };
}

export const Fonts = {
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semiBold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
};
