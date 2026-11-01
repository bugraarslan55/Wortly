import { Article, Word } from '../types';

/**
 * Örnek cümle (Almanca ve Türkçe) için en fazla karakter. Gerçek Almanca öğrenme cümleleri
 * genellikle 100 karakterin altındadır; 200, uzun bileşik cümleleri de karşılar ve Cümle Yazma
 * ekranında girdinin taşmasını önler. Sınır yazarken görünür biçimde uygulanır, metin sessizce kesilmez.
 */
export const MAX_EXAMPLE_LENGTH = 200;

/** Kayıtlı bir cümleyi tam yazabilmek için Cümle Yazma giriş sınırı (eski, daha uzun kayıtlar dahil). */
export const getSentenceInputLimit = (reference: string): number =>
  Math.max(MAX_EXAMPLE_LENGTH + 20, reference.length + 20);

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
