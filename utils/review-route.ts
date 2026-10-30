import { useUserStore, useWordStore } from '../store';
import { getTopicsForLevel } from '../constants/topics';
import { getReviewState, isWordDue } from './spaced-repetition';

// Ana ekrandaki "Tekrar Zamanı" kartıyla aynı yönlendirme mantığı.
export function getReviewRoute(): string {
  const { profile } = useUserStore.getState();
  const { words, reviewStates } = useWordStore.getState();
  const topics = getTopicsForLevel(profile?.level || 'A1');

  const allWords = [...topics.flatMap(topic => topic.words), ...words.filter(word => word.isCustom)];
  const candidates = Array.from(new Map(allWords.map(word => [word.id, word])).values());
  const firstDueWord = candidates.find(
    word => Boolean(getReviewState(word, reviewStates).lastReviewed) && isWordDue(word, reviewStates),
  );

  if (firstDueWord?.isCustom) return '/kelime/calis';
  if (firstDueWord?.topicId) return `/konu/${firstDueWord.topicId}/alistirma`;
  return '/konular';
}
