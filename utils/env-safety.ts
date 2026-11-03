// Geliştirme ortamının yanlışlıkla production Supabase projesine bağlanmasına karşı uyarı mantığı (saf).
//
// Bu ortam değişkeni (EXPO_PUBLIC_APP_ENV) yalnızca bir İŞARETTİR: hangi projeye bağlandığını doğrulamaz, hiçbir adres
// veya anahtar içermez/yazdırmaz. Geliştirici `.env.local` içinde test projesini gösterirken 'staging' (ya da 'local')
// yazar; işaretsiz bir geliştirme çalıştırması bu uyarıyı verir.

export type AppEnvironment = 'production' | 'staging' | 'local' | 'unset' | 'unknown';

export function parseAppEnvironment(value: string | null | undefined): AppEnvironment {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 'unset';
  if (normalized === 'production' || normalized === 'staging' || normalized === 'local') return normalized;
  return 'unknown';
}

export interface DevEnvironmentReport {
  level: 'ok' | 'warn';
  message: string | null;
}

/** Yalnızca geliştirme (__DEV__) çalıştırmaları için; yayın sürümünde hiçbir şey üretmez. */
export function evaluateDevEnvironment(input: { appEnv: string | null | undefined; isDev: boolean }): DevEnvironmentReport {
  if (!input.isDev) return { level: 'ok', message: null };
  const env = parseAppEnvironment(input.appEnv);
  if (env === 'staging' || env === 'local') return { level: 'ok', message: null };
  const detail = env === 'production'
    ? 'EXPO_PUBLIC_APP_ENV=production: geliştirme sürümü production Supabase projesine bağlı.'
    : 'EXPO_PUBLIC_APP_ENV tanımlı değil: bağlı Supabase projesi doğrulanamıyor (production olabilir).';
  return {
    level: 'warn',
    message: `[Wortly] UYARI: ${detail} Gerçek hesap kullanma; test için .env.local içinde test projesini ve EXPO_PUBLIC_APP_ENV=staging ayarla.`,
  };
}
