import { ALL_TOPICS } from '../constants/topics';

// Uygulamayla gelen konu kelimelerinin kimlikleri (topicId + artikel + Almanca kelimeden türetilir ve
// uygulama yeniden başlasa da değişmez; bkz. constants/topics.ts). Kişisel kelimelerin kimlikleri
// rastgele üretilir ve bu kümede bulunmaz. Böylece konu ilerlemesi senkronu kişisel/silinmiş/bilinmeyen
// kimlikleri yanlışlıkla statik saymaz.
//
// Not: bir konu kelimesinin Almanca yazımı, artikeli veya konusu veri güncellemesinde değişirse kimliği
// de değişir ve eski kimlikteki ilerleme yeni kelimeyle eşleşmez (veri sürümü değişiklikleri dikkatle yapılmalı).

let cache: Set<string> | null = null;

export function getStaticWordIds(): Set<string> {
  if (!cache) cache = new Set(ALL_TOPICS.flatMap(topic => topic.words.map(word => word.id)));
  return cache;
}

export const isStaticWordId = (id: string): boolean => getStaticWordIds().has(id);
