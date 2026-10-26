import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createAudioPlayer } from 'expo-audio';
import { File } from 'expo-file-system';

const STORAGE_TIMEOUT_MS = 5000;

export const pronunciationStorageKey = (userId: string) =>
  `@wortly:pronunciations:${userId}`;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Pronunciation storage timed out')), STORAGE_TIMEOUT_MS);
    }),
  ]);
}

export async function readPronunciationRecordings(userId: string): Promise<Record<string, string>> {
  try {
    const raw = await withTimeout(AsyncStorage.getItem(pronunciationStorageKey(userId)));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function writePronunciationRecordings(
  userId: string,
  recordings: Record<string, string>,
) {
  try {
    await withTimeout(
      AsyncStorage.setItem(pronunciationStorageKey(userId), JSON.stringify(recordings)),
    );
  } catch {
    // Kayıt oturum boyunca bellekte kalmaya devam eder.
  }
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

export async function clearPronunciationRecordings(userId: string | null | undefined) {
  if (!userId || userId === 'guest' || Platform.OS === 'web') return;

  const recordings = await readPronunciationRecordings(userId);
  Object.values(recordings).forEach(deletePronunciationFile);

  try {
    await withTimeout(AsyncStorage.removeItem(pronunciationStorageKey(userId)));
  } catch {
    // Yerel temizlik başarısız olursa çıkış işlemi yine tamamlanır.
  }
}
