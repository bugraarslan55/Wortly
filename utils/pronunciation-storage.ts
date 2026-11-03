import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { sanitizeRecordingMap } from './pronunciation-controller';
import {
  corruptBackupKey, EMPTY_REPORT, findOrphanRecordings, keptRecordingsKey, parseMapKeyUserId, recordingMapKey,
  RECORDING_FILE_PATTERN, type OrphanReport, type StoredFile,
} from './pronunciation-cleanup';

const STORAGE_TIMEOUT_MS = 5000;

export const pronunciationStorageKey = recordingMapKey;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Pronunciation storage timed out')), STORAGE_TIMEOUT_MS);
    }),
  ]);
}

type StrictRead = { ok: true; map: Record<string, string> } | { ok: false };

// Okuma HATASI ile "kayıt yok" ayrılır: hata varsa güncelleme yapılmaz (aksi halde boş haritanın üzerine
// yazmak diğer kelimelerin eşlemelerini kaybettirirdi). Bozuk JSON, üzerine yazılmadan önce yedeklenir.
async function readStrict(userId: string): Promise<StrictRead> {
  let raw: string | null;
  try {
    raw = await withTimeout(AsyncStorage.getItem(pronunciationStorageKey(userId)));
  } catch {
    return { ok: false };
  }
  if (!raw) return { ok: true, map: {} };
  try {
    return { ok: true, map: sanitizeRecordingMap(JSON.parse(raw)) };
  } catch {
    try {
      await withTimeout(AsyncStorage.setItem(corruptBackupKey(userId), raw));
    } catch {
      return { ok: false };
    }
    return { ok: true, map: {} };
  }
}

// Bozuk/beklenmeyen JSON ({}, null, dizi...) çökme yapmaz; geçerli girdiler korunur.
export async function readPronunciationRecordings(userId: string): Promise<Record<string, string>> {
  const result = await readStrict(userId);
  return result.ok ? result.map : {};
}

// Okuma-değiştirme-yazma SIRAYLA ve atomik çalışır (iki güncelleme birbirinin girişini ezmez).
// Başarıyı döndürür: false ise çağıran eski kaydı/dosyayı SİLMEMELİDİR.
let writeQueue: Promise<unknown> = Promise.resolve();
export function updatePronunciationRecordings(
  userId: string,
  mutate: (map: Record<string, string>) => void,
): Promise<boolean> {
  const run = writeQueue.then(async () => {
    const current = await readStrict(userId);
    if (!current.ok) return false;
    const next = { ...current.map };
    mutate(next);
    try {
      await withTimeout(
        AsyncStorage.setItem(pronunciationStorageKey(userId), JSON.stringify(next)),
      );
      return true;
    } catch {
      return false;
    }
  });
  writeQueue = run.catch(() => undefined);
  return run;
}

export function deletePronunciationFile(uri: string | null | undefined) {
  if (!uri || Platform.OS === 'web') return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Dosya zaten yoksa sessizce geç.
  }
}

export function pronunciationFileExists(uri: string): boolean {
  if (Platform.OS === 'web') return true;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

// Kaydedici aynı oturumda hep aynı dosya yoluna yazar; her kaydı benzersiz bir
// dosyaya taşımak, yeniden kayıtta eski kaydı korur ve player'ın yeni kaydı yüklemesini sağlar.
export async function moveRecordingToUniqueFile(uri: string): Promise<string> {
  if (Platform.OS === 'web') return uri;
  try {
    const source = new File(uri);
    const target = new File(
      source.parentDirectory,
      `pronunciation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`,
    );
    await source.move(target);
    return source.uri;
  } catch {
    return uri;
  }
}

// Süreyi, her çağrıda yeni oluşturulan ayrı bir player'dan okur; hook'larla
// paylaşılan (eski kaydın süresini tutabilen) player/durum değerleri kullanılmaz.
// Dosya timeoutMs içinde yüklenemezse null döner.
export async function measureRecordingDuration(uri: string, timeoutMs = 3000): Promise<number | null> {
  if (Platform.OS === 'web') return null;
  if (!pronunciationFileExists(uri)) return null;

  const player = createAudioPlayer(uri);
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (player.isLoaded && player.duration > 0) return player.duration;
      await new Promise<void>(resolve => setTimeout(resolve, 100));
    }
    return null;
  } catch {
    return null;
  } finally {
    try {
      player.remove();
    } catch {
      // Player zaten serbest bırakılmış olabilir.
    }
  }
}

