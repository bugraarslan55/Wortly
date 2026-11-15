import type { Level } from '../types';

// İfade Defterim: kullanıcının senaryolardan kaydettiği ifadelerin saf mantığı (depolama, ağ ve ekran bağımlılığı yok).
//
// Kayıt, senaryo dosyasına BAĞLI DEĞİLDİR: Almanca/Türkçe metin, senaryo adı, seviye ve konuşan kaydedildiği anda kopyalanır.
// Senaryo metni sonradan değişse ya da senaryo kalksa bile ifade saklanan metinle açılır. Veri yalnızca cihazdadır
// (Supabase/senkronizasyon yok).

export const PHRASE_LEVELS: readonly Level[] = ['A1', 'A2', 'B1'];
/** Cihazdaki tek kullanıcı kaydının büyüklüğü sınırsız büyümesin. */
export const MAX_PHRASES = 500;

export interface Phrase {
  /** Almanca metinden türetilir (`phraseId`): aynı ifade tek kayıttır. */
  id: string;
  german: string;
  turkish: string;
  /** Konuşan; kullanıcının kendi cevabı için "Sen". Boş olabilir. */
  speaker: string;
  scenarioId: string;
  scenarioTitle: string;
  level: Level;
  savedAt: number;
}

export type PhraseInput = Omit<Phrase, 'id' | 'savedAt'>;

export const PHRASEBOOK_FULL_MESSAGE =
  `İfade Defterin dolu (${MAX_PHRASES} ifade). Yeni ifade kaydetmek için birkaç ifadeyi sil.`;
export const PHRASEBOOK_FAILED_MESSAGE = 'İfade kaydedilemedi. Biraz sonra tekrar dene.';
export const PHRASEBOOK_LOCKED_MESSAGE =
  'İfade Defterim şu anda açılamıyor. Kayıtlı ifadelerin silinmedi; uygulamayı yeniden başlatıp tekrar dene.';

export const saveLabel = (saved: boolean, german: string) =>
  saved ? `İfade Defterim'den kaldır: ${german}` : `İfade Defterim'e kaydet: ${german}`;
export const deleteLabel = (german: string) => `İfadeyi sil: ${german}`;

/** Büyük/küçük harf ve boşluk farkı aynı ifadedir (noktalama farkı farklı ifadedir). */
export const phraseId = (german: string): string => `p:${german.trim().replace(/\s+/g, ' ').toLowerCase()}`;

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isLevel = (value: unknown): value is Level => PHRASE_LEVELS.includes(value as Level);

/** Girdiyi doğrular ve kaydedilecek kayda çevirir; eksik/bozuk girdide null. */
export function makePhrase(input: Partial<PhraseInput> | null | undefined, now: number): Phrase | null {
  if (!input || !Number.isFinite(now)) return null;
  const { german, turkish, scenarioId, scenarioTitle, level, speaker } = input;
  if (!isText(german) || !isText(turkish) || !isText(scenarioId) || !isText(scenarioTitle) || !isLevel(level)) return null;
  return {
    id: phraseId(german),
    german: german.trim(),
    turkish: turkish.trim(),
    speaker: typeof speaker === 'string' ? speaker.trim() : '',
    scenarioId: scenarioId.trim(),
    scenarioTitle: scenarioTitle.trim(),
    level,
    savedAt: now,
  };
}

export type AddStatus = 'added' | 'duplicate' | 'full';

/** Yeni ifade başa eklenir. Zaten kayıtlıysa kopya oluşmaz ve İLK kayıt (eski metin) korunur. */
export function addPhrase(items: readonly Phrase[], phrase: Phrase): { items: Phrase[]; status: AddStatus } {
  if (items.some(item => item.id === phrase.id)) return { items: [...items], status: 'duplicate' };
  if (items.length >= MAX_PHRASES) return { items: [...items], status: 'full' };
  return { items: [phrase, ...items], status: 'added' };
}

