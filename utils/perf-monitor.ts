// Yalnızca GELİŞTİRME ortamı için hafif performans ölçümü (saf mantık; zamanlayıcı ve saat dışarıdan verilebilir).
//
// - JS iş parçacığı takılma izleyicisi: düzenli bir zamanlayıcının beklenenden GEÇ çalışması, JS iş parçacığının o sürede
//   meşgul olduğunu (ve dokunmaların geç işlendiğini) gösterir. Yalnızca süre/sayı raporlanır; KULLANICI VERİSİ, kimlik,
//   adres veya anahtar asla yazılmaz.
// - Açılış zamanlayıcısı: uygulama modülü yüklendiğinden itibaren aşamalara kadar geçen süre.
// Bu ölçümler gerçek dokunma gecikmesinin ölçümü DEĞİLDİR; cihazda telefonla birlikte yorumlanmalıdır.

export interface StallEvent { lagMs: number; count: number; maxMs: number }

export function createStallDetector(options: { intervalMs?: number; thresholdMs?: number } = {}) {
  const intervalMs = options.intervalMs ?? 100;
  const thresholdMs = options.thresholdMs ?? 150;
  let count = 0;
  let maxMs = 0;
  return {
    /** Zamanlayıcı tikinde çağrılır: beklenen aralıktan fazla gecikme eşiği aşarsa olay döner. */
    tick(elapsedSinceLastTickMs: number): StallEvent | null {
      const lag = elapsedSinceLastTickMs - intervalMs;
      if (!Number.isFinite(lag) || lag < thresholdMs) return null;
      count += 1;
      maxMs = Math.max(maxMs, lag);
      return { lagMs: Math.round(lag), count, maxMs: Math.round(maxMs) };
    },
    summary: () => ({ count, maxMs: Math.round(maxMs) }),
    intervalMs,
  };
}

export function startJsStallMonitor(
  report: (event: StallEvent) => void,
  deps: {
    now?: () => number;
    setTimer?: (callback: () => void, ms: number) => unknown;
    clearTimer?: (handle: unknown) => void;
    intervalMs?: number;
    thresholdMs?: number;
  } = {},
): () => void {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((callback: () => void, ms: number) => setInterval(callback, ms));
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearInterval(handle as ReturnType<typeof setInterval>));
  const detector = createStallDetector({ intervalMs: deps.intervalMs, thresholdMs: deps.thresholdMs });
  let last = now();
  const handle = setTimer(() => {
    const current = now();
    const event = detector.tick(current - last);
    last = current;
    if (event) report(event);
  }, detector.intervalMs);
  return () => clearTimer(handle);
}

export function createStartupTimer(now: () => number = Date.now, report: (label: string, elapsedMs: number) => void = () => undefined) {
  const startedAt = now();
  const seen = new Set<string>();
  return {
    /** Her aşama yalnızca bir kez raporlanır; geçen süreyi (ms) döndürür, tekrar çağrıda null. */
    mark(label: string): number | null {
      if (seen.has(label)) return null;
      seen.add(label);
      const elapsed = Math.max(0, Math.round(now() - startedAt));
      report(label, elapsed);
      return elapsed;
    },
  };
}
