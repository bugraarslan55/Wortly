import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Word, UserProfile, QuizSession, Level, MasteryLevel } from '../types';
import { findDuplicateCustomWord } from '../utils/word-validation';
import { supabase } from '../utils/supabase';
import { ReviewStateMap } from '../utils/spaced-repetition';
import { ScenarioResult } from '../utils/learning-analysis';
import {
  LOCAL_SCENARIO_LIMIT, LOCAL_SESSION_LIMIT, nextStreakState, previousLocalDateKey, toLocalDateKey,
} from '../utils/progress-stats';
import { nextMasteryLevel } from '../utils/mastery';
import { withoutReviewState } from '../utils/known-words';
import { createLatestGuard } from '../utils/latest-guard';
import { Dataset, mergeParkedById, mergeReviewStates, UNKNOWN_OWNER } from '../utils/data-ownership';
import {
  addDeviceAccount, LegacyOffer, legacyOfferState, planReviewRestore, planSessionRestore, planWordRestore,
} from '../utils/legacy-restore';
import {
  backupCorrupt, createDataIsolation, KeyValueStorage, OWNER_KEYS, selectPendingForUser,
} from '../utils/data-isolation';

// ─── STORAGE KEYS ───────────────────────────────────────────────────────────
const KEYS = {
  WORDS: '@wortly:words',
  WORDS_OWNER: '@wortly:words-owner',
  REVIEW_STATES: '@wortly:review-states',
  REVIEW_OWNER: '@wortly:review-owner',
  PROFILE: '@wortly:profile',
  PROFILE_OWNER: '@wortly:profile-owner',
  SESSIONS: '@wortly:sessions',
  SESSIONS_OWNER: '@wortly:sessions-owner',
  SESSION_TOTAL: '@wortly:session-total',
  PENDING_CHANGES: '@wortly:pending-changes',
};

const scenarioResultsKey = (userId: string) => `@wortly:scenario-results:${userId}`;

const devWarn = (...args: unknown[]) => {
  if (__DEV__) console.warn(...args);
};

// Normal akış izleri: uyarı değil, debug seviyesinde yazılır. Kullanıcı kimliği loglanmaz.
const devLog = (...args: unknown[]) => {
  if (__DEV__) console.debug(...args);
};

type PendingChange = {
  entity: 'word' | 'profile' | 'session';
  id: string;
  operation: 'upsert' | 'delete';
  userId: string | null;
  queuedAt: number;
};

// ─── BULUT İSTEĞİ ZAMAN AŞIMI ───────────────────────────────────────────────
// Supabase isteği hiç yanıt vermezse (ör. simülatörde ağ erişilemez durumda
// takılı kalırsa) senkronizasyon fonksiyonları sonsuza kadar beklemesin;
// belirli bir süre sonra "hata" olarak kabul edilip yerel/offline akışa
// güvenli şekilde dönülsün.
const SYNC_TIMEOUT_MS = 8000;
const TIMEOUT_ERROR = { message: 'Zaman aşımı: Supabase isteği yanıt vermedi.' };

function withTimeout<T>(promise: PromiseLike<T>, fallback: T, ms: number = SYNC_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallback);
      }
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallback);
        }
      },
    );
  });
}

// ─── YEREL DEPOLAMA ZAMAN AŞIMI ─────────────────────────────────────────────
// Simülatörde AsyncStorage çağrıları da (native köprü/dosya kilidi sorunları
// yüzünden) bazen hiç yanıt vermeden askıda kalabiliyor. `await` bir kez
// askıda kalırsa dışındaki try/catch/finally hiçbir zaman çalışmaz, bu da
// isLoaded/syncedUserId hiç ayarlanmadan RootLayout kapısının sonsuza kadar
// kapalı kalmasına yol açar. Bu yüzden load/sync/resetLocal akışlarındaki her
// AsyncStorage çağrısı da ayrıca zaman aşımına uğratılır.
const STORAGE_TIMEOUT_MS = 5000;

function safeGetItem(key: string): Promise<string | null> {
  return withTimeout(AsyncStorage.getItem(key), null, STORAGE_TIMEOUT_MS);
}

function safeSetItem(key: string, value: string): Promise<void> {
  if (writeBlockedKeys.has(key)) return Promise.resolve(); // yedeği alınamayan bozuk veri korunur
  return withTimeout(AsyncStorage.setItem(key, value), undefined, STORAGE_TIMEOUT_MS);
}

function safeMultiRemove(keys: string[]): Promise<void> {
  return withTimeout(AsyncStorage.multiRemove(keys), undefined, STORAGE_TIMEOUT_MS);
}

let pendingChangesWrite: Promise<void> = Promise.resolve();

const readPendingChanges = async (): Promise<PendingChange[]> => {
  const raw = await safeGetItem(KEYS.PENDING_CHANGES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PendingChange[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const updatePendingChanges = async (
  updater: (changes: PendingChange[]) => PendingChange[],
): Promise<void> => {
  const task = pendingChangesWrite.then(async () => {
    const current = await readPendingChanges();
    const next = updater(current);
    await safeSetItem(KEYS.PENDING_CHANGES, JSON.stringify(next));
  });
  pendingChangesWrite = task.catch(() => undefined);
  await task;
};

const queuePendingChange = async (change: Omit<PendingChange, 'queuedAt'>): Promise<void> => {
  await updatePendingChanges((changes) => [
    ...changes.filter((item) => !(item.entity === change.entity && item.id === change.id)),
    { ...change, queuedAt: Date.now() },
  ]);
};

const clearPendingChange = async (entity: PendingChange['entity'], id: string): Promise<void> => {
  await updatePendingChanges((changes) => changes.filter((item) => !(item.entity === entity && item.id === id)));
};

const clearPendingChangesForEntity = async (entity: PendingChange['entity']): Promise<void> => {
  await updatePendingChanges((changes) => changes.filter((item) => item.entity !== entity));
};

const getPendingChangesForUser = async (
  entity: PendingChange['entity'],
  userId: string,
  ownerId: string | null,
): Promise<PendingChange[]> => {
  // Yalnızca bu kullanıcının kendi kuyruk kayıtları; başka kullanıcıya ait kayıtlar ASLA uygulanmaz.
  return selectPendingForUser(await readPendingChanges(), entity, userId, ownerId);
};

const OWNER_KEY_BY_ENTITY: Record<PendingChange['entity'], string> = {
  word: KEYS.WORDS_OWNER,
  profile: KEYS.PROFILE_OWNER,
  session: KEYS.SESSIONS_OWNER,
};

// Bu kullanıcıya ait, henüz buluta ulaşmamış değişiklik sayısı. Sahibi bilinmeyen
// (userId: null) kayıtlar yalnızca o varlığın yerel sahibi bu kullanıcıysa sayılır;
// aksi halde senkronizasyon onları hiç işlemeyeceği için sayaç hiç sıfırlanmazdı.
export const getPendingChangeCount = async (userId: string): Promise<number> => {
  const changes = await readPendingChanges();
  const owners: Partial<Record<PendingChange['entity'], string | null>> = {};
  let count = 0;
  for (const item of changes) {
    if (item.userId === userId) {
      count += 1;
    } else if (item.userId === null) {
      owners[item.entity] ??= await safeGetItem(OWNER_KEY_BY_ENTITY[item.entity]);
      if (owners[item.entity] === userId) count += 1;
    }
  }
  return count;
};

// Aynı varlık ve kullanıcı için eşzamanlı senkronizasyonlar tek isteği paylaşır
// (açılış, uygulama öne gelme ve zamanlayıcı tetikleyicileri üst üste binmesin).
const inFlightSyncs = new Map<string, Promise<void>>();
function dedupeSync(entity: string, userId: string, run: () => Promise<void>): Promise<void> {
  const key = `${entity}:${userId}`;
  const existing = inFlightSyncs.get(key);
  if (existing) return existing;
  const task = run().finally(() => inFlightSyncs.delete(key));
  inFlightSyncs.set(key, task);
  return task;
}

const getCurrentUserId = async (): Promise<string | null> => {
  const { data } = await withTimeout(
    supabase.auth.getSession(),
    { data: { session: null } } as any,
    3000,
  );
  return data?.session?.user?.id ?? null;
};

const getMutationUserId = async (ownerKey: string): Promise<string | null> => (
  (await getCurrentUserId()) ?? await safeGetItem(ownerKey)
);

// Gerçek AsyncStorage'a zaman aşımı korumalı adaptör: yazma/silme zaman aşımına uğrarsa HATA fırlatır (sessizce
// başarılı sayılmaz), böylece park/sahip yazımı doğrulanamazsa veri yerinde bırakılır.
const asyncStorageAdapter: KeyValueStorage = {
  // Okuma HATASI/zaman aşımı "değer yok" (null) gibi görünmemeli: aksi halde sahip anahtarı okunamayınca kullanıcının
  // kendi verisi "sahibi bilinmiyor" sanılıp park edilirdi. Bu yüzden başarısız okuma HATA fırlatır.
  getItem: async (key) => {
    const result = await withTimeout(
      AsyncStorage.getItem(key).then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const, value: null }),
      ),
      { ok: false as const, value: null },
      STORAGE_TIMEOUT_MS,
    );
    if (!result.ok) throw new Error('Depolama okuması başarısız');
    return result.value;
  },
  setItem: async (key, value) => {
    const result = await withTimeout(AsyncStorage.setItem(key, value).then(() => 'ok' as const), 'timeout' as const, STORAGE_TIMEOUT_MS);
    if (result !== 'ok') throw new Error('Depolama yazımı zaman aşımına uğradı');
  },
  removeItem: async (key) => {
    const result = await withTimeout(AsyncStorage.removeItem(key).then(() => 'ok' as const), 'timeout' as const, STORAGE_TIMEOUT_MS);
    if (result !== 'ok') throw new Error('Depolama silimi zaman aşımına uğradı');
  },
  getAllKeys: async () => {
    const keys = await withTimeout<readonly string[] | null>(AsyncStorage.getAllKeys(), null, STORAGE_TIMEOUT_MS);
    if (!keys) throw new Error('Anahtar listesi zaman aşımına uğradı');
    return keys;
  },
};
const isolation = createDataIsolation(asyncStorageAdapter);

