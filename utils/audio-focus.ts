// Ses "odağı": seslendirme, kayıt oynatma ve mikrofon kaydı aynı anda çalışmasın.
// Saf mantık (expo bağımlılığı yok); gerçek durdurma işlevleri kaydedilir.
//
// Kurallar:
// - Kayıt sürerken seslendirme ve oynatma BAŞLAMAZ (referans sesi kayda karışmasın).
// - Kayıt başlarken sürmekte olan seslendirme/oynatma durdurulur.
// - Seslendirme ve oynatma birbirini durdurur (üst üste çalmaz).
// - Aynı anda ikinci kayıt başlamaz.

export type AudioKind = 'speech' | 'playback' | 'recording';
const KINDS: AudioKind[] = ['speech', 'playback', 'recording'];

export function createAudioFocus() {
  const stops: Record<AudioKind, Set<() => void>> = {
    speech: new Set(), playback: new Set(), recording: new Set(),
  };
  const listeners = new Set<() => void>();
  let recording = false;

  return {
    /** Bir türün durdurma işlevini kaydeder; dönen işlev kaydı kaldırır. */
    register(kind: AudioKind, stop: () => void): () => void {
      stops[kind].add(stop);
      return () => { stops[kind].delete(stop); };
    },
    setRecording(active: boolean) {
      if (recording === active) return;
      recording = active;
      listeners.forEach(listener => listener());
    },
    isRecording: () => recording,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** `kind` başlamak ister. false: şu an başlayamaz. true: diğer türler durduruldu, başlayabilir. */
    request(kind: AudioKind): boolean {
      if (recording) return false; // kayıt sürerken yeni kayıt, seslendirme ve oynatma başlamaz
      for (const other of KINDS) {
        if (other === kind) continue;
        stops[other].forEach((stop) => {
          try { stop(); } catch { /* durdurma hatası diğer türlerin durmasını engellemesin */ }
        });
      }
      return true;
    },
  };
}

export type AudioFocus = ReturnType<typeof createAudioFocus>;

/** Uygulama genelinde tek ses odağı. */
export const audioFocus: AudioFocus = createAudioFocus();
