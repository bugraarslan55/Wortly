import type {
  SpeechAvailability, SpeechError, SpeechErrorCode, SpeechPermissionState, SpeechPermissions, SpeechStartResult,
  SpeechUnavailableReason,
} from './types';

// Native modülden gelen ham değerlerin normalizasyonu ve Türkçe mesajlar (saf; birim testlenir).
// Bozuk/eksik/beklenmeyen ham veri hata fırlatmaz; güvenli ve "kullanılamıyor" yönünde sonuç verir.

const UNAVAILABLE_REASONS: readonly SpeechUnavailableReason[] = [
  'unsupported-platform', 'native-module-missing', 'os-version', 'language-not-supported', 'language-not-installed',
  'on-device-not-supported', 'recognizer-unavailable', 'unknown',
];

const ERROR_CODES: readonly SpeechErrorCode[] = [
  'unavailable', 'permission-denied', 'busy', 'no-audio', 'no-speech', 'model-missing', 'audio-error', 'recognizer-error',
  'interrupted', 'timeout',
];

const PERMISSION_STATES: readonly SpeechPermissionState[] = ['granted', 'denied', 'undetermined', 'restricted', 'not-required'];

export const UNAVAILABLE_MESSAGE = 'Bu cihazda Almanca sesli cevap kullanılamıyor. Seçeneklerle devam edebilirsin.';

/** iOS: Almanca cihaz içi tanıma yok ya da hazır değil (dikte kapalı / Almanca dikte dili yüklü değil). */
export const MODEL_MISSING_MESSAGE =
  'Bu telefonda Almanca cihaz içi konuşma tanıma hazır değil. Ayarlar > Genel > Klavye bölümünde “Dikte”yi aç ve Almanca dikte dilini ekle; sonra tekrar dene. Şimdilik seçeneklerle devam edebilirsin.';

const UNAVAILABLE_MESSAGES: Record<SpeechUnavailableReason, string> = {
  'unsupported-platform': UNAVAILABLE_MESSAGE,
  'native-module-missing': UNAVAILABLE_MESSAGE,
  'os-version': UNAVAILABLE_MESSAGE,
  'language-not-supported': UNAVAILABLE_MESSAGE,
  'language-not-installed': 'Bu cihazda Almanca için çevrimdışı konuşma tanıma yüklü değil. Seçeneklerle devam edebilirsin.',
  'on-device-not-supported': MODEL_MISSING_MESSAGE,
  'recognizer-unavailable': UNAVAILABLE_MESSAGE,
  unknown: UNAVAILABLE_MESSAGE,
};

const PERMISSION_MESSAGES = {
  both: 'Mikrofon veya konuşma tanıma izni verilmedi. İzni cihaz ayarlarından açabilir ya da seçeneklerle devam edebilirsin.',
  microphone: 'Mikrofon izni verilmedi. Ayarlar > Wortly bölümünden Mikrofon iznini açabilir ya da seçeneklerle devam edebilirsin.',
  speech: 'Konuşma tanıma izni verilmedi. Ayarlar > Wortly bölümünden Konuşma Tanıma iznini açabilir ya da seçeneklerle devam edebilirsin.',
} as const;

