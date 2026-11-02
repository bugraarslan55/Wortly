import type { ScenarioResult } from './learning-analysis';
import { MIN_VALID_TIMESTAMP, mergeProgress, normalizeMastery, normalizeTimestamp } from './progress-merge';
import type { ProgressSnapshot } from './progress-merge';
import type { ReviewStateMap } from './spaced-repetition';

// Cihazlar arası öğrenme senkronizasyonunun saf çekirdeği (ağ ve depolama enjekte edilir).
// Store bu işlevleri Supabase "taşıyıcıları" ile çağırır; testler sahte taşıyıcı kullanır.
//
// Güvenlik ilkeleri:
// - Yerel veri yalnızca bulutla BİRLEŞTİRİLİR; hiçbir koşulda silinmez.
// - Ağ/yazma hatasında `ok: false` döner ve çağıran taraf "senkronize edildi" işaretlemez.
// - Yükleme idempotenttir (sunucuda birincil anahtar + çakışma kuralı); aynı kayıt tekrar gönderilebilir.

export const PAGE_SIZE = 1000; // PostgREST varsayılan satır sınırı
export const UPLOAD_CHUNK = 500;
const MAX_PAGES = 200; // sonsuz döngü koruması (200 bin satır)

// ─── Sayfalama ──────────────────────────────────────────────────────────────

export interface PageResult<T> {
  rows: T[] | null;
  error: boolean;
}

/** `range(from, to)` ile tüm sayfaları okur. Herhangi bir sayfa hatalıysa ok=false döner. */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<{ rows: T[]; ok: boolean }> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error || !result.rows) return { rows: all, ok: false };
    all.push(...result.rows);
    if (result.rows.length < pageSize) return { rows: all, ok: true };
  }
  return { rows: all, ok: false };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─── Konu kelimesi ilerlemesi ───────────────────────────────────────────────

export interface ProgressRow {
  word_id: string;
  mastery_level: number;
  last_reviewed: string;
}

export interface ProgressTransport {
  fetchPage: (from: number, to: number) => Promise<PageResult<ProgressRow>>;
  /** Satırları yükler (sunucu çakışma kuralını uygular). Başarılıysa true. */
  upsert: (rows: ProgressRow[]) => Promise<boolean>;
}

export function toProgressRow(wordId: string, state: ProgressSnapshot, now: number = Date.now()): ProgressRow | null {
  const last = normalizeTimestamp(state.lastReviewed, now);
  if (!wordId || last === undefined) return null; // sunucu geçerli son tekrar zamanı ister
  return {
    word_id: wordId,
    mastery_level: normalizeMastery(state.masteryLevel),
    last_reviewed: new Date(last).toISOString(),
  };
}

export function fromProgressRow(row: ProgressRow, now: number = Date.now()): ProgressSnapshot {
  return {
    masteryLevel: normalizeMastery(row.mastery_level),
    lastReviewed: normalizeTimestamp(row.last_reviewed, now),
  };
}

export interface ProgressSyncInput {
  /** Cihazdaki reviewStates (kişisel kelimeler dahil olabilir; yalnızca statik olanlar eşitlenir). */
  localStates: ReviewStateMap;
  /**
   * Yalnızca uygulamayla gelen (statik) kelime kimlikleri için true döner. Kişisel kelimelerin ilerlemesi
   * `user_words` ile eşitlenir; silinmiş kişisel kelimelerin veya bilinmeyen kimliklerin kayıtları
   * burada gönderilmez/uygulanmaz.
   */
  isStaticId: (id: string) => boolean;
  transport: ProgressTransport;
  now?: number;
}

export interface ProgressSyncResult {
  ok: boolean;
  /** Buluttan alınıp yerele UYGULANMASI gereken kayıtlar (yerel eksik veya bulut daha güncel). */
  pulled: Record<string, ProgressSnapshot>;
  /** Buluta yüklenen kelime kimlikleri. */
  uploadedIds: string[];
  /** Yüklenemeyen kimlikler (hata); kuyrukta kalmalıdır. */
  failedIds: string[];
}

/**
 * Tam senkron: bulutu sayfalayarak oku, kelime başına `mergeProgress` kuralıyla birleştir,
 * yerelde eksik/eski olanları `pulled` olarak döndür, bulutta eksik/eski olanları yükle.
 */
