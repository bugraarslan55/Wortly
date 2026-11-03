// Açılış ekranı (splash) yaşam döngüsü. Saf mantık: expo-splash-screen çağrıları dışarıdan enjekte edilir.
//
// Amaç: splash, tema ve ilk yerel durum hazır olmadan kapanıp boş/açık renkli bir ekran göstermesin; ama başlatma
// takılırsa ya da hata verirse uygulama splash ekranında SONSUZA KADAR kalmasın.
//  - start(): modül yüklenirken (global kapsam) bir kez çağrılır; otomatik gizlemeyi engeller ve güvenlik süresini başlatır.
//  - update(): tema, yerel veri ve oturum başlatması tamamlanınca splash gizlenir.
//  - Süre dolarsa (maxWaitMs) hazır olunmasa bile gizlenir.
//  - En fazla BİR KEZ gizlenir; gizleme/engelleme çağrıları hata verse bile uygulama etkilenmez.

/** Hazırlık beklemesinin üst sınırı. Tema okuması (3 sn) ve yerel yüklemelerin zaman aşımlarından uzundur. */
export const SPLASH_MAX_WAIT_MS = 5000;

export interface SplashReadiness {
  /** Kayıtlı tema tercihi okundu (ya da okuma başarısız olup varsayılan kullanıldı). */
  themeLoaded: boolean;
  /** Yerel profil verisi yüklendi. */
  localDataLoaded: boolean;
  /** Oturum başlatması (getSession) tamamlandı. */
  authLoaded: boolean;
}

export const isSplashReady = (readiness: SplashReadiness): boolean =>
  readiness.themeLoaded && readiness.localDataLoaded && readiness.authLoaded;

export type SplashState = 'idle' | 'visible' | 'hidden';
export type SplashHideReason = 'ready' | 'timeout' | 'forced';

export interface SplashDeps {
  /** SplashScreen.preventAutoHideAsync */
  prevent: () => unknown;
  /** SplashScreen.hide */
  hide: () => unknown;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  maxWaitMs?: number;
}

export function createSplashLifecycle(deps: SplashDeps) {
  const setTimer = deps.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const maxWaitMs = deps.maxWaitMs ?? SPLASH_MAX_WAIT_MS;

  let state: SplashState = 'idle';
  let reason: SplashHideReason | null = null;
  let timer: unknown = null;
  let hideCalls = 0;

  const swallow = (fn: () => unknown) => {
    try {
      const result = fn();
      if (result && typeof (result as Promise<unknown>).catch === 'function') (result as Promise<unknown>).catch(() => undefined);
    } catch {
      // Splash API hatası uygulamayı etkilemez (ör. splash zaten kapanmış olabilir).
    }
  };

  function hide(why: SplashHideReason) {
    if (state === 'hidden') return;
    state = 'hidden';
    reason = why;
    if (timer !== null) { clearTimer(timer); timer = null; }
    hideCalls += 1;
    swallow(deps.hide);
  }

  return {
    /** Global kapsamda bir kez çağrılır. */
    start() {
      if (state !== 'idle') return;
      state = 'visible';
      swallow(deps.prevent);
      timer = setTimer(() => { timer = null; hide('timeout'); }, maxWaitMs);
    },
    /** Hazırlık durumu değiştikçe çağrılır; hazırsa splash gizlenir. */
    update(readiness: SplashReadiness) {
      if (state === 'visible' && isSplashReady(readiness)) hide('ready');
    },
    /** Beklenmedik durumlarda (ör. kritik hata ekranı) hemen gizler. */
    forceHide() { hide('forced'); },
    getState: () => state,
    getReason: () => reason,
    getHideCalls: () => hideCalls,
  };
}
