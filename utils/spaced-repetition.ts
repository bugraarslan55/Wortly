import { MasteryLevel, Word } from '../types';

export type ReviewState = {
  masteryLevel: MasteryLevel;
  lastReviewed?: number;
};

export type ReviewStateMap = Record<string, ReviewState>;

const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_INTERVAL_DAYS: Record<MasteryLevel, number> = {
  0: 0,
  1: 1,
  2: 3,
  3: 7,
};

export function getReviewState(word: Word, reviewStates: ReviewStateMap): ReviewState {
  return reviewStates[word.id] ?? {
    masteryLevel: word.masteryLevel,
    lastReviewed: word.lastReviewed,
  };
}

export function getNextReviewAt(state: ReviewState): number {
  if (!state.lastReviewed || state.masteryLevel === 0) return 0;
  return state.lastReviewed + REVIEW_INTERVAL_DAYS[state.masteryLevel] * DAY_MS;
}

export function isWordDue(word: Word, reviewStates: ReviewStateMap, now = Date.now()): boolean {
  return getNextReviewAt(getReviewState(word, reviewStates)) <= now;
}

/** Zamanı gelen ve seviyesi düşük kelimeleri oturumun başına taşır. */
export function selectWordsForReview(
  words: Word[],
  limit: number,
  reviewStates: ReviewStateMap,
  now = Date.now(),
): Word[] {
  const uniqueWords = Array.from(new Map(words.map(word => [word.id, word])).values());

  return [...uniqueWords]
    .sort((a, b) => {
      const aState = getReviewState(a, reviewStates);
      const bState = getReviewState(b, reviewStates);
      const aDue = isWordDue(a, reviewStates, now);
      const bDue = isWordDue(b, reviewStates, now);

      if (aDue !== bDue) return aDue ? -1 : 1;

      const aNextReview = getNextReviewAt(aState);
      const bNextReview = getNextReviewAt(bState);
      if (aNextReview !== bNextReview) return aNextReview - bNextReview;
      if (aState.masteryLevel !== bState.masteryLevel) {
        return aState.masteryLevel - bState.masteryLevel;
      }

      return a.addedAt - b.addedAt;
    })
    .slice(0, Math.max(0, limit));
}
