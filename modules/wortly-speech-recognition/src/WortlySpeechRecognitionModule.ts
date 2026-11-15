import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { NativeSpeechModule } from './types';

/** Modül yalnızca iOS ve Android'de vardır; web ve diğerlerinde "desteklenmiyor" sonucu verilir. */
export const isSpeechPlatformSupported = Platform.OS === 'ios' || Platform.OS === 'android';

function loadNativeModule(): NativeSpeechModule | null {
  if (!isSpeechPlatformSupported) return null;
  try {
    // Opsiyonel yükleme: modül eklenmeden önce alınmış eski derlemelerde null döner (çökmez).
    return requireOptionalNativeModule<NativeSpeechModule>('WortlySpeechRecognition');
  } catch {
    return null;
  }
}

export const nativeSpeechModule: NativeSpeechModule | null = loadNativeModule();