// Bozuk (ayrıştırılamayan) yerel veri üzerine yazılıp kaybolmasın: ham metin ÖNCE ayrı bir anahtara yedeklenir ve
// doğrulanır. Yedek doğrulanamazsa o anahtara yazma reddedilir (bozuk ama kurtarılabilir veri korunur).
const writeBlockedKeys = new Set<string>();
async function parseStored<T>(raw: string | null, key: string, fallback: T): Promise<T> {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    if (!(await backupCorrupt(asyncStorageAdapter, key, raw))) writeBlockedKeys.add(key);
    return fallback;
  }
}

// Devam eden yerel yazmalar izlenir: çıkış (resetLocal) bunları bekler, böylece çıkıştan sonra geç biten bir yazma
// silinmiş veriyi sahipsiz olarak geri getirmez.
const activeWrites = new Set<Promise<unknown>>();
function withWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = task();
  activeWrites.add(run);
  const release = () => { activeWrites.delete(run); };
  run.then(release, release);
  return run;
}
async function drainWrites(maxWaitMs = 3000): Promise<void> {
  if (activeWrites.size === 0) return;
  await Promise.race([
    Promise.allSettled([...activeWrites]),
    new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs)),
  ]);
}

const OWNER_KEY_BY_DATASET: Record<Dataset, string> = OWNER_KEYS;
const OWNER_STATE_BY_DATASET: Record<Dataset, string> = {
  profile: 'profileOwner', words: 'wordsOwner', review: 'reviewOwner', sessions: 'sessionsOwner',
};

// Yerel veriyi oluşturan kullanıcı biliniyorsa (oturum açık) sahip anahtarı HEMEN yazılır; böylece çevrimdışı
// oluşturulan veri yeniden başlatmada "sahibi bilinmeyen" sayılıp gizlenmez.
async function stampOwner(dataset: Dataset, userId: string | null, set: (partial: any) => void): Promise<void> {
  if (!userId) return;
  set({ [OWNER_STATE_BY_DATASET[dataset]]: userId });
  await safeSetItem(OWNER_KEY_BY_DATASET[dataset], userId);
}

// Kelime + tekrar durumu uzlaştırması (utils/data-isolation.ts): başka kullanıcıya ait / sahibi bilinmeyen veri silinmez ve
// bağlanmaz, DOĞRULANARAK park edilir; sahibi dönen kullanıcının park edilmiş verisi idempotent birleştirmeyle geri yüklenir.
// Bu cihazda (güncellemeden beri) hangi hesapların kullanıldığı. Sahibi bilinmeyen eski kayıtlar yalnızca TEK hesap
// kullanıldıysa o hesaba sunulur; birden fazla hesap varsa sahiplik belirsizdir ve kayıtlar güvenle bekletilir.
const DEVICE_ACCOUNTS_KEY = '@wortly:device-accounts';

async function readDeviceAccounts(): Promise<string[] | null> {
  try {
    const raw = await asyncStorageAdapter.getItem(DEVICE_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && !!item) : null;
  } catch {
    return null; // okunamadı/bozuk: hesap geçmişi doğrulanamaz
  }
}

async function recordDeviceAccount(userId: string): Promise<void> {
  try {
    const current = await readDeviceAccounts();
    if (current === null) return; // bozuk geçmişin üzerine yazma
    const next = addDeviceAccount(current, userId);
    if (next.length !== current.length) await asyncStorageAdapter.setItem(DEVICE_ACCOUNTS_KEY, JSON.stringify(next));
  } catch {
    // Yazılamazsa teklif "bekletme" durumunda kalır (güvenli taraf).
  }
}

async function reconcileWordData(userId: string, set: (partial: any) => void, get: () => WordStore): Promise<boolean> {
  await recordDeviceAccount(userId);
  const pending = await readPendingChanges();
  const hasOwnWordPending = pending.some(change => change.entity === 'word' && change.userId === userId);
  const { words, reviewStates } = get();

  const wordsResult = await isolation.reconcile({
    dataset: 'words',
    userId,
    rawData: JSON.stringify(words),
    hasData: words.length > 0,
    hasOwnPendingChange: hasOwnWordPending,
    clearLocal: async () => {
      set({ words: [] });
      await asyncStorageAdapter.removeItem(KEYS.WORDS);
    },
    applyParked: async (parsed) => {
      if (!Array.isArray(parsed)) return false;
      const merged = mergeParkedById(get().words, parsed as Word[]);
      const text = JSON.stringify(merged);
      await asyncStorageAdapter.setItem(KEYS.WORDS, text);
      if ((await safeGetItem(KEYS.WORDS)) !== text) return false;
      set({ words: merged });
      return true;
    },
  });
  if (wordsResult === 'failed') return false;

  const reviewResult = await isolation.reconcile({
    dataset: 'review',
    userId,
    rawData: JSON.stringify(reviewStates),
    hasData: Object.keys(reviewStates).length > 0,
    hasOwnPendingChange: false,
    clearLocal: async () => {
      set({ reviewStates: {} });
      await asyncStorageAdapter.removeItem(KEYS.REVIEW_STATES);
    },
    applyParked: async (parsed) => {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
      const merged = mergeReviewStates(get().reviewStates, parsed as ReviewStateMap);
      const text = JSON.stringify(merged);
      await asyncStorageAdapter.setItem(KEYS.REVIEW_STATES, text);
      if ((await safeGetItem(KEYS.REVIEW_STATES)) !== text) return false;
      set({ reviewStates: merged });
      return true;
    },
  });
  if (reviewResult === 'failed') return false;

  set({ wordsOwner: userId, reviewOwner: userId });
  return true;
}

// ─── WORD STORE ─────────────────────────────────────────────────────────────
interface WordStore {
  /** Bellekteki kişisel kelimelerin / tekrar durumlarının sahibi (kayıtlı sahip anahtarından). */
  wordsOwner: string | null;
  reviewOwner: string | null;
  words: Word[];
  reviewStates: ReviewStateMap;
  isLoaded: boolean;
  syncedUserId: string | null;
  loadWords: () => Promise<void>;
  syncWords: (userId: string) => Promise<void>;
  resetLocal: () => Promise<void>;
  addWord: (word: Omit<Word, 'id' | 'addedAt' | 'masteryLevel'>) => Promise<WordSaveResult>;
  updateWord: (id: string, updates: Partial<Word>) => Promise<WordSaveResult>;
  deleteWord: (id: string) => Promise<void>;
  updateMastery: (id: string, correct: boolean, options?: { maxLevel?: MasteryLevel }) => Promise<void>;
  getCustomWords: () => Word[];
  getWordsByTopic: (topicId: string) => Word[];
}

