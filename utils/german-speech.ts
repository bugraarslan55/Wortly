import { Word } from '../types';

export function getGermanSpeechText(word: Pick<Word, 'article' | 'german'>): string {
  const spokenLemma = word.german
    .replace(/[()]/g, '')
    .replace(/\s*\/\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  return [word.article, spokenLemma].filter(Boolean).join(' ');
}
