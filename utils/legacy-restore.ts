// Eski (sahibi doğrulanamayan, park edilmiş) kayıtların KURTARMA planı ve kullanıcıya gösterilecek açıklama. Saf mantık.
//
// İlkeler:
// - Mevcut kayıtlar ASLA ezilmez veya yerel listeden çıkarılmaz; kurtarma yalnızca BOŞ yer varsa ekler.
// - Cihazdaki oturum listesi 100 kayıtla sınırlıdır (bilinçli sınır, artırılmaz). Sığmayan kayıtlar silinmez, park alanında
//   güvende bekler ve kullanıcıya bu açıkça söylenir.
// - Aynı kayıt (kimliğe göre) ikinci kez eklenmez; tekrar deneme veriyi çoğaltmaz.

// ─── Sahibi bilinmeyen kayıtlar: kime sunulabilir? ──────────────────────────
//
// Sahibi bilinmeyen kayıtların KİME ait olduğunu teknik olarak doğrulayamayız: "bana ait" onayı kullanıcının beyanıdır,
// kanıt değildir. Bu yüzden teklif yalnızca belirsizliğin en düşük olduğu durumda yapılır: bu cihazda (güncellemeden beri)
// YALNIZCA tek bir hesap kullanıldıysa ve o hesapla giriş yapıldıysa. Cihazda birden fazla hesap kullanıldıysa kayıtlar
// güvenle BEKLETİLİR: hiçbir hesaba sunulmaz ve aktarılmaz.
export type LegacyOffer = 'offer' | 'hold' | 'none';

export function legacyOfferState(
  deviceAccounts: readonly string[] | null | undefined,
  userId: string | null | undefined,
  hasLegacy: boolean,
): LegacyOffer {
  if (!hasLegacy) return 'none';
  if (!userId || !Array.isArray(deviceAccounts)) return 'hold'; // hesap geçmişi okunamadı: doğrulanamaz
  const unique = Array.from(new Set(deviceAccounts));
  return unique.length === 1 && unique[0] === userId ? 'offer' : 'hold';
}

export function addDeviceAccount(accounts: readonly string[] | null | undefined, userId: string): string[] {
  const base = Array.isArray(accounts) ? accounts.filter(item => typeof item === 'string' && item) : [];
  return base.includes(userId) ? base : [...base, userId];
}

export const HOLD_MESSAGE =
  'Bu cihazda birden fazla hesap kullanıldığı için bu eski kayıtların hangi hesaba ait olduğu doğrulanamıyor. '
  + 'Kayıtlar silinmedi; hiçbir hesaba aktarılmadan güvenle bekletiliyor.';

export const OFFER_CAVEAT =
  'Bu kayıtların kime ait olduğu teknik olarak doğrulanamıyor. Yalnızca bu hesap SENİNSE ve bu cihazda eski bir sürümde bu hesabı kullandıysan ekle.';

/** Salt okunur geçmiş görüntüleme için sayfalama (yeni eklenen sayfa boyutu kadar kayıt). */
export function paginate<T>(items: readonly T[], page: number, size: number): { items: T[]; hasMore: boolean; total: number } {
  const safeSize = Math.max(1, Math.floor(size));
  const end = Math.max(1, Math.floor(page)) * safeSize;
  return { items: items.slice(0, end), hasMore: items.length > end, total: items.length };
}

export interface SessionLike {
  id: string;
  date: number;
}

export interface SessionRestorePlan<T extends SessionLike> {
  /** Şimdi eklenecekler (boş yer kadar, en yeniler önce). */
  toAdd: T[];
  /** Kayıt sınırı nedeniyle şimdilik eklenemeyenler (silinmez, parkta bekler). */
  waiting: T[];
  /** Zaten yerelde olan kayıtlar (tekrar eklenmez). */
  alreadyPresent: number;
}