// Çıkış: yalnızca bu kullanıcının kayıtları silinir. Harita okunamazsa HİÇBİR ŞEY silinmez (kayıtlar kullanıcıya
// özel anahtarda kalır, başka kullanıcıya görünmez).
export async function clearPronunciationRecordings(userId: string | null | undefined) {
  if (!userId || userId === 'guest' || Platform.OS === 'web') return;

  const current = await readStrict(userId);
  if (!current.ok) return;
  Object.values(current.map).forEach(deletePronunciationFile);

  try {
    await withTimeout(AsyncStorage.removeItem(pronunciationStorageKey(userId)));
    await withTimeout(AsyncStorage.removeItem(keptRecordingsKey(userId)));
  } catch {
    // Yerel temizlik başarısız olursa çıkış işlemi yine tamamlanır.
  }
}

// ─── Kelime silme ve yetim kayıt temizliği (yalnızca kullanıcı onayıyla çağrılır) ──────────────────────────

async function readKept(userId: string): Promise<Set<string>> {
  try {
    const raw = await withTimeout(AsyncStorage.getItem(keptRecordingsKey(userId)));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Kullanıcı "kelimeyi sil, kaydı sakla" dedi: kayıt temizlik tekliflerinden ayrılır. */
export async function markRecordingKept(userId: string, wordId: string): Promise<void> {
  if (Platform.OS === 'web' || !userId || userId === 'guest') return;
  try {
    const kept = await readKept(userId);
    kept.add(wordId);
    await withTimeout(AsyncStorage.setItem(keptRecordingsKey(userId), JSON.stringify([...kept])));
  } catch {
    // İşaret yazılamazsa kayıt yine silinmez; yalnızca "sahipsiz" listesinde görünür (silme yine onaylıdır).
  }
}

/** Bu kelimenin cihazda gerçekten var olan bir telaffuz kaydı var mı? */
export async function hasPronunciationRecording(userId: string, wordId: string): Promise<boolean> {
  if (Platform.OS === 'web' || !userId || userId === 'guest') return false;
  const current = await readStrict(userId);
  if (!current.ok) return false;
  const uri = current.map[wordId];
  return !!uri && pronunciationFileExists(uri);
}

/** Kelimenin kaydını siler (kullanıcı onayladıktan sonra): önce harita, başarılıysa dosya. */
export async function deleteWordPronunciation(userId: string, wordId: string): Promise<boolean> {
  if (Platform.OS === 'web' || !userId || userId === 'guest') return false;
  let uri: string | undefined;
  const ok = await updatePronunciationRecordings(userId, (map) => {
    uri = map[wordId];
    delete map[wordId];
  });
  if (ok && uri) deletePronunciationFile(uri);
  return ok;
}

async function readAllMaps(): Promise<{ maps: Record<string, Record<string, string>>; complete: boolean }> {
  const maps: Record<string, Record<string, string>> = {};
  try {
    const keys = await withTimeout(AsyncStorage.getAllKeys());
    let complete = true;
    for (const key of keys) {
      const userId = parseMapKeyUserId(key);
      if (!userId) continue; // yan anahtarlar (:kept, :corrupt) ve başka veriler atlanır
      const result = await readStrict(userId);
      if (result.ok) maps[userId] = result.map;
      else complete = false;
    }
    return { maps, complete };
  } catch {
    return { maps, complete: false };
  }
}

function listRecordingFiles(): StoredFile[] {
  if (Platform.OS === 'web') return [];
  try {
    return new Directory(Paths.document).list().flatMap((entry) => {
      if (!(entry instanceof File) || !RECORDING_FILE_PATTERN.test(entry.uri)) return [];
      let size = 0;
      let modifiedAt: number | null = null;
      try {
        const info = entry.info();
        size = info.size ?? 0;
        modifiedAt = info.modificationTime ?? info.creationTime ?? null;
      } catch {
        // Bilgi okunamazsa yaş bilinmez: güvenli tarafta kalınır (yetim sayılmaz).
      }
      return [{ uri: entry.uri, size, modifiedAt }];
    });
  } catch {
    return [];
  }
}

function sizeOfFile(uri: string): number {
  try {
    return new File(uri).size ?? 0;
  } catch {
    return 0;
  }
}

/** Silmeden yalnızca raporlar: kelimesi silinmiş girişler ve hiçbir haritada olmayan eski dosyalar. */
export async function scanOrphanRecordings(options: {
  userId: string;
  isKnownWordId: (id: string) => boolean;
  wordsReliable: boolean;
}): Promise<OrphanReport> {
  if (Platform.OS === 'web' || !options.userId || options.userId === 'guest') return EMPTY_REPORT;
  const { maps, complete } = await readAllMaps();
  return findOrphanRecordings({
    currentUserId: options.userId,
    maps,
    mapsComplete: complete,
    files: listRecordingFiles(),
    isKnownWordId: options.isKnownWordId,
    wordsReliable: options.wordsReliable,
    keptWordIds: await readKept(options.userId),
    sizeOf: sizeOfFile,
    now: Date.now(),
  });
}

/**
 * Kullanıcı onayladıktan sonra raporlanan yetimleri siler. Silmeden hemen önce yeniden doğrular:
 * giriş hâlâ aynı dosyayı gösteriyor mu / dosya hâlâ hiçbir haritada yok mu. Başka kullanıcıların girişlerine ve
 * dosyalarına dokunmaz. Silinen dosya sayısını döndürür.
 */
export async function cleanupOrphanRecordings(userId: string, report: OrphanReport): Promise<number> {
  if (Platform.OS === 'web' || !userId || userId === 'guest') return 0;
  let deleted = 0;

  if (report.staleEntries.length > 0) {
    const removedUris: string[] = [];
    const ok = await updatePronunciationRecordings(userId, (map) => {
      for (const entry of report.staleEntries) {
        if (map[entry.wordId] === entry.uri) {
          removedUris.push(entry.uri);
          delete map[entry.wordId];
        }
      }
    });
    if (ok) {
      removedUris.forEach(deletePronunciationFile);
      deleted += removedUris.length;
    }
  }

  if (report.unreferencedFiles.length > 0) {
    const { maps, complete } = await readAllMaps();
    if (complete) {
      const referenced = new Set(Object.values(maps).flatMap(map => Object.values(map)));
      for (const file of report.unreferencedFiles) {
        if (referenced.has(file.uri) || !RECORDING_FILE_PATTERN.test(file.uri)) continue;
        deletePronunciationFile(file.uri);
        deleted += 1;
      }
    }
  }
  return deleted;
}

/**
 * Kullanıcının "kaydı sakla" dediği, kelimesi silinmiş kayıtları AÇIKÇA siler (yalnızca kullanıcı bu eylemi
 * ayrıca onayladığında çağrılır). Önce harita, başarılıysa dosya; saklama işareti de temizlenir.
 */
export async function cleanupKeptRecordings(userId: string, report: OrphanReport): Promise<number> {
  if (Platform.OS === 'web' || !userId || userId === 'guest' || report.keptEntries.length === 0) return 0;
  const removedUris: string[] = [];
  const removedIds: string[] = [];
  const ok = await updatePronunciationRecordings(userId, (map) => {
    for (const entry of report.keptEntries) {
      if (map[entry.wordId] === entry.uri) {
        removedUris.push(entry.uri);
        removedIds.push(entry.wordId);
        delete map[entry.wordId];
      }
    }
  });
  if (!ok) return 0;
  removedUris.forEach(deletePronunciationFile);
  try {
    const kept = await readKept(userId);
    removedIds.forEach(id => kept.delete(id));
    await withTimeout(AsyncStorage.setItem(keptRecordingsKey(userId), JSON.stringify([...kept])));
  } catch {
    // İşaret kalsa da zararsızdır.
  }
  return removedUris.length;
}
