// Staging güvenlik korumasının AĞSIZ testleri (supabase/tests/staging-guard.js).
//
// Gerçek Supabase'e HİÇ bağlanılmaz; yalnızca SAHTE adresler ve sentetik anahtarlar kullanılır. Gerçek üretim
// adresi/anahtarı bu dosyada ve çıktısında geçmez. Amaç: üretim olduğu dışlanamayan hiçbir adrese test bağlantısı
// kurulamadığını (fail-closed) ve bunun çalışma klasöründen bağımsız olduğunu kanıtlamak.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const guard = require(path.join(ROOT, 'supabase', 'tests', 'staging-guard.js'));

const PROD_REF = 'fakeprodref01';
const STAGE_REF = 'fakestageref2';
const PROD_URL = `https://${PROD_REF}.supabase.co`;
const STAGE_URL = `https://${STAGE_REF}.supabase.co`;
const ANON = 'sb_publishable_FAKEFAKEFAKEFAKE00';
const SERVICE = 'sb_secret_FAKEFAKEFAKEFAKE0011';

const goodEnv = (extra = {}) => ({
  PRODUCTION_SUPABASE_URL: PROD_URL,
  STAGING_URL: STAGE_URL,
  STAGING_PROJECT_REF: STAGE_REF,
  STAGING_ANON_KEY: ANON,
  STAGING_SERVICE_ROLE_KEY: SERVICE,
  STAGING_CONFIRM: guard.CONFIRM_VALUE,
  ...extra,
});
const refuses = (env, pattern, options) => assert.throws(() => guard.assertSafeStagingEnv(env, options), (error) => {
  assert.ok(error instanceof guard.GuardError, 'GuardError bekleniyordu: ' + error.message);
  if (pattern) assert.match(error.message, pattern);
  for (const secret of [PROD_URL, PROD_REF, STAGE_URL, ANON, SERVICE]) assert.ok(!error.message.includes(secret), 'hata mesajı değer içermemeli');
  return true;
});
const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

// ─── Ortam doğrulaması ──────────────────────────────────────────────────────────────────────────
test('geçerli sentetik staging yapılandırması kabul edilir ve doğrulanmış adres döner', () => {
  assert.deepEqual(guard.assertSafeStagingEnv(goodEnv()), { url: STAGE_URL, ref: STAGE_REF });
});

test('üretim URL\'si staging olarak verilmiş: reddedilir (URL biçimi ve referans varyasyonları dahil)', () => {
  const asStaging = { STAGING_URL: PROD_URL, STAGING_PROJECT_REF: PROD_REF };
  refuses(goodEnv(asStaging), /üretim projesiyle aynı/);
  refuses(goodEnv({ STAGING_URL: PROD_URL + '/', STAGING_PROJECT_REF: PROD_REF }), /üretim projesiyle aynı/);
  refuses(goodEnv({ STAGING_URL: PROD_URL.toUpperCase().replace('HTTPS', 'https'), STAGING_PROJECT_REF: PROD_REF }), /üretim projesiyle aynı/);
});

test('üretim yalnızca referansla biliniyorsa da (PRODUCTION_PROJECT_REF) aynı referans reddedilir', () => {
  const env = goodEnv({ PRODUCTION_SUPABASE_URL: '', PRODUCTION_PROJECT_REF: STAGE_REF });
  refuses(env, /referansı üretim projesiyle aynı/);
});

test('üretim referansı belirlenemiyor: FAIL-CLOSED, test başlamaz', () => {
  const nothing = { urls: [], refs: [], problems: [] };
  refuses(goodEnv({ PRODUCTION_SUPABASE_URL: '' }), /belirlenemedi/, { production: nothing });
  refuses(goodEnv(), /belirlenemedi/, { production: nothing });
  refuses(goodEnv(), /belirlenemedi/, { productionUrls: [] });
});

test('üretim yapılandırması bozuk/okunamıyor: durur', () => {
  refuses(goodEnv(), /okunamadı/, { production: { urls: [PROD_URL], refs: [], problems: ['.env okunamadı.'] } });
});

test('staging referansı eksik, URL ile uyuşmuyor veya URL geçersiz: reddedilir', () => {
  refuses(goodEnv({ STAGING_PROJECT_REF: '' }), /Eksik ortam/);
  refuses(goodEnv({ STAGING_PROJECT_REF: undefined }), /Eksik ortam/);
  refuses(goodEnv({ STAGING_PROJECT_REF: 'baskaref12345' }), /eşleşmiyor/);
  refuses(goodEnv({ STAGING_URL: 'https://example.com' }), /geçerli bir Supabase/);
  refuses(goodEnv({ STAGING_URL: 'ftp://x' }), /geçerli bir Supabase/);
  refuses(goodEnv({ STAGING_URL: '' }), /Eksik ortam/);
});

