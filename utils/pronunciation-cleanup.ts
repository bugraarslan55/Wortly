// Telaffuz kayıtlarında "yetim" (sahipsiz) veriyi bulan saf mantık. Bu modül hiçbir şeyi SİLMEZ; yalnızca
// ne silinebileceğini raporlar. Silme, kullanıcı açık onay verdikten sonra pronunciation-storage'da yapılır.
//
// Yetim türleri:
// 1) Haritada kaydı olan ama kelimesi artık var olmayan GEÇERLİ KULLANICININ girişleri (kelime silindi).
// 2) Hiçbir kullanıcının haritasında olmayan, Wortly'nin adlandırma desenine uyan ve yeterince eski dosyalar
//    (kayıt sırasında uygulama kapandı, harita yazılamadı vb.).
//
// Güvenlik: başka kullanıcıların girişlerine ve dosyalarına asla dokunulmaz; herhangi bir kullanıcının haritasında
// geçen dosya yetim sayılmaz; haritalar eksiksiz okunamadıysa veya kelime listesi güvenilir değilse ilgili tür
// raporlanmaz; genç dosyalar (devam eden kayıt/yazım) atlanır.

// Saklama anahtarları kullanıcıya özeldir; farklı kullanıcıların kayıtları karışmaz.
export const MAP_KEY_PREFIX = '@wortly:pronunciations:';
export const recordingMapKey = (userId: string) => `${MAP_KEY_PREFIX}${userId}`;
/** Kullanıcının "kelimeyi sil, kaydı sakla" dediği kelimeler: otomatik/toplu temizliğe girmez. */
export const keptRecordingsKey = (userId: string) => `${recordingMapKey(userId)}:kept`;
export const corruptBackupKey = (userId: string) => `${recordingMapKey(userId)}:corrupt`;

/** Bir depolama anahtarı kayıt HARİTASI mı? Evetse kullanıcı kimliğini döndürür; yan anahtarlar (:kept, :corrupt) null. */
export function parseMapKeyUserId(key: string): string | null {
  if (!key.startsWith(MAP_KEY_PREFIX)) return null;
  const rest = key.slice(MAP_KEY_PREFIX.length);
  if (!rest || rest.endsWith(':kept') || rest.endsWith(':corrupt')) return null;
  return rest;
}

export const RECORDING_FILE_PATTERN = /(^|\/)pronunciation-\d+-[a-z0-9]+\.m4a$/;
/** Bundan genç dosyalar yetim sayılmaz (yeni kayıt, harita yazımı sürüyor olabilir). */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export type RecordingMap = Record<string, string>;

export interface StoredFile {
  uri: string;
  size: number;
  /** Bilinmiyorsa null: güvenli tarafta kalınır (yetim sayılmaz). */
  modifiedAt: number | null;
}

export interface StaleEntry {
  wordId: string;
  uri: string;
  size: number;
}

export interface OrphanReport {
  unreferencedFiles: StoredFile[];
  /** Kelimesi silinmiş, kullanıcının SAKLAMAYI SEÇMEDİĞİ kayıtlar: onaylı temizliğe konu olabilir. */
  staleEntries: StaleEntry[];
  /** Kelimesi silinmiş ama kullanıcının açıkça sakladığı kayıtlar: ayrı gösterilir, temizliğe girmez. */
  keptEntries: StaleEntry[];
  count: number;
  bytes: number;
  keptCount: number;
  keptBytes: number;
}

export const EMPTY_REPORT: OrphanReport = {
  unreferencedFiles: [], staleEntries: [], keptEntries: [], count: 0, bytes: 0, keptCount: 0, keptBytes: 0,
};

export function findOrphanRecordings(input: {
  currentUserId: string;
  /** Her kullanıcının haritası (cihazdaki tümü). */
  maps: Record<string, RecordingMap>;
  /** Tüm haritalar hatasız okunabildi mi? Değilse dosya tabanlı yetim aranmaz. */
  mapsComplete: boolean;
  /** Belge klasöründeki dosyalar. */
  files: StoredFile[];
  isKnownWordId: (id: string) => boolean;
  /** Kelime listesi yüklenip eşitlendi mi? Değilse kelime tabanlı yetim aranmaz. */
  wordsReliable: boolean;
  sizeOf: (uri: string) => number;
  /** Kullanıcının saklamayı seçtiği kelime kimlikleri. */
  keptWordIds?: ReadonlySet<string>;
  now: number;
  minAgeMs?: number;
}): OrphanReport {
  const minAge = input.minAgeMs ?? ORPHAN_MIN_AGE_MS;

  const referenced = new Set<string>();
  for (const map of Object.values(input.maps)) {
    for (const uri of Object.values(map)) referenced.add(uri);
  }

  const staleEntries: StaleEntry[] = [];
  const keptEntries: StaleEntry[] = [];
  if (input.wordsReliable) {
    const own = input.maps[input.currentUserId] ?? {};
    for (const [wordId, uri] of Object.entries(own)) {
      if (input.isKnownWordId(wordId)) continue;
      const entry = { wordId, uri, size: input.sizeOf(uri) };
      if (input.keptWordIds?.has(wordId)) keptEntries.push(entry);
      else staleEntries.push(entry);
    }
  }

  const unreferencedFiles: StoredFile[] = [];
  if (input.mapsComplete) {
    for (const file of input.files) {
      if (!RECORDING_FILE_PATTERN.test(file.uri)) continue;
      if (referenced.has(file.uri)) continue;
      if (file.modifiedAt === null || input.now - file.modifiedAt < minAge) continue;
      unreferencedFiles.push(file);
    }
  }

  const bytes =
    unreferencedFiles.reduce((sum, file) => sum + file.size, 0) +
    staleEntries.reduce((sum, entry) => sum + entry.size, 0);
  return {
    unreferencedFiles,
    staleEntries,
    keptEntries,
    count: unreferencedFiles.length + staleEntries.length,
    bytes,
    keptCount: keptEntries.length,
    keptBytes: keptEntries.reduce((sum, entry) => sum + entry.size, 0),
  };
}

/** Haritadan verilen kelimelerin girişlerini çıkarır; özgün haritayı değiştirmez. */
export function withoutWordEntries(map: RecordingMap, wordIds: readonly string[]): { map: RecordingMap; removed: string[] } {
  const drop = new Set(wordIds);
  const next: RecordingMap = {};
  const removed: string[] = [];
  for (const [wordId, uri] of Object.entries(map)) {
    if (drop.has(wordId)) removed.push(uri);
    else next[wordId] = uri;
  }
  return { map: next, removed };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
