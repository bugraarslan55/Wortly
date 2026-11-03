// "Karşılaştır" akışı: önce Almanca referans ses, bitince kullanıcının kaydı. Saf mantık; seslendirme,
// oynatma ve zamanlayıcı enjekte edilir.
//
// Dayanıklılık:
// - Bitiş geri çağrısı hiç gelmezse (bazı cihazlarda expo-speech `onDone` vermeyebilir) zaman aşımı sonrası
//   "manuel" duruma geçilir; kullanıcı kaydını elle dinleyebilir, arayüz takılı kalmaz.
// - Bitiş geri çağrısı iki kez gelirse kayıt yalnızca BİR kez çalınır.
// - Zaman aşımından sonra gelen geç bitiş çağrısı yok sayılır (sürpriz oynatma olmaz).
// - Seslendirme başlayamazsa (kayıt sürüyor, iptal edildi) hemen manuel duruma geçilir.
// - İptal (ekran değişti, arka plan, başka eylem) çalışan akışı geçersiz kılar.

export const REFERENCE_TIMEOUT_MS = 10000;
/** Seslendirme hâlâ sürüyorsa zaman aşımı en fazla bu kadar kez uzatılır (bitiş çağrısı hiç gelmezse sonsuza kadar beklemez). */
export const MAX_TIMEOUT_EXTENSIONS = 6;

/** Metin uzunluğuna göre bekleme süresi: kısa kelimelerde 10 sn, uzun cümlelerde daha uzun (en çok 60 sn). */
export function referenceTimeoutMs(text: string): number {
  const length = typeof text === 'string' ? text.length : 0;
  return Math.min(60000, Math.max(REFERENCE_TIMEOUT_MS, 6000 + length * 220));
}

export type CompareStatus = 'idle' | 'reference' | 'manual';

export const MANUAL_MESSAGE =
  'Otomatik karşılaştırma başlatılamadı. Almanca sesi dinleyip ardından "Kaydımı Dinle"ye dokunabilirsin.';

export interface CompareDeps {
  /** Referans sesi başlatır; başlayabildiyse true. Bitişte `onFinished`, hatada `onFailed` çağrılır. */
  speakReference(callbacks: { onFinished: () => void; onFailed: () => void }): Promise<boolean>;
  playRecording(): Promise<void>;
  /** Bekleme süresi (ms); verilmezse REFERENCE_TIMEOUT_MS. Uzun metinler için metne göre hesaplanır. */
  timeoutMs?(): number;
  /** Referans ses şu an çalıyor mu? Çalıyorsa zaman aşımı manuel moda geçmez, uzatılır. */
  isReferenceSpeaking?(): boolean;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export function createCompareFlow(deps: CompareDeps) {
  let status: CompareStatus = 'idle';
  let run = 0;
  let timer: unknown = null;
  const listeners = new Set<() => void>();

  const setStatus = (next: CompareStatus) => {
    if (status === next) return;
    status = next;
    listeners.forEach(listener => listener());
  };
  const clear = () => {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
  };
  const armTimer = (runId: number, extensions: number) => {
    const ms = deps.timeoutMs?.() ?? REFERENCE_TIMEOUT_MS;
    timer = deps.setTimer(() => {
      if (runId !== run || status !== 'reference') return;
      // Ses hâlâ çalıyorsa (uzun metin) erken manuel moda geçme; sınırlı sayıda uzat.
      if (deps.isReferenceSpeaking?.() && extensions < MAX_TIMEOUT_EXTENSIONS) {
        armTimer(runId, extensions + 1);
        return;
      }
      toManual(runId);
    }, ms);
  };
  const toManual = (runId: number) => {
    if (runId !== run || status !== 'reference') return;
    clear();
    run += 1; // geç gelen bitiş çağrıları artık geçersiz
    setStatus('manual');
  };

  return {
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    async start(): Promise<'started' | 'ignored' | 'manual'> {
      if (status === 'reference') return 'ignored'; // çift dokunuş
      clear();
      run += 1;
      const runId = run;
      setStatus('reference');
      armTimer(runId, 0);

      const finished = () => {
        // Yalnızca geçerli akışın ilk bitişi kaydı çalar; yinelenen/geç çağrılar yok sayılır.
        if (runId !== run || status !== 'reference') return;
        clear();
        run += 1;
        setStatus('idle');
        void deps.playRecording().catch(() => { setStatus('manual'); });
      };

      let started = false;
      try {
        started = await deps.speakReference({ onFinished: finished, onFailed: () => toManual(runId) });
      } catch {
        started = false;
      }
      if (!started) {
        toManual(runId);
        return 'manual';
      }
      return 'started';
    },

    /** Ekran değişti, uygulama arka plana gitti ya da kullanıcı başka bir eylem başlattı. */
    cancel() {
      clear();
      run += 1;
      setStatus('idle');
    },

    /** Kullanıcı manuel uyarıyı kapattı / kaydı elle dinledi. */
    dismissManual() {
      if (status === 'manual') setStatus('idle');
    },
  };
}

export type CompareFlow = ReturnType<typeof createCompareFlow>;
