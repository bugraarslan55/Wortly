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
//  2. easProfile: EAS'ın KENDİSİNİN derleme ortamına koyduğu EAS_BUILD_PROFILE değeri; app.config.js bunu uygulama yapılandırmasına
//     (extra.buildProfile) yazar. Elle ayarlanmaz, eas.json'da unutulamaz: EAS her derlemede profil adını kendisi verir.
//  3. buildProfile (EXPO_PUBLIC_BUILD_PROFILE): eas.json "env" ile verilen ikinci, bağımsız işaret.
// Profil, bu iki kaynaktan EN KISITLAYICI olanıdır: biri bile development/preview/tanınmayan diyorsa derleme KORUMALIDIR
// (bir işaretin eksik olması ya da 'production' demesi diğerinin uyarısını geçersiz kılamaz).
// KORUMALI = isDev VEYA çözülen profil development/preview/tanınmayan. İki kaynak da yoksa (EAS dışı yerel derleme) ve isDev=false
// ise derleme "yayın" sayılır ve izin verilir: bu durumda production olup olmadığı KANITLANAMAZ — mimari sınırlama, bkz. belge.
//
// KORUMALI modda bağlantı şu koşulların HEPSİ sağlanırsa izinlidir (fail-closed):
//  - Supabase adresi ve anahtar tanımlı, adres geçerli; üretim proje kimlikleri (EXPO_PUBLIC_PRODUCTION_PROJECT_REFS) tanımlı;
//  - bağlı proje kimliği üretim kimliklerinden biri DEĞİL (ortam işareti ne derse desin);
//  - ortam işareti (EXPO_PUBLIC_APP_ENV) staging ya da local. İşaret tek başına kanıt değil, ek koşuldur.
// Yerel yığın (127.0.0.1/localhost) her zaman izinlidir. Üretim kimliği kaynak koda gömülmez. Güvenliği kapatan bir ortam
// değişkeni YOKTUR (eski ALLOW_PRODUCTION_IN_DEV kaldırıldı).

export type BuildProfile = 'development' | 'preview' | 'production' | 'unspecified' | 'unknown';

export function parseBuildProfile(value: unknown): BuildProfile {
  // Metin olmayan değer (ör. bozuk yapılandırma) bilgi taşımaz: ne koruma kaldırır ne de ekler.
  if (typeof value !== 'string') return 'unspecified';
  const normalized = value.trim().toLowerCase();
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
    /** Yayın modunda: EAS/ortam profil işaretlerinden en az biri vardı (false = EAS dışı yerel derleme; production KANITLANAMAZ). */
    profileKnown?: boolean;
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

export type ResolvedProfile = { profile: BuildProfile; sources: BuildProfile[] };

/** EAS profili (app.config.js) ve EXPO_PUBLIC_BUILD_PROFILE birlikte değerlendirilir; EN KISITLAYICI olan geçerlidir. */
export function resolveBuildProfile(easProfile: unknown, envProfile: unknown): ResolvedProfile {
  const sources = [parseBuildProfile(easProfile), parseBuildProfile(envProfile)];
  const given = sources.filter(profile => profile !== 'unspecified');
  if (given.length === 0) return { profile: 'unspecified', sources };
  const restrictive = given.find(profile => profile !== 'production');
  return { profile: restrictive ?? 'production', sources };
}

export const isProtectedBuild = (input: {
  isDev: boolean;
  buildProfile?: unknown;
  easProfile?: unknown;
}): boolean => {
  if (input.isDev) return true;
  const { profile } = resolveBuildProfile(input.easProfile, input.buildProfile);
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
  buildProfile: unknown;
  /** EAS_BUILD_PROFILE değeri (app.config.js → Constants.expoConfig.extra.buildProfile); EAS dışı derlemede yok. */
  easProfile?: unknown;
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
      profileKnown: resolveBuildProfile(input.easProfile, input.buildProfile).profile !== 'unspecified',
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
