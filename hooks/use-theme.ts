import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { DarkColors, LightColors, ThemeColors } from '../constants/theme';
import { useThemeStore } from '../store/theme';

export type ThemeScheme = 'light' | 'dark';

/** Seçilen tercihe (sistem/açık/koyu) göre geçerli renk şemasını ve paleti verir. */
export function useTheme() {
  const preference = useThemeStore(state => state.preference);
  const systemScheme = useColorScheme();
  const scheme: ThemeScheme = preference === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : preference;

  return useMemo(() => ({
    scheme,
    isDark: scheme === 'dark',
    colors: scheme === 'dark' ? DarkColors : LightColors,
  }), [scheme]);
}

export const useColors = (): ThemeColors => useTheme().colors;

/**
 * Renklere bağlı StyleSheet için hook üretir. Her şema için stiller bir kez oluşturulur.
 *
 *   const useStyles = makeStyles(Colors => StyleSheet.create({ ... }));
 *   // bileşende: const styles = useStyles();
 */
export function makeStyles<T>(factory: (colors: ThemeColors) => T): () => T {
  const cache: Partial<Record<ThemeScheme, T>> = {};
  return function useStyles() {
    const { scheme, colors } = useTheme();
    let styles = cache[scheme];
    if (!styles) {
      styles = factory(colors);
      cache[scheme] = styles;
    }
    return styles;
  };
}