test('onay metni eksik veya yanlış: reddedilir', () => {
  refuses(goodEnv({ STAGING_CONFIRM: undefined }), /Eksik ortam/);
  refuses(goodEnv({ STAGING_CONFIRM: '' }), /Eksik ortam/);
  refuses(goodEnv({ STAGING_CONFIRM: 'evet' }), /STAGING_CONFIRM/);
  refuses(goodEnv({ STAGING_CONFIRM: guard.CONFIRM_VALUE.toLowerCase() }), /STAGING_CONFIRM/);
});

test('anahtarlar: yer değiştirmiş, aynı, eksik veya tanınmayan biçim reddedilir (doğrulanamayan anahtar kabul edilmez)', () => {
  refuses(goodEnv({ STAGING_ANON_KEY: SERVICE }), /ANON_KEY/);
  refuses(goodEnv({ STAGING_SERVICE_ROLE_KEY: ANON }), /SERVICE_ROLE_KEY/);
  refuses(goodEnv({ STAGING_ANON_KEY: 'rastgele-metin' }), /ANON_KEY/);
  refuses(goodEnv({ STAGING_SERVICE_ROLE_KEY: 'rastgele-metin' }), /SERVICE_ROLE_KEY/);
  refuses(goodEnv({ STAGING_SERVICE_ROLE_KEY: undefined }), /Eksik ortam/);
});

test('yerel yığın (localhost) staging olarak kabul edilir, ama üretim referansı olamaz', () => {
  const env = goodEnv({ STAGING_URL: 'http://127.0.0.1:54321', STAGING_PROJECT_REF: 'local' });
  assert.equal(guard.assertSafeStagingEnv(env).ref, 'local');
});

// ─── Üretim adresinin çalışma klasöründen bağımsız bulunması ─────────────────────────────────────
test('.env ayrıştırma: tırnak, export, CRLF ve boş değer', () => {
  assert.deepEqual(guard.parseEnvFile(`EXPO_PUBLIC_SUPABASE_URL=${PROD_URL}\r\nX=1`), { found: true, value: PROD_URL });
  assert.equal(guard.parseEnvFile(`export EXPO_PUBLIC_SUPABASE_URL="${PROD_URL}"`).value, PROD_URL);
  assert.equal(guard.parseEnvFile(`EXPO_PUBLIC_SUPABASE_URL='${PROD_URL}'`).value, PROD_URL);
  assert.deepEqual(guard.parseEnvFile('EXPO_PUBLIC_SUPABASE_URL='), { found: true, value: null });
  assert.equal(guard.parseEnvFile('BASKA=1').found, false);
});

test('.env boş URL içeriyorsa "problem" sayılır ve doğrulama durur', () => {
  const dir = tmp('wortly-guard-');
  fs.writeFileSync(path.join(dir, '.env'), 'EXPO_PUBLIC_SUPABASE_URL=\n');
  const found = guard.discoverProduction({ env: {}, searchDirs: [dir] });
  assert.equal(found.problems.length, 1);
  refuses(goodEnv({ PRODUCTION_SUPABASE_URL: '' }), /okunamadı/, { production: found });
});

test('.env yok ve başka kaynak yok: keşif boş döner → fail-closed', () => {
  const dir = tmp('wortly-guard-');
  const found = guard.discoverProduction({ env: {}, searchDirs: [dir] });
  assert.deepEqual([found.urls, found.refs, found.problems], [[], [], []]);
  refuses(goodEnv({ PRODUCTION_SUPABASE_URL: '' }), /belirlenemedi/, { production: found });
});

test('ana klasör, ek worktree ve BAŞKA çalışma klasöründen çalıştırınca aynı üretim adresi bulunur ve staging reddedilir', () => {
  // Gerçek git: ana depo (.env burada) + ek worktree (.env yok) + ilgisiz klasör.
  const main = tmp('wortly-main-');
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  git(main, 'init', '-q');
  git(main, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'x');
  fs.writeFileSync(path.join(main, '.env'), `EXPO_PUBLIC_SUPABASE_URL=${PROD_URL}\n`);
  const tree = path.join(tmp('wortly-tree-'), 'wt');
  git(main, 'worktree', 'add', '-q', '-b', 'guard-test', tree);
  assert.equal(fs.existsSync(path.join(tree, '.env')), false, 'ek worktree\'de .env yok');
  const guardDirMain = path.join(main, 'supabase', 'tests');
  const guardDirTree = path.join(tree, 'supabase', 'tests');
  fs.mkdirSync(guardDirMain, { recursive: true });
  fs.mkdirSync(guardDirTree, { recursive: true });

  const previous = process.cwd();
  try {
    for (const cwd of [main, tree, os.tmpdir()]) {
      process.chdir(cwd); // süreç klasörü sonucu DEĞİŞTİRMEMELİ
      for (const guardDir of [guardDirMain, guardDirTree]) {
        const found = guard.discoverProduction({ env: {}, guardDir });
        assert.deepEqual(found.urls, [PROD_URL], 'üretim adresi bulundu');
        refuses({ ...goodEnv({ PRODUCTION_SUPABASE_URL: '' }), STAGING_URL: PROD_URL, STAGING_PROJECT_REF: PROD_REF }, /üretim projesiyle aynı/, { production: found });
        assert.deepEqual(guard.assertSafeStagingEnv(goodEnv({ PRODUCTION_SUPABASE_URL: '' }), { production: found }), { url: STAGE_URL, ref: STAGE_REF });
      }
    }
  } finally {
    process.chdir(previous);
  }
});

