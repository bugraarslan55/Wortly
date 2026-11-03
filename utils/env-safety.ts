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

// ─── Fail-closed bağlantı koruması (TASARIM — henüz uygulamaya BAĞLI DEĞİL) ─────────────────────────────────
//
// Yalnızca geliştirme (__DEV__) çalıştırmalarını denetler. Yayın sürümünde (isDev=false) HER ZAMAN izin verir: gerçek
// uygulamanın ve mevcut hesapların bağlantısını bozma riski yoktur. Üretim proje kimliği (ref) kaynak koda GÖMÜLMEZ;
// `.env` içindeki EXPO_PUBLIC_PRODUCTION_PROJECT_REFS (virgülle ayrılmış) ile karşılaştırılır. Ortam işareti (APP_ENV) tek
// başına yeterli sayılmaz: işaret VE proje kimliği karşılaştırması birlikte gerekir.

export type ConnectionVerdict =
  | { allow: true; mode: 'release' | 'dev-verified' | 'dev-override' | 'dev-local'; reason: string; userMessage: null }
  | { allow: false; mode: 'dev-blocked'; reason: 'invalid-url' | 'production-unknown' | 'is-production' | 'unmarked-environment' | 'marked-production'; userMessage: string };

/** https://<ref>.supabase.co → ref; yerel yığın (127.0.0.1/localhost) → 'local'; aksi halde null. */
export function projectRefOf(url: string | null | undefined): string | null {
  const value = String(url ?? '').trim();
  const hosted = value.match(/^https:\/\/([a-z0-9]{10,40})\.supabase\.co\/?$/i);
  if (hosted) return hosted[1].toLowerCase();
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(value)) return 'local';
  return null;
}

export const parseProductionRefs = (value: string | null | undefined): string[] =>
  Array.from(new Set(String(value ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean)));

export function evaluateConnection(input: {
  isDev: boolean;
  url: string | null | undefined;
  appEnv: string | null | undefined;
  productionRefs: string | null | undefined;
  /** Bilinçli olarak EXPO_PUBLIC_ALLOW_PRODUCTION_IN_DEV=yes-i-understand verildiyse. */
  allowProductionInDev?: boolean;
}): ConnectionVerdict {
  if (!input.isDev) return { allow: true, mode: 'release', reason: 'release-build', userMessage: null };
  if (input.allowProductionInDev) return { allow: true, mode: 'dev-override', reason: 'explicit-override', userMessage: null };

  const ref = projectRefOf(input.url);
  if (!ref) {
    return { allow: false, mode: 'dev-blocked', reason: 'invalid-url', userMessage: 'Geliştirme sürümünde Supabase adresi geçersiz ya da eksik olduğu için bağlantı kurulmadı. .env.local dosyasını kontrol et.' };
  }
  if (ref === 'local') return { allow: true, mode: 'dev-local', reason: 'local-stack', userMessage: null };

  const production = parseProductionRefs(input.productionRefs);
  if (production.length === 0) {
    return { allow: false, mode: 'dev-blocked', reason: 'production-unknown', userMessage: 'Production proje kimliği tanımlı olmadığı için bağlı projenin test projesi olduğu doğrulanamadı; bağlantı kurulmadı. EXPO_PUBLIC_PRODUCTION_PROJECT_REFS değişkenini ayarla.' };
  }
  if (production.includes(ref)) {
    return { allow: false, mode: 'dev-blocked', reason: 'is-production', userMessage: 'Geliştirme sürümü production Supabase projesine bağlanmak üzere; veriyi korumak için bağlantı kurulmadı. .env.local içinde test projesini göster.' };
  }
  const env = parseAppEnvironment(input.appEnv);
  if (env === 'production') {
    return { allow: false, mode: 'dev-blocked', reason: 'marked-production', userMessage: 'Ortam production olarak işaretli; geliştirme sürümünde bağlantı kurulmadı.' };
  }
  if (env !== 'staging' && env !== 'local') {
    return { allow: false, mode: 'dev-blocked', reason: 'unmarked-environment', userMessage: 'Ortam staging/local olarak işaretlenmedi (EXPO_PUBLIC_APP_ENV); bağlantı kurulmadı.' };
  }
  return { allow: true, mode: 'dev-verified', reason: 'staging-verified', userMessage: null };
}
