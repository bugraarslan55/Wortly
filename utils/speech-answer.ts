import type { SpeechAvailability, SpeechError, SpeechSnapshot } from '../modules/wortly-speech-recognition/src/types';

// Sesle verilen cevabın karar noktasındaki iki seçenekle eşleştirilmesi ve sesli cevap panelinin durumları (saf mantık).
//
// Bu bir telaffuz/aksan puanlaması DEĞİLDİR: yalnızca cihaz içi tanıyıcının verdiği metni normalize edip seçeneklerle karşılaştırır;
// güven yüzdesi üretmez. Ses ve transkript saklanmaz; bu dosya yalnızca bellekteki metinle çalışır, hiçbir şey yazmaz/göndermez.

export const VOICE_UNAVAILABLE_MESSAGE = 'Bu cihazda Almanca sesli cevap kullanılamıyor. Seçeneklerle devam edebilirsin.';
export const VOICE_PRIVACY_NOTE = 'Ses ve konuşma yalnızca cihazında işlenir; kaydedilmez ve gönderilmez.';
export const VOICE_IDLE_HINT = 'Mikrofona dokun ve seçeneklerden birini Almanca söyle.';
export const VOICE_LISTENING_MESSAGE = 'Dinliyorum… Cevabını Almanca söyle.';
export const VOICE_PROCESSING_MESSAGE = 'Cevabın işleniyor…';
export const VOICE_BUSY_MESSAGE = 'Mikrofon şu an başka bir işlem tarafından kullanılıyor. Biraz sonra tekrar dene.';
export const VOICE_NO_MATCH_MESSAGE = 'Cevabını seçeneklerden biriyle eşleştiremedim. Tekrar dene ya da aşağıdaki seçeneklerden birini seç.';
export const VOICE_AMBIGUOUS_MESSAGE = 'Cevabın iki seçeneğe de benziyor. Tekrar dene ve yalnızca birini söyle ya da seçeneklerden birini seç.';
export const VOICE_EMPTY_MESSAGE = 'Seni duyamadım. Tekrar dene ya da seçeneklerden birini seç.';

/** Seçeneğin cümlesinin etrafında kalabilecek en çok ek kelime ("äh", "also", "ich möchte"…). Daha fazlası ilgisiz cümledir. */
const MAX_EXTRA_WORDS = 3;
/** Ek kelimeler arasında bunlardan biri varsa cümle seçeneği tersine çevirebilir ("nicht mit Milch"): eşleşme sayılmaz. */
const NEGATIONS = new Set(['nicht', 'nichts', 'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines', 'nie', 'niemals']);

const UMLAUTS: Record<string, string> = { ä: 'a', ö: 'o', ü: 'u' };

/** Büyük/küçük harf, noktalama, boşluk ve umlaut/ß farklarını yok sayar (tanıyıcı "Tüte" yerine "Tute" yazabilir). */
export function normalizeSpeechText(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[äöü]/g, char => UMLAUTS[char] ?? char)
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s.,;:!?¿¡"'“”„‚‘’`´…\-–—()[\]{}/\\]+/g, ' ')
    .trim();
}

export interface SpeechChoiceOption {
  german?: string;
  accepted?: readonly string[];
}

/** Bir seçeneğin normalize adayları: kendi cümlesi + kabul edilen alternatifler (tekrarsız, boşlar atılır). */
function candidatesOf(option: SpeechChoiceOption | null | undefined): string[] {
  const raw = [option?.german, ...(Array.isArray(option?.accepted) ? option.accepted : [])];
  const normalized = raw.map(normalizeSpeechText).filter(Boolean);
  return [...new Set(normalized)];
}

function containsPhrase(words: readonly string[], phrase: readonly string[]): number {
  for (let start = 0; start + phrase.length <= words.length; start += 1) {
    if (phrase.every((word, offset) => words[start + offset] === word)) return start;
  }
  return -1;
}

