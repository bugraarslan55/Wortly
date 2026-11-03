import { useMemo } from 'react';
import { useRouter as useExpoRouter } from 'expo-router';
import {
  sharedNavigationGuard, DUPLICATE_BACK_WINDOW_MS, DUPLICATE_NAVIGATION_WINDOW_MS, navigationKey,
} from '../utils/navigation-guard';

// Uygulama genelinde tek koruma: aynı hedefe kısa sürede art arda gelen push/replace/navigate ve art arda "geri" yok sayılır.
const guard = sharedNavigationGuard;
const GUARDED = new Set(['push', 'replace', 'navigate']);

/**
 * expo-router'ın useRouter'ı ile aynı API; yalnızca yanlışlıkla çift dokunuşla oluşan TEKRAR gezinmeyi engeller
 * (aynı ekran yığında iki kez açılmaz, iki ekran birden geri gitmez). Diğer tüm yöntemler değişmeden geçer.
 */
export function useRouter(): ReturnType<typeof useExpoRouter> {
  const router = useExpoRouter();
  return useMemo(() => new Proxy(router, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      if (typeof prop === 'string' && GUARDED.has(prop)) {
        return (...args: unknown[]) => {
          if (!guard.allow(navigationKey(prop, args[0]), DUPLICATE_NAVIGATION_WINDOW_MS)) return undefined;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      if (prop === 'back') {
        return (...args: unknown[]) => {
          if (!guard.allow('back', DUPLICATE_BACK_WINDOW_MS)) return undefined;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value.bind(target);
    },
  }), [router]);
}
