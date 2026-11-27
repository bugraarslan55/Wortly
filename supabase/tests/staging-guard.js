// Staging entegrasyon testlerinin ortak güvenlik kontrolü.
//
// Amaç: testlerin yanlışlıkla ÜRETİM projesine veya gerçek kullanıcı verisinin bulunduğu bir projeye
// yazmasını engellemek. Ağ isteği atmaz; yalnızca ortam değişkenlerini ve dosya içeriğini inceler.
// Anahtarları ASLA loglamaz (hata mesajlarında değerler yer almaz).

const childProcess = require('child_process');
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

// ─── Üretim adresinin bulunması (ÇALIŞMA KLASÖRÜNDEN BAĞIMSIZ, fail-closed) ───────────────────────────
//
// Üretim adresi şu kaynaklardan toplanır; HEPSİ staging adresiyle karşılaştırılır:
//  1. PRODUCTION_SUPABASE_URL / PRODUCTION_PROJECT_REF ortam değişkenleri,
//  2. bu dosyanın bulunduğu deponun kökündeki .env, .env.local, .env.production,
//  3. git'in ORTAK dizininden bulunan ana çalışma klasörünün aynı dosyaları (ek worktree'lerde .env yoktur).
// Hiçbir kaynaktan üretim adresi belirlenemiyorsa karşılaştırma yapılamaz → test BAŞLAMAZ.
// process.cwd() hiçbir yerde kullanılmaz.

const ENV_FILES = ['.env', '.env.local', '.env.production'];