/** Aday, söylenen cümlede kelime sınırlarıyla geçiyor ve çevresinde az sayıda, olumsuzlama içermeyen kelime var mı? */
function candidateMatches(words: readonly string[], candidate: string): boolean {
  const phrase = candidate.split(' ');
  const start = containsPhrase(words, phrase);
  if (start < 0) return false;
  const extras = [...words.slice(0, start), ...words.slice(start + phrase.length)];
  return extras.length <= MAX_EXTRA_WORDS && !extras.some(word => NEGATIONS.has(word));
}

export type SpokenMatch =
  | { kind: 'match'; index: number }
  | { kind: 'ambiguous' }
  | { kind: 'none' }
  | { kind: 'empty' };

/** Tanınan metni iki seçenekle karşılaştırır. Yalnızca TEK seçenek uyuyorsa dal seçilir; ikisi de uyarsa belirsizdir. */
export function matchSpokenChoice(transcript: unknown, options: readonly SpeechChoiceOption[] | null | undefined): SpokenMatch {
  const spoken = normalizeSpeechText(transcript);
  if (!spoken) return { kind: 'empty' };
  if (!Array.isArray(options)) return { kind: 'none' };
  const words = spoken.split(' ');
  const matched = options.flatMap((option, index) =>
    candidatesOf(option).some(candidate => candidateMatches(words, candidate)) ? [index] : []);
  if (matched.length === 1) return { kind: 'match', index: matched[0] };
  return matched.length > 1 ? { kind: 'ambiguous' } : { kind: 'none' };
}

/** İki seçeneğin ortak (normalize) adayları. Boş olmalıdır; aksi hâlde aynı cümle iki dalı birden seçerdi. */
export function overlappingCandidates(options: readonly SpeechChoiceOption[] | null | undefined): string[] {
  if (!Array.isArray(options) || options.length < 2) return [];
  const first = new Set(candidatesOf(options[0]));
  return candidatesOf(options[1]).filter(candidate => first.has(candidate));
}

export interface VoiceInput {
  /** Kullanılabilirlik henüz sorgulanmadıysa null. */
  availability: SpeechAvailability | null;
  snapshot: SpeechSnapshot;
  /** `start()` hemen hata döndürdüyse (ör. kullanılamıyor); denetleyici bu durumda anlık durumu güncellemez. */
  startError: SpeechError | null;
  options: readonly SpeechChoiceOption[];
  /** Kullanıcı seçeneklere dokunarak cevap verdi: eski sesli sonuç artık gösterilmez. */
  dismissed: boolean;
}

export type VoiceView =
  | { kind: 'checking' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'idle' }
  | { kind: 'listening'; interim: string }
  | { kind: 'processing'; interim: string }
  | { kind: 'matched'; index: number; heard: string }
  | { kind: 'no-match'; reason: 'none' | 'ambiguous' | 'empty'; message: string; heard: string }
  | { kind: 'error'; message: string; detail?: string };

const NO_MATCH_MESSAGES = { none: VOICE_NO_MATCH_MESSAGE, ambiguous: VOICE_AMBIGUOUS_MESSAGE, empty: VOICE_EMPTY_MESSAGE } as const;

/** Panelin ne göstereceğini tek yerde karar verir (saf; ekran yalnızca bunu çizer). Her durumda seçenekler ayrıca kullanılabilir kalır. */
export function describeVoice({ availability, snapshot, startError, options, dismissed }: VoiceInput): VoiceView {
  if (!availability) return { kind: 'checking' };
  if (!availability.available) return { kind: 'unavailable', message: availability.message };
  const failure = snapshot.error ?? startError;
  if (failure?.code === 'unavailable') return { kind: 'unavailable', message: failure.message };
  if (snapshot.status === 'starting' || snapshot.status === 'listening') return { kind: 'listening', interim: snapshot.transcript };
  if (snapshot.status === 'stopping') return { kind: 'processing', interim: snapshot.transcript };
  if (failure) return { kind: 'error', message: failure.message, detail: failure.detail };
  if (snapshot.isFinal && !dismissed) {
    const result = matchSpokenChoice(snapshot.transcript, options);
    const heard = snapshot.transcript.trim();
    if (result.kind === 'match') return { kind: 'matched', index: result.index, heard };
    return { kind: 'no-match', reason: result.kind, message: NO_MATCH_MESSAGES[result.kind], heard };
  }
  return { kind: 'idle' };
}
