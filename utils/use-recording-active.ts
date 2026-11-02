import { useSyncExternalStore } from 'react';
import { audioFocus } from './audio-focus';

/** Mikrofon kaydı sürüyor mu? (Seslendirme düğmelerini kayıt sırasında pasifleştirmek için.) */
export function useRecordingActive(): boolean {
  return useSyncExternalStore(audioFocus.subscribe, audioFocus.isRecording, audioFocus.isRecording);
}
