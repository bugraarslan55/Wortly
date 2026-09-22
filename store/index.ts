import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Word, UserProfile, QuizSession, Level } from '../types';
import { findDuplicateCustomWord } from '../utils/word-validation';

// ─── STORAGE KEYS ───────────────────────────────────────────────────────────
const KEYS = {
  WORDS: '@wortly:words',
  PROFILE: '@wortly:profile',
  SESSIONS: '@wortly:sessions',
};

// ─── WORD STORE ─────────────────────────────────────────────────────────────
interface WordStore {
  words: Word[];
  isLoaded: boolean;
  loadWords: () => Promise<void>;
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

export const useWordStore = create<WordStore>((set, get) => ({
  words: [],
  isLoaded: false,

  loadWords: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.WORDS);
      const words: Word[] = raw ? JSON.parse(raw) : [];
      set({ words, isLoaded: true });
    } catch {
      set({ isLoaded: true });
    }
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
    return { ok: true };
  },

  deleteWord: async (id) => {
    const updated = get().words.filter(w => w.id !== id);
    set({ words: updated });
    await AsyncStorage.setItem(KEYS.WORDS, JSON.stringify(updated));
  },

  updateMastery: async (id, correct) => {
    const word = get().words.find(w => w.id === id);
    if (!word) return;
    const newLevel = correct
      ? Math.min(3, word.masteryLevel + 1) as 0|1|2|3
      : Math.max(0, word.masteryLevel - 1) as 0|1|2|3;
    await get().updateWord(id, { masteryLevel: newLevel, lastReviewed: Date.now() });
  },

  getCustomWords: () => get().words.filter(w => w.isCustom),
  getWordsByTopic: (topicId) => get().words.filter(w => w.topicId === topicId),
}));

// ─── USER STORE ─────────────────────────────────────────────────────────────
interface UserStore {
  profile: UserProfile | null;
  isLoaded: boolean;
  loadProfile: () => Promise<void>;
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

export const useUserStore = create<UserStore>((set, get) => ({
  profile: null,
  isLoaded: false,

  loadProfile: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.PROFILE);
      const profile: UserProfile = raw ? JSON.parse(raw) : DEFAULT_PROFILE;

      // Migrasyon: yayın kapsamı yalnızca A1/A2. Eski sürümde kaydedilmiş B1
      // veya geçersiz bir seviye varsa güvenli biçimde A2'ye normalize edilir
      // ve kalıcı olarak geri yazılır.
      if (profile.level !== 'A1' && profile.level !== 'A2') {
        profile.level = 'A2';
        await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
      }

      set({ profile, isLoaded: true });
    } catch {
      set({ profile: DEFAULT_PROFILE, isLoaded: true });
    }
  },

  setProfile: async (profile) => {
    set({ profile });
    await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
  },

  updateProfile: async (updates) => {
    const current = get().profile || DEFAULT_PROFILE;
    const updated = { ...current, ...updates };
    set({ profile: updated });
    await AsyncStorage.setItem(KEYS.PROFILE, JSON.stringify(updated));
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
  loadSessions: () => Promise<void>;
  startSession: (session: Omit<QuizSession, 'id' | 'date'>) => void;
  saveSession: (session: QuizSession) => Promise<void>;
  clearCurrentSession: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  currentSession: null,

  loadSessions: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEYS.SESSIONS);
      set({ sessions: raw ? JSON.parse(raw) : [] });
    } catch {}
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
  },

  clearCurrentSession: () => set({ currentSession: null }),
}));
