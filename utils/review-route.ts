import { useUserStore, useWordStore } from '../store';
import { getTopicsForLevel } from '../constants/topics';
import { findDueWords } from './learning-analysis';
import { reviewRouteForDue } from './study-recommendations';
import { findMiniQuizWord } from './mini-quiz';

// Bildirime dokunulunca açılacak rota: kelime kimliği varsa mini quiz, yoksa tekrar akışı.
export function getNotificationRoute(data: Record<string, unknown> | null | undefined): string {
  const wordId = data?.wordId;
  // Kelime bu hesapta yoksa (silinmiş / başka hesaba ait kimlik) mini quiz açılmaz, tekrar akışına düşülür.
  if (typeof wordId === 'string' && wordId && findMiniQuizWord(wordId, useWordStore.getState().words)) {
    return `/mini-quiz?wordId=${encodeURIComponent(wordId)}`;
  }
  return getReviewRoute();
}

// Ana ekrandaki "Tekrar Zamanı" kartıyla aynı yönlendirme mantığı.
export function getReviewRoute(): string {
  const { profile } = useUserStore.getState();
  const { words, reviewStates } = useWordStore.getState();
  const topics = getTopicsForLevel(profile?.level || 'A1');

  const allWords = [...topics.flatMap(topic => topic.words), ...words.filter(word => word.isCustom)];
  const candidates = Array.from(new Map(allWords.map(word => [word.id, word])).values());
  // Ana Sayfa planı ve Analiz önerisiyle AYNI kural: en çok geciken kelimenin türüne göre rota.
  return reviewRouteForDue(findDueWords(candidates, reviewStates));
}
