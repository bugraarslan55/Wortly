// Derin bağlantıyla gelen kimlik doğrulama URL'lerinin (e-posta doğrulama, şifre sıfırlama) güvenli ayrıştırılması (saf).
//
// Neden: URL'deki HAM belirteçlerle `setSession` çağırmak, o bağlantıyı açan her uygulama/siteye kullanıcıyı sessizce başka bir
// hesaba (saldırganın hesabına) girdirme imkânı verir. İstemci PKCE akışıyla çalışır: e-posta bağlantısı yalnızca tek
// kullanımlık bir `?code=` taşır ve kod, o akışı BAŞLATAN cihazda saklanan yerel doğrulayıcıyla değiştirilir (supabase-js
// `exchangeCodeForSession`). Doğrulayıcı cihazdan hiç çıkmadığı için başkasının kodu bu cihazda oturum kuramaz.
//
// Burada yalnızca (a) uygulamanın kendi ürettiği iki yolu (auth/callback, auth/reset) ve (b) kod biçimini süzeriz.
// access_token / refresh_token taşıyan HİÇBİR bağlantı kabul edilmez (yol, tür ve biçim ne olursa olsun).
// Belgeler: docs/auth-links.md.

export const APP_SCHEME = 'wortly';

export type AuthLinkRoute = 'callback' | 'reset';

/** Tek kullanımlık PKCE kodu. Hangi akıştan (kayıt/sıfırlama) geldiği istemcinin kendi doğrulayıcısından anlaşılır, URL'den değil. */
export interface AuthLink {
  kind: 'code';
  route: AuthLinkRoute;
  code: string;
}

export interface AuthLinkOptions {
  /** Uygulamanın kendi şeması (app.json). */
  appScheme: string;
  /** Yalnızca geliştirme: Expo Go / geliştirme sunucusu bağlantıları (exp://, exps://; yol "/--/" önekiyle gelir). */
  allowExpoDev: boolean;
  /** Yalnızca web: uygulamanın kendi kökeni (ör. window.location.origin). Başka kök kabul edilmez. */
  webOrigin: string | null;
}

const ROUTES: Record<string, AuthLinkRoute> = { 'auth/callback': 'callback', 'auth/reset': 'reset' };

const MAX_URL_LENGTH = 4096;
const KEYS = ['access_token', 'refresh_token', 'code'] as const;
/** GoTrue kodları UUID'dir; yalnızca URL-güvenli karakterlere ve makul uzunluğa izin verilir. */
const CODE_PATTERN = /^[A-Za-z0-9_.~-]{8,512}$/;

/** Anahtar=değer çiftlerini okur; ilgilendiğimiz bir anahtar TEKRARLANIRSA belirsizdir → null. */
function parseParams(input: string): Map<string, string> | null {
  const result = new Map<string, string>();
  if (!input) return result;
  for (const pair of input.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    let key: string;
    let value: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
      value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
    } catch {
      return null;
    }
    if ((KEYS as readonly string[]).includes(key) && result.has(key)) return null;
    result.set(key, value);
  }
  return result;
}

/** Şema/köken kurallarına göre URL'nin yolunu çıkarır; kabul edilmeyen şema/köken için null. */
function extractRoute(base: string, options: AuthLinkOptions): string | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(base);
  if (!match) return null;
  const scheme = match[1]!.toLowerCase();
  const rest = match[2]!;

  let route: string;
  if (scheme === options.appScheme.toLowerCase()) {
    // wortly://auth/callback → host "auth", yol "callback"; wortly:///auth/callback de aynı yola çıkar.
    route = rest.replace(/^\/+/, '');
  } else if (options.allowExpoDev && (scheme === 'exp' || scheme === 'exps')) {
    const slash = rest.indexOf('/');
    route = slash === -1 ? '' : rest.slice(slash + 1);
    if (route.startsWith('--/')) route = route.slice(3);
  } else if (options.webOrigin && (scheme === 'http' || scheme === 'https') && base.startsWith(`${options.webOrigin}/`)) {
    route = base.slice(options.webOrigin.length + 1);
  } else {
    return null;
  }
  return route.replace(/\/$/, '');
}

/**
 * Kabul edilen bir kimlik doğrulama bağlantısıysa ayrıştırılmış halini, aksi halde null döndürür.
 * Hiçbir ağ/depolama erişimi yapmaz ve kodu doğrulamaz (doğrulama, cihazdaki doğrulayıcıyla `exchangeCodeForSession`'da yapılır).
 */
export function parseAuthLink(url: unknown, options: AuthLinkOptions): AuthLink | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LENGTH) return null;
  if (/[\s\u0000-\u001f\u007f\\]/.test(url)) return null;

  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? '' : url.slice(hashAt + 1);
  const queryAt = beforeHash.indexOf('?');
  const base = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1);

  const routePath = extractRoute(base, options);
  if (routePath === null) return null;
  const route = Object.prototype.hasOwnProperty.call(ROUTES, routePath) ? ROUTES[routePath] : undefined;
  if (!route) return null;

  const fragmentParams = parseParams(fragment);
  const queryParams = parseParams(query);
  if (!fragmentParams || !queryParams) return null;

  // Ham belirteç taşıyan bağlantı (parça ya da sorgu): kod olsa bile TAMAMEN reddedilir.
  for (const params of [fragmentParams, queryParams]) {
    if (params.has('access_token') || params.has('refresh_token')) return null;
  }

  // Kod yalnızca sorgu dizisinde (GoTrue PKCE yönlendirmesi `?code=`) kabul edilir.
  if (fragmentParams.has('code')) return null;
  const code = queryParams.get('code');
  if (!code || !CODE_PATTERN.test(code)) return null;
  return { kind: 'code', route, code };
}
