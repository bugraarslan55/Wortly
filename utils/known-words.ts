import type { Word } from '../types';

/**
 * "Bilinen" kelime kimliği: uygulamayla gelen konu kelimesi VEYA cihazdaki kişisel kelime.
 * Silinmiş kişisel kelimelerin (veya veri sürümünden kaldırılmış konu kelimelerinin) artık var olmayan
 * ilerleme kayıtları istatistiklere ve rozetlere katılmasın diye kullanılır. Kayıtlar silinmez, yalnızca
 * sayımda yok sayılır.
 */
export function makeIsKnownWordId(
  words: Word[] | null | undefined,
  isStaticId: (id: string) => boolean,
): (id: string) => boolean {
  const custom = new Set((words ?? []).filter(word => word?.isCustom).map(word => word.id));
  return (id: string) => isStaticId(id) || custom.has(id);
}

/** `id` kaydı çıkarılmış yeni ilerleme haritası; kayıt yoksa AYNI nesne döner (gereksiz yazma/render olmasın). */
export function withoutReviewState<T>(states: Record<string, T>, id: string): Record<string, T> {
  if (!(id in states)) return states;
  const next: Record<string, T> = { ...states };
  delete next[id];
  return next;
}