function parseEnvFile(text) {
  const match = String(text).match(/^\s*(?:export\s+)?EXPO_PUBLIC_SUPABASE_URL\s*=\s*(.*)$/m);
  if (!match) return { found: false, value: null };
  const value = match[1].trim().replace(/^['"]|['"]$/g, '').trim();
  return { found: true, value: value || null };
}

/** Ana çalışma klasörü: git ortak dizininin (.git) üst klasörü. Bulunamazsa null (başka kaynaklara bakılır). */
function mainWorktreeRoot(fromDir, run = childProcess.execFileSync) {
  try {
    const out = String(run('git', ['rev-parse', '--git-common-dir'], { cwd: fromDir, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    if (!out) return null;
    const common = path.resolve(fromDir, out);
    return path.basename(common) === '.git' ? path.dirname(common) : null;
  } catch { return null; }
}

/**
 * Üretim adreslerini bulur. Dönen { urls, refs, problems }: problems boş değilse (okunamayan/bozuk .env) çağıran DURMALIDIR.
 * Test için fs, env, aranacak klasörler ve git çağrısı enjekte edilebilir.
 */
function discoverProduction({
  env = process.env,
  guardDir = __dirname,
  searchDirs = null,
  readFile = (file) => fs.readFileSync(file, 'utf8'),
  exists = (file) => fs.existsSync(file),
  runGit = childProcess.execFileSync,
} = {}) {
  const urls = [];
  const refs = [];
  const problems = [];
  if (env.PRODUCTION_SUPABASE_URL && stripSlash(env.PRODUCTION_SUPABASE_URL)) urls.push(stripSlash(env.PRODUCTION_SUPABASE_URL));
  if (env.PRODUCTION_PROJECT_REF && String(env.PRODUCTION_PROJECT_REF).trim()) refs.push(String(env.PRODUCTION_PROJECT_REF).trim().toLowerCase());

  const dirs = searchDirs ?? [path.resolve(guardDir, '..', '..'), mainWorktreeRoot(guardDir, runGit)].filter(Boolean);
  for (const dir of new Set(dirs.map((d) => path.resolve(d)))) {
    for (const name of ENV_FILES) {
      const file = path.join(dir, name);
      let text;
      try {
        if (!exists(file)) continue;
        text = readFile(file);
      } catch {
        problems.push(name + ' okunamadı.');
        continue;
      }
      const parsed = parseEnvFile(text);
      if (!parsed.found) continue;
      if (!parsed.value) { problems.push(name + ' içindeki EXPO_PUBLIC_SUPABASE_URL boş.'); continue; }
      urls.push(stripSlash(parsed.value));
    }
  }
  return { urls: Array.from(new Set(urls.filter(Boolean))), refs: Array.from(new Set(refs)), problems };
}

/** Geriye dönük uyumluluk: yalnızca adres listesi. */
function readProductionUrls(rootDir, env = process.env) {
  return discoverProduction({ env, searchDirs: [rootDir] }).urls;
}

/**
 * Ortamı doğrular; güvenliyse { url, ref } döner, değilse GuardError fırlatır (hata mesajları değer İÇERMEZ).
 * Üretim adresi/referansı varsayılan olarak ÇALIŞMA KLASÖRÜNDEN BAĞIMSIZ bulunur. FAIL-CLOSED: üretim adresi belirlenemezse,
 * .env bozuksa, referans/URL eksik veya uyumsuzsa, anahtar türü doğrulanamazsa test başlamaz.
 * Bu işlev ağ bağlantısı kurmaz ve kullanıcı oluşturmaz; tüm staging betiklerinde İLK iş olarak çağrılmalıdır.
 */
function assertSafeStagingEnv(env, { production = null, productionUrls = null } = {}) {
  const prod = production ?? (productionUrls
    ? { urls: productionUrls.map(stripSlash).filter(Boolean), refs: [], problems: [] }
    : discoverProduction({ env }));

  if (prod.problems.length) throw new GuardError('Üretim yapılandırması okunamadı (' + prod.problems.join(' ') + '). Güvenli tarafta durduruldu.');
  const prodRefs = new Set(prod.refs);
  for (const prodUrl of prod.urls) {
    const ref = parseProjectRef(prodUrl);
    if (ref) prodRefs.add(ref);
  }
  if (prod.urls.length === 0 && prodRefs.size === 0) {
    throw new GuardError('Üretim proje adresi/referansı belirlenemedi; staging adresiyle karşılaştırılamadığı için durduruldu. PRODUCTION_SUPABASE_URL (veya PRODUCTION_PROJECT_REF) verin.');
  }

  const need = ['STAGING_URL', 'STAGING_PROJECT_REF', 'STAGING_ANON_KEY', 'STAGING_SERVICE_ROLE_KEY', 'STAGING_CONFIRM'];
  const missing = need.filter((name) => !env[name] || !String(env[name]).trim());
  if (missing.length) throw new GuardError('Eksik ortam değişkenleri: ' + missing.join(', ') + '. Test projesi açıkça tanımlanmalı.');

  if (env.STAGING_CONFIRM !== CONFIRM_VALUE) throw new GuardError('STAGING_CONFIRM=' + CONFIRM_VALUE + ' ayarlanmalı.');

  const url = stripSlash(env.STAGING_URL);
  const ref = parseProjectRef(url);
  if (!ref) throw new GuardError('STAGING_URL geçerli bir Supabase proje adresi değil (https://<ref>.supabase.co veya yerel yığın).');

  // Proje referansı ayrıca ve açıkça girilmeli: URL kopyalama hatası tek başına yetmez.
  if (String(env.STAGING_PROJECT_REF).trim().toLowerCase() !== ref) {
    throw new GuardError('STAGING_PROJECT_REF, STAGING_URL içindeki proje referansıyla eşleşmiyor.');
  }

  for (const prodUrl of prod.urls) {
    if (prodUrl.toLowerCase() === url.toLowerCase()) throw new GuardError('STAGING_URL üretim projesiyle aynı. Hiçbir istek gönderilmedi.');
  }
  if (ref !== 'local' && prodRefs.has(ref)) throw new GuardError('STAGING proje referansı üretim projesiyle aynı. Hiçbir istek gönderilmedi.');

  // Anahtar türleri DOĞRULANAMIYORSA (tanınmayan biçim) da reddedilir.
  if (keyKind(env.STAGING_ANON_KEY) !== 'public') {
    throw new GuardError('STAGING_ANON_KEY publishable/anon anahtar olarak doğrulanamadı (gizli ya da tanınmayan biçim).');
  }
  if (keyKind(env.STAGING_SERVICE_ROLE_KEY) !== 'secret') {
    throw new GuardError('STAGING_SERVICE_ROLE_KEY service_role/secret anahtar olarak doğrulanamadı (publishable ya da tanınmayan biçim).');
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
  assertSafeStagingEnv, assertNoRealUsers, discoverProduction, mainWorktreeRoot, parseEnvFile, readProductionUrls, parseProjectRef, keyKind, redact,
};
