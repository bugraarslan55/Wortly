import { Article } from '../types';
import { Colors } from './theme';

export const ARTICLE_PALETTES = {
  der: { foreground: Colors.articleDer, background: Colors.articleDerContainer },
  die: { foreground: Colors.articleDie, background: Colors.articleDieContainer },
  das: { foreground: Colors.articleDas, background: Colors.articleDasContainer },
  plural: { foreground: Colors.articlePlural, background: Colors.articlePluralContainer },
  none: { foreground: Colors.onSurfaceVariant, background: Colors.surfaceContainer },
} as const;

export function getArticlePalette(article: Article) {
  return article ? ARTICLE_PALETTES[article] : ARTICLE_PALETTES.none;
}
