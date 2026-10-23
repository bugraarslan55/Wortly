import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Word, UserProfile, QuizSession, Level, MasteryLevel } from '../types';
import { findDuplicateCustomWord } from '../utils/word-validation';
import { supabase } from '../utils/supabase';
import { ReviewStateMap } from '../utils/spaced-repetition';

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
  return withTimeout(AsyncStorage.setItem(key, value), undefined, STORAGE_TIMEOUT_MS);
}

function safeMultiRemove(keys: string[]): Promise<void> {
  return withTimeout(AsyncStorage.multiRemove(keys), undefined, STORAGE_TIMEOUT_MS);
}

// ─── WORD STORE ─────────────────────────────────────────────────────────────
interface WordStore {
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
  updateMastery: (id: string, correct: boolean) => Promise<void>;
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
    console.warn('[Wortly] Kullanıcı kelimeleri buluta senkronize edilemedi:', error.message);
    return false;
  }
  return true;
};

const saveCloudWord = async (word: Word) => {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  await saveCloudWords(data.user.id, [word]);
};

const deleteCloudWord = async (wordId: string) => {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase
    .from('user_words')
    .delete()
    .eq('id', wordId)
    .eq('user_id', data.user.id);
  if (error) console.warn('[Wortly] Kullanıcı kelimesi buluttan silinemedi:', error.message);
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
    console.warn('[Wortly] Çalışma oturumu buluta kaydedilemedi:', error.message);
    return false;
  }
  return true;
};

