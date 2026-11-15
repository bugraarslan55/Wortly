// Cihaz içi Almanca konuşma tanıma modülünün genel tipleri (saf; React/native bağımlılığı yok).
//
// Gizlilik sözleşmesi: ses ve transkript YALNIZCA cihaz içinde işlenir. Modül hiçbir şeyi sunucuya göndermez, diske yazmaz ve
// günlüğe basmaz; transkript yalnızca bellekteki anlık durumda (SpeechSnapshot) tutulur ve temizlenince silinir.
// Bu bir aksan/telaffuz puanlaması DEĞİLDİR: yalnızca konuşmanın yazıya çevrilmiş hâlini verir; güven yüzdesi üretmez.

/** Tanıma dili. Sabittir: iOS'ta de-DE, Android'de "de-DE" yüklü cihaz içi paketi aranır. */
export const SPEECH_LOCALE = 'de-DE';

export type SpeechUnavailableReason =
  /** Web ya da modülün hiç desteklenmediği platform. */
  | 'unsupported-platform'
  /** Native modül bu derlemede yok (modül eklenmeden önceki eski derleme). */
  | 'native-module-missing'
  /** Android 13'ten eski: cihaz içi tanıyıcı API'si yok. */
  | 'os-version'
  /** Cihaz Almanca (de-DE) tanımayı hiç desteklemiyor. */
  | 'language-not-supported'
  /** Almanca cihaz içi dil paketi yüklü değil (Android). */
  | 'language-not-installed'
  /** Cihaz içi tanıma bu cihazda/bu dil için yok (iOS: sunucuya düşmek yerine kullanılamaz sayılır). */
  | 'on-device-not-supported'
  | 'recognizer-unavailable'
  | 'unknown';

export type SpeechAvailability =
  | { available: true }
  | { available: false; reason: SpeechUnavailableReason; message: string };

export type SpeechPermissionState = 'granted' | 'denied' | 'undetermined' | 'restricted' | 'not-required';

export interface SpeechPermissions {
  microphone: SpeechPermissionState;
  /** iOS'ta konuşma tanıma izni; Android'de gerekmez ('not-required'). */
  speech: SpeechPermissionState;
  /** Başlamak için gereken tüm izinler verildi mi? */
  granted: boolean;
  /** Sistem izin penceresi hâlâ gösterilebilir mi? (false ise kullanıcı Ayarlar'a yönlendirilmelidir.) */
  canAskAgain: boolean;
}

export type SpeechErrorCode =
  | 'unavailable'
  | 'permission-denied'
  | 'busy'
  /** Mikrofon açıldı ama hiç (ya da neredeyse hiç) ses gelmedi. */
  | 'no-audio'
  /** Ses geldi ama tanıyıcı hiçbir kelime çıkarmadı. */
  | 'no-speech'
  /** Almanca cihaz içi tanıma modeli/dikte bu telefonda hazır değil. */
  | 'model-missing'
  | 'audio-error'
  | 'recognizer-error'
  | 'interrupted'
  | 'timeout';

export interface SpeechError {
  code: SpeechErrorCode;
  /** Kullanıcıya gösterilebilecek Türkçe açıklama (transkript veya ses içermez). */
  message: string;
  /** code === 'unavailable' ise nedeni. */
  reason?: SpeechUnavailableReason;
  /** Sorun giderme için teknik ayrıntı (ör. "hata:kAFAssistantErrorDomain/1110 · seviye:0.012"). Ses/metin içermez. */
  detail?: string;
}

export type SpeechStatus = 'idle' | 'starting' | 'listening' | 'stopping';

export interface SpeechSnapshot {
  status: SpeechStatus;
  /** Tanınan metin (kısmi ya da nihai). Yalnızca bellekte; durum temizlenince boşalır. */
  transcript: string;
  isFinal: boolean;
  error: SpeechError | null;
}

export type SpeechStartResult = { ok: true } | { ok: false; error: SpeechError };

export interface StartOptions {
  /** En çok dinleme süresi (ms). Varsayılan DEFAULT_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Eksik izin varsa sistem izin penceresi gösterilsin mi? Varsayılan true. */
  requestPermissions?: boolean;
}

export const DEFAULT_TIMEOUT_MS = 15_000;
/** stop() sonrası nihai sonuç gelmezse beklenen en uzun süre (native tarafın kendi süresinden uzundur). */
export const STOP_GRACE_MS = 4_000;

/** Native modülün (Swift/Kotlin) JS'e açtığı ham yüzey. Biçimler platforma göre farklı olabilir; core.ts normalize eder. */
export interface NativeSubscription {
  remove(): void;
}

export interface NativeSpeechModule {
  getAvailability(): Promise<unknown>;
  getPermissions(): Promise<unknown>;
  requestPermissions(): Promise<unknown>;
  start(): Promise<unknown>;
  stop(): Promise<unknown>;
  cancel(): Promise<unknown>;
  addListener(eventName: 'onStateChange' | 'onResult' | 'onError', listener: (payload: unknown) => void): NativeSubscription;
}