export type WordSaveResult =
  | { ok: true }
  | { ok: false; reason: 'duplicate'; existing: Word };

type CloudWord = {
  id: string;
  user_id: string;
  german: string;
  article: Word['article'];
  turkish: string;
  plural: string | null;
  example: string | null;
  example_turkish: string | null;
  mastery_level: number;
  last_reviewed: string | null;
  is_custom: boolean;
  topic_id: string | null;
  created_at: string;
};

const cloudWordColumns = 'id, user_id, german, article, turkish, plural, example, example_turkish, mastery_level, last_reviewed, is_custom, topic_id, created_at';

const toCloudWord = (userId: string, word: Word) => ({
  id: word.id,
  user_id: userId,
  german: word.german,
  article: word.article,
  turkish: word.turkish,
  plural: word.plural ?? null,
  example: word.example ?? null,
  example_turkish: word.exampleTurkish ?? null,
  mastery_level: word.masteryLevel,
  last_reviewed: word.lastReviewed ? new Date(word.lastReviewed).toISOString() : null,
  is_custom: true,
  topic_id: word.topicId ?? null,
});

const fromCloudWord = (word: CloudWord): Word => ({
  id: word.id,
  german: word.german,
  article: word.article,
  turkish: word.turkish,
  plural: word.plural ?? undefined,
  example: word.example ?? undefined,
  exampleTurkish: word.example_turkish ?? undefined,
  addedAt: Date.parse(word.created_at) || Date.now(),
  masteryLevel: Math.max(0, Math.min(3, word.mastery_level)) as Word['masteryLevel'],
  lastReviewed: word.last_reviewed ? Date.parse(word.last_reviewed) : undefined,
  isCustom: word.is_custom,
  topicId: word.topic_id ?? undefined,
});

const saveCloudWords = async (userId: string, words: Word[]) => {
  if (words.length === 0) return true;
  const { error } = await withTimeout(
    supabase
      .from('user_words')
      .upsert(words.map(word => toCloudWord(userId, word)), { onConflict: 'id' }),
    { error: TIMEOUT_ERROR } as any,
  );
  if (error) {
    devWarn('[Wortly] Kullanıcı kelimeleri buluta senkronize edilemedi:', error.message);
    return false;
  }
  return true;
};

const saveCloudWord = async (userId: string, word: Word) => {
  return saveCloudWords(userId, [word]);
};

const deleteCloudWord = async (userId: string, wordId: string) => {
  const { error } = await withTimeout(
    supabase
      .from('user_words')
      .delete()
      .eq('id', wordId)
      .eq('user_id', userId),
    { error: TIMEOUT_ERROR } as any,
  );
  if (error) {
    devWarn('[Wortly] Kullanıcı kelimesi buluttan silinemedi:', error.message);
    return false;
  }
  return true;
};

type CloudSession = {
  id: string;
  user_id: string;
  type: QuizSession['type'];
  word_ids: string[];
  score: number;
  total: number;
  session_date: string;
  topic_id: string | null;
};

const cloudSessionColumns = 'id, user_id, type, word_ids, score, total, session_date, topic_id';

const toCloudSession = (userId: string, session: QuizSession) => ({
  id: session.id,
  user_id: userId,
  type: session.type,
  word_ids: session.wordIds,
  score: session.score,
  total: session.total,
  session_date: new Date(session.date).toISOString(),
  topic_id: session.topicId ?? null,
});

const fromCloudSession = (session: CloudSession): QuizSession => ({
  id: session.id,
  type: session.type,
  wordIds: session.word_ids,
  score: session.score,
  total: session.total,
  date: Date.parse(session.session_date) || Date.now(),
  topicId: session.topic_id ?? undefined,
});

const saveCloudSession = async (userId: string, session: QuizSession) => {
  const { error } = await withTimeout(
    supabase
      .from('study_sessions')
      .upsert(toCloudSession(userId, session), { onConflict: 'id' }),
    { error: TIMEOUT_ERROR } as any,
  );
  if (error) {
    devWarn('[Wortly] Çalışma oturumu buluta kaydedilemedi:', error.message);
    return false;
  }
  return true;
};