test('git bulunamazsa ana klasör aranamaz: yine de yalnızca bulunan kaynaklarla karar verilir; hiç yoksa durur', () => {
  const dir = tmp('wortly-nogit-');
  const failingGit = () => { throw new Error('git yok'); };
  assert.equal(guard.mainWorktreeRoot(dir, failingGit), null);
  const found = guard.discoverProduction({ env: {}, guardDir: path.join(dir, 'a', 'b'), runGit: failingGit });
  refuses(goodEnv({ PRODUCTION_SUPABASE_URL: '' }), /belirlenemedi/, { production: found });
});

// ─── Giriş noktaları: koruma atlanamaz ───────────────────────────────────────────────────────────
test('ağa bağlanabilen HER staging betiği, istemci oluşturmadan ÖNCE merkezi güvenlik doğrulamasını çağırır', () => {
  const dir = path.join(ROOT, 'supabase', 'tests');
  const entry = fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'staging-guard.js')
    .map(f => ({ f, text: fs.readFileSync(path.join(dir, f), 'utf8') }))
    .filter(({ text }) => /createClient\(|STAGING_URL/.test(text));
  assert.ok(entry.length >= 2, 'beklenen en az iki staging betiği');
  for (const { f, text } of entry) {
    const check = text.indexOf('assertSafeStagingEnv(');
    const connect = text.search(/createClient\(|auth\.admin|require\(['"]@supabase/);
    assert.ok(check >= 0, `${f}: merkezi doğrulama çağrılmıyor`);
    assert.ok(connect < 0 || check < connect, `${f}: doğrulama bağlantıdan ÖNCE olmalı`);
    assert.ok(!/productionUrls\s*:/.test(text), `${f}: üretim adresini kendisi vermemeli (merkezi keşif kullanılmalı)`);
    assert.ok(!/process\.cwd\(\)/.test(text), `${f}: çalışma klasörüne bağımlı olmamalı`);
  }
  const guardText = fs.readFileSync(path.join(dir, 'staging-guard.js'), 'utf8');
  assert.ok(!/process\.cwd\(\)/.test(guardText.replace(/\/\/.*$/gm, '')), 'koruma process.cwd() kullanmamalı');
});

test('staging betikleri güvensiz yapılandırmada AĞA GİTMEDEN çıkış kodu 2 ile durur (farklı çalışma klasörlerinden)', () => {
  const scripts = ['staging.integration.test.js', 'learning-sync.staging.test.js'].map(f => path.join(ROOT, 'supabase', 'tests', f));
  const base = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP };
  const cases = [
    ['üretim = staging', goodEnv({ STAGING_URL: PROD_URL, STAGING_PROJECT_REF: PROD_REF })],
    ['onay yok', goodEnv({ STAGING_CONFIRM: undefined })],
    ['referans yok', goodEnv({ STAGING_PROJECT_REF: undefined })],
  ];
  for (const script of scripts) {
    for (const cwd of [ROOT, os.tmpdir()]) {
      for (const [label, env] of cases) {
        const childEnv = { ...base };
        for (const [k, v] of Object.entries(env)) if (v !== undefined) childEnv[k] = v;
        const run = spawnSync(process.execPath, [script], { cwd, env: childEnv, encoding: 'utf8', timeout: 60000 });
        const output = (run.stdout || '') + (run.stderr || '');
        assert.equal(run.status, 2, `${path.basename(script)} @ ${path.basename(cwd)} [${label}] çıkış kodu 2 olmalı: ${output.slice(0, 200)}`);
        assert.match(output, /DURDURULDU/);
        for (const secret of [PROD_URL, PROD_REF, STAGE_URL, ANON, SERVICE]) assert.ok(!output.includes(secret), 'çıktıda gizli/adres değeri yok');
      }
    }
  }
});
