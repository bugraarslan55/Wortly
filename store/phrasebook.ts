import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLatestGuard } from '../utils/latest-guard';
import type { Phrase, PhraseInput } from '../utils/phrasebook';
import { createPhrasebookRepo } from '../utils/phrasebook-storage';

// İfade Defterim'in YEREL kaydı (kullanıcıya özel anahtar; bkz. utils/phrasebook-storage.ts). Buluta gönderilmez
// (Supabase/senkronizasyon yok) ve çevrimdışı çalışır. Çıkışta yalnızca bellek temizlenir; kullanıcıya özel kayıt cihazda kalır
// (rozetler ve senaryo sonuçlarıyla aynı). Mağaza yalnızca `userId` ile yüklenen kullanıcının verisini tutar.

const repo = createPhrasebookRepo(AsyncStorage);

export type SaveOutcome = 'added' | 'duplicate' | 'full' | 'failed';
export type DeleteOutcome = 'removed' | 'missing' | 'failed';

interface PhrasebookStore {
  /** Yüklenen kaydın sahibi; başka kullanıcının kaydı asla kullanılmaz. */
  userId: string | null;
  isLoaded: boolean;
  /** Depo okunamadı: kayıtlar gösterilmez ve (mevcut veriyi ezmemek için) yeni yazım yapılmaz. */
  isLocked: boolean;
  items: Phrase[];
  load: (userId: string) => Promise<void>;
  save: (userId: string, input: Partial<PhraseInput>) => Promise<SaveOutcome>;
  remove: (userId: string, id: string) => Promise<DeleteOutcome>;
  reset: () => void;
}

// Hesap değişiminde ESKİ hesabın geç biten okuması yeni hesabın kaydını ezmesin (son istek kazanır).
const loads = createLatestGuard();

export const usePhrasebookStore = create<PhrasebookStore>((set, get) => ({
  userId: null,
  isLoaded: false,
  isLocked: false,
  items: [],

  load: async (userId) => {
    const token = loads.begin();
    const result = await repo.load(userId);
    if (!loads.isLatest(token)) return;
    if (result.ok) set({ userId, items: result.items, isLoaded: true, isLocked: false });
    else set({ userId, items: [], isLoaded: true, isLocked: true });
  },

  save: async (userId, input) => {
    const state = get();
    // Başka kullanıcının kaydı yüklüyse ya da depo okunamadıysa yazma (hesap değişimi sırasında karışmasın, veri ezilmesin).
    if (state.userId !== userId || !state.isLoaded || state.isLocked) return 'failed';
    const result = await repo.add(userId, input);
    if (result.items && get().userId === userId) set({ items: result.items });
    return result.status;
  },

  remove: async (userId, id) => {
    const state = get();
    if (state.userId !== userId || !state.isLoaded || state.isLocked) return 'failed';
    const result = await repo.remove(userId, id);
    if (result.items && get().userId === userId) set({ items: result.items });
    return result.status;
  },

  reset: () => {
    loads.invalidate(); // çıkıştan sonra süren okuma veri yazamaz
    set({ userId: null, isLoaded: false, isLocked: false, items: [] });
  },
}));