export const removePhrase = (items: readonly Phrase[], id: string): Phrase[] => items.filter(item => item.id !== id);
export const isSaved = (items: readonly Phrase[], id: string): boolean => items.some(item => item.id === id);

// ─── Depolama biçimi ─────────────────────────────────────────────────────────

export const serializePhrasebook = (items: readonly Phrase[]): string => JSON.stringify({ version: 1, items });

export interface ParsedPhrasebook {
  items: Phrase[];
  /**
   * Ham veri bozuk, bilinmeyen sürümde ya da bazı kayıtlar geçersiz: üzerine yazmadan ÖNCE ham veri yedeklenmelidir.
   * (Yalnızca kopya kayıtların birleştirilmesi kayıp sayılmaz.)
   */
  lossy: boolean;
}

function parseEntry(entry: unknown): Phrase | null {
  if (!entry || typeof entry !== 'object') return null;
  const item = entry as Record<string, unknown>;
  const savedAt = item.savedAt;
  if (typeof savedAt !== 'number') return null;
  // Kimlik her zaman metinden yeniden üretilir (elle bozulmuş/eski kimlik kopyaya yol açmasın).
  return makePhrase({
    german: item.german as string, turkish: item.turkish as string, speaker: item.speaker as string,
    scenarioId: item.scenarioId as string, scenarioTitle: item.scenarioTitle as string, level: item.level as Level,
  }, savedAt);
}

export function parsePhrasebook(raw: string | null | undefined): ParsedPhrasebook {
  if (!raw) return { items: [], lossy: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { items: [], lossy: true };
  }
  const record = parsed as { version?: unknown; items?: unknown } | null;
  if (!record || typeof record !== 'object' || record.version !== 1 || !Array.isArray(record.items)) {
    return { items: [], lossy: true };
  }
  const valid = record.items.map(parseEntry);
  const lossy = valid.some(item => item === null);
  // Yeniden eskiye; aynı kimlikte ilk (en yeni) kayıt kalır.
  const sorted = valid.filter((item): item is Phrase => item !== null).sort((a, b) => b.savedAt - a.savedAt);
  const seen = new Set<string>();
  const items = sorted.filter(item => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  return { items, lossy };
}

// ─── Arama ve filtre ─────────────────────────────────────────────────────────

const FOLD_MAP: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u', ß: 'ss', ç: 'c', ğ: 'g', ı: 'i', ş: 's' };

/** Büyük/küçük harf, umlaut/ß ve Türkçe harf (ç ğ ı ö ş ü, İ) farklarını yok sayar: "tute"→Tüte, "poset"→Poşet. */
export function foldSearch(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[äöüßçğış]/g, char => FOLD_MAP[char] ?? char)
    .replace(/[̀-ͯ]/g, '') // "İ".toLowerCase() = "i" + birleşik nokta
    .replace(/\s+/g, ' ')
    .trim();
}

export type LevelFilter = 'all' | Level;

export function filterPhrases(
  items: readonly Phrase[] | null | undefined,
  { query, level }: { query?: string; level: LevelFilter },
): Phrase[] {
  if (!Array.isArray(items)) return [];
  const tokens = foldSearch(query).split(' ').filter(Boolean);
  return items.filter((item) => {
    if (level !== 'all' && item.level !== level) return false;
    if (tokens.length === 0) return true;
    const haystack = foldSearch(`${item.german} ${item.turkish} ${item.scenarioTitle} ${item.speaker}`);
    return tokens.every(token => haystack.includes(token));
  });
}

export function levelCounts(items: readonly Phrase[] | null | undefined): Record<LevelFilter, number> {
  const counts: Record<LevelFilter, number> = { all: 0, A1: 0, A2: 0, B1: 0 };
  const list: readonly Phrase[] = Array.isArray(items) ? items : [];
  for (const item of list) {
    counts.all += 1;
    if (isLevel(item.level)) counts[item.level] += 1;
  }
  return counts;
}
