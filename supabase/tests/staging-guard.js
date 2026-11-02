// Staging entegrasyon testlerinin ortak güvenlik kontrolü.
//
// Amaç: testlerin yanlışlıkla ÜRETİM projesine veya gerçek kullanıcı verisinin bulunduğu bir projeye
// yazmasını engellemek. Ağ isteği atmaz; yalnızca ortam değişkenlerini ve dosya içeriğini inceler.
// Anahtarları ASLA loglamaz (hata mesajlarında değerler yer almaz).

const fs = require('fs');
const path = require('path');

class GuardError extends Error {}

const CONFIRM_VALUE = 'EVET-BU-URETIM-DEGIL';
const TEST_EMAIL_DOMAIN = '@wortly-test.invalid';

const stripSlash = (url) => String(url || '').trim().replace(/\/+$/, '');

/** https://<ref>.supabase.co → ref; yerel yığın için host adı (127.0.0.1/localhost) → 'local'. */
function parseProjectRef(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol === 'https:' && /^[a-z0-9]{10,40}\.supabase\.co$/i.test(parsed.hostname)) {
    return parsed.hostname.split('.')[0].toLowerCase();
  }
  if (parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)) return 'local';
  return null;
}

/** JWT biçimli anahtarın rol alanı (doğrulama yapmaz; yalnızca yanlış anahtar türünü yakalamak için). */
function jwtRole(key) {
  const parts = String(key || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch { return null; }
}

/** 'public' (anon/publishable), 'secret' (service_role/secret) veya 'unknown'. */
function keyKind(key) {
  const value = String(key || '').trim();
  if (value.startsWith('sb_publishable_')) return 'public';
  if (value.startsWith('sb_secret_')) return 'secret';
  const role = jwtRole(value);
  if (role === 'anon') return 'public';
  if (role === 'service_role') return 'secret';
  return 'unknown';
}

/** Uygulamanın bağlandığı üretim adresleri: kök .env dosyası ve isteğe bağlı PRODUCTION_SUPABASE_URL. */
function readProductionUrls(rootDir, env = process.env) {
  const urls = [];
  try {
    const file = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
    const match = file.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m);
    if (match) urls.push(stripSlash(match[1]));
  } catch { /* .env yok */ }
  if (env.PRODUCTION_SUPABASE_URL) urls.push(stripSlash(env.PRODUCTION_SUPABASE_URL));
  return urls.filter(Boolean);
}

/**
 * Ortamı doğrular; güvenliyse { url, ref } döner, değilse GuardError fırlatır.
 * Hata mesajları değer içermez.
 */
function assertSafeStagingEnv(env, { productionUrls = [] } = {}) {
  const need = ['STAGING_URL', 'STAGING_PROJECT_REF', 'STAGING_ANON_KEY', 'STAGING_SERVICE_ROLE_KEY', 'STAGING_CONFIRM'];
  const missing = need.filter((name) => !env[name] || !String(env[name]).trim());
  if (missing.length) throw new GuardError(`Eksik ortam değişkenleri: ${missing.join(', ')}. Test projesi açıkça tanımlanmalı.`);

  if (env.STAGING_CONFIRM !== CONFIRM_VALUE) throw new GuardError(`STAGING_CONFIRM=${CONFIRM_VALUE} ayarlanmalı.`);

  const url = stripSlash(env.STAGING_URL);
  const ref = parseProjectRef(url);
  if (!ref) throw new GuardError('STAGING_URL geçerli bir Supabase proje adresi değil (https://<ref>.supabase.co veya yerel yığın).');

  // Proje referansı ayrıca ve açıkça girilmeli: URL kopyalama hatası tek başına yetmez.
  if (String(env.STAGING_PROJECT_REF).trim().toLowerCase() !== ref) {
    throw new GuardError('STAGING_PROJECT_REF, STAGING_URL içindeki proje referansıyla eşleşmiyor.');
  }

  for (const prod of productionUrls) {
    const prodRef = parseProjectRef(prod);
    if (stripSlash(prod).toLowerCase() === url.toLowerCase() || (prodRef && prodRef === ref && ref !== 'local')) {
      throw new GuardError('STAGING_URL üretim projesiyle aynı. Hiçbir istek gönderilmedi.');
    }
  }

  if (keyKind(env.STAGING_ANON_KEY) === 'secret') {
    throw new GuardError('STAGING_ANON_KEY bir gizli (service_role/secret) anahtar gibi görünüyor; publishable anahtar gerekli.');
  }
  if (keyKind(env.STAGING_SERVICE_ROLE_KEY) === 'public') {
    throw new GuardError('STAGING_SERVICE_ROLE_KEY bir publishable anahtar gibi görünüyor; test kullanıcıları için service_role/secret gerekli.');
  }
  if (String(env.STAGING_ANON_KEY).trim() === String(env.STAGING_SERVICE_ROLE_KEY).trim()) {
    throw new GuardError('Publishable ve service_role anahtarları aynı olamaz.');
  }
  return { url, ref };
}

/**
 * Ağ denetimi (yönetici istemcisiyle): projede test dışı kullanıcı varsa DURUR. Gerçek kullanıcıların
 * bulunduğu bir proje (ör. üretim) test projesi sayılmaz. Yalnızca kullanıcı listesini okur.
 */
async function assertNoRealUsers(adminClient, { allowOthers = false } = {}) {
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new GuardError('Kullanıcı listesi okunamadı; ortam doğrulanamadığı için durduruldu.');
  const others = (data?.users ?? []).filter((user) => !String(user.email || '').toLowerCase().endsWith(TEST_EMAIL_DOMAIN));
  if (others.length > 0 && !allowOthers) {
    throw new GuardError(
      `Projede ${others.length} test dışı kullanıcı var; bu bir test projesi gibi görünmüyor. ` +
      'Durduruldu. (Bilinçli olarak izin vermek için STAGING_ALLOW_OTHER_USERS=EVET, yalnızca boş olmayan bir TEST projesinde.)',
    );
  }
}

/** Çıktıdaki olası anahtarları maskeler. */
function redact(text, env = process.env) {
  let out = String(text);
  for (const name of ['STAGING_ANON_KEY', 'STAGING_SERVICE_ROLE_KEY']) {
    const secret = env[name];
    if (secret && secret.length > 8) out = out.split(secret).join('[gizli]');
  }
  return out.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[jwt]').replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, '[anahtar]');
}

module.exports = {
  GuardError, CONFIRM_VALUE, TEST_EMAIL_DOMAIN,
  assertSafeStagingEnv, assertNoRealUsers, readProductionUrls, parseProjectRef, keyKind, redact,
};
