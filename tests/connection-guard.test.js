// Fail-closed bağlantı koruması: karar mantığı, boş istemci ve uygulamaya bağlantı (kaynak taraması).
// @utils: env-safety, blocked-client
//
// Gerçek Supabase'e HİÇ bağlanılmaz; yalnızca SAHTE proje kimlikleri kullanılır. Kapsam DIŞI (cihazda/derlemede denenmeli):
// gerçek EAS derleme profillerinin EXPO_PUBLIC_BUILD_PROFILE değerini taşıması, engel ekranının görünümü.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const E = require(path.join(out, 'utils', 'env-safety.js'));
const B = require(path.join(out, 'utils', 'blocked-client.js'));
const ROOT = path.resolve(__dirname, '..');

const PROD = 'fakeprodref01';
const STAGE_URL = 'https://fakestageref2.supabase.co';
const PROD_URL = `https://${PROD}.supabase.co`;
// Varsayılan: geliştirme (Metro) + geçerli staging.
const dev = (extra = {}) => ({ isDev: true, buildProfile: undefined, url: STAGE_URL, hasKey: true, appEnv: 'staging', productionRefs: PROD, ...extra });
// Preview: release modunda derlenir (isDev=false); yalnızca derleme profili ayırt eder.
const preview = (extra = {}) => dev({ isDev: false, buildProfile: 'preview', ...extra });
// Yayın: production profili, isDev=false.
const release = (extra = {}) => dev({ isDev: false, buildProfile: 'production', url: PROD_URL, appEnv: 'production', ...extra });

// ─── İstenen senaryo matrisi ──────────────────────────────────────────────────────────────────
test('Development + production bağlantısı → ENGEL (ortam işareti staging yazsa bile)', () => {
  const verdict = E.evaluateConnection(dev({ url: PROD_URL, appEnv: 'staging' }));
  assert.equal(verdict.allow, false);
  assert.equal(verdict.reason, 'is-production');
});

test('Preview + production bağlantısı → ENGEL (preview release modunda olsa bile)', () => {
  for (const appEnv of ['staging', 'production', undefined]) {
    const verdict = E.evaluateConnection(preview({ url: PROD_URL, appEnv }));
    assert.equal(verdict.allow, false, String(appEnv));
    assert.equal(verdict.reason, 'is-production');
  }
});

test('Development + geçerli staging bağlantısı → İZİN', () => {
  const verdict = E.evaluateConnection(dev());
  assert.equal(verdict.allow, true);
  assert.equal(verdict.mode, 'protected-verified');
});

test('Preview + geçerli staging bağlantısı → İZİN', () => {
  const verdict = E.evaluateConnection(preview());
  assert.equal(verdict.allow, true);
  assert.equal(verdict.mode, 'protected-verified');
});

test('Eksik production referansı → ENGEL (karşılaştırma yapılamaz); geliştirme ve preview için', () => {
  for (const productionRefs of [undefined, null, '', '  , ']) {
    for (const make of [dev, preview]) {
      const verdict = E.evaluateConnection(make({ productionRefs }));
      assert.equal(verdict.allow, false);
      assert.equal(verdict.reason, 'production-unknown');
    }
  }
});

test('Yanlış ortam işareti → ENGEL: production işaretli ya da işaretsiz/tanınmayan', () => {
  for (const make of [dev, preview]) {
    assert.equal(E.evaluateConnection(make({ appEnv: 'production' })).reason, 'marked-production');
    for (const appEnv of [undefined, '', 'prod', 'dev', 'test']) assert.equal(E.evaluateConnection(make({ appEnv })).reason, 'unmarked-environment');
  }
});

test('Production sürümü + doğrulanmış production yapılandırması → İZİN (verified=true)', () => {
  const verdict = E.evaluateConnection(release());
  assert.equal(verdict.allow, true);
  assert.equal(verdict.mode, 'release');
  assert.equal(verdict.verified, true);
});

// ─── Yayın sürümü ASLA kilitlenmez ─────────────────────────────────────────────────────────────
test('YAYIN: profil verilmemiş eski/yerel release derlemesi, özel alan adı, eksik production kimliği, farklı işaret → hepsi İZİN', () => {
  const cases = [
    release({ buildProfile: undefined }),                         // profil değişkeni olmayan mevcut yayın
    release({ buildProfile: '' }),
    release({ url: 'https://api.wortly.example', productionRefs: undefined }), // özel alan adı
    release({ productionRefs: undefined, appEnv: undefined }),    // üretim kimliği/işaret tanımsız
    release({ appEnv: 'staging' }),                               // işaret tutarsız (yalnızca verified=false)
    release({ url: STAGE_URL }),
  ];
  for (const input of cases) {
    const verdict = E.evaluateConnection(input);
    assert.equal(verdict.allow, true, JSON.stringify({ ...input, url: '[url]' }));
    assert.equal(verdict.mode, 'release');
  }
  assert.equal(E.evaluateConnection(release({ appEnv: 'staging' })).verified, false, 'doğrulanamayan yayın engellenmez, yalnızca işaretlenir');
});

