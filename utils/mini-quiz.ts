import { Level, Word } from '../types';
import { ALL_TOPICS, getTopicById, getTopicsForLevel } from '../constants/topics';
import { useUserStore, useWordStore } from '../store';
import { findDueWords } from './learning-analysis';
import { getNextReviewAt, getReviewState, ReviewStateMap } from './spaced-repetition';
import type { ReminderContent } from './review-reminder';

// Bildirimden açılan mini quiz: tek bir Almanca kelime, 3 Türkçe seçenek (1 doğru, 2 yanlış).

export const MINI_QUIZ_OPTION_COUNT = 3;

export type MiniQuizQuestion = {
  word: Word;
  /** Türkçe seçenekler; karışık sırada. */
  options: string[];
  correctIndex: number;
};

export type MiniQuizSource = {
  level?: Level | null;
  customWords?: Word[] | null;
  reviewStates?: ReviewStateMap | null;
  now?: number;
  random?: () => number;
  /** Aynı oturumda tekrar sorulmasın diye hariç tutulan kelime kimlikleri. */
  excludeIds?: string[];
};

const normalizeMeaning = (value: string) => value.trim().toLocaleLowerCase('tr-TR');

const isUsable = (word: Word | null | undefined): word is Word =>
  Boolean(word && word.id && word.german?.trim() && word.turkish?.trim());

const unique = (words: Word[]): Word[] =>
  Array.from(new Map(words.filter(isUsable).map(word => [word.id, word])).values());

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Ana ekran ve tekrar akışıyla aynı aday kümesi: seviye konuları + kişisel kelimeler. */
export function getMiniQuizCandidates(level?: Level | null, customWords?: Word[] | null): Word[] {
  const topicWords = getTopicsForLevel(level || 'A1').flatMap(topic => topic.words);
  const personalWords = (Array.isArray(customWords) ? customWords : []).filter(word => word?.isCustom);
  return unique([...topicWords, ...personalWords]);
}

/** Kelime kimliğinden kelimeyi bulur: önce kişisel kelimeler, sonra tüm statik konular. */
export function findMiniQuizWord(id: string | null | undefined, customWords?: Word[] | null): Word | null {
  if (!id) return null;
  const personal = (Array.isArray(customWords) ? customWords : []).find(word => word?.id === id);
  if (isUsable(personal)) return personal;
  for (const topic of ALL_TOPICS) {
    const found = topic.words.find(word => word.id === id);
    if (isUsable(found)) return found;
  }
  return null;
}

/**
 * Yanlış seçenekler kelimenin kendi havuzundan gelir (konu kelimesi için konusu, kişisel kelime
 * için kişisel kelimeler); yetmezse seviye havuzuna düşer. İki farklı yanlış anlam bulunamazsa null.
 */
export function buildMiniQuizQuestion(
  word: Word,
  candidates: Word[],
  customWords: Word[] | null | undefined,
  random: () => number = Math.random,
): MiniQuizQuestion | null {
  if (!isUsable(word)) return null;

  const ownPool = word.isCustom
    ? (Array.isArray(customWords) ? customWords.filter(item => item?.isCustom) : [])
    : (word.topicId ? getTopicById(word.topicId)?.words ?? [] : []);

  const seenMeanings = new Set([normalizeMeaning(word.turkish)]);
  const distractors: string[] = [];
  for (const pool of [ownPool, candidates]) {
    for (const candidate of shuffle(unique(pool), random)) {
      const meaning = normalizeMeaning(candidate.turkish);
      if (candidate.id === word.id || seenMeanings.has(meaning)) continue;
      seenMeanings.add(meaning);
      distractors.push(candidate.turkish.trim());
      if (distractors.length === MINI_QUIZ_OPTION_COUNT - 1) break;
    }
    if (distractors.length === MINI_QUIZ_OPTION_COUNT - 1) break;
  }
  if (distractors.length < MINI_QUIZ_OPTION_COUNT - 1) return null;

  const correct = word.turkish.trim();
  const options = shuffle([correct, ...distractors], random);
  return { word, options, correctIndex: options.indexOf(correct) };
}

/**
 * Soru için kelime seçimi. Öncelik:
 * 1. Tekrar zamanı gelenler (en çok gecikenden), 2. zayıf/yanlış yapılanlar (seviyesi düşük, henüz
 * zamanı gelmemiş), 3. seviyeden rastgele bir kelime. Hiçbirinden soru kurulamazsa null.
 */
export function pickMiniQuizQuestion(source: MiniQuizSource = {}): MiniQuizQuestion | null {
  const { level, customWords, reviewStates, now = Date.now(), random = Math.random, excludeIds = [] } = source;
  const excluded = new Set(excludeIds);
  const candidates = getMiniQuizCandidates(level, customWords);
  const available = candidates.filter(word => !excluded.has(word.id));
  const states = reviewStates ?? {};

  const dueWords = findDueWords(available, states, now);
  const dueIds = new Set(dueWords.map(word => word.id));
  const weakWords = available
    .filter(word => {
      const state = getReviewState(word, states);
      return !dueIds.has(word.id) && Boolean(state.lastReviewed) && state.masteryLevel <= 1;
    })
    .sort((a, b) => {
      const aState = getReviewState(a, states);
      const bState = getReviewState(b, states);
      return aState.masteryLevel - bState.masteryLevel || getNextReviewAt(aState) - getNextReviewAt(bState);
    });
  const usedIds = new Set([...dueIds, ...weakWords.map(word => word.id)]);
  const randomWords = shuffle(available.filter(word => !usedIds.has(word.id)), random);

  for (const word of [...dueWords, ...weakWords, ...randomWords]) {
    const question = buildMiniQuizQuestion(word, candidates, customWords, random);
    if (question) return question;
  }
  return null;
}

const displayGerman = (word: Word) => {
  const german = word.german.trim();
  return word.article && !german.toLocaleLowerCase('de-DE').startsWith(`${word.article} `)
    ? `${word.article} ${german}`
    : german;
};

/** Günlük bildirim metni; uygun kelime yoksa null (genel bildirim metni kullanılır). */
export function getMiniQuizReminderContent(): ReminderContent | null {
  try {
    const { profile } = useUserStore.getState();
    const { words, reviewStates } = useWordStore.getState();
    // Seviye bilinmiyorsa kelime seçilmez; genel bildirim metni kullanılır.
    if (!profile?.level) return null;
    const question = pickMiniQuizQuestion({ level: profile?.level, customWords: words, reviewStates });
    if (!question) return null;
    return {
      wordId: question.word.id,
      body: `Bugünün kelimesi: ${displayGerman(question.word)} — anlamını hatırlıyor musun?`,
    };
  } catch {
    return null;
  }
}
