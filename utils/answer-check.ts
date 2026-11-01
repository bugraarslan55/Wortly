import type { Word } from '../types';

// Yazılı alıştırmaların (Yazarak Tekrar, Dinle ve Yaz) ortak cevap değerlendirmesi.
// Saf fonksiyonlardır; ekran veya depolama bağımlılığı yoktur.
//
// Kurallar:
// - Büyük/küçük harf farkı cevabı yanlış yapmaz; ama doğru yazım (ör. isimlerin büyük harfi)
//   kullanıcıya bildirilir ve "capitalization" notu döner.
// - ae/oe/ue/ss, ä/ö/ü/ß için resmî geçerli alternatif yazımdır; kabul edilir ve
//   "transliteration" notu döner. Harf eksik bırakmak (ör. "Madchen") kabul EDİLMEZ.
// - Artikel isteğe bağlıdır: "Apfel" ve "der Apfel" ikisi de doğrudur.
// - Başka hiçbir gevşetme yoktur (yazım hatası, eksik harf, sondaki noktalama vb. yanlıştır).

const ANSWER_ALTERNATIVES: Record<string, string[]> = {
  // "istemek" iki yaygın A1 karşılığı da doğru olduğundan ikisini kabul et.
  'goethe-a1-wollen': ['möchten'],
};

export type AnswerNote = 'capitalization' | 'transliteration';

export interface AnswerVerdict {
  correct: boolean;
  /** Doğru cevapta yazımla ilgili bilgilendirme; yoksa tam doğru yazılmıştır. */
  note?: AnswerNote;
  /** Kullanıcıya gösterilecek doğru yazım (artikelsiz). */
  expected: string;
}

const collapse = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ');

/** Karşılaştırma biçimi: küçük harf + ä/ö/ü/ß → ae/oe/ue/ss. */
export function normalizeGermanAnswer(value: string): string {
  return collapse(value)
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/** Kelime için kabul edilen ham (normalleştirilmemiş) yazımlar. */
export function getAcceptedRawAnswers(word: Word): string[] {
  const answers = [word.german, ...(ANSWER_ALTERNATIVES[word.id] ?? [])];

  if (word.article) answers.push(`${word.article} ${word.german}`);

  // Birleşik Goethe kayıtlarında tek tek verilen biçimleri de kabul et.
  if (word.german.includes('/')) {
    answers.push(...word.german.split('/').map(part => part.trim()).filter(Boolean));
  }

  // "(sich) anmelden" için hem "sich anmelden" hem "anmelden" geçerlidir.
  const optionalPart = word.german.match(/^\(([^)]+)\)\s*(.+)$/);
  if (optionalPart) {
    answers.push(`${optionalPart[1]} ${optionalPart[2]}`, optionalPart[2]);
  }

  return answers;
}

export function checkGermanAnswer(word: Word, input: string): AnswerVerdict {
  const typed = collapse(input);
  const normalizedTyped = normalizeGermanAnswer(typed);
  const raw = getAcceptedRawAnswers(word);
  const expected = word.german;

  if (!normalizedTyped) return { correct: false, expected };

  const matched = raw.find(candidate => normalizeGermanAnswer(candidate) === normalizedTyped);
  if (matched === undefined) return { correct: false, expected };

  const exact = collapse(matched);
  if (typed === exact) return { correct: true, expected };

  // Yalnızca büyük/küçük harf farkı mı, yoksa ae/oe/ue/ss yazımı mı?
  if (typed.toLocaleLowerCase('de-DE') === exact.toLocaleLowerCase('de-DE')) {
    return { correct: true, note: 'capitalization', expected };
  }
  return { correct: true, note: 'transliteration', expected };
}

/** Kullanıcıya gösterilecek kısa bilgi metni; not yoksa boş. */
export function describeAnswerNote(verdict: AnswerVerdict): string {
  if (!verdict.correct || !verdict.note) return '';
  return verdict.note === 'capitalization'
    ? `Doğru. Yazımı: ${verdict.expected}`
    : `Doğru. Standart yazımı: ${verdict.expected}`;
}
