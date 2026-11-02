import type { MasteryLevel, Word } from '../types';
import type { ReviewStateMap } from './spaced-repetition';
import { normalizeTimestamp } from './timestamps';

// Zaman damgası doğrulama kuralları paylaşılan modüldedir; eski içe aktarma yolları için yeniden dışa aktarılır.
export { MAX_FUTURE_SKEW_MS, MIN_VALID_TIMESTAMP, normalizeTimestamp } from './timestamps';

// Aynı kelimenin ilerlemesi iki yerde (yerel cihaz ve bulut) farklı olabildiğinde hangisinin
// geçerli olacağını belirleyen saf birleştirme kuralı. Ekran, depolama veya ağ bağımlılığı yoktur.
//
// Kural (sunucu tarafındaki user_word_progress tetikleyicisiyle aynıdır):
// 1. `lastReviewed` değeri daha YENİ olan kayıt kazanır; seviyesi düşük olsa bile (yanlış cevap
//    seviyeyi düşürebilir, bu yüzden "yüksek seviye kazanır" kullanılmaz).
// 2. Zaman damgaları eşitse yüksek seviye kazanır (iki taraf aynı sonuca yakınsar).
// 3. Geçersiz/eksik/saçma zaman damgası "bilinmiyor" sayılır; geçerli olan taraf kazanır. İkisi de
//    bilinmiyorsa bulut değeri korunur (mevcut senkronizasyon davranışı).
// 4. İleri tarihli damga (cihaz saati ileriyse) şimdiye çekilir; sunucu da aynısını yapar.
//
// Sınırlama: cihaz saatine güvenilir. Saati çok geri olan bir cihazdaki gerçek tekrar, daha ileri
// tarihli bir kayıtla karşılaştığında kaybedebilir. Sunucu yalnızca ileri sapmayı sınırlar.

export interface ProgressSnapshot {
  masteryLevel: MasteryLevel;
  lastReviewed?: number;
}

export type MergeSource = 'local' | 'cloud' | 'same';

export interface MergeResult {
  state: ProgressSnapshot;
  /** Sonucun hangi taraftan geldiği; 'local' ise bulutun güncellenmesi gerekir. */
  source: MergeSource;
}

export function normalizeMastery(value: unknown): MasteryLevel {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(3, Math.round(number))) as MasteryLevel;
}

const normalize = (state: ProgressSnapshot, now: number): ProgressSnapshot => ({
  masteryLevel: normalizeMastery(state.masteryLevel),
  lastReviewed: normalizeTimestamp(state.lastReviewed, now),
});

export function mergeProgress(
  local: ProgressSnapshot,
  cloud: ProgressSnapshot,
  now: number = Date.now(),
): MergeResult {
  const l = normalize(local, now);
  const c = normalize(cloud, now);
  const lt = l.lastReviewed;
  const ct = c.lastReviewed;

  if (lt === undefined && ct === undefined) return { state: c, source: 'cloud' };
  if (ct === undefined) return { state: l, source: 'local' };
  if (lt === undefined) return { state: c, source: 'cloud' };

  if (lt > ct) return { state: l, source: 'local' };
  if (ct > lt) return { state: c, source: 'cloud' };

  // Aynı an: yüksek seviye kazanır; tamamen aynıysa değişiklik yok.
  if (l.masteryLevel > c.masteryLevel) return { state: l, source: 'local' };
  if (c.masteryLevel > l.masteryLevel) return { state: c, source: 'cloud' };
  return { state: c, source: 'same' };
}

// ─── Kişisel kelime ilerlemesinin senkron birleştirmesi ──────────────────────

export interface CustomWordProgressMergeInput {
  /** Buluttan gelen (bekleyen silmeler çıkarılmış, bekleyen yerel yazmalar uygulanmış) kelimeler. */
  cloudWords: Map<string, Word>;
  /** Cihazdaki kişisel kelimeler (senkron başlangıcındaki görüntü). */
  localCustomWords: Word[];
  /** Cihazdaki en güncel reviewStates. */
  reviewStates: ReviewStateMap;
  /** Yerelde bekleyen yazması olan kelimeler: yerel kayıt zaten kazanır, dokunulmaz. */
  pendingUpsertIds: Set<string>;
  now?: number;
}

export interface CustomWordProgressMergeResult {
  words: Map<string, Word>;
  reviewStates: ReviewStateMap;
  reviewStatesChanged: boolean;
  /** Yerel ilerlemesi buluttakinden yeni olan, buluta yeniden gönderilmesi gereken kelimeler. */
  pushIds: string[];
}

/**
 * Kişisel kelimenin ilerlemesi hem bulut satırında (`mastery_level`, `last_reviewed`) hem yerel
 * `reviewStates` kaydında bulunur ve `reviewStates` öncelikli okunur. Bulut verisi alınırken kelime
 * başına `mergeProgress` kuralı uygulanır; böylece ne eski bulut verisi yeni yerel cevabı ne de
 * bayat yerel kayıt başka cihazda yapılan yeni çalışmayı ezer.
 */
export function mergeCustomWordProgress(input: CustomWordProgressMergeInput): CustomWordProgressMergeResult {
  const { cloudWords, localCustomWords, reviewStates, pendingUpsertIds, now = Date.now() } = input;
  const words = new Map(cloudWords);
  const nextReviewStates: ReviewStateMap = { ...reviewStates };
  const localById = new Map(localCustomWords.map(word => [word.id, word] as const));
  const pushIds: string[] = [];
  let reviewStatesChanged = false;

  for (const [id, cloudWord] of cloudWords) {
    if (!cloudWord.isCustom || pendingUpsertIds.has(id)) continue;
    const localWord = localById.get(id);
    const localState: ProgressSnapshot | undefined = reviewStates[id]
      ?? (localWord ? { masteryLevel: localWord.masteryLevel, lastReviewed: localWord.lastReviewed } : undefined);
    if (!localState) continue; // bu cihazda geçmiş yok: bulut değeri geçerli

    const merged = mergeProgress(
      localState,
      { masteryLevel: cloudWord.masteryLevel, lastReviewed: cloudWord.lastReviewed },
      now,
    );
    words.set(id, { ...cloudWord, masteryLevel: merged.state.masteryLevel, lastReviewed: merged.state.lastReviewed });

    const previous = reviewStates[id];
    if (
      !previous
      || previous.masteryLevel !== merged.state.masteryLevel
      || previous.lastReviewed !== merged.state.lastReviewed
    ) {
      nextReviewStates[id] = merged.state;
      reviewStatesChanged = true;
    }
    if (merged.source === 'local') pushIds.push(id);
  }

  return { words, reviewStates: nextReviewStates, reviewStatesChanged, pushIds };
}