test('Ayar (adres/anahtar) hiç yoksa: istemci oluşturulamaz → çökme yerine anlaşılır engel (yayında da)', () => {
  for (const make of [dev, preview, release]) {
    assert.equal(E.evaluateConnection(make({ url: undefined })).reason, 'missing-config');
    assert.equal(E.evaluateConnection(make({ url: '' })).reason, 'missing-config');
    assert.equal(E.evaluateConnection(make({ hasKey: false })).reason, 'missing-config');
  }
});

// ─── Güçlü yönler: tek sinyale güvenilmez, atlatma yok ─────────────────────────────────────────
test('geliştirme modu, profil "production" iddia etse bile korumalıdır (__DEV__ üzerinde production profili yayın sayılmaz)', () => {
  const verdict = E.evaluateConnection(dev({ buildProfile: 'production', url: PROD_URL, appEnv: 'production' }));
  assert.equal(verdict.allow, false);
});

test('tanınmayan derleme profili (ör. "staging") release modunda bile korumalıdır; profil büyük/küçük harf duyarsız', () => {
  assert.equal(E.evaluateConnection(preview({ buildProfile: 'staging', url: PROD_URL })).allow, false);
  assert.equal(E.evaluateConnection(preview({ buildProfile: 'PREVIEW', url: PROD_URL })).allow, false);
  assert.equal(E.evaluateConnection(release({ buildProfile: 'Production' })).allow, true);
  assert.equal(E.parseBuildProfile('x'), 'unknown');
  assert.equal(E.parseBuildProfile(undefined), 'unspecified');
});

test('güvenliği kapatan bir istisna YOKTUR: ek alanlar (eski ALLOW_PRODUCTION_IN_DEV dahil) kararı değiştirmez', () => {
  const verdict = E.evaluateConnection({ ...dev({ url: PROD_URL }), allowProductionInDev: true, override: true, force: 'yes-i-understand' });
  assert.equal(verdict.allow, false);
  const source = fs.readFileSync(path.join(ROOT, 'utils', 'env-safety.ts'), 'utf8') + fs.readFileSync(path.join(ROOT, 'utils', 'supabase.ts'), 'utf8');
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ''), /ALLOW_PRODUCTION|allowProductionInDev/);
});

test('adres biçimi/büyük harf/eğik çizgi production karşılaştırmasını atlatamaz; yerel yığın izinli', () => {
  for (const url of [PROD_URL + '/', PROD_URL.toUpperCase().replace('HTTPS', 'https')]) {
    assert.equal(E.evaluateConnection(dev({ url })).reason, 'is-production');
  }
  assert.equal(E.evaluateConnection(dev({ productionRefs: ` ${PROD.toUpperCase()} , other123456 `, url: PROD_URL })).reason, 'is-production');
  for (const url of [undefined, 'abc', 'http://evil.example.com', 'https://x.supabase.co.evil.com']) {
    if (url === undefined) continue;
    assert.equal(E.evaluateConnection(dev({ url })).reason, 'invalid-url', url);
  }
  const local = E.evaluateConnection(dev({ url: 'http://127.0.0.1:54321', productionRefs: '', appEnv: undefined }));
  assert.equal(local.allow, true);
  assert.equal(local.mode, 'protected-local');
});

test('kullanıcı mesajları adres, anahtar veya proje kimliği içermez', () => {
  for (const reason of ['missing-config', 'invalid-url', 'production-unknown', 'is-production', 'marked-production', 'unmarked-environment', 'guard-error']) {
    const message = E.blockMessage(reason);
    assert.ok(message.length > 20);
    assert.doesNotMatch(message, /supabase\.co|https?:|sb_|eyJ|fakeprodref01|fakestageref2/i);
  }
});