export async function syncProgressWithCloud(input: ProgressSyncInput): Promise<ProgressSyncResult> {
  const { localStates, isStaticId, transport, now = Date.now() } = input;
  const fetched = await fetchAllPages(transport.fetchPage);
  if (!fetched.ok) return { ok: false, pulled: {}, uploadedIds: [], failedIds: [] };

  const cloud = new Map<string, ProgressSnapshot>();
  for (const row of fetched.rows) {
    if (!row.word_id || !isStaticId(row.word_id)) continue;
    cloud.set(row.word_id, fromProgressRow(row, now));
  }

  const pulled: Record<string, ProgressSnapshot> = {};
  const toUpload: ProgressRow[] = [];

  for (const [id, cloudState] of cloud) {
    const local = localStates[id];
    if (!local) {
      pulled[id] = cloudState;
      continue;
    }
    const merged = mergeProgress(local, cloudState, now);
    if (merged.source === 'cloud') {
      const same = local.masteryLevel === merged.state.masteryLevel && local.lastReviewed === merged.state.lastReviewed;
      if (!same) pulled[id] = merged.state;
    } else if (merged.source === 'local') {
      const row = toProgressRow(id, merged.state, now);
      if (row) toUpload.push(row);
    }
  }

  for (const [id, local] of Object.entries(localStates)) {
    if (!isStaticId(id) || cloud.has(id)) continue;
    const row = toProgressRow(id, local, now);
    if (row) toUpload.push(row);
  }

  const upload = await uploadProgressRows(toUpload, transport);
  return { ok: upload.failed.length === 0, pulled, uploadedIds: upload.uploaded, failedIds: upload.failed };
}

async function uploadProgressRows(rows: ProgressRow[], transport: ProgressTransport) {
  const uploaded: string[] = [];
  const failed: string[] = [];
  for (const group of chunk(rows, UPLOAD_CHUNK)) {
    const ok = await transport.upsert(group);
    (ok ? uploaded : failed).push(...group.map(row => row.word_id));
  }
  return { uploaded, failed };
}

export interface ProgressFlushResult {
  ok: boolean;
  uploadedIds: string[];
  failedIds: string[];
  /** Yerelde geçerli kaydı olmayan kimlikler: gönderilecek bir şey yok, kuyruktan çıkarılabilir. */
  droppedIds: string[];
}

/** Hafif akış: yalnızca bekleyen kimlikleri yükler (bulutu okumaz). */
export async function flushProgressIds(
  ids: string[],
  localStates: ReviewStateMap,
  isStaticId: (id: string) => boolean,
  transport: ProgressTransport,
  now: number = Date.now(),
): Promise<ProgressFlushResult> {
  const rows: ProgressRow[] = [];
  const droppedIds: string[] = [];
  for (const id of new Set(ids)) {
    const state = localStates[id];
    const row = isStaticId(id) && state ? toProgressRow(id, state, now) : null;
    if (row) rows.push(row);
    else droppedIds.push(id);
  }
  const upload = await uploadProgressRows(rows, transport);
  return { ok: upload.failed.length === 0, uploadedIds: upload.uploaded, failedIds: upload.failed, droppedIds };
}

export type OwnerDecision = 'adopt' | 'proceed' | 'skip';

/**
 * Cihazdaki reviewStates kime ait? Başka bir kullanıcıya aitse (hesap değişimi) hiçbir şey
 * yüklenmez/uygulanmaz; sahibi belirsizse (eski sürümden kalan yerel veri) bu kullanıcı devralır,
 * kelime senkronizasyonundaki mevcut davranışla aynı.
 */
export function decideProgressOwnership(reviewOwner: string | null, userId: string): OwnerDecision {
  if (!userId) return 'skip';
  if (reviewOwner === null || reviewOwner === '') return 'adopt';
  return reviewOwner === userId ? 'proceed' : 'skip';
}

// ─── Senaryo sonuçları ──────────────────────────────────────────────────────

export interface ScenarioRow {
  id: string;
  scenario_id: string;
  score: number;
  total: number;
  completed_at: string;
}

export interface ScenarioTransport {
  fetchPage: (from: number, to: number) => Promise<PageResult<ScenarioRow>>;
  /** Satırları yükler (tekrarlar sunucuda yok sayılır). Başarılıysa true. */
  insert: (rows: ScenarioRow[]) => Promise<boolean>;
  /** Bulutta kayıtlı toplam sonuç sayısı (satırları indirmeden); bilinmiyorsa null. */
  count?: () => Promise<number | null>;
}

/** Kimliği olmayan eski kayıtlar için içerikten türetilen kararlı kimlik (aynı kayıt hep aynı kimlik). */
export function legacyScenarioId(result: ScenarioResult): string {
  const source = `${result.scenarioId ?? ''}|${result.date ?? 0}|${result.score}|${result.total}`;
  let hash = 5381;
  for (let i = 0; i < source.length; i += 1) hash = ((hash * 33) ^ source.charCodeAt(i)) >>> 0;
  return `legacy-${(result.date ?? 0).toString(36)}-${hash.toString(36)}`;
}

/** Eski (kimliksiz) kayıtlara kararlı kimlik atar; mevcut kimlikler ve kayıtlar korunur. */
export function ensureScenarioIds(results: ScenarioResult[]): { results: ScenarioResult[]; changed: boolean } {
  let changed = false;
  const seen = new Set<string>();
  const next = results.map(result => {
    let id = result.id && result.id.length >= 8 ? result.id : legacyScenarioId(result);
    // Aynı içerikli iki eski kayıt çakışmasın.
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    if (id === result.id) return result;
    changed = true;
    return { ...result, id };
  });
  return { results: next, changed };
}

