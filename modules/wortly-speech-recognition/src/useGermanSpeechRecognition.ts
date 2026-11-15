import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { makeError, makeUnavailable, normalizePermissions } from './core';
import { createSpeechController, type SpeechController } from './controller';
import { isSpeechPlatformSupported, nativeSpeechModule } from './WortlySpeechRecognitionModule';
import type { SpeechAvailability, SpeechPermissions, SpeechSnapshot, SpeechStartResult, StartOptions } from './types';

const IDLE_SNAPSHOT: SpeechSnapshot = { status: 'idle', transcript: '', isFinal: false, error: null };

/**
 * Ekranlar için hook. Ekran kapanınca (unmount) dinleme iptal edilir ve native tanıyıcı/mikrofon kapatılır; uygulama
 * arka plana geçince de iptal edilir (native taraf ayrıca kendi başına temizler). Transkript yalnızca bu hook'un
 * bellekteki durumunda tutulur; kaydedilmez, gönderilmez.
 */
export function useGermanSpeechRecognition() {
  const [controller, setController] = useState<SpeechController | null>(null);
  const [snapshot, setSnapshot] = useState<SpeechSnapshot>(IDLE_SNAPSHOT);

  useEffect(() => {
    // Denetleyici efekt içinde kurulur: geliştirmede (StrictMode) efekt iki kez çalışsa da kapatılmış nesne yeniden kullanılmaz.
    const created = createSpeechController({ native: nativeSpeechModule, platformSupported: isSpeechPlatformSupported });
    setController(created);
    const unsubscribe = created.subscribe(setSnapshot);
    // Yalnızca gerçek arka plan: iOS izin penceresi uygulamayı 'inactive' yapar ve başlatmayı kesmemelidir.
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') void created.cancel();
    });
    return () => {
      appState.remove();
      unsubscribe();
      void created.dispose();
    };
  }, []);

  const start = useCallback(
    (options?: StartOptions): Promise<SpeechStartResult> =>
      controller ? controller.start(options) : Promise.resolve({ ok: false, error: makeError('unavailable', 'unknown') }),
    [controller],
  );
  const stop = useCallback(() => (controller ? controller.stop() : Promise.resolve()), [controller]);
  const cancel = useCallback(() => (controller ? controller.cancel() : Promise.resolve()), [controller]);
  const getAvailability = useCallback(
    (): Promise<SpeechAvailability> => (controller ? controller.getAvailability() : Promise.resolve(makeUnavailable('unknown'))),
    [controller],
  );
  const getPermissions = useCallback(
    (): Promise<SpeechPermissions> => (controller ? controller.getPermissions() : Promise.resolve(normalizePermissions(null))),
    [controller],
  );
  const requestPermissions = useCallback(
    (): Promise<SpeechPermissions> => (controller ? controller.requestPermissions() : Promise.resolve(normalizePermissions(null))),
    [controller],
  );

  // `ready`: denetleyici kuruldu. Öncesinde getAvailability() sahte "kullanılamıyor" döner; ekranlar önce ready'yi beklemelidir.
  return { ready: controller !== null, snapshot, start, stop, cancel, getAvailability, getPermissions, requestPermissions };
}
