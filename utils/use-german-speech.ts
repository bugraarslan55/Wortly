import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Speech from 'expo-speech';

export type SpeechRate = 'normal' | 'slow';

const RATES: Record<SpeechRate, number> = { normal: 0.92, slow: 0.3 };

/**
 * Sesli alıştırmalar için tek bir expo-speech kontrol noktası (iOS ve Android'de aynı).
 *
 * - Her `speak` çağrısı öncekini iptal eder; hızlı dokunuşlar sesleri üst üste bindirmez
 *   (yalnızca son istek okunur, `runId` ile eski istekler yok sayılır).
 * - `stop` devam eden sesi durdurur (cevap verilince, sorular arasında geçerken).
 * - Ekran kapanınca (unmount) ve uygulama arka plana geçince ses otomatik durur.
 */
export function useGermanSpeech() {
  const runRef = useRef(0);
  const [speakingRate, setSpeakingRate] = useState<SpeechRate | null>(null);

  const stop = useCallback(() => {
    runRef.current += 1;
    setSpeakingRate(null);
    void Speech.stop();
  }, []);

  const speak = useCallback(async (text: string, mode: SpeechRate = 'normal') => {
    if (!text) return;
    const runId = runRef.current + 1;
    runRef.current = runId;
    setSpeakingRate(mode);
    await Speech.stop();
    // Bu arada yeni bir istek geldiyse veya ekran kapandıysa okuma.
    if (runRef.current !== runId) return;

    const finish = () => {
      if (runRef.current === runId) setSpeakingRate(null);
    };
    Speech.speak(text, {
      language: 'de-DE',
      rate: RATES[mode],
      pitch: 1,
      onDone: finish,
      onError: finish,
      onStopped: finish,
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stop();
    });
    return () => {
      subscription.remove();
      // Unmount: durum güncellemeden sesi kes ve bekleyen istekleri geçersiz kıl.
      runRef.current += 1;
      void Speech.stop();
    };
  }, [stop]);

  return { speak, stop, speakingRate };
}
