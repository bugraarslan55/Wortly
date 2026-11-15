import { backupCorrupt, type KeyValueStorage } from './data-isolation';
import {
  addPhrase, makePhrase, parsePhrasebook, removePhrase, serializePhrasebook, type AddStatus, type Phrase, type PhraseInput,
} from './phrasebook';

// İfade Defterim'in kalıcı depolaması. Depolama ENJEKTE edilir (AsyncStorage'a benzer arayüz): okuma/yazma hataları,
// eşzamanlılık ve hesap değişimi gerçeğe yakın şekilde test edilebilir. Kayıt kullanıcıya özel bir anahtardadır
// (rozetler ve senaryo sonuçlarıyla aynı yaklaşım); hesaplar arasında veri karışmaz ve buluta gönderilmez.
//
// Tasarım ilkeleri (veri kaybını her şeyin üstünde tut):
// - Her değişiklik, kilit altında depodan OKUNAN güncel veri üzerinde yapılır (bellekteki kopyaya güvenilmez; çift dokunuş
//   ve eşzamanlı yazımlar birbirini ezmez).
// - Okuma hatası "boş veri" sayılmaz: yazma reddedilir, mevcut veri ezilmez.
// - Bozuk/kısmen geçersiz ham veri, üzerine yazılmadan ÖNCE yedeklenir ve yedek doğrulanamazsa yazılmaz.

export const phrasebookKey = (userId: string) => `@wortly:phrasebook:${userId}`;

export type PhrasebookLoad = { ok: true; items: Phrase[] } | { ok: false };
export type AddResult = { status: AddStatus | 'failed'; items: Phrase[] | null };
export type RemoveResult = { status: 'removed' | 'missing' | 'failed'; items: Phrase[] | null };

const validUserId = (userId: string | null | undefined): userId is string => typeof userId === 'string' && userId.trim().length > 0;

export function createPhrasebookRepo(storage: KeyValueStorage, now: () => number = Date.now) {
  let chain: Promise<unknown> = Promise.resolve();
  function locked<T>(task: () => Promise<T>): Promise<T> {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  }

  async function read(userId: string): Promise<{ items: Phrase[]; lossy: boolean; raw: string | null } | null> {
    let raw: string | null;
    try {
      raw = await storage.getItem(phrasebookKey(userId));
    } catch {
      return null;
    }
    const parsed = parsePhrasebook(raw);
    return { items: parsed.items, lossy: parsed.lossy, raw };
  }

  /** Yazmadan önce (gerekirse) bozuk ham veriyi yedekler; sonra yeni listeyi yazar. false: yazılamadı, depo korundu. */
  async function write(userId: string, current: { lossy: boolean; raw: string | null }, items: Phrase[]): Promise<boolean> {
    const key = phrasebookKey(userId);
    if (current.lossy && current.raw && !(await backupCorrupt(storage, key, current.raw, now))) return false;
    try {
      await storage.setItem(key, serializePhrasebook(items));
      return true;
    } catch {
      return false;
    }
  }

  return {
    load: (userId: string | null | undefined): Promise<PhrasebookLoad> => locked(async () => {
      if (!validUserId(userId)) return { ok: false };
      const current = await read(userId);
      return current ? { ok: true, items: current.items } : { ok: false };
    }),

    add: (userId: string | null | undefined, input: Partial<PhraseInput>): Promise<AddResult> => locked(async () => {
      if (!validUserId(userId)) return { status: 'failed', items: null };
      const phrase = makePhrase(input, now());
      if (!phrase) return { status: 'failed', items: null };
      const current = await read(userId);
      if (!current) return { status: 'failed', items: null };
      const result = addPhrase(current.items, phrase);
      if (result.status !== 'added') return result;
      return (await write(userId, current, result.items))
        ? result
        : { status: 'failed', items: null };
    }),

    remove: (userId: string | null | undefined, id: string): Promise<RemoveResult> => locked(async () => {
      if (!validUserId(userId)) return { status: 'failed', items: null };
      const current = await read(userId);
      if (!current) return { status: 'failed', items: null };
      const items = removePhrase(current.items, id);
      if (items.length === current.items.length) return { status: 'missing', items: current.items };
      return (await write(userId, current, items))
        ? { status: 'removed', items }
        : { status: 'failed', items: null };
    }),
  };
}

export type PhrasebookRepo = ReturnType<typeof createPhrasebookRepo>;