export const useWordStore = create<WordStore>((set, get) => ({
  words: [],
  reviewStates: {},
  isLoaded: false,
  syncedUserId: null,

  loadWords: async () => {
    console.warn('[Wortly][load] loadWords başladı');
    try {
      const [raw, rawReviewStates] = await Promise.all([
        safeGetItem(KEYS.WORDS),
        safeGetItem(KEYS.REVIEW_STATES),
      ]);
      const words: Word[] = raw ? JSON.parse(raw) : [];
      const reviewStates: ReviewStateMap = rawReviewStates ? JSON.parse(rawReviewStates) : {};
      set({ words, reviewStates, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    } finally {
      console.warn('[Wortly][load] loadWords tamamlandı');
    }
  },

  syncWords: async (userId) => {
    // Bu fonksiyon ne olursa olsun (başarı, hata ya da beklenmeyen bir
    // istisna) `finally` içinde syncedUserId'i işaretler — RootLayout'taki
    // senkronizasyon kapısı bu sayede asla sonsuza kadar beklemez. Tüm
    // AsyncStorage çağrıları da safeGetItem/safeSetItem ile zaman aşımına
    // uğratılır, çünkü yerel depolama çağrısı askıda kalırsa `await` hiç
    // dönmez ve finally bile çalışmaz.
    console.warn('[Wortly][sync] syncWords başladı', userId);
    try {
      const localOwner = await safeGetItem(KEYS.WORDS_OWNER);
      const reviewOwner = await safeGetItem(KEYS.REVIEW_OWNER);

      // Statik kelimelerin tekrar geçmişi cihazda tutulur. Kullanıcı değişince
      // önceki hesabın geçmişi yeni hesaba görünür şekilde taşınmasın.
      if (reviewOwner && reviewOwner !== userId) {
        const emptyReviewStates: ReviewStateMap = {};
        set({ reviewStates: emptyReviewStates });
        await safeSetItem(KEYS.REVIEW_STATES, JSON.stringify(emptyReviewStates));
      }
      await safeSetItem(KEYS.REVIEW_OWNER, userId);

      const { data, error } = await withTimeout(
        supabase
          .from('user_words')
          .select(cloudWordColumns)
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        { data: null, error: TIMEOUT_ERROR } as any,
      );

      if (error) {
        console.warn('[Wortly] Kullanıcı kelimeleri buluttan okunamadı:', error.message);
        return;
      }

      const cloudWords = (data ?? []) as CloudWord[];
      const localWords = get().words;
      const localCustomWords = localWords.filter(word => word.isCustom);

      // İlk bulut geçişinde mevcut cihaz kelimelerini kaybetmeden yükle.
      if ((!localOwner || localOwner === userId) && cloudWords.length === 0 && localCustomWords.length > 0) {
        const saved = await saveCloudWords(userId, localCustomWords);
        if (saved) await safeSetItem(KEYS.WORDS_OWNER, userId);
        return;
      }

      const nextWords = cloudWords.map(fromCloudWord);
      set({ words: nextWords });
      await safeSetItem(KEYS.WORDS, JSON.stringify(nextWords));
      await safeSetItem(KEYS.WORDS_OWNER, userId);
    } catch (err) {
      console.warn('[Wortly] Kelime senkronizasyonunda beklenmeyen hata:', err);
    } finally {
      set({ syncedUserId: userId });
      console.warn('[Wortly][sync] syncWords tamamlandı', userId);
    }
  },

  resetLocal: async () => {
    set({ words: [], reviewStates: {}, syncedUserId: null });
    await safeMultiRemove([
      KEYS.WORDS,
      KEYS.WORDS_OWNER,
      KEYS.REVIEW_STATES,
      KEYS.REVIEW_OWNER,
    ]);
  },

  addWord: async (wordData) => {
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
    await AsyncStorage.setItem(KEYS.WORDS, JSON.stringify(updated));
    await saveCloudWord(newWord);
    return { ok: true };
  },

  updateWord: async (id, updates) => {
    const current = get().words.find(w => w.id === id);
    if (current) {
      const nextGerman = updates.german ?? current.german;
      const nextArticle = updates.article ?? current.article;
      const duplicate = findDuplicateCustomWord(get().words, nextGerman, nextArticle, id);
      if (duplicate) return { ok: false, reason: 'duplicate', existing: duplicate };
    }

    const updated = get().words.map(w => w.id === id ? { ...w, ...updates } : w);
    set({ words: updated });
    await AsyncStorage.setItem(KEYS.WORDS, JSON.stringify(updated));
    const updatedWord = updated.find(word => word.id === id);
    if (updatedWord) await saveCloudWord(updatedWord);
    return { ok: true };
  },

  deleteWord: async (id) => {
    const updated = get().words.filter(w => w.id !== id);
    set({ words: updated });
    await AsyncStorage.setItem(KEYS.WORDS, JSON.stringify(updated));
    await deleteCloudWord(id);
  },

  updateMastery: async (id, correct) => {
    const word = get().words.find(w => w.id === id);
    const currentReview = get().reviewStates[id] ?? (word ? {
      masteryLevel: word.masteryLevel,
      lastReviewed: word.lastReviewed,
    } : {
      masteryLevel: 0 as MasteryLevel,
    });
    const newLevel = correct
      ? Math.min(3, currentReview.masteryLevel + 1) as MasteryLevel
      : Math.max(0, currentReview.masteryLevel - 1) as MasteryLevel;
    const lastReviewed = Date.now();
    const reviewStates = {
      ...get().reviewStates,
      [id]: { masteryLevel: newLevel, lastReviewed },
    };

    set({ reviewStates });
    await safeSetItem(KEYS.REVIEW_STATES, JSON.stringify(reviewStates));

    // Özel kelimeler için mevcut mastery alanını da koru. Statik Goethe
    // kelimeleri yalnızca bu yerel review haritasında tutulur.
    if (word) {
      await get().updateWord(id, { masteryLevel: newLevel, lastReviewed });
    }
  },

  getCustomWords: () => get().words.filter(w => w.isCustom),
  getWordsByTopic: (topicId) => get().words.filter(w => w.topicId === topicId),
}));

// ─── USER STORE ─────────────────────────────────────────────────────────────
interface UserStore {
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
  if (error) console.warn('[Wortly] Profil buluta senkronize edilemedi:', error.message);
};

export const useUserStore = create<UserStore>((set, get) => ({
  profile: null,
  isLoaded: false,
  syncedUserId: null,

  loadProfile: async () => {
    console.warn('[Wortly][load] loadProfile başladı');
    try {
      const raw = await safeGetItem(KEYS.PROFILE);
      const profile: UserProfile = raw ? JSON.parse(raw) : DEFAULT_PROFILE;

      // Migrasyon: yayın kapsamı artık A1/A2/B1. Geçersiz/tanınmayan bir
      // seviye varsa güvenli biçimde A2'ye normalize edilir ve kalıcı olarak
      // geri yazılır.
      if (profile.level !== 'A1' && profile.level !== 'A2' && profile.level !== 'B1') {
        profile.level = 'A2';
        await safeSetItem(KEYS.PROFILE, JSON.stringify(profile));
      }

      set({ profile, isLoaded: true });
    } catch {
      set({ profile: DEFAULT_PROFILE, isLoaded: true });
    } finally {
      console.warn('[Wortly][load] loadProfile tamamlandı');
    }
  },

  syncProfile: async (userId) => {
    // syncWords'teki gibi: her çıkış yolunda (başarı/hata/istisna) `finally`
    // içinde syncedUserId işaretlenir, senkronizasyon kapısı asla takılmaz.
    // Tüm AsyncStorage çağrıları da safeGetItem/safeSetItem ile zaman
    // aşımına uğratılır (askıda kalan bir `await`, finally'nin de hiç
    // çalışmamasına yol açar).
    console.warn('[Wortly][sync] syncProfile başladı', userId);
    try {
      const localProfile = get().profile ?? DEFAULT_PROFILE;
      const localOwner = await safeGetItem(KEYS.PROFILE_OWNER);
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('name, level, onboarding_completed, streak, last_study_date, total_words_learned, daily_goal')
          .eq('id', userId)
          .maybeSingle(),
        { data: null, error: TIMEOUT_ERROR } as any,
      );

      if (error) {
        console.warn('[Wortly] Bulut profil okunamadı:', error.message);
        return;
      }

      if (!data) {
        const profile = localOwner && localOwner !== userId ? DEFAULT_PROFILE : localProfile;
        await saveCloudProfile(userId, profile);
        await safeSetItem(KEYS.PROFILE_OWNER, userId);
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
        await saveCloudProfile(userId, localProfile);
        await safeSetItem(KEYS.PROFILE_OWNER, userId);
        return;
      }

      const profile = fromCloudProfile(data);
      set({ profile });
      await safeSetItem(KEYS.PROFILE, JSON.stringify(profile));
      await safeSetItem(KEYS.PROFILE_OWNER, userId);
    } catch (err) {
      console.warn('[Wortly] Profil senkronizasyonunda beklenmeyen hata:', err);
    } finally {
      set({ syncedUserId: userId });
      console.warn('[Wortly][sync] syncProfile tamamlandı', userId);
    }
  },

  resetLocal: async () => {
    set({ profile: DEFAULT_PROFILE, syncedUserId: null });
    await safeMultiRemove([KEYS.PROFILE, KEYS.PROFILE_OWNER]);
  },

  setProfile: async (profile) => {
    set({ profile });
    await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await saveCloudProfile(data.user.id, profile);
      await AsyncStorage.setItem(KEYS.PROFILE_OWNER, data.user.id);
    }
  },

  updateProfile: async (updates) => {
    const current = get().profile || DEFAULT_PROFILE;
    const updated = { ...current, ...updates };
    set({ profile: updated });
    await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(updated));
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await saveCloudProfile(data.user.id, updated);
      await AsyncStorage.setItem(KEYS.PROFILE_OWNER, data.user.id);
    }
  },

  completeOnboarding: async (name, level) => {
    const profile: UserProfile = {
      ...DEFAULT_PROFILE,
      name,
      level,
      onboardingCompleted: true,
    };
    set({ profile });
    await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await saveCloudProfile(data.user.id, profile);
      await AsyncStorage.setItem(KEYS.PROFILE_OWNER, data.user.id);
    }
  },

  updateStreak: async () => {
    const profile = get().profile;
    if (!profile) return;
    const today = new Date().toISOString().split('T')[0];
    const lastDate = profile.lastStudyDate;
    if (lastDate === today) return; // Aynı gün

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const newStreak = lastDate === yesterday ? profile.streak + 1 : 1;
    await get().updateProfile({ streak: newStreak, lastStudyDate: today });
  },
}));

