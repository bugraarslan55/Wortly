import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Speech from 'expo-speech';
import { audioFocus } from './audio-focus';

export type SpeechRate = 'normal' | 'slow';

const RATES: Record<SpeechRate, number> = { normal: 0.92, slow: 0.3 };

/**
 * Sesli alıştırmalar için tek bir expo-speech kontrol noktası (iOS ve Android'de aynı).
 *
 * - Her `speak` çağrısı öncekini iptal eder; hızlı dokunuşlar sesleri üst üste bindirmez
 *   (yalnızca son istek okunur, `runId` ile eski istekler yok sayılır).
 * - `stop` devam eden sesi durdurur (cevap verilince, sorular arasında geçerken).
 * - Ekran kapanınca (unmount) ve uygulama arka plana geçince ses otomatik durur.
 * - Ortak ses odağı: mikrofon kaydı sürerken konuşma başlamaz; kayıt oynatma sürüyorsa önce o durdurulur,
 *   kayıt başlayınca konuşma durdurulur.
 * - `speak` okumanın BAŞLAYIP BAŞLAMADIĞINI döndürür (kayıt sürüyor / yeni istek geldi ise false).
 * - `onFinished` yalnızca okuma DOĞAL olarak bittiğinde çağrılır (durdurma/iptalde çağrılmaz); `onFailed` hatada.
 *   Bazı cihazlarda bitiş geri çağrısı hiç gelmeyebilir; çağıran zaman aşımıyla korunmalıdır (utils/compare-flow.ts).
 */
export function useGermanSpeech() {
  const runRef = useRef(0);
  const [speakingRate, setSpeakingRate] = useState<SpeechRate | null>(null);

  const stop = useCallback(() => {
    runRef.current += 1;
    setSpeakingRate(null);
    void Speech.stop();
  }, []);

  const speak = useCallback(async (
    text: string,
    mode: SpeechRate = 'normal',
    options?: { onFinished?: () => void; onFailed?: () => void },
  ): Promise<boolean> => {
    if (!text) return false;
    // Kayıt sürüyorsa referans sesi başlamaz; kayıt oynatma varsa durdurulur.
    if (!audioFocus.request('speech')) return false;
    const runId = runRef.current + 1;
    runRef.current = runId;
    setSpeakingRate(mode);
    await Speech.stop();
    // Bu arada yeni bir istek geldiyse veya ekran kapandıysa okuma.
    if (runRef.current !== runId) return false;

    const finish = () => {
      if (runRef.current === runId) setSpeakingRate(null);
    };
    Speech.speak(text, {
      language: 'de-DE',
      rate: RATES[mode],
      pitch: 1,
      onDone: () => {
        const current = runRef.current === runId;
        finish();
        if (current) options?.onFinished?.();
      },
      onError: () => {
        const current = runRef.current === runId;
        finish();
        if (current) options?.onFailed?.();
      },
      onStopped: finish,
    });
    return true;
  }, []);

  useEffect(() => audioFocus.register('speech', stop), [stop]);

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