export const useWordStore = create<WordStore>((set, get) => ({
  wordsOwner: null,
  reviewOwner: null,
  words: [],
  reviewStates: {},
  isLoaded: false,
  syncedUserId: null,

  loadWords: async () => {
    devLog('[Wortly][load] loadWords başladı');
    try {
      const [raw, rawReviewStates] = await Promise.all([
        safeGetItem(KEYS.WORDS),
        safeGetItem(KEYS.REVIEW_STATES),
      ]);
      const [wordsOwner, reviewOwner] = await Promise.all([
        safeGetItem(KEYS.WORDS_OWNER),
        safeGetItem(KEYS.REVIEW_OWNER),
      ]);
      const words: Word[] = await parseStored<Word[]>(raw, KEYS.WORDS, []);
      const reviewStates: ReviewStateMap = await parseStored<ReviewStateMap>(rawReviewStates, KEYS.REVIEW_STATES, {});
      set({
        words: Array.isArray(words) ? words : [],
        reviewStates: reviewStates && typeof reviewStates === 'object' && !Array.isArray(reviewStates) ? reviewStates : {},
        wordsOwner: wordsOwner || null,
        reviewOwner: reviewOwner || null,
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    } finally {
      devLog('[Wortly][load] loadWords tamamlandı');
    }
  },

  syncWords: (userId) => dedupeSync('words', userId, async () => {
    // Bu fonksiyon ne olursa olsun (başarı, hata ya da beklenmeyen bir
    // istisna) `finally` içinde syncedUserId'i işaretler — RootLayout'taki
    // senkronizasyon kapısı bu sayede asla sonsuza kadar beklemez. Tüm
    // AsyncStorage çağrıları da safeGetItem/safeSetItem ile zaman aşımına
    // uğratılır, çünkü yerel depolama çağrısı askıda kalırsa `await` hiç
    // dönmez ve finally bile çalışmaz.
    devLog('[Wortly][sync] syncWords başladı');
    const wordsAtStart = get().words;
    try {
      // Sahiplik uzlaştırması: başka kullanıcıya ait / sahibi bilinmeyen veri (tekrar geçmişi dahil) silinmez ve
      // bu kullanıcıya bağlanmaz, park edilir. Park edilemezse veri gizli kalır ve eşitleme güvenli şekilde durur.
      if (!(await reconcileWordData(userId, set, get))) return;
      const localOwner = await safeGetItem(KEYS.WORDS_OWNER);

      const wordsAtStartSync = get().words;
      void wordsAtStartSync;
      const localWords = get().words;
      const localCustomWords = localWords.filter(word => word.isCustom);
      const pendingChanges = await getPendingChangesForUser('word', userId, localOwner);

      // Yerel değişiklikler buluta ulaşmadıysa önce onları yeniden dene.
      // Başarısız bir yazımdan sonra bulut verisini okuyup yereli ezmek,
      // çevrimdışı eklenen/güncellenen kelimelerin kaybolmasına neden olur.
      for (const change of pendingChanges) {
        // Anlık görüntü yerine güncel duruma bak: bekleyen kayıt, kelime state'e eklendikten
        // sonra yazılır; eski görüntüde kelime yok görünürse kayıt yanlışlıkla temizlenirdi.
        const localWord = get().words.find(word => word.isCustom && word.id === change.id);
        // Bekleyen bir "upsert"in yerel karşılığı yoksa (ör. çıkıştaki resetLocal yerel
        // kelimeleri sildi) kelime kullanıcı tarafından silinmiş değildir: silme isteği
        // ayrı bir "delete" kaydıdır. Bu durumda buluttaki kelimeyi silme, kaydı temizle.
        if (change.operation === 'upsert' && !localWord) {
          await clearPendingChange('word', change.id);
          continue;
        }
        const saved = change.operation === 'delete'
          ? await deleteCloudWord(userId, change.id)
          : await saveCloudWord(userId, localWord!);

        if (!saved) return;
        await clearPendingChange('word', change.id);
      }

      const { data, error } = await withTimeout(
        supabase
          .from('user_words')
          .select(cloudWordColumns)
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        { data: null, error: TIMEOUT_ERROR } as any,
      );

      if (error) {
        devWarn('[Wortly] Kullanıcı kelimeleri buluttan okunamadı:', error.message);
        return;
      }

      const cloudWords = (data ?? []) as CloudWord[];

      // İlk bulut geçişinde (bu cihazda henüz sahip yokken) mevcut cihaz kelimelerini
      // kaybetmeden yükle. Sahibi zaten bu kullanıcı olan bir cihazda bulut boşsa kelimeler
      // başka bir cihazdan silinmiştir; yerel kopyalardan geri yükleme (silinenlerin
      // dirilmesi) yapılmaz. Gönderilmemiş yerel kelimeler bekleyen kayıtlarla korunur.
      if (!localOwner && cloudWords.length === 0 && localCustomWords.length > 0) {
        const saved = await saveCloudWords(userId, localCustomWords);
        if (saved) await safeSetItem(KEYS.WORDS_OWNER, userId);
        return;
      }

      const pendingUpsertIds = new Set(
        pendingChanges
          .filter(change => change.operation === 'upsert')
          .map(change => change.id),
      );
      const pendingDeleteIds = new Set(
        pendingChanges
          .filter(change => change.operation === 'delete')
          .map(change => change.id),
      );
      const nextWordsById = new Map(
        cloudWords
          .filter(word => !pendingDeleteIds.has(word.id))
          .map(word => [word.id, fromCloudWord(word)] as const),
      );
      for (const word of localCustomWords) {
        if (pendingUpsertIds.has(word.id)) nextWordsById.set(word.id, word);
      }
      const nextWords = Array.from(nextWordsById.values());
      // Ağ beklenirken kullanıcı kelime ekledi/düzenledi/sildiyse bu eski anlık görüntüyle
      // üzerine yazma; bekleyen kayıtlar bir sonraki senkronizasyonda işlenir.
      if (get().words !== wordsAtStart) {
        devLog('[Wortly][sync] syncWords: yerel değişiklik algılandı, birleştirme ertelendi');
        return;
      }
      set({ words: nextWords });
      await safeSetItem(KEYS.WORDS, JSON.stringify(nextWords));
      await safeSetItem(KEYS.WORDS_OWNER, userId);
    } catch (err) {
      devWarn('[Wortly] Kelime senkronizasyonunda beklenmeyen hata:', err);
    } finally {
      set({ syncedUserId: userId });
      devLog('[Wortly][sync] syncWords tamamlandı');
    }
  }),

  resetLocal: async () => {
    set({ words: [], reviewStates: {}, wordsOwner: null, reviewOwner: null, syncedUserId: null });
    await drainWrites(); // devam eden yerel yazmalar bitmeden silme: geç yazma silinen veriyi geri getirmesin
    await safeMultiRemove([
      KEYS.WORDS,
      KEYS.WORDS_OWNER,
      KEYS.REVIEW_STATES,
      KEYS.REVIEW_OWNER,
    ]);
  },

  addWord: (wordData) => withWrite(async () => {
    const duplicate = findDuplicateCustomWord(get().words, wordData.german, wordData.article);
    if (duplicate) return { ok: false, reason: 'duplicate', existing: duplicate };

    const newWord: Word = {
      ...wordData,
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      addedAt: Date.now(),
      masteryLevel: 0,
    };
    const updated = [...get().words, newWord];
    set({ words: updated });
    await safeSetItem(KEYS.WORDS, JSON.stringify(updated));
    const userId = await getMutationUserId(KEYS.WORDS_OWNER);
    await stampOwner('words', userId, set);
    await queuePendingChange({ entity: 'word', id: newWord.id, operation: 'upsert', userId });
    if (userId && await saveCloudWord(userId, newWord)) {
      await clearPendingChange('word', newWord.id);
      await safeSetItem(KEYS.WORDS_OWNER, userId);
    }
    return { ok: true };
  }),

  updateWord: (id, updates) => withWrite(async () => {
    const current = get().words.find(w => w.id === id);
    if (current) {
      const nextGerman = updates.german ?? current.german;
      const nextArticle = updates.article ?? current.article;
      const duplicate = findDuplicateCustomWord(get().words, nextGerman, nextArticle, id);
      if (duplicate) return { ok: false, reason: 'duplicate', existing: duplicate };
    }

    const updated = get().words.map(w => w.id === id ? { ...w, ...updates } : w);
    set({ words: updated });
    await safeSetItem(KEYS.WORDS, JSON.stringify(updated));
    const updatedWord = updated.find(word => word.id === id);
    if (updatedWord) {
      const userId = await getMutationUserId(KEYS.WORDS_OWNER);
      await stampOwner('words', userId, set);
      await queuePendingChange({ entity: 'word', id, operation: 'upsert', userId });
      if (userId && await saveCloudWord(userId, updatedWord)) {
        await clearPendingChange('word', id);
        await safeSetItem(KEYS.WORDS_OWNER, userId);
      }
    }
    return { ok: true };
  }),

  deleteWord: (id) => withWrite(async () => {
    const updated = get().words.filter(w => w.id !== id);
    // Silinen kelimenin ilerleme kaydı da kaldırılır; aksi halde "öğrenilen kelime" istatistiğinde ve
    // rozetlerde var olmayan kelime sayılmaya devam ederdi.
    const reviewStates = withoutReviewState(get().reviewStates, id);
    const hadReviewState = reviewStates !== get().reviewStates;
    set(hadReviewState ? { words: updated, reviewStates } : { words: updated });
    await safeSetItem(KEYS.WORDS, JSON.stringify(updated));
    if (hadReviewState) await safeSetItem(KEYS.REVIEW_STATES, JSON.stringify(reviewStates));
    const userId = await getMutationUserId(KEYS.WORDS_OWNER);
    await stampOwner('words', userId, set);
    await queuePendingChange({ entity: 'word', id, operation: 'delete', userId });
    if (userId && await deleteCloudWord(userId, id)) {
      await clearPendingChange('word', id);
      await safeSetItem(KEYS.WORDS_OWNER, userId);
    }
  }),

  updateMastery: (id, correct, options) => withWrite(async () => {
    const word = get().words.find(w => w.id === id);
    const currentReview = get().reviewStates[id] ?? (word ? {
      masteryLevel: word.masteryLevel,
      lastReviewed: word.lastReviewed,
    } : {
      masteryLevel: 0 as MasteryLevel,
    });
    const newLevel = nextMasteryLevel(currentReview.masteryLevel, correct, options?.maxLevel);
    const lastReviewed = Date.now();
    const reviewStates = {
      ...get().reviewStates,
      [id]: { masteryLevel: newLevel, lastReviewed },
    };

    set({ reviewStates });
    await safeSetItem(KEYS.REVIEW_STATES, JSON.stringify(reviewStates));
    await stampOwner('review', await getMutationUserId(KEYS.REVIEW_OWNER), set);

    // Özel kelimeler için mevcut mastery alanını da koru. Statik Goethe
    // kelimeleri yalnızca bu yerel review haritasında tutulur.
    if (word) {
      await get().updateWord(id, { masteryLevel: newLevel, lastReviewed });
    }
  }),

  getCustomWords: () => get().words.filter(w => w.isCustom),
  getWordsByTopic: (topicId) => get().words.filter(w => w.topicId === topicId),
}));

// ─── USER STORE ─────────────────────────────────────────────────────────────
interface UserStore {
  /** Bellekteki profilin sahibi (kayıtlı sahip anahtarından). */
  profileOwner: string | null;
  profile: UserProfile | null;
  isLoaded: boolean;
  syncedUserId: string | null;
  loadProfile: () => Promise<void>;
  syncProfile: (userId: string) => Promise<void>;
  resetLocal: () => Promise<void>;
  setProfile: (profile: UserProfile) => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  completeOnboarding: (name: string, level: Level) => Promise<void>;
  updateStreak: () => Promise<void>;
}

const DEFAULT_PROFILE: UserProfile = {
  name: '',
  level: 'A1',
  onboardingCompleted: false,
  streak: 0,
  totalWordsLearned: 0,
  dailyGoal: 10,
};

const toCloudProfile = (userId: string, profile: UserProfile) => ({
  id: userId,
  name: profile.name,
  level: profile.level,
  onboarding_completed: profile.onboardingCompleted,
  streak: profile.streak,
  last_study_date: profile.lastStudyDate ?? null,
  total_words_learned: profile.totalWordsLearned,
  daily_goal: profile.dailyGoal,
});

const fromCloudProfile = (profile: {
  name: string;
  level: Level;
  onboarding_completed: boolean;
  streak: number;
  last_study_date: string | null;
  total_words_learned: number;
  daily_goal: number;
}): UserProfile => ({
  name: profile.name,
  level: profile.level,
  onboardingCompleted: profile.onboarding_completed,
  streak: profile.streak,
  lastStudyDate: profile.last_study_date ?? undefined,
  totalWordsLearned: profile.total_words_learned,
  dailyGoal: profile.daily_goal,
});

const saveCloudProfile = async (userId: string, profile: UserProfile) => {
  const { error } = await withTimeout(
    supabase
      .from('profiles')
      .upsert(toCloudProfile(userId, profile), { onConflict: 'id' }),
    { error: TIMEOUT_ERROR } as any,
  );
  if (error) {
    devWarn('[Wortly] Profil buluta senkronize edilemedi:', error.message);
    return false;
  }
  return true;
};

export const useUserStore = create<UserStore>((set, get) => ({
  profileOwner: null,
  profile: null,
  isLoaded: false,
  syncedUserId: null,

  loadProfile: async () => {
    devLog('[Wortly][load] loadProfile başladı');
    try {
      const raw = await safeGetItem(KEYS.PROFILE);
      const profile: UserProfile = (await parseStored<UserProfile>(raw, KEYS.PROFILE, DEFAULT_PROFILE)) ?? DEFAULT_PROFILE;
      const profileOwner = await safeGetItem(KEYS.PROFILE_OWNER);

      // Migrasyon: yayın kapsamı artık A1/A2/B1. Geçersiz/tanınmayan bir
      // seviye varsa güvenli biçimde A2'ye normalize edilir ve kalıcı olarak
      // geri yazılır.
      if (profile.level !== 'A1' && profile.level !== 'A2' && profile.level !== 'B1') {
        profile.level = 'A2';
        await safeSetItem(KEYS.PROFILE, JSON.stringify(profile));
      }

      set({ profile, profileOwner: profileOwner || null, isLoaded: true });
    } catch {
      set({ profile: DEFAULT_PROFILE, isLoaded: true });
    } finally {
      devLog('[Wortly][load] loadProfile tamamlandı');
    }
  },

  syncProfile: (userId) => dedupeSync('profile', userId, async () => {
    // syncWords'teki gibi: her çıkış yolunda (başarı/hata/istisna) `finally`
    // içinde syncedUserId işaretlenir, senkronizasyon kapısı asla takılmaz.
    // Tüm AsyncStorage çağrıları da safeGetItem/safeSetItem ile zaman
    // aşımına uğratılır (askıda kalan bir `await`, finally'nin de hiç
    // çalışmamasına yol açar).
    devLog('[Wortly][sync] syncProfile başladı');
    try {
      // Sahiplik uzlaştırması (profil): başka kullanıcıya ait / sahibi bilinmeyen profil park edilir, varsayılan
      // profil kullanılır; sahibi dönen kullanıcının park edilmiş profili geri yüklenir (bekleyen kayıt gerçek
      // profili göndersin, varsayılan olanı değil).
      const current = get().profile ?? DEFAULT_PROFILE;
      const profileHasData = current.onboardingCompleted || current.name.length > 0 || current.streak > 0;
      const pendingProfile = (await readPendingChanges()).some(c => c.entity === 'profile' && c.userId === userId);
      const profileResult = await isolation.reconcile({
        dataset: 'profile',
        userId,
        rawData: JSON.stringify(current),
        hasData: profileHasData,
        hasOwnPendingChange: pendingProfile,
        clearLocal: async () => {
          set({ profile: DEFAULT_PROFILE });
          await asyncStorageAdapter.removeItem(KEYS.PROFILE);
        },
        applyParked: async (parsed) => {
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
          const now = get().profile ?? DEFAULT_PROFILE;
          const nowHasData = now.onboardingCompleted || now.name.length > 0 || now.streak > 0;
          if (!nowHasData) {
            const text = JSON.stringify(parsed);
            await asyncStorageAdapter.setItem(KEYS.PROFILE, text);
            set({ profile: parsed as UserProfile });
          }
          return true; // mevcut profil doluysa park edilmiş eski profil gereksizdir (bulut/yerel güncel kazanır)
        },
      });
      if (profileResult === 'failed') return;
      set({ profileOwner: userId });
      const profileAtStart = get().profile;
      const localProfile = get().profile ?? DEFAULT_PROFILE;
      const localOwner = await safeGetItem(KEYS.PROFILE_OWNER);
      const pendingChanges = await getPendingChangesForUser('profile', userId, localOwner);
      const hasPendingProfile = pendingChanges.length > 0;

      if (hasPendingProfile) {
        const saved = await saveCloudProfile(userId, localProfile);
        if (!saved) return;
        await clearPendingChange('profile', 'profile');
      }

      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('name, level, onboarding_completed, streak, last_study_date, total_words_learned, daily_goal')
          .eq('id', userId)
          .maybeSingle(),
        { data: null, error: TIMEOUT_ERROR } as any,
      );

      if (error) {
        devWarn('[Wortly] Bulut profil okunamadı:', error.message);
        return;
      }

      if (!data) {
        const profile = localOwner && localOwner !== userId ? DEFAULT_PROFILE : localProfile;
        if (await saveCloudProfile(userId, profile)) {
          await safeSetItem(KEYS.PROFILE_OWNER, userId);
        }
        return;
      }

      const cloudIsInitial =
        data.name === '' &&
        data.level === 'A1' &&
        !data.onboarding_completed &&
        data.streak === 0 &&
        data.total_words_learned === 0;
      const localHasProgress =
        localProfile.onboardingCompleted ||
        localProfile.name.length > 0 ||
        localProfile.level !== 'A1' ||
        localProfile.streak > 0 ||
        localProfile.totalWordsLearned > 0;

      // Preserve the current device's pre-cloud profile on the first rollout,
      // but never reuse it for a different signed-in user.
      if ((!localOwner || localOwner === userId) && cloudIsInitial && localHasProgress) {
        if (await saveCloudProfile(userId, localProfile)) {
          await safeSetItem(KEYS.PROFILE_OWNER, userId);
        }
        return;
      }

      // Yazma başarıyla tamamlandıktan hemen sonra eski bir okuma dönerse,
      // bu senkronizasyonda yerel değişikliği koru.
      const profile = hasPendingProfile ? localProfile : fromCloudProfile(data);
      if (get().profile !== profileAtStart) {
        devLog('[Wortly][sync] syncProfile: yerel değişiklik algılandı, birleştirme ertelendi');
        return;
      }
      set({ profile });
      await safeSetItem(KEYS.PROFILE, JSON.stringify(profile));
      await safeSetItem(KEYS.PROFILE_OWNER, userId);
    } catch (err) {
      devWarn('[Wortly] Profil senkronizasyonunda beklenmeyen hata:', err);
    } finally {
      set({ syncedUserId: userId });
      devLog('[Wortly][sync] syncProfile tamamlandı');
    }
  }),

  resetLocal: async () => {
    set({ profile: DEFAULT_PROFILE, profileOwner: null, syncedUserId: null });
    await drainWrites();
    await safeMultiRemove([KEYS.PROFILE, KEYS.PROFILE_OWNER]);
    // Yerel profil silindi; bekleyen profil kaydı kalırsa bir sonraki girişte
    // varsayılan profil buluttaki gerçek profilin üzerine yazılırdı.
    await clearPendingChangesForEntity('profile');
  },

  setProfile: (profile) => withWrite(async () => {
    set({ profile });
    await safeSetItem(KEYS.PROFILE, JSON.stringify(profile));
    const userId = await getMutationUserId(KEYS.PROFILE_OWNER);
    await stampOwner('profile', userId, set);
    await queuePendingChange({ entity: 'profile', id: 'profile', operation: 'upsert', userId });
    if (userId && await saveCloudProfile(userId, profile)) {
      await clearPendingChange('profile', 'profile');
      await safeSetItem(KEYS.PROFILE_OWNER, userId);
    }
  }),

  updateProfile: (updates) => withWrite(async () => {
    const current = get().profile || DEFAULT_PROFILE;
    const updated = { ...current, ...updates };
    set({ profile: updated });
    await safeSetItem(KEYS.PROFILE, JSON.stringify(updated));
    const userId = await getMutationUserId(KEYS.PROFILE_OWNER);
    await stampOwner('profile', userId, set);
    await queuePendingChange({ entity: 'profile', id: 'profile', operation: 'upsert', userId });
    if (userId && await saveCloudProfile(userId, updated)) {
      await clearPendingChange('profile', 'profile');
      await safeSetItem(KEYS.PROFILE_OWNER, userId);
    }
  }),

  completeOnboarding: (name, level) => withWrite(async () => {
    const profile: UserProfile = {
      ...DEFAULT_PROFILE,
      name,
      level,
      onboardingCompleted: true,
    };
    set({ profile });
    await safeSetItem(KEYS.PROFILE, JSON.stringify(profile));
    const userId = await getMutationUserId(KEYS.PROFILE_OWNER);
    await stampOwner('profile', userId, set);
    await queuePendingChange({ entity: 'profile', id: 'profile', operation: 'upsert', userId });
    if (userId && await saveCloudProfile(userId, profile)) {
      await clearPendingChange('profile', 'profile');
      await safeSetItem(KEYS.PROFILE_OWNER, userId);
    }
  }),

  updateStreak: async () => {
    const profile = get().profile;
    if (!profile) return;
    // Yerel takvim günü kullanılır (UTC değil): gece yarısından sonra gün doğru değişir.
    const next = nextStreakState(profile, toLocalDateKey(), previousLocalDateKey());
    if (!next) return; // Aynı gün: seri tekrar artmaz
    await get().updateProfile(next);
  },
}));

const scenarioLoads = createLatestGuard();

// ─── SESSION STORE ──────────────────────────────────────────────────────────
interface SessionStore {
  sessions: QuizSession[];
  scenarioResults: ScenarioResult[];
  /** Bellekteki senaryo sonuçlarının sahibi; farklı kullanıcıya ait sonuçlar hiçbir ekranda kullanılmaz. */
  scenarioResultsOwner: string | null;
  /** Bellekteki oturumların sahibi (kayıtlı sahip anahtarından); bilinmiyorsa null. Başka kullanıcıya ait oturumlar kullanılmaz. */
  sessionsOwner: string | null;
  /**
   * Kullanıcının bulutta kayıtlı gerçek toplam oturum sayısı (yerel liste yalnızca son 100'ü tutar).
   * Bilinmiyorsa null; sahibi (userId) uyuşmayan değer kullanılmaz.
   */
  sessionTotal: { userId: string; count: number } | null;
  currentSession: QuizSession | null;
  isLoaded: boolean;
  syncedUserId: string | null;
  loadSessions: () => Promise<void>;
  loadScenarioResults: (userId: string) => Promise<void>;
  syncSessions: (userId: string) => Promise<void>;
  resetLocal: () => Promise<void>;
  startSession: (session: Omit<QuizSession, 'id' | 'date'>) => void;
  saveSession: (session: QuizSession) => Promise<void>;
  saveScenarioResult: (userId: string, result: Omit<ScenarioResult, 'id' | 'date'>) => Promise<void>;
  clearCurrentSession: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  scenarioResults: [],
  scenarioResultsOwner: null,
  sessionsOwner: null,
  sessionTotal: null,
  currentSession: null,
  isLoaded: false,
  syncedUserId: null,

  loadSessions: async () => {
    devLog('[Wortly][load] loadSessions başladı');
    try {
      const raw = await safeGetItem(KEYS.SESSIONS);
      const totalRaw = await safeGetItem(KEYS.SESSION_TOTAL);
      let sessionTotal: { userId: string; count: number } | null = null;
      try {
        const parsed = totalRaw ? JSON.parse(totalRaw) : null;
        if (parsed && typeof parsed.userId === 'string' && Number.isFinite(parsed.count) && parsed.count >= 0) {
          sessionTotal = { userId: parsed.userId, count: Math.floor(parsed.count) };
        }
      } catch {
        sessionTotal = null;
      }
      const ownerRaw = await safeGetItem(KEYS.SESSIONS_OWNER);
      const parsedSessions = await parseStored<QuizSession[]>(raw, KEYS.SESSIONS, []);
      set({ sessions: Array.isArray(parsedSessions) ? parsedSessions : [], sessionTotal, sessionsOwner: ownerRaw || null, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    } finally {
      devLog('[Wortly][load] loadSessions tamamlandı');
    }
  },

  loadScenarioResults: async (userId) => {
    // Hesap değişiminde ESKİ hesabın geç gelen okuması yeni hesabın sonuçlarını ezmesin: yalnızca en yeni istek yazar.
    const token = scenarioLoads.begin();
    try {
      const raw = await safeGetItem(scenarioResultsKey(userId));
      const parsed = raw ? JSON.parse(raw) : [];
      if (!scenarioLoads.isLatest(token)) return;
      set({ scenarioResults: Array.isArray(parsed) ? parsed : [], scenarioResultsOwner: userId });
    } catch {
      if (scenarioLoads.isLatest(token)) set({ scenarioResults: [], scenarioResultsOwner: userId });
    }
  },

  syncSessions: (userId) => dedupeSync('sessions', userId, async () => {
    // syncWords/syncProfile'daki gibi: her çıkış yolunda (başarı/hata/istisna)
    // `finally` içinde syncedUserId işaretlenir, senkronizasyon kapısı asla
    // takılmaz. Tüm AsyncStorage çağrıları da safeGetItem/safeSetItem ile
    // zaman aşımına uğratılır.
    devLog('[Wortly][sync] syncSessions başladı');
    try {
      // Sahiplik uzlaştırması (oturumlar): başka kullanıcıya ait / sahibi bilinmeyen oturumlar silinmez ve bağlanmaz,
      // park edilir; sahibi dönen kullanıcının park edilmiş oturumları geri yüklenir.
      const pendingSessions = (await readPendingChanges()).some(c => c.entity === 'session' && c.userId === userId);
      const sessionsNow = get().sessions;
      const sessionsResult = await isolation.reconcile({
        dataset: 'sessions',
        userId,
        rawData: JSON.stringify(sessionsNow),
        hasData: sessionsNow.length > 0,
        hasOwnPendingChange: pendingSessions,
        clearLocal: async () => {
          set({ sessions: [] });
          await asyncStorageAdapter.removeItem(KEYS.SESSIONS);
        },
        applyParked: async (parsed) => {
          if (!Array.isArray(parsed)) return false;
          const merged = mergeParkedById(get().sessions, parsed as QuizSession[]);
          const text = JSON.stringify(merged);
          await asyncStorageAdapter.setItem(KEYS.SESSIONS, text);
          if ((await safeGetItem(KEYS.SESSIONS)) !== text) return false;
          set({ sessions: merged });
          return true;
        },
      });
      if (sessionsResult === 'failed') return;
      set({ sessionsOwner: userId });
      const localOwner = await safeGetItem(KEYS.SESSIONS_OWNER);
      const localSessions = get().sessions;
      const pendingChanges = await getPendingChangesForUser('session', userId, localOwner);

      for (const change of pendingChanges) {
        const localSession = get().sessions.find(session => session.id === change.id);
        if (!localSession) {
          await clearPendingChange('session', change.id);
          continue;
        }
        if (!(await saveCloudSession(userId, localSession))) return;
        await clearPendingChange('session', change.id);
      }

      const { data, error } = await withTimeout(
        supabase
          .from('study_sessions')
          .select(cloudSessionColumns)
          .eq('user_id', userId)
          .order('session_date', { ascending: false }),
        { data: null, error: TIMEOUT_ERROR } as any,
      );

      if (error) {
        devWarn('[Wortly] Çalışma geçmişi buluttan okunamadı:', error.message);
        return;
      }

      const cloudSessions = (data ?? []) as CloudSession[];

      // İlk bulut geçişinde mevcut cihaz geçmişini kaybetmeden yükle.
      if ((!localOwner || localOwner === userId) && cloudSessions.length === 0 && localSessions.length > 0) {
        let allSaved = true;
        for (const session of localSessions) {
          if (!(await saveCloudSession(userId, session))) allSaved = false;
        }
        if (allSaved) await safeSetItem(KEYS.SESSIONS_OWNER, userId);
        return;
      }

      const pendingSessionIds = new Set(pendingChanges.map(change => change.id));
      const nextSessionsById = new Map(
        cloudSessions.map(session => [session.id, fromCloudSession(session)] as const),
      );
      for (const session of localSessions) {
        if (pendingSessionIds.has(session.id)) nextSessionsById.set(session.id, session);
      }
      const nextSessions = Array.from(nextSessionsById.values()).sort((a, b) => b.date - a.date);
      if (get().sessions !== localSessions) {
        devLog('[Wortly][sync] syncSessions: yerel değişiklik algılandı, birleştirme ertelendi');
        return;
      }
      set({ sessions: nextSessions, sessionsOwner: userId });
      await safeSetItem(KEYS.SESSIONS, JSON.stringify(nextSessions));
      await safeSetItem(KEYS.SESSIONS_OWNER, userId);

      // Gerçek toplam: satırları indirmeden bulut sayısı (migration gerekmez). Başarısızsa mevcut
      // değer korunur; sayı uydurulmaz.
      const { count, error: countError } = await withTimeout(
        supabase
          .from('study_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
        { count: null, error: TIMEOUT_ERROR } as any,
      );
      if (!countError && typeof count === 'number') {
        const total = { userId, count };
        set({ sessionTotal: total });
        await safeSetItem(KEYS.SESSION_TOTAL, JSON.stringify(total));
      }
    } catch (err) {
      devWarn('[Wortly] Çalışma geçmişi senkronizasyonunda beklenmeyen hata:', err);
    } finally {
      set({ syncedUserId: userId });
      devLog('[Wortly][sync] syncSessions tamamlandı');
    }
  }),

  resetLocal: async () => {
    scenarioLoads.invalidate(); // süren senaryo okumaları çıkıştan sonra veri yazamaz
    set({ sessions: [], scenarioResults: [], scenarioResultsOwner: null, sessionsOwner: null, sessionTotal: null, currentSession: null, syncedUserId: null });
    await drainWrites();
    await safeMultiRemove([KEYS.SESSIONS, KEYS.SESSIONS_OWNER, KEYS.SESSION_TOTAL]);
  },

  startSession: (sessionData) => {
    const session: QuizSession = {
      ...sessionData,
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, // aynı milisaniyede iki oturum çakışmasın
      date: Date.now(),
    };
    set({ currentSession: session });
  },

  saveSession: (session) => withWrite(async () => {
    const updated = [session, ...get().sessions].slice(0, LOCAL_SESSION_LIMIT); // Yerelde son N oturum
    // Yerel durum hemen güncellenir (ekranlar beklemeden sonuca geçer). Bilinen gerçek toplam 1
    // artırılır; bir sonraki senkron bulut sayısıyla düzeltir.
    const previousTotal = get().sessionTotal;
    const bumpedTotal = previousTotal ? { ...previousTotal, count: previousTotal.count + 1 } : null;
    set({ sessions: updated, sessionTotal: bumpedTotal, currentSession: null });
    await safeSetItem(KEYS.SESSIONS, JSON.stringify(updated));
    const userId = await getMutationUserId(KEYS.SESSIONS_OWNER);
    await stampOwner('sessions', userId, set);
    if (bumpedTotal) {
      if (userId && bumpedTotal.userId === userId) {
        await safeSetItem(KEYS.SESSION_TOTAL, JSON.stringify(bumpedTotal));
      } else {
        // Toplam başka bir kullanıcıya aitse bu hesapta kullanılmaz.
        set({ sessionTotal: previousTotal });
      }
    }
    await queuePendingChange({ entity: 'session', id: session.id, operation: 'upsert', userId });
    if (userId && await saveCloudSession(userId, session)) {
      await clearPendingChange('session', session.id);
      await safeSetItem(KEYS.SESSIONS_OWNER, userId);
    }
  }),

  saveScenarioResult: (userId, result) => withWrite(async () => {
    const nextResult: ScenarioResult = {
      ...result,
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      date: Date.now(),
    };
    // Bellekteki liste başka kullanıcıya aitse (veya henüz yüklenmediyse) üzerine yazarak kayıt kaybettirmemek
    // için bu kullanıcının kayıtlı listesi depodan okunur.
    let base = get().scenarioResults;
    if (get().scenarioResultsOwner !== userId) {
      try {
        const raw = await safeGetItem(scenarioResultsKey(userId));
        const parsed = raw ? JSON.parse(raw) : [];
        base = Array.isArray(parsed) ? parsed : [];
      } catch {
        base = [];
      }
    }
    const updated = [nextResult, ...base].slice(0, LOCAL_SCENARIO_LIMIT);
    set({ scenarioResults: updated, scenarioResultsOwner: userId });
    await safeSetItem(scenarioResultsKey(userId), JSON.stringify(updated));
  }),

  clearCurrentSession: () => set({ currentSession: null }),
}));

export interface LegacyRecordsSummary {
  /** Şimdi eklenebilecek (veya bu işlemde eklenen) kişisel kelime sayısı. */
  words: number;
  /** Şimdi eklenebilecek (veya bu işlemde eklenen) çalışma kaydı sayısı. */
  sessions: number;
  /** Şimdi eklenebilecek (veya bu işlemde eklenen) kelime ilerlemesi sayısı. */
  reviewStates: number;
  /** words + sessions + reviewStates. */
  total: number;
  /**
   * Cihazdaki 100 kayıt sınırı nedeniyle yerel listeye sığmayan çalışma kayıtları: onaydan ÖNCE parkta (sahibi bilinmeyen),
   * onaydan SONRA kullanıcının salt okunur arşivinde güvende bekler. Tamamlanmış yerel oturum sayılmaz.
   */
  waiting: number;
  /** Bu işlem sahibi doğrulanamadığı için engellendi (cihazda birden fazla hesap kullanıldı). */
  blocked?: boolean;
}

const emptyLegacySummary = (): LegacyRecordsSummary => ({ words: 0, sessions: 0, reviewStates: 0, total: 0, waiting: 0 });

/**
 * Sahibi doğrulanamadığı için park edilmiş eski yerel kayıtların özeti (hiçbir şey değiştirilmez, içerik gösterilmez; yalnızca
 * sayılar). Sayılar şu anki yerel duruma göre HESAPLANIR: zaten yerelde olan kayıtlar sayılmaz; oturumlar için boş yer kadarı
 * "eklenebilir", kalanı "bekliyor".
 */
export async function summarizeLegacyRecords(): Promise<LegacyRecordsSummary> {
  const summary = emptyLegacySummary();
  const currentWords = useWordStore.getState().words;
  for (const key of await isolation.parkedKeys(UNKNOWN_OWNER, 'words')) {
    const parked = await isolation.readParked<Word[]>(key);
    if (Array.isArray(parked)) summary.words += planWordRestore(currentWords, parked).length;
  }
  // Oturumlar: tüm park kayıtları birlikte değerlendirilir (aynı kimlik iki kez sayılmaz, boş yer paylaşılır).
  const allParkedSessions: QuizSession[] = [];
  for (const key of await isolation.parkedKeys(UNKNOWN_OWNER, 'sessions')) {
    const parked = await isolation.readParked<QuizSession[]>(key);
    if (Array.isArray(parked)) allParkedSessions.push(...parked);
  }
  const sessionPlan = planSessionRestore(useSessionStore.getState().sessions, allParkedSessions, LOCAL_SESSION_LIMIT);
  summary.sessions = sessionPlan.toAdd.length;
  summary.waiting = sessionPlan.waiting.length;
  const currentReview = useWordStore.getState().reviewStates;
  for (const key of await isolation.parkedKeys(UNKNOWN_OWNER, 'review')) {
    const parked = await isolation.readParked<ReviewStateMap>(key);
    if (parked && typeof parked === 'object') summary.reviewStates += planReviewRestore(currentReview, parked).length;
  }
  summary.total = summary.words + summary.sessions + summary.reviewStates;
  return summary;
}

/**
 * Kullanıcının KENDİ onayıyla hesabına bağlanmış ama yerel listeye sığmayan çalışma kayıtları (salt okunur arşiv).
 * Yalnızca bu kullanıcının arşivi okunur; başka kullanıcının kayıtları ASLA döndürülmez. İstatistik, görev, rozet ve
 * eşitlemeye KATILMAZ (yerel oturum listesinde olmadıkları için).
 */
export async function loadArchivedSessions(userId: string): Promise<QuizSession[]> {
  if (!userId) return [];
  const localIds = new Set(useSessionStore.getState().sessions.map(session => session.id));
  const byId = new Map<string, QuizSession>();
  for (const key of await isolation.parkedKeys(userId, 'archive')) {
    const parked = await isolation.readParked<QuizSession[]>(key);
    if (!Array.isArray(parked)) continue;
    for (const item of parked) {
      if (
        item && typeof item.id === 'string' && Number.isFinite(item.score) && Number.isFinite(item.total)
        && Number.isFinite(item.date) && !localIds.has(item.id)
      ) byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.date - a.date);
}

export interface LegacyOfferInfo {
  /** none: gösterilecek bir şey yok; offer: (belirsizliği açıkça belirterek) onaya sunulabilir; hold: sahiplik belirsiz, bekletilir. */
  state: LegacyOffer;
  summary: LegacyRecordsSummary;
  /** Bu kullanıcının salt okunur arşivindeki kayıt sayısı. */
  archived: number;
}

/** Kurtarma kartının kullandığı TEK kaynak: teklif durumu + sayılar + arşiv. */
export async function getLegacyOffer(userId: string): Promise<LegacyOfferInfo> {
  const summary = await summarizeLegacyRecords();
  const archived = (await loadArchivedSessions(userId)).length;
  const hasLegacy = summary.total > 0 || summary.waiting > 0;
  const state = legacyOfferState(await readDeviceAccounts(), userId, hasLegacy);
  return { state, summary, archived };
}

// Geri yükleme işlemleri sırayla çalışır: çift onay / çift dokunuş birbirine karışmaz. Her adım kimliğe göre birleştirme
// olduğu için tekrar çalıştırmak veriyi ÇOĞALTMAZ; park kaydı yalnızca başarıyla uygulandıktan sonra kaldırılır
// (uygulama arada kapansa bile sonraki çalıştırma güvenle tamamlar).
let restoreChain: Promise<unknown> = Promise.resolve();

/**
 * Kullanıcı bu eski kayıtların KENDİSİNE ait olduğunu açıkça onayladığında çağrılır. ÖNEMLİ: kullanıcının onayı bir
 * beyandır, sahiplik KANITI değildir; bu yüzden cihazda birden fazla hesap kullanıldıysa işlem ENGELLENİR (`blocked`) ve
 * kayıtlar bekletilir. Onaylanırsa kayıtlar bu hesaba eklenir ve buluta gönderilmek üzere kuyruğa alınır. MEVCUT kayıtlar
 * ezilmez: oturumlar yalnızca cihazdaki 100 kayıt sınırında BOŞ yer varsa listeye eklenir; sığmayanlar silinmeden bu hesabın
 * salt okunur arşivine alınır (artık başka hesaba sunulamaz). Dönen sayılar bu işlemde GERÇEKTEN eklenenlerdir.
 */
export function restoreLegacyRecords(userId: string): Promise<LegacyRecordsSummary> {
  const run = restoreChain.then(() => withWrite(async () => {
    const restored = emptyLegacySummary();
    const offer = await getLegacyOffer(userId);
    if (offer.state !== 'offer') {
      restored.blocked = offer.state === 'hold';
      restored.waiting = offer.archived;
      return restored;
    }

    await isolation.consumeParked(UNKNOWN_OWNER, 'words', async (parsed) => {
      if (!Array.isArray(parsed)) return false;
      const fresh = planWordRestore(useWordStore.getState().words, parsed as Word[]);
      const merged = mergeParkedById(useWordStore.getState().words, fresh);
      const text = JSON.stringify(merged);
      await asyncStorageAdapter.setItem(KEYS.WORDS, text);
      await asyncStorageAdapter.setItem(KEYS.WORDS_OWNER, userId);
      if ((await safeGetItem(KEYS.WORDS)) !== text) return false;
      useWordStore.setState({ words: merged, wordsOwner: userId });
      for (const word of fresh) await queuePendingChange({ entity: 'word', id: word.id, operation: 'upsert', userId });
      restored.words += fresh.length;
      return true;
    });

    await isolation.consumeParked(UNKNOWN_OWNER, 'sessions', async (parsed) => {
      if (!Array.isArray(parsed)) return false;
      const plan = planSessionRestore(useSessionStore.getState().sessions, parsed as QuizSession[], LOCAL_SESSION_LIMIT);
      if (plan.toAdd.length > 0) {
        const merged = [...useSessionStore.getState().sessions, ...plan.toAdd].sort((a, b) => b.date - a.date);
        const text = JSON.stringify(merged);
        await asyncStorageAdapter.setItem(KEYS.SESSIONS, text);
        await asyncStorageAdapter.setItem(KEYS.SESSIONS_OWNER, userId);
        if ((await safeGetItem(KEYS.SESSIONS)) !== text) return false;
        useSessionStore.setState({ sessions: merged, sessionsOwner: userId });
        for (const session of plan.toAdd) await queuePendingChange({ entity: 'session', id: session.id, operation: 'upsert', userId });
        restored.sessions += plan.toAdd.length;
      }
      if (plan.waiting.length > 0) {
        // Sığmayanlar bu kullanıcının arşivine alınır ("archive" türü: salt okunur, istatistiğe/eşitlemeye katılmaz, otomatik
        // geri yüklenmez). Yalnızca doğrulanırsa eski (sahibi bilinmeyen) kayıt kaldırılır; hiçbiri silinmez.
        return (await isolation.parkInLock('archive', userId, JSON.stringify(plan.waiting))) !== 'failed';
      }
      return true;
    });

    await isolation.consumeParked(UNKNOWN_OWNER, 'review', async (parsed) => {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
      const changed = planReviewRestore(useWordStore.getState().reviewStates, parsed as ReviewStateMap);
      const merged = mergeReviewStates(useWordStore.getState().reviewStates, parsed as ReviewStateMap);
      const text = JSON.stringify(merged);
      await asyncStorageAdapter.setItem(KEYS.REVIEW_STATES, text);
      await asyncStorageAdapter.setItem(KEYS.REVIEW_OWNER, userId);
      if ((await safeGetItem(KEYS.REVIEW_STATES)) !== text) return false;
      useWordStore.setState({ reviewStates: merged, reviewOwner: userId });
      restored.reviewStates += changed.length;
      return true;
    });

    restored.total = restored.words + restored.sessions + restored.reviewStates;
    // Listeye sığmayıp arşive alınan (salt okunur) kayıt sayısı.
    restored.waiting = (await loadArchivedSessions(userId)).length;
    return restored;
  }));
  restoreChain = run.catch(() => undefined);
  return run;
}

// Bekleyen değişiklikleri buluta göndermeyi dener ve kalan sayıyı döndürür.
// Başarısız olan kayıtlar kuyrukta kalır; 0 dönmesi hepsinin buluta ulaştığını gösterir.
export async function flushPendingChanges(userId: string): Promise<number> {
  await Promise.all([
    useUserStore.getState().syncProfile(userId),
    useWordStore.getState().syncWords(userId),
    useSessionStore.getState().syncSessions(userId),
  ]);
  return getPendingChangeCount(userId);
}
