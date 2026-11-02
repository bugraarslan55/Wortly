import type { Word } from '../types';
import type { ReviewStateMap } from './spaced-repetition';

// Çıkış uyarısının içeriğini belirleyen saf mantık (ekranlardan bağımsız, test edilebilir).
//
// Konu kelimelerinin çalışma geçmişi (`reviewStates`) şu an buluta kaydedilmiyor ve çıkışta
// cihazdan silinir. Bu yüzden "senkronize edilmiş" gibi gösterilmez ve kullanıcı açıkça onay
// vermeden silinmez.

/**
 * Yalnızca bu cihazda bulunan konu ilerlemesi: kişisel olmayan (statik) kelimelere ait,
 * en az bir kez tekrar edilmiş kayıt sayısı. Kişisel kelimelerin ilerlemesi `user_words` ile
 * zaten buluta gider ve burada sayılmaz.
 */
export function countLocalOnlyProgress(
  reviewStates: ReviewStateMap | null | undefined,
  words: Word[] | null | undefined,
): number {
  const customIds = new Set((words ?? []).filter(word => word.isCustom).map(word => word.id));
  let count = 0;
  for (const [id, state] of Object.entries(reviewStates ?? {})) {
    if (customIds.has(id)) continue;
    if (state && typeof state.lastReviewed === 'number' && Number.isFinite(state.lastReviewed)) count += 1;
  }
  return count;
}

export type SignOutKind = 'plain' | 'pending' | 'progress' | 'both';

export interface SignOutPlan {
  kind: SignOutKind;
  title: string;
  message: string;
  /** true ise silme için açık onay (yıkıcı düğme) gerekir. */
  needsDeleteConfirmation: boolean;
  /** true ise "Önce senkronize et" seçeneği sunulur. */
  offerSync: boolean;
}

export function buildSignOutPlan(pendingChanges: number, localOnlyProgress: number): SignOutPlan {
  // NaN/negatif/sonsuz değerler 0 sayılır.
  const toCount = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
  const pending = toCount(pendingChanges);
  const progress = toCount(localOnlyProgress);

  const progressText =
    `Bu cihazdaki ${progress} konu kelimesinin çalışma geçmişi (seviyeler ve tekrar zamanları) ` +
    'henüz buluta kaydedilmiyor. Çıkış yaparsan bu ilerleme silinir ve başka cihazda görünmez.';
  const pendingText = `${pending} değişiklik henüz buluta gönderilmedi.`;

  if (pending === 0 && progress === 0) {
    return {
      kind: 'plain',
      title: 'Çıkış Yap',
      message: 'Hesabından çıkış yapmak istiyor musun?',
      needsDeleteConfirmation: false,
      offerSync: false,
    };
  }
  if (progress === 0) {
    return {
      kind: 'pending',
      title: 'Senkronize edilmemiş değişiklikler',
      message: `${pendingText} Şimdi çıkış yaparsan bu değişiklikler kaybolur.`,
      needsDeleteConfirmation: true,
      offerSync: true,
    };
  }
  if (pending === 0) {
    return {
      kind: 'progress',
      title: 'Konu ilerlemen silinecek',
      message: progressText,
      needsDeleteConfirmation: true,
      offerSync: false,
    };
  }
  return {
    kind: 'both',
    title: 'Kaydedilmemiş veriler var',
    message:
      `${pendingText} Senkronize edebilirsin. Ancak ${progressText.charAt(0).toLowerCase()}${progressText.slice(1)}`,
    needsDeleteConfirmation: true,
    offerSync: true,
  };
}
