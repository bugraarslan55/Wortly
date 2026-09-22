import { Article, Word } from '../types';

export function normalizeGermanWord(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('de-DE')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');
}

export function findDuplicateCustomWord(
  words: Word[],
  german: string,
  article: Article,
  excludeId?: string,
): Word | undefined {
  const normalizedGerman = normalizeGermanWord(german);
  if (!normalizedGerman) return undefined;

  return words.find((word) =>
    word.isCustom &&
    word.id !== excludeId &&
    word.article === article &&
    normalizeGermanWord(word.german) === normalizedGerman
  );
}