const ERROR_MESSAGES: Record<Exclude<SpeechErrorCode, 'unavailable'>, string> = {
  'permission-denied': PERMISSION_MESSAGES.both,
  busy: 'Dinleme zaten sürüyor.',
  'no-audio': 'Ses algılanmadı: mikrofondan ses gelmedi. Telefonu ağzına yaklaştır, mikrofonun örtülü olmadığını ve başka bir uygulamanın mikrofonu kullanmadığını kontrol et; tekrar dene ya da seçeneklerle devam et.',
  'no-speech': 'Ses geldi ama konuşman yazıya çevrilemedi. Daha yakından, net ve biraz daha yüksek sesle söyleyip tekrar dene ya da seçeneklerle devam et.',
  'model-missing': MODEL_MISSING_MESSAGE,
  'audio-error': 'Mikrofon açılamadı. Tekrar dene ya da seçeneklerle devam et.',
  'recognizer-error': 'Konuşma tanıma bir hata verdi. Tekrar dene ya da seçeneklerle devam et.',
  interrupted: 'Dinleme kesildi. Tekrar deneyebilirsin.',
  timeout: 'Süre doldu, bir şey duyamadım. Tekrar dene ya da seçeneklerle devam et.',
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function unavailableMessage(reason: SpeechUnavailableReason): string {
  return UNAVAILABLE_MESSAGES[reason];
}

export function makeUnavailable(reason: SpeechUnavailableReason): Extract<SpeechAvailability, { available: false }> {
  return { available: false, reason, message: unavailableMessage(reason) };
}

export function makeError(code: SpeechErrorCode, reason?: SpeechUnavailableReason, detail?: string): SpeechError {
  const extra = detail ? { detail } : {};
  if (code === 'unavailable') {
    const why = reason ?? 'unknown';
    return { code, reason: why, message: unavailableMessage(why), ...extra };
  }
  return { code, message: ERROR_MESSAGES[code], ...extra };
}

/** İzin reddi: hangi iznin eksik olduğunu söyleyen mesaj (mikrofon / konuşma tanıma / ikisi). */
export function permissionDeniedError(permissions: SpeechPermissions): SpeechError {
  const microphoneMissing = permissions.microphone !== 'granted';
  const speechMissing = permissions.speech !== 'granted' && permissions.speech !== 'not-required';
  const message = microphoneMissing && !speechMissing ? PERMISSION_MESSAGES.microphone
    : speechMissing && !microphoneMissing ? PERMISSION_MESSAGES.speech
      : PERMISSION_MESSAGES.both;
  return { code: 'permission-denied', message };
}

const MAX_DETAIL_LENGTH = 200;

/** Native'den gelen teknik ayrıntı: yalnızca kısa düz metin; başka her şey atılır. */
export function readDetail(raw: unknown): string | undefined {
  if (!isRecord(raw) || typeof raw.detail !== 'string') return undefined;
  const text = raw.detail.trim().slice(0, MAX_DETAIL_LENGTH);
  return text || undefined;
}

const asReason = (value: unknown): SpeechUnavailableReason =>
  UNAVAILABLE_REASONS.includes(value as SpeechUnavailableReason) ? (value as SpeechUnavailableReason) : 'unknown';

const asErrorCode = (value: unknown): SpeechErrorCode =>
  ERROR_CODES.includes(value as SpeechErrorCode) ? (value as SpeechErrorCode) : 'recognizer-error';

/** Ham değer ancak açıkça `available: true` ise kullanılabilir sayılır; başka her şey "kullanılamıyor"dur. */
export function normalizeAvailability(raw: unknown): SpeechAvailability {
  if (isRecord(raw) && raw.available === true) return { available: true };
  return makeUnavailable(isRecord(raw) ? asReason(raw.reason) : 'unknown');
}

const asPermissionState = (value: unknown): SpeechPermissionState =>
  PERMISSION_STATES.includes(value as SpeechPermissionState) ? (value as SpeechPermissionState) : 'denied';

/**
 * İki platform biçimini birleştirir:
 *  - iOS:     { microphone, speech }  (her biri granted | denied | restricted | undetermined)
 *  - Android: { status, canAskAgain } (Expo izin yanıtı; konuşma tanıma izni ayrıca gerekmez)
 * Tanınmayan ham değer güvenli yönde "izin yok, tekrar sorulamaz" sayılır.
 */
export function normalizePermissions(raw: unknown): SpeechPermissions {
  if (!isRecord(raw)) return { microphone: 'denied', speech: 'denied', granted: false, canAskAgain: false };

  let microphone: SpeechPermissionState;
  let speech: SpeechPermissionState;
  if ('microphone' in raw || 'speech' in raw) {
    microphone = asPermissionState(raw.microphone);
    speech = asPermissionState(raw.speech);
  } else {
    microphone = asPermissionState(raw.status);
    speech = 'not-required';
  }

  const granted = microphone === 'granted' && (speech === 'granted' || speech === 'not-required');
  const askable = (state: SpeechPermissionState) => state === 'undetermined';
  const canAskAgain = !granted && (
    askable(microphone) || askable(speech) ||
    // Android: reddedilmiş ama sistem penceresi hâlâ gösterilebilir.
    (speech === 'not-required' && microphone !== 'granted' && raw.canAskAgain === true)
  );
  return { microphone, speech, granted, canAskAgain };
}

/** native.start() ham sonucunu normalize eder. Bilinmeyen sonuç başarı sayılmaz. */
export function normalizeStartResult(raw: unknown): SpeechStartResult {
  const status = isRecord(raw) ? raw.status : undefined;
  if (status === 'started') return { ok: true };
  if (status === 'unavailable') return { ok: false, error: makeError('unavailable', asReason(isRecord(raw) ? raw.reason : undefined), readDetail(raw)) };
  if (status === 'permission-denied') return { ok: false, error: makeError('permission-denied', undefined, readDetail(raw)) };
  if (status === 'busy') return { ok: false, error: makeError('busy') };
  if (status === 'error') return { ok: false, error: makeError(asErrorCode(isRecord(raw) ? raw.code : undefined), undefined, readDetail(raw)) };
  if (status === 'cancelled') return { ok: false, error: makeError('interrupted') };
  return { ok: false, error: makeError('recognizer-error') };
}

/** onError olay yükünü SpeechError'a çevirir. */
export function normalizeNativeError(raw: unknown): SpeechError {
  const code = asErrorCode(isRecord(raw) ? raw.code : undefined);
  return code === 'unavailable'
    ? makeError('unavailable', asReason(isRecord(raw) ? raw.reason : undefined), readDetail(raw))
    : makeError(code, undefined, readDetail(raw));
}

/** onResult olay yükünü okur; geçersizse null. */
export function readResult(raw: unknown): { transcript: string; isFinal: boolean } | null {
  if (!isRecord(raw) || typeof raw.transcript !== 'string') return null;
  return { transcript: raw.transcript, isFinal: raw.isFinal === true };
}