export function toScenarioRow(result: ScenarioResult, now: number = Date.now()): ScenarioRow | null {
  const completed = normalizeTimestamp(result.date, now);
  const { id, scenarioId, score, total } = result;
  if (!id || id.length < 8 || id.length > 80) return null;
  if (!scenarioId || scenarioId.length > 200) return null;
  if (!Number.isInteger(score) || !Number.isInteger(total) || total < 1 || score < 0 || score > total) return null;
  if (completed === undefined || completed < MIN_VALID_TIMESTAMP) return null;
  return { id, scenario_id: scenarioId, score, total, completed_at: new Date(completed).toISOString() };
}

export function fromScenarioRow(row: ScenarioRow): ScenarioResult {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    score: row.score,
    total: row.total,
    date: Date.parse(row.completed_at) || undefined,
  };
}

const byNewest = (a: ScenarioResult, b: ScenarioResult) => (b.date ?? 0) - (a.date ?? 0);

export interface ScenarioSyncInput {
  /** Cihazdaki sonuçlar (kimlikler `ensureScenarioIds` ile tamamlanmış olmalı). */
  local: ScenarioResult[];
  transport: ScenarioTransport;
  /** Yerelde tutulacak en fazla sonuç; bulutta doğrulanmamış kayıtlar sınırın dışında da korunur. */
  cap: number;
  now?: number;
}

export interface ScenarioSyncResult {
  ok: boolean;
  /** Yerele yazılacak birleşik liste (yeniden eskiye). */
  merged: ScenarioResult[];
  uploadedIds: string[];
  failedIds: string[];
  /** Geçersiz olduğu için buluta gönderilemeyen (ama yerelde korunan) kayıtlar. */
  skippedIds: string[];
}

/** Tam senkron: bulutu sayfalayarak oku, yerel ile kimlik üzerinden birleştir, eksikleri yükle. */
export async function syncScenariosWithCloud(input: ScenarioSyncInput): Promise<ScenarioSyncResult> {
  const { local, transport, cap, now = Date.now() } = input;
  const fetched = await fetchAllPages(transport.fetchPage);
  if (!fetched.ok) {
    return { ok: false, merged: [...local].sort(byNewest), uploadedIds: [], failedIds: [], skippedIds: [] };
  }

  const cloudById = new Map(fetched.rows.map(row => [row.id, fromScenarioRow(row)] as const));
  const localById = new Map<string, ScenarioResult>();
  for (const result of local) if (result.id) localById.set(result.id, result);

  const toUpload: ScenarioRow[] = [];
  const skippedIds: string[] = [];
  for (const [id, result] of localById) {
    if (cloudById.has(id)) continue;
    const row = toScenarioRow(result, now);
    if (row) toUpload.push(row);
    else skippedIds.push(id);
  }

  const uploaded: string[] = [];
  const failed: string[] = [];
  for (const group of chunk(toUpload, UPLOAD_CHUNK)) {
    const ok = await transport.insert(group);
    (ok ? uploaded : failed).push(...group.map(row => row.id));
  }

  // Birleşim: aynı kimlik tek kez (yerel nesne korunur). Sınır yalnızca bulutta doğrulanmış
  // kayıtları kırpar; yüklenemeyen/geçersiz yerel kayıtlar sınırın dışında da tutulur.
  const unverified = new Set([...failed, ...skippedIds]);
  const all = new Map<string, ScenarioResult>(cloudById);
  for (const [id, result] of localById) all.set(id, result);
  const sorted = Array.from(all.values()).sort(byNewest);
  const kept = sorted.filter((result, index) => index < cap || (result.id !== undefined && unverified.has(result.id)));

  return { ok: failed.length === 0, merged: kept, uploadedIds: uploaded, failedIds: failed, skippedIds };
}

/** Hafif akış: yalnızca verilen kimlikleri yükler (bulutu okumaz). */
export async function flushScenarioIds(
  ids: string[],
  local: ScenarioResult[],
  transport: ScenarioTransport,
  now: number = Date.now(),
): Promise<{ ok: boolean; uploadedIds: string[]; failedIds: string[]; droppedIds: string[] }> {
  const byId = new Map(local.filter(r => r.id).map(r => [r.id as string, r] as const));
  const rows: ScenarioRow[] = [];
  const droppedIds: string[] = [];
  for (const id of new Set(ids)) {
    const result = byId.get(id);
    const row = result ? toScenarioRow(result, now) : null;
    if (row) rows.push(row);
    else droppedIds.push(id);
  }
  const uploaded: string[] = [];
  const failed: string[] = [];
  for (const group of chunk(rows, UPLOAD_CHUNK)) {
    const ok = await transport.insert(group);
    (ok ? uploaded : failed).push(...group.map(row => row.id));
  }
  return { ok: failed.length === 0, uploadedIds: uploaded, failedIds: failed, droppedIds };
}

/** Yerel listeye gelen yeni sonuçları (örn. senkron sırasında kaydedilenler) kaybetmeden birleştirir. */
export function mergeLateScenarioResults(merged: ScenarioResult[], latestLocal: ScenarioResult[]): ScenarioResult[] {
  const known = new Set(merged.map(result => result.id));
  const late = latestLocal.filter(result => !result.id || !known.has(result.id));
  return late.length === 0 ? merged : [...late, ...merged].sort(byNewest);
}
