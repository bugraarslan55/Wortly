// Cihazdaki kişisel verinin SAHİPLİĞİ ve park etme (karantina) mantığı. Saf; depolama, ağ ve ekran bağımlılığı yok.
//
// İlke: sahibi doğrulanamayan yerel veri ASLA bir kullanıcıya gösterilmez ve ASLA sessizce silinmez veya yeni
// kullanıcıya bağlanmaz. Başka bir kullanıcıya ait ya da sahibi bilinmeyen veri "park" edilir (sahibi anahtarıyla
// ayrı bir yere kopyalanır). Sahibi geri dönerse otomatik, sahibi bilinmiyorsa kullanıcının AÇIK onayıyla geri yüklenir.

export type Dataset = 'profile' | 'words' | 'review' | 'sessions';
export const DATASETS: Dataset[] = ['profile', 'words', 'review', 'sessions'];

/**
 * Park kayıtlarının türü. 'archive': kullanıcının KENDİ onayıyla hesabına bağladığı ama cihazdaki 100 kayıt sınırı nedeniyle
 * yerel listeye sığmayan çalışma kayıtları. Salt okunur görüntülenir; istatistik/görev/rozetlere ve eşitlemeye KATILMAZ ve
 * hiçbir zaman otomatik geri yüklenmez.
 */
export type ParkKind = Dataset | 'archive';

/** mine: bu kullanıcının; empty: veri yok (sızacak bir şey yok); foreign: başka kullanıcının; unknown: sahibi bilinmiyor. */
export type OwnerVerdict = 'mine' | 'empty' | 'foreign' | 'unknown';

export function verdictFor(input: {
  owner: string | null | undefined;
  userId: string;
  hasData: boolean;
  /** Bu kullanıcı adına kuyruğa alınmış bekleyen değişiklik var: sahiplik kanıtıdır. */
  hasOwnPendingChange?: boolean;
}): OwnerVerdict {
  const { owner, userId, hasData } = input;
  if (owner === userId) return 'mine';
  if (!hasData) return 'empty';
  if (owner) return 'foreign';
  return input.hasOwnPendingChange ? 'mine' : 'unknown';
}

/** Bu karar sonucunda ne yapılır? */
export function actionFor(verdict: OwnerVerdict): 'keep' | 'adopt' | 'park-foreign' | 'park-unknown' {
  switch (verdict) {
    case 'mine': return 'keep';
    case 'empty': return 'adopt';
    case 'foreign': return 'park-foreign';
    default: return 'park-unknown';
  }
}

export interface DatasetState {
  /** Bellekteki verinin sahibi (kayıtlı sahip anahtarından / eşitlemeden). */
  owner: string | null | undefined;
  hasData: boolean;
}

export interface LocalAccess {
  /** Her veri kümesi bu kullanıcı için güvenle gösterilebilir mi? */
  verified: boolean;
  /** Gösterilemeyen (sahibi doğrulanamayan veya başka kullanıcıya ait) veri kümeleri. */
  blocked: Dataset[];
}

/**
 * Yerel verilerin bu kullanıcıya gösterilip gösterilemeyeceği. Veri yoksa sorun yoktur. Sahibi bu kullanıcı ise
 * (çevrimdışı olsa bile) gösterilebilir. Başka kullanıcıya ait ya da sahibi bilinmeyen veri varsa engellenir.
 */
export function evaluateLocalAccess(input: {
  userId: string | null | undefined;
  datasets: Record<Dataset, DatasetState>;
}): LocalAccess {
  if (!input.userId) return { verified: true, blocked: [] };
  const blocked = DATASETS.filter((name) => {
    const state = input.datasets[name];
    if (!state?.hasData) return false;
    return state.owner !== input.userId;
  });
  return { verified: blocked.length === 0, blocked };
}

// ─── Park (karantina) kayıtları ──────────────────────────────────────────────

export const UNKNOWN_OWNER = '__unknown__';
const PARK_PREFIX = '@wortly:parked:';

/** Her park ayrı bir anahtardır (zaman damgalı): önceki park edilmiş veri asla ezilmez. */
export const parkedKey = (ownerId: string | null | undefined, dataset: ParkKind, at: number) =>
  `${PARK_PREFIX}${ownerId || UNKNOWN_OWNER}:${dataset}:${at}`;

export interface ParsedParkedKey {
  ownerId: string;
  dataset: ParkKind;
  at: number;
}

export function parseParkedKey(key: string): ParsedParkedKey | null {
  if (!key.startsWith(PARK_PREFIX)) return null;
  const rest = key.slice(PARK_PREFIX.length);
  const match = /^(.*):(profile|words|review|sessions|archive):(\d+)$/.exec(rest);
  if (!match) return null;
  return { ownerId: match[1]!, dataset: match[2] as ParkKind, at: Number(match[3]) };
}

/** Bir sahibin park edilmiş anahtarları, eskiden yeniye. */
export function parkedKeysFor(keys: readonly string[], ownerId: string, dataset?: ParkKind): string[] {
  return keys
    .map(key => ({ key, parsed: parseParkedKey(key) }))
    .filter((item): item is { key: string; parsed: ParsedParkedKey } =>
      !!item.parsed && item.parsed.ownerId === ownerId && (!dataset || item.parsed.dataset === dataset))
    .sort((a, b) => a.parsed.at - b.parsed.at)
    .map(item => item.key);
}

export interface ParkedEnvelope {
  version: 1;
  parkedAt: number;
  raw: string;
}

export const wrapParked = (raw: string, now: number): string => JSON.stringify({ version: 1, parkedAt: now, raw } satisfies ParkedEnvelope);

/** Park edilmiş metni güvenle açar; bozuksa null (veri silinmez, yalnızca okunamaz sayılır). */
export function unwrapParked(text: string | null | undefined): ParkedEnvelope | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.version === 1 && typeof parsed.raw === 'string' && Number.isFinite(parsed.parkedAt)) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Kimliğe göre birleştirir; aynı kimlikte MEVCUT (güncel) kayıt kazanır, park edilmiş kayıtlar eksikleri tamamlar. */
export function mergeParkedById<T extends { id: string }>(
  current: readonly T[] | null | undefined,
  parked: readonly T[] | null | undefined,
): T[] {
  const base = Array.isArray(current) ? current : [];
  const ids = new Set(base.map(item => item?.id));
  const extra = Array.isArray(parked) ? parked : [];
  return [...base, ...extra.filter(item => item && typeof item.id === 'string' && !ids.has(item.id))];
}

/** İnceleme durumlarını birleştirir; aynı kelimede daha yeni `lastReviewed` kazanır. */
export function mergeReviewStates<T extends { lastReviewed?: number }>(
  current: Record<string, T> | null | undefined,
  parked: Record<string, T> | null | undefined,
): Record<string, T> {
  const merged: Record<string, T> = { ...(current ?? {}) };
  for (const [id, state] of Object.entries(parked ?? {})) {
    if (!state || typeof state !== 'object') continue;
    const existing = merged[id];
    if (!existing || (state.lastReviewed ?? 0) > (existing.lastReviewed ?? 0)) merged[id] = state;
  }
  return merged;
}