// ─── SESSION STORE ──────────────────────────────────────────────────────────
interface SessionStore {
  sessions: QuizSession[];
  currentSession: QuizSession | null;
  isLoaded: boolean;
  syncedUserId: string | null;
  loadSessions: () => Promise<void>;
  syncSessions: (userId: string) => Promise<void>;
  resetLocal: () => Promise<void>;
  startSession: (session: Omit<QuizSession, 'id' | 'date'>) => void;
  saveSession: (session: QuizSession) => Promise<void>;
  clearCurrentSession: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  currentSession: null,
  isLoaded: false,
  syncedUserId: null,

  loadSessions: async () => {
    console.warn('[Wortly][load] loadSessions başladı');
    try {
      const raw = await safeGetItem(KEYS.SESSIONS);
      set({ sessions: raw ? JSON.parse(raw) : [], isLoaded: true });
    } catch {
      set({ isLoaded: true });
    } finally {
      console.warn('[Wortly][load] loadSessions tamamlandı');
    }
  },

  syncSessions: async (userId) => {
    // syncWords/syncProfile'daki gibi: her çıkış yolunda (başarı/hata/istisna)
    // `finally` içinde syncedUserId işaretlenir, senkronizasyon kapısı asla
    // takılmaz. Tüm AsyncStorage çağrıları da safeGetItem/safeSetItem ile
    // zaman aşımına uğratılır.
    console.warn('[Wortly][sync] syncSessions başladı', userId);
    try {
      const localOwner = await safeGetItem(KEYS.SESSIONS_OWNER);
      const { data, error } = await withTimeout(
        supabase
          .from('study_sessions')
          .select(cloudSessionColumns)
          .eq('user_id', userId)
          .order('session_date', { ascending: false }),
        { data: null, error: TIMEOUT_ERROR } as any,
      );

      if (error) {
        console.warn('[Wortly] Çalışma geçmişi buluttan okunamadı:', error.message);
        return;
      }

      const cloudSessions = (data ?? []) as CloudSession[];
      const localSessions = get().sessions;

      // İlk bulut geçişinde mevcut cihaz geçmişini kaybetmeden yükle.
      if ((!localOwner || localOwner === userId) && cloudSessions.length === 0 && localSessions.length > 0) {
        let allSaved = true;
        for (const session of localSessions) {
          if (!(await saveCloudSession(userId, session))) allSaved = false;
        }
        if (allSaved) await safeSetItem(KEYS.SESSIONS_OWNER, userId);
        return;
      }

      const nextSessions = cloudSessions.map(fromCloudSession);
      set({ sessions: nextSessions });
      await safeSetItem(KEYS.SESSIONS, JSON.stringify(nextSessions));
      await safeSetItem(KEYS.SESSIONS_OWNER, userId);
    } catch (err) {
      console.warn('[Wortly] Çalışma geçmişi senkronizasyonunda beklenmeyen hata:', err);
    } finally {
      set({ syncedUserId: userId });
      console.warn('[Wortly][sync] syncSessions tamamlandı', userId);
    }
  },

  resetLocal: async () => {
    set({ sessions: [], currentSession: null, syncedUserId: null });
    await safeMultiRemove([KEYS.SESSIONS, KEYS.SESSIONS_OWNER]);
  },

  startSession: (sessionData) => {
    const session: QuizSession = {
      ...sessionData,
      id: Date.now().toString(36),
      date: Date.now(),
    };
    set({ currentSession: session });
  },

  saveSession: async (session) => {
    const updated = [session, ...get().sessions].slice(0, 100); // Son 100 oturum
    set({ sessions: updated, currentSession: null });
    await AsyncStorage.setItem(KEYS.SESSIONS, JSON.stringify(updated));
    const { data } = await supabase.auth.getUser();
    if (data.user) await saveCloudSession(data.user.id, session);
  },

  clearCurrentSession: () => set({ currentSession: null }),
}));