// ─── Boş istemci: başlatma hatasında/engelde veri erişimi yok ─────────────────────────────────────
test('engelli istemci: ağ isteği yapmaz, oturum yoktur, her sorgu güvenli hataya çözülür', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = () => { fetchCalls += 1; throw new Error('ağ kullanılmamalı'); };
  try {
    const client = B.createBlockedClient();
    const session = await client.auth.getSession();
    assert.deepEqual(session, { data: { session: null }, error: null });
    const listener = client.auth.onAuthStateChange(() => undefined);
    assert.doesNotThrow(() => listener.data.subscription.unsubscribe());

    const query = await client.from('user_words').select('id').eq('user_id', 'x').order('created_at', { ascending: true });
    assert.equal(query.data, null);
    assert.equal(query.error.message, B.BLOCKED_ERROR_MESSAGE);
    const write = await client.from('profiles').upsert({ id: 'x' }, { onConflict: 'id' });
    assert.equal(write.data, null);
    assert.ok(write.error);
    const single = await client.from('profiles').select('*').eq('id', 'x').maybeSingle();
    assert.ok(single.error);
    const signIn = await client.auth.signInWithPassword({ email: 'a@b.invalid', password: 'x' });
    assert.equal(signIn.data, null);
    assert.ok(signIn.error);
    const signOut = await client.auth.signOut();
    assert.ok(signOut.error, 'çıkış çağrısı da güvenli hataya çözülür');
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── Uygulamaya bağlantı (kaynak taraması; çalışma zamanı davranışı derlemede/cihazda denenmeli) ─────────
test('gerçek istemci yalnızca bağlantı kararı "izin" ise oluşturulur; karar istemciden ÖNCE verilir; başka yerde istemci kurulmaz', () => {
  const source = fs.readFileSync(path.join(ROOT, 'utils', 'supabase.ts'), 'utf8');
  const decision = source.indexOf('export const connectionVerdict');
  const create = source.indexOf('createClient(supabaseUrl');
  assert.ok(decision > 0 && create > decision, 'karar istemciden önce');
  assert.match(source, /connectionVerdict\.allow\s*\?\s*createClient/);
  assert.match(source, /createBlockedClient\(\)/);
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const dir of ['app', 'components', 'store', 'hooks', 'utils']) {
    for (const file of walk(path.join(ROOT, dir)).filter(f => /\.tsx?$/.test(f))) {
      if (path.basename(file) === 'supabase.ts') continue;
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\bcreateClient\(/, `${file} istemci oluşturmamalı`);
    }
  }
});

test('değerlendirme hatası: korumalı derlemede engel, yayın derlemesinde izin (kilitlenme yok)', () => {
  const source = fs.readFileSync(path.join(ROOT, 'utils', 'supabase.ts'), 'utf8');
  assert.match(source, /catch \{[\s\S]*isProtectedBuild\(\{ isDev, buildProfile \}\)[\s\S]*guard-error[\s\S]*guard-error-release/);
});

test('kök yerleşim: engelliyse yalnızca hata ekranı; oturum/veri/bildirim/senkron başlatan AppRoot oluşturulmaz', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'app', '_layout.tsx'), 'utf8');
  const root = layout.indexOf('export default function RootLayout');
  const app = layout.indexOf('function AppRoot()');
  assert.ok(app > 0 && root > app);
  const body = layout.slice(root);
  assert.match(body, /if \(!connectionVerdict\.allow\) \{[\s\S]*<ConnectionBlockedScreen[\s\S]*return <AppRoot \/>/);
  // Başlatma etkileri (oturum, yükleme, abonelikler) yalnızca AppRoot içinde.
  for (const call of ['initializeAuth()', 'loadProfile()', 'subscribeToNotificationResponses(setPendingResponse)', 'useReminderSync(', 'syncWords(']) {
    const at = layout.indexOf(call);
    assert.ok(at > app && at < root, `${call} AppRoot içinde olmalı`);
  }
  assert.doesNotMatch(body, /initializeAuth|loadWords|syncWords|useReminderSync/);
});

test('engel ekranı gerçek adres/anahtar/kimlik göstermez (yalnızca açıklama ve neden kodu)', () => {
  const screen = fs.readFileSync(path.join(ROOT, 'components', 'connection-blocked-screen.tsx'), 'utf8');
  assert.doesNotMatch(screen, /process\.env|EXPO_PUBLIC|supabase\.co|sb_/);
});

test('derleme profilleri: development/preview eas.json env ile işaretlenir; production profiline dokunulmaz', () => {
  const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
  assert.equal(eas.build.development.env.EXPO_PUBLIC_BUILD_PROFILE, 'development');
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_BUILD_PROFILE, 'preview');
  assert.equal(eas.build.production.env, undefined, 'production derlemesinin yapılandırması değişmedi');
});

test('projectRefOf / parseProductionRefs', () => {
  assert.equal(E.projectRefOf('https://abcdefghij1234.supabase.co'), 'abcdefghij1234');
  assert.equal(E.projectRefOf('http://localhost:54321'), 'local');
  assert.equal(E.projectRefOf('https://supabase.co'), null);
  assert.deepEqual(E.parseProductionRefs('A1b2c3d4e5f6, a1b2c3d4e5f6 ,x'), ['a1b2c3d4e5f6', 'x']);
});
