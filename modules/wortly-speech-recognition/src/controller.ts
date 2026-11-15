import {
  makeError, makeUnavailable, normalizeAvailability, normalizeNativeError, normalizePermissions, normalizeStartResult,
  permissionDeniedError, readDetail, readResult,
} from './core';
import {
  DEFAULT_TIMEOUT_MS, STOP_GRACE_MS,
  type NativeSpeechModule, type NativeSubscription, type SpeechAvailability, type SpeechError, type SpeechPermissions,
  type SpeechSnapshot, type SpeechStartResult, type SpeechUnavailableReason, type StartOptions,
} from './types';

// Konuşma tanıma oturumunun durum makinesi (saf; React/native import'u yok, birim testlenir).
// Sorumluluklar: izin → başlat → kısmi/nihai metin → durdur/iptal/zaman aşımı/hata → temizlik. Ses ve transkript
// yalnızca bellekteki anlık durumda tutulur; hiçbir yere yazılmaz ve gönderilmez.

export interface SpeechControllerDeps {
  /** Native modül; derlemede yoksa (eski derleme) null. */
  native: NativeSpeechModule | null;
  /** Platform bu modülü destekliyor mu? (web: false) */
  platformSupported: boolean;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export type SpeechListener = (snapshot: SpeechSnapshot) => void;

const IDLE: SpeechSnapshot = { status: 'idle', transcript: '', isFinal: false, error: null };

export function createSpeechController(deps: SpeechControllerDeps) {
  const { native, platformSupported } = deps;
  const setTimer = deps.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let snapshot: SpeechSnapshot = IDLE;
  const listeners = new Set<SpeechListener>();
  let subscriptions: NativeSubscription[] = [];
  let timer: unknown = null;
  /** Her iptal/dispose/yeni oturumda artar; bekleyen eski async işler sonuçlarını yok sayar. */
  let epoch = 0;
  let disposed = false;

  const unavailableReason = (): SpeechUnavailableReason | null => {
    if (disposed || !platformSupported) return 'unsupported-platform';
    if (!native) return 'native-module-missing';
    return null;
  };

  const emit = () => listeners.forEach(listener => listener(snapshot));
  const update = (next: Partial<SpeechSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    emit();
  };
  const clearTimerHandle = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const finishIdle = (next: Partial<SpeechSnapshot> = {}) => {
    clearTimerHandle();
    update({ status: 'idle', ...next });
  };
  const fail = (error: SpeechError): SpeechStartResult => {
    finishIdle({ error });
    return { ok: false, error };
  };
  const safeNative = async (action: () => Promise<unknown>) => {
    try { await action(); } catch { /* temizlik hatası kullanıcıya yansımaz */ }
  };

  function armTimer(ms: number, onFire: () => void) {
    clearTimerHandle();
    timer = setTimer(() => { timer = null; onFire(); }, ms);
  }

  function ensureListeners() {
    if (!native || subscriptions.length > 0) return;
    subscriptions = [
      native.addListener('onResult', (payload) => {
        const result = readResult(payload);
        if (!result || (snapshot.status !== 'listening' && snapshot.status !== 'stopping')) return;
        if (result.isFinal) {
          // Boş nihai sonuç, önceden duyulan kısmi metni EZMEZ; hiç metin yoksa sessiz "boş cevap" yerine açık hata verilir.
          const text = result.transcript.trim() ? result.transcript : snapshot.transcript;
          if (text.trim()) finishIdle({ transcript: text, isFinal: true, error: null });
          else finishIdle({ transcript: '', isFinal: false, error: makeError('no-speech', undefined, readDetail(payload)) });
        } else if (result.transcript.trim()) update({ transcript: result.transcript, isFinal: false });
      }),
      native.addListener('onError', (payload) => {
        if (snapshot.status === 'idle') return;
        finishIdle({ error: normalizeNativeError(payload) });
      }),
      native.addListener('onStateChange', (payload) => {
        const state = (payload as { state?: unknown } | null)?.state;
        if (state === 'idle' && (snapshot.status === 'listening' || snapshot.status === 'stopping')) finishIdle();
      }),
    ];
  }

  async function getAvailability(): Promise<SpeechAvailability> {
    const reason = unavailableReason();
    if (reason) return makeUnavailable(reason);
    try {
      return normalizeAvailability(await native!.getAvailability());
    } catch {
      return makeUnavailable('recognizer-unavailable');
    }
  }

  async function getPermissions(): Promise<SpeechPermissions> {
    if (unavailableReason()) return normalizePermissions(null);
    try {
      return normalizePermissions(await native!.getPermissions());
    } catch {
      return normalizePermissions(null);
    }
  }

  async function requestPermissions(): Promise<SpeechPermissions> {
    if (unavailableReason()) return normalizePermissions(null);
    try {
      return normalizePermissions(await native!.requestPermissions());
    } catch {
      return normalizePermissions(null);
    }
  }

  async function start(options: StartOptions = {}): Promise<SpeechStartResult> {
    const reason = unavailableReason();
    if (reason) return { ok: false, error: makeError('unavailable', reason) };
    if (snapshot.status !== 'idle') return { ok: false, error: makeError('busy') };

    epoch += 1;
    const mine = epoch;
    snapshot = { status: 'starting', transcript: '', isFinal: false, error: null };
    emit();
    ensureListeners();
    const interrupted = (): SpeechStartResult => ({ ok: false, error: makeError('interrupted') });

    try {
      let permissions = await getPermissions();
      if (mine !== epoch) return interrupted();
      if (!permissions.granted && options.requestPermissions !== false && permissions.canAskAgain) {
        permissions = await requestPermissions();
        if (mine !== epoch) return interrupted();
      }
      if (!permissions.granted) return fail(permissionDeniedError(permissions));

      // Mikrofon, native tarafta Almanca cihaz içi destek doğrulandıktan SONRA açılır; destek yoksa hiç açılmaz.
      const started = normalizeStartResult(await native!.start());
      if (mine !== epoch) {
        // Beklerken iptal edildi: native taraf başladıysa kapat.
        if (started.ok) await safeNative(() => native!.cancel());
        return interrupted();
      }
      if (!started.ok) return fail(started.error);

      if (snapshot.status === 'starting') update({ status: 'listening' });
      armTimer(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, () => { void onTimeout(); });
      return { ok: true };
    } catch {
      if (mine !== epoch) return interrupted();
      return fail(makeError('recognizer-error'));
    }
  }

  async function onTimeout() {
    if (snapshot.status !== 'listening') return;
    // Metin varsa dinlemeyi nazikçe bitir (nihai sonuç gelir); hiç metin yoksa iptal edip zaman aşımı bildir.
    if (snapshot.transcript.trim()) {
      await stop();
      return;
    }
    epoch += 1;
    await safeNative(() => native!.cancel());
    finishIdle({ error: makeError('timeout') });
  }

  async function stop(): Promise<void> {
    if (disposed || !native || snapshot.status !== 'listening') return;
    const mine = epoch;
    clearTimerHandle();
    update({ status: 'stopping' });
    // Nihai sonuç gelmezse takılı kalma: süre dolunca temizle ve eldeki metni nihai say (yoksa "duyamadım").
    armTimer(STOP_GRACE_MS, () => {
      if (mine !== epoch || snapshot.status !== 'stopping') return;
      epoch += 1;
      void safeNative(() => native.cancel());
      if (snapshot.transcript.trim()) finishIdle({ isFinal: true });
      else finishIdle({ error: makeError('no-speech') });
    });
    await safeNative(() => native.stop());
  }

  async function cancel(): Promise<void> {
    epoch += 1;
    clearTimerHandle();
    const wasActive = snapshot.status !== 'idle';
    snapshot = IDLE;
    emit();
    if (native && !disposed && wasActive) await safeNative(() => native.cancel());
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    const wasActive = snapshot.status !== 'idle';
    disposed = true;
    epoch += 1;
    clearTimerHandle();
    subscriptions.forEach(subscription => subscription.remove());
    subscriptions = [];
    snapshot = IDLE;
    listeners.clear();
    if (native && wasActive) await safeNative(() => native.cancel());
  }

  return {
    getSnapshot: (): SpeechSnapshot => snapshot,
    subscribe(listener: SpeechListener): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getAvailability,
    getPermissions,
    requestPermissions,
    start,
    stop,
    cancel,
    dispose,
  };
}

export type SpeechController = ReturnType<typeof createSpeechController>;
