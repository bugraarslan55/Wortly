import { createLatestGuard } from '../utils/latest-guard';
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EMPTY_EARNED_RECORD, EarnedRecord, parseEarnedRecord, recordEarned,
} from '../utils/achievements';

// Kazanılan rozetlerin YEREL kaydı (kullanıcıya özel anahtar). Neden gerekli: bazı koşullar
// (ör. 7 günlük seri, "Öğrenildi" kelime sayısı) kazanıldıktan sonra veride artık görünmeyebilir
// (seri bozulur, mastery düşer, yerel oturum listesi 100 kayıtla sınırlıdır). Rozet yalnızca o an mevcut
// veri koşulu GERÇEKTEN kanıtlarken kaydedilir; kanıtlanamayan hiçbir rozet geriye dönük verilmez.
//
// Kayıt buluta gönderilmez (yeni Supabase tablosu/migration yok). Biçimi (utils/achievements.ts,
// EarnedRecord) birleştirilebilir bir "büyüyen küme"dir; ileride cihazlar arası senkron eklenirse
// mergeEarnedRecords ile güvenle birleştirilebilir. Aynı hesap başka cihazda kullanılırsa oradaki rozetler
// ayrıca ve o cihazda kanıtlanabildiği kadarıyla kazanılır.

const storageKey = (userId: string) => `@wortly:achievements:${userId}`;

interface AchievementStore {
  /** Yüklenen kaydın sahibi; başka kullanıcının kaydı asla kullanılmaz. */
  userId: string | null;
  isLoaded: boolean;
  record: EarnedRecord;
  /** Bu oturumda yeni doğrulananlar (sonuç ekranındaki bildirim için). */
  recentlyEarned: string[];
  load: (userId: string) => Promise<void>;
  markEarned: (userId: string, ids: string[], now: number) => Promise<void>;
  clearRecent: () => void;
  reset: () => void;
}

// Hesap değişiminde ESKİ hesabın geç biten okuması yeni hesabın kaydını ezmesin (son istek kazanır).
const loads = createLatestGuard();

export const useAchievementStore = create<AchievementStore>((set, get) => ({
  userId: null,
  isLoaded: false,
  record: EMPTY_EARNED_RECORD,
  recentlyEarned: [],

  load: async (userId) => {
    const token = loads.begin();
    try {
      const raw = await AsyncStorage.getItem(storageKey(userId));
      if (!loads.isLatest(token)) return;
      set({ userId, record: parseEarnedRecord(raw), recentlyEarned: [], isLoaded: true });
    } catch {
      if (loads.isLatest(token)) set({ userId, record: EMPTY_EARNED_RECORD, recentlyEarned: [], isLoaded: true });
    }
  },

  markEarned: async (userId, ids, now) => {
    const state = get();
    // Başka kullanıcının kaydı yüklüyse yazma (hesap değişimi sırasında karışmasın).
    if (state.userId !== userId || !state.isLoaded) return;
    const { record, fresh } = recordEarned(state.record, ids, now);
    if (fresh.length === 0) return; // aynı rozet ikinci kez kaydedilmez
    set({ record, recentlyEarned: [...state.recentlyEarned, ...fresh] });
    try {
      await AsyncStorage.setItem(storageKey(userId), JSON.stringify(record));
    } catch {
      // Yazılamazsa rozet bellekte kalır; koşul hâlâ kanıtlıysa sonraki açılışta yeniden denenir.
    }
  },

  clearRecent: () => set({ recentlyEarned: [] }),

  // Çıkışta yalnızca bellek temizlenir; kullanıcıya özel kayıt cihazda kalır (senaryo sonuçlarıyla aynı).
  reset: () => {
    loads.invalidate(); // çıkıştan sonra süren okuma veri yazamaz
    set({ userId: null, isLoaded: false, record: EMPTY_EARNED_RECORD, recentlyEarned: [] });
  },
}));