export function planSessionRestore<T extends SessionLike>(
  current: readonly SessionLike[] | null | undefined,
  parked: readonly T[] | null | undefined,
  limit: number,
): SessionRestorePlan<T> {
  const base = Array.isArray(current) ? current : [];
  const presentIds = new Set(base.map(item => item?.id));
  const seen = new Set<string>();
  const candidates: T[] = [];
  let alreadyPresent = 0;
  for (const item of Array.isArray(parked) ? parked : []) {
    if (!item || typeof item.id !== 'string') continue;
    if (presentIds.has(item.id)) { alreadyPresent += 1; continue; }
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    candidates.push(item);
  }
  candidates.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  const capacity = Math.max(0, limit - base.length);
  return { toAdd: candidates.slice(0, capacity), waiting: candidates.slice(capacity), alreadyPresent };
}

/** Park edilmiş kelimelerden henüz yerelde olmayan (yeni eklenecek) kişisel kelimeler. */
export function planWordRestore<T extends { id: string; isCustom?: boolean }>(
  current: readonly { id: string }[] | null | undefined,
  parked: readonly T[] | null | undefined,
): T[] {
  const present = new Set((Array.isArray(current) ? current : []).map(item => item?.id));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const word of Array.isArray(parked) ? parked : []) {
    if (!word || typeof word.id !== 'string' || !word.isCustom || present.has(word.id) || seen.has(word.id)) continue;
    seen.add(word.id);
    out.push(word);
  }
  return out;
}

/** Park edilmiş tekrar durumlarından eklenecek/güncellenecek kelime kimlikleri (yeni olanlar ya da daha yeni çalışılanlar). */
export function planReviewRestore(
  current: Record<string, { lastReviewed?: number }> | null | undefined,
  parked: Record<string, { lastReviewed?: number }> | null | undefined,
): string[] {
  const base = current ?? {};
  return Object.entries(parked ?? {})
    .filter(([id, state]) => !!state && typeof state === 'object' && (!(id in base) || (state.lastReviewed ?? 0) > (base[id]?.lastReviewed ?? 0)))
    .map(([id]) => id);
}

export interface RestoreOutcome {
  /** Bu işlemde gerçekten eklenen kayıt sayısı. */
  restored: number;
  /** Kayıt sınırı nedeniyle henüz eklenemeyen, parkta güvende bekleyen kayıt sayısı. */
  waiting: number;
}

export type OutcomeTone = 'success' | 'partial' | 'nothing';

/** Kullanıcıya gösterilecek sonuç: tamamı eklenmediyse ASLA tam başarı mesajı verilmez. */
export function describeRestoreOutcome(outcome: RestoreOutcome): { tone: OutcomeTone; text: string } {
  const { restored, waiting } = outcome;
  if (waiting > 0 && restored > 0) {
    return {
      tone: 'partial',
      text: `${restored} kayıt hesabına eklendi. Kalan ${waiting} çalışma kaydı cihazdaki kayıt sınırı (100 kayıt) nedeniyle henüz eklenemedi. Verilerin güvende, silinmedi.`,
    };
  }
  if (waiting > 0) {
    return {
      tone: 'nothing',
      text: `Yeni kayıt eklenmedi. ${waiting} çalışma kaydı cihazdaki kayıt sınırı (100 kayıt) nedeniyle henüz eklenemiyor. Verilerin güvende, silinmedi; tekrar denemek kayıtları çoğaltmaz.`,
    };
  }
  if (restored > 0) return { tone: 'success', text: `${restored} kayıt hesabına eklendi.` };
  return { tone: 'nothing', text: 'Eklenecek yeni kayıt kalmadı.' };
}

/** Özet kartında gösterilen bekleyen kayıtlar için açıklama (yoksa boş). */
export function describeWaiting(waiting: number): string {
  return waiting > 0
    ? `${waiting} çalışma kaydı cihazdaki kayıt sınırı (100 kayıt) nedeniyle henüz eklenemedi. Verilerin güvende; hiçbiri silinmedi.`
    : '';
}
