// Yanlışlıkla tekrarlanan gezinmeyi (aynı yere art arda iki kez dokunma) engelleyen saf mantık.
//
// Sorun: bir liste öğesine ya da "Geri"ye hızlı iki kez dokunmak aynı ekranı yığında iki kez açar (veya iki ekran geri gider).
// Koruma: AYNI anahtar (yöntem + hedef) kısa bir pencere içinde ikinci kez gelirse yok sayılır. Farklı hedefler, farklı yöntemler
// ve pencere dışındaki bilinçli tekrarlar (ör. "Tekrar çalış") engellenmez; bu yüzden normal tek dokunuşu etkilemez.

export const DUPLICATE_NAVIGATION_WINDOW_MS = 700;
export const DUPLICATE_BACK_WINDOW_MS = 400;

/** Hedefi kararlı bir metne çevirir (nesne hedeflerde anahtar sırası fark etmez). */
export function navigationKey(method: string, target: unknown): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
    }
    return value;
  };
  try {
    return `${method}:${typeof target === 'string' ? target : JSON.stringify(stable(target))}`;
  } catch {
    return `${method}:?`;
  }
}

export function createDuplicateNavigationGuard(now: () => number = Date.now) {
  let lastKey: string | null = null;
  let lastAt = 0;
  return {
    /** İzin verilirse true (ve kaydedilir); pencere içinde aynı anahtar tekrar gelirse false. */
    allow(key: string, windowMs: number = DUPLICATE_NAVIGATION_WINDOW_MS): boolean {
      const current = now();
      if (key === lastKey && current - lastAt < windowMs) return false;
      lastKey = key;
      lastAt = current;
      return true;
    },
    reset() { lastKey = null; lastAt = 0; },
    /** Ekran değişince çağrılır: son kilit "geri" değilse sıfırlanır (çift geri tek geri kalır). */
    resetForward() { if (lastKey !== 'back') { lastKey = null; lastAt = 0; } },
  };
}

/** Uygulama genelinde tek paylaşılan koruma (korumalı useRouter ve ekran-değişimi sıfırlaması kullanır). */
export const sharedNavigationGuard = createDuplicateNavigationGuard();
