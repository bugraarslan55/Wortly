// Yerel Expo modülü: cihaz içi Almanca (de-DE) konuşma tanıma. Ses/transkript sunucuya gitmez, kaydedilmez.
// Bu aşamada hiçbir ekrana bağlı değildir.
export { createSpeechController } from './src/controller';
export type { SpeechController, SpeechControllerDeps } from './src/controller';
export { useGermanSpeechRecognition } from './src/useGermanSpeechRecognition';
export { isSpeechPlatformSupported, nativeSpeechModule } from './src/WortlySpeechRecognitionModule';
export {
  DEFAULT_TIMEOUT_MS, SPEECH_LOCALE, STOP_GRACE_MS,
} from './src/types';
export type {
  SpeechAvailability, SpeechError, SpeechErrorCode, SpeechPermissionState, SpeechPermissions, SpeechSnapshot, SpeechStartResult,
  SpeechStatus, SpeechUnavailableReason, StartOptions,
} from './src/types';
