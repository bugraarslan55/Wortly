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

// ─── Fail-closed bağlantı koruması ─────────────────────────────────────────────────────────────────────────
//
// Amaç production'a erişimi yasaklamak DEĞİL; yanlış ortamdan (geliştirme / preview) production veritabanına bağlanmayı
// önlemektir. Yayın (production) sürümü ASLA engellenmez.
//
// Ortam ayrımı iki bağımsız sinyalle yapılır (tek bir değişkene güvenilmez):
//  1. isDev (__DEV__): Metro geliştirme paketi (Expo Go, development client).
//  2. buildProfile (EXPO_PUBLIC_BUILD_PROFILE): derleme sırasında eas.json "env" ile verilir ('development' | 'preview').
//     Preview derlemeleri release modundadır (isDev=false), bu yüzden onları yalnızca bu işaret ayırt eder.
// KORUMALI = isDev VEYA profil development/preview/tanınmayan bir değer. Profil 'production' ya da hiç verilmemişse ve
// isDev=false ise sürüm "yayın" sayılır ve her zaman izin verilir (profil verilmemesi eski/yerel yayın derlemelerini kilitlemesin diye).
//
// KORUMALI modda bağlantı şu koşulların HEPSİ sağlanırsa izinlidir (fail-closed):
//  - Supabase adresi ve anahtar tanımlı, adres geçerli; üretim proje kimlikleri (EXPO_PUBLIC_PRODUCTION_PROJECT_REFS) tanımlı;
//  - bağlı proje kimliği üretim kimliklerinden biri DEĞİL (ortam işareti ne derse desin);
//  - ortam işareti (EXPO_PUBLIC_APP_ENV) staging ya da local. İşaret tek başına kanıt değil, ek koşuldur.
// Yerel yığın (127.0.0.1/localhost) her zaman izinlidir. Üretim kimliği kaynak koda gömülmez. Güvenliği kapatan bir ortam
// değişkeni YOKTUR (eski ALLOW_PRODUCTION_IN_DEV kaldırıldı).

export type BuildProfile = 'development' | 'preview' | 'production' | 'unspecified' | 'unknown';

export function parseBuildProfile(value: string | null | undefined): BuildProfile {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 'unspecified';
  if (normalized === 'development' || normalized === 'preview' || normalized === 'production') return normalized;
  return 'unknown';
}

export type BlockReason =
  | 'missing-config' | 'invalid-url' | 'production-unknown' | 'is-production'
  | 'unmarked-environment' | 'marked-production' | 'guard-error';

export type ConnectionVerdict =
  | {
    allow: true;
    mode: 'release' | 'protected-verified' | 'protected-local';
    /** Yalnızca yayın modunda anlamlı: bağlı proje üretim kimliklerinden biri ve işaret production ise true. Engellemez. */
    verified: boolean;
    reason: string;
    userMessage: null;
  }
  | { allow: false; mode: 'blocked'; reason: BlockReason; userMessage: string };

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

export const isProtectedBuild = (input: { isDev: boolean; buildProfile: string | null | undefined }): boolean => {
  if (input.isDev) return true;
  const profile = parseBuildProfile(input.buildProfile);
  return profile === 'development' || profile === 'preview' || profile === 'unknown';
};

const MESSAGES: Record<BlockReason, string> = {
  'missing-config': 'Supabase bağlantı ayarları eksik olduğu için uygulama veriye bağlanamıyor.',
  'invalid-url': 'Bağlantı adresi geçersiz olduğu için test sürümü veriye bağlanmadı.',
  'production-unknown': 'Bu test sürümünde production proje kimliği tanımlı olmadığından bağlı projenin test projesi olduğu doğrulanamadı; veriyi korumak için bağlantı kurulmadı.',
  'is-production': 'Bu test sürümü production veritabanına bağlanmak üzereydi; veriyi korumak için bağlantı kurulmadı.',
  'marked-production': 'Ortam işareti production olarak ayarlı; test sürümünde bağlantı kurulmadı.',
  'unmarked-environment': 'Ortam, test (staging/local) olarak işaretlenmediği için bağlantı kurulmadı.',
  'guard-error': 'Bağlantı güvenliği doğrulanamadığı için bağlantı kurulmadı.',
};
export const blockMessage = (reason: BlockReason): string => MESSAGES[reason];

const block = (reason: BlockReason): ConnectionVerdict => ({ allow: false, mode: 'blocked', reason, userMessage: MESSAGES[reason] });

export function evaluateConnection(input: {
  isDev: boolean;
  /** EXPO_PUBLIC_BUILD_PROFILE (derleme sırasında eas.json env ile). */
  buildProfile: string | null | undefined;
  url: string | null | undefined;
  hasKey: boolean;
  appEnv: string | null | undefined;
  productionRefs: string | null | undefined;
}): ConnectionVerdict {
  const hasUrl = String(input.url ?? '').trim().length > 0;
  // Ayar yoksa istemci zaten oluşturulamaz (yayında da): çökmek yerine anlaşılır bir yapılandırma hatası gösterilir.
  if (!hasUrl || !input.hasKey) return block('missing-config');

  const ref = projectRefOf(input.url);
  const production = parseProductionRefs(input.productionRefs);
  const env = parseAppEnvironment(input.appEnv);

  if (!isProtectedBuild(input)) {
    // Yayın: asla engellenmez (özel alan adı kullanan adresler dahil). Yalnızca bilgi amaçlı "doğrulandı" bayrağı.
    return {
      allow: true, mode: 'release', reason: 'release-build', userMessage: null,
      verified: !!ref && production.includes(ref) && env === 'production',
    };
  }

  if (!ref) return block('invalid-url');
  if (ref === 'local') return { allow: true, mode: 'protected-local', verified: false, reason: 'local-stack', userMessage: null };
  if (production.length === 0) return block('production-unknown');
  if (production.includes(ref)) return block('is-production');
  if (env === 'production') return block('marked-production');
  if (env !== 'staging' && env !== 'local') return block('unmarked-environment');
  return { allow: true, mode: 'protected-verified', verified: true, reason: 'staging-verified', userMessage: null };
}
