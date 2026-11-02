import { Article } from '../types';
import { ThemeColors } from './theme';

export function getArticlePalettes(colors: ThemeColors) {
  return {
    der: { foreground: colors.articleDer, background: colors.articleDerContainer },
    die: { foreground: colors.articleDie, background: colors.articleDieContainer },
    das: { foreground: colors.articleDas, background: colors.articleDasContainer },
    plural: { foreground: colors.articlePlural, background: colors.articlePluralContainer },
    none: { foreground: colors.onSurfaceVariant, background: colors.surfaceContainer },
  } as const;
}

export function getArticlePalette(article: Article, colors: ThemeColors) {
  const palettes = getArticlePalettes(colors);
  return article ? palettes[article] : palettes.none;
}
