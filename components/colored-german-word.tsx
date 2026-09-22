import { StyleProp, Text, TextStyle } from 'react-native';
import { Article } from '../types';
import { ARTICLE_PALETTES, getArticlePalette } from '../constants/article-colors';

export function ColoredGermanWord({
  article,
  german,
  style,
  articleStyle,
}: {
  article: Article;
  german: string;
  style?: StyleProp<TextStyle>;
  articleStyle?: StyleProp<TextStyle>;
}) {
  const embeddedArticleMatch = german.trim().match(/^(der|die|das)\s+(.+)$/i);
  const embeddedArticle = embeddedArticleMatch?.[1]?.toLocaleLowerCase('de-DE') as Article | undefined;
  const displayedArticle = article || embeddedArticle || '';
  const displayedGerman = embeddedArticleMatch?.[2] || german;
  const palette = getArticlePalette(displayedArticle);

  return (
    <Text style={style}>
      {displayedArticle ? (
        <Text style={[articleStyle, { color: palette.foreground }]}>{displayedArticle} </Text>
      ) : null}
      {displayedGerman}
    </Text>
  );
}

export function ColoredGermanPlural({
  plural,
  style,
}: {
  plural: string;
  style?: StyleProp<TextStyle>;
}) {
  const pluralWithoutArticle = plural.trim().replace(/^die\s+/i, '');

  return (
    <Text style={style}>
      Çoğul:{' '}
      <Text style={{ color: ARTICLE_PALETTES.plural.foreground, fontWeight: '700' }}>die </Text>
      {pluralWithoutArticle}
    </Text>
  );
}
