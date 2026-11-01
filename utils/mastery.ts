import type { MasteryLevel } from '../types';

export const MAX_MASTERY: MasteryLevel = 3;
/** Flashcard "Biliyorum" kullanıcının kendi işaretidir; tek başına "Öğrenildi" (3) yapmaz. */
export const SELF_REPORTED_MAX_MASTERY: MasteryLevel = 2;

/**
 * Bir cevap sonrası yeni öğrenme seviyesi.
 * Doğru cevap seviyeyi 1 artırır (en çok `maxLevel`), yanlış cevap 1 azaltır (en az 0).
 * `maxLevel` mevcut seviyeden düşükse seviye korunur, doğru cevap seviyeyi düşürmez.
 */
export function nextMasteryLevel(
  current: MasteryLevel,
  correct: boolean,
  maxLevel: MasteryLevel = MAX_MASTERY,
): MasteryLevel {
  if (!correct) return Math.max(0, current - 1) as MasteryLevel;
  if (current >= maxLevel) return current;
  return Math.min(maxLevel, current + 1) as MasteryLevel;
}
