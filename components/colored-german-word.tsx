import { StyleProp, Text, TextStyle } from 'react-native';
import { Article } from '../types';
import { getArticlePalette, getArticlePalettes } from '../constants/article-colors';
import { useColors } from '../hooks/use-theme';

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
  const colors = useColors();
  const embeddedArticleMatch = german.trim().match(/^(der|die|das)\s+(.+)$/i);
  const embeddedArticle = embeddedArticleMatch?.[1]?.toLocaleLowerCase('de-DE') as Article | undefined;
  const displayedArticle = article || embeddedArticle || '';
  const displayedGerman = embeddedArticleMatch?.[2] || german;
  const palette = getArticlePalette(displayedArticle, colors);

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
  const colors = useColors();
  const pluralWithoutArticle = plural.trim().replace(/^die\s+/i, '');

  return (
    <Text style={style}>
      Çoğul:{' '}
      <Text style={{ color: getArticlePalettes(colors).plural.foreground, fontWeight: '700' }}>die </Text>
      {pluralWithoutArticle}
    </Text>
  );
}
