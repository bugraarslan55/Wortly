// Derin bağlantıyla oturum açma (login CSRF / oturum sabitleme): YALNIZCA cihazda başlatılmış PKCE akışının tek kullanımlık kodu.
// @utils: auth-link
//
// Eski davranış: gelen HER URL'deki access_token/refresh_token ile `setSession` çağrılıyordu. Şimdi ham belirteç taşıyan hiçbir
// bağlantı oturum kuramaz; yalnızca auth/callback ve auth/reset üzerindeki `?code=` (PKCE) kabul edilir ve kod, cihazda saklanan
// yerel doğrulayıcıyla değiştirilir (gerçek istemci davranışı: tests/auth-pkce-flow.test.js). Gerçek Supabase'e bağlanılmaz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createWorld } = require('./support/store-harness');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const L = require(path.join(out, 'utils', 'auth-link.js'));
const ROOT = path.resolve(__dirname, '..');

const OPTIONS = { appScheme: 'wortly', allowExpoDev: false, webOrigin: null };
const parse = (url, options = OPTIONS) => L.parseAuthLink(url, options);
const CODE = '34e770dd-9ff9-416c-87fa-43b31d7ef225';
const ATTACKER = 'attacker-access-token.part2.part3';
const ATTACKER_R = 'attacker-refresh-token';
const tokens = (type = 'signup') => `#access_token=${ATTACKER}&refresh_token=${ATTACKER_R}&expires_in=3600&token_type=bearer${type === null ? '' : `&type=${type}`}`;

// ─── Saf ayrıştırıcı ──────────────────────────────────────────────────────────────────────────────────────────

test('geçerli bağlantılar: auth/callback ve auth/reset üzerinde ?code= tek kullanımlık kod bağlantısıdır', () => {
  assert.deepEqual(parse(`wortly://auth/callback?code=${CODE}`), { kind: 'code', route: 'callback', code: CODE });
  assert.deepEqual(parse(`wortly://auth/reset?code=${CODE}`), { kind: 'code', route: 'reset', code: CODE });
  assert.equal(parse(`wortly://auth/callback/?code=${CODE}`)?.route, 'callback', 'sondaki eğik çizgi');
  assert.equal(parse(`WORTLY://auth/callback?code=${CODE}`)?.route, 'callback', 'şema büyük/küçük harf duyarsızdır');
  assert.equal(parse(`wortly:///auth/reset?code=${CODE}`)?.route, 'reset', 'boş host');
  assert.equal(parse(`wortly://auth/callback?sb_flow_id=abcdef12&code=${CODE}`)?.code, CODE, 'ek parametreler yok sayılır');
});

test('HAM BELİRTEÇ: access_token/refresh_token taşıyan HİÇBİR bağlantı kabul edilmez (yol, tür ve biçim ne olursa olsun)', () => {
  for (const route of ['auth/callback', 'auth/reset', 'profile', 'auth']) {
    for (const type of ['signup', 'recovery', 'magiclink', 'invite', 'email_change', null]) {
      assert.equal(parse(`wortly://${route}${tokens(type)}`), null, `parça: ${route} ${type}`);
      assert.equal(parse(`wortly://${route}?access_token=${ATTACKER}&refresh_token=${ATTACKER_R}${type ? `&type=${type}` : ''}`), null, `sorgu: ${route} ${type}`);
    }
  }
  assert.equal(parse(`wortly://auth/callback#access_token=${ATTACKER}`), null, 'tek belirteç');
  assert.equal(parse(`wortly://auth/callback#refresh_token=${ATTACKER_R}`), null, 'tek belirteç');
});

test('belirteç + kod birlikte: kod, belirteci "kurtaramaz"; bağlantının tamamı reddedilir', () => {
  assert.equal(parse(`wortly://auth/callback?code=${CODE}${tokens('signup')}`), null);
  assert.equal(parse(`wortly://auth/reset?code=${CODE}&access_token=${ATTACKER}`), null);
  assert.equal(parse(`wortly://auth/reset?code=${CODE}&refresh_token=${ATTACKER_R}`), null);
});

test('YANLIŞ YOL: auth/callback ve auth/reset dışındaki hiçbir yolda kod kabul edilmez', () => {
  const paths = [
    'profile', 'hesabi-sil', 'auth', 'auth/', 'auth/callback/extra', 'auth/callbackx', 'auth/reset/profile', 'auth/callback/../profile',
    'auth/%63allback', 'auth%2Fcallback', 'Auth/Callback', 'AUTH/RESET', '(tabs)', '', '/', 'evil.example/auth/callback',
    'auth//callback', 'auth/./callback', 'auth\\callback', 'auth/callback;x', 'auth/callback%00',
  ];
  for (const p of paths) assert.equal(parse(`wortly://${p}?code=${CODE}`), null, `kabul edilmemeliydi: ${p}`);
});

test('geçersiz kod: eksik, boş, tekrarlanan, çok kısa/uzun veya beklenmeyen karakterli kod reddedilir', () => {
  for (const q of ['', '?code=', `?code=${CODE}&code=${CODE}`, '?code=short', `?code=${'a'.repeat(513)}`, '?code=abc%20def12345', '?code=%00%00%00%00%00%00%00%00', '?code=a/b/c/d/e/f/g/h', '?code=<script>alert1</script>']) {
    assert.equal(parse(`wortly://auth/callback${q}`), null, q);
  }
  assert.equal(parse(`wortly://auth/callback#code=${CODE}`), null, 'kod yalnızca sorgu dizisinde kabul edilir');
});

test('hata bağlantıları (süresi dolmuş vb.) kod içermez ve yok sayılır', () => {
  assert.equal(parse('wortly://auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'), null);
  assert.equal(parse('wortly://auth/callback?error=access_denied&error_code=otp_expired'), null);
  assert.equal(parse('wortly://auth/callback'), null);
});

test('YANLIŞ ŞEMA / köken: başka şema, https ve exp yalnızca açıkça izin verildiğinde kabul edilir', () => {
  for (const url of [
    `https://evil.example/auth/callback?code=${CODE}`, `http://evil.example/auth/reset?code=${CODE}`, `evil://auth/callback?code=${CODE}`,
    `javascript://auth/callback?code=${CODE}`, `exp://192.168.0.5:8081/--/auth/callback?code=${CODE}`, `exps://x.exp.direct/--/auth/reset?code=${CODE}`,
    `file:///auth/callback?code=${CODE}`, `auth/callback?code=${CODE}`, '', `wortly:auth/callback?code=${CODE}`,
  ]) assert.equal(parse(url), null, url);
  assert.equal(parse(null), null);
  assert.equal(parse(undefined), null);
  assert.equal(parse(42), null);
});

test('boşluk/denetim karakteri, ters eğik çizgi ve aşırı uzun URL reddedilir', () => {
  assert.equal(parse(` wortly://auth/callback?code=${CODE}`), null);
  assert.equal(parse(`wortly://auth/callback?code=${CODE}\n`), null);
  assert.equal(parse(`wortly://auth/call\tback?code=${CODE}`), null);
  assert.equal(parse(`wortly://auth\\callback?code=${CODE}`), null);
  assert.equal(parse(`wortly://auth/callback?code=${CODE}&x=${'a'.repeat(5000)}`), null);
});

test('geliştirme: exp/exps yalnızca allowExpoDev ile ve yine yalnızca doğru yol ile kabul edilir (Expo "/--/" öneki)', () => {
  const dev = { ...OPTIONS, allowExpoDev: true };
  assert.equal(parse(`exp://192.168.0.5:8081/--/auth/callback?code=${CODE}`, dev)?.route, 'callback');
  assert.equal(parse(`exps://x.exp.direct/--/auth/reset?code=${CODE}`, dev)?.route, 'reset');
  assert.equal(parse(`exp://192.168.0.5:8081/--/profile?code=${CODE}`, dev), null);
  assert.equal(parse(`exp://192.168.0.5:8081/--/auth/callback${tokens('signup')}`, dev), null, 'dev modda da ham belirteç yok');
  assert.equal(parse(`exp://192.168.0.5:8081/--/auth/callback?code=${CODE}`), null, 'dev kapalıyken reddedilir');
  assert.equal(parse(`https://evil.example/auth/callback?code=${CODE}`, dev), null, 'dev, https açmaz');
});

test('web: yalnızca uygulamanın KENDİ kökeni (origin) kabul edilir', () => {
  const web = { ...OPTIONS, webOrigin: 'https://app.example' };
  assert.equal(parse(`https://app.example/auth/reset?code=${CODE}`, web)?.route, 'reset');
  assert.equal(parse(`https://evil.example/auth/reset?code=${CODE}`, web), null);
  assert.equal(parse(`https://app.example.evil.example/auth/reset?code=${CODE}`, web), null);
  assert.equal(parse(`https://app.example@evil.example/auth/reset?code=${CODE}`, web), null);
  assert.equal(parse(`https://app.example/profile?code=${CODE}`, web), null);
  assert.equal(parse(`https://app.example/auth/reset?code=${CODE}`), null, 'web kökeni verilmemişse reddedilir');
});

test('uygulama şeması app.json ile aynı (şema değişirse bağlantılar sessizce reddedilmesin)', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
  assert.equal(app.scheme, L.APP_SCHEME);
  assert.equal(L.APP_SCHEME, 'wortly');
});

// ─── GERÇEK auth mağazası: setSession HİÇ çağrılmaz; yalnızca kod değişimi ───────────────────────────────────

const calls = { setSession: [], exchange: [], replace: [] };
const platform = { OS: 'ios' };
const stubs = {
  'react-native': { Platform: platform },
  'expo-linking': { createURL: (p) => `wortly://${p}`, parse: () => ({}) },
  'expo-router': { router: { replace: (p) => calls.replace.push(p) } },
  'expo-audio': { createAudioPlayer: () => ({}) },
  'expo-file-system': { File: class {}, Directory: class {}, Paths: { document: '' } },
  'expo-constants': { __esModule: true, default: { executionEnvironment: 'bare' }, ExecutionEnvironment: { StoreClient: 'storeClient' } },
  'expo-notifications': { setNotificationHandler: () => undefined },
};
const loadBeforeStubs = Module._load;
Module._load = function stubbedLoad(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
  return loadBeforeStubs.call(this, request, parent, isMain);
};

/** exchange: kod → { data, error } (varsayılan: başarılı oturum). */
function bootAuth({ existingUser = null, exchange = null } = {}) {
  calls.setSession.length = 0; calls.exchange.length = 0; calls.replace.length = 0;
  platform.OS = 'ios';
  const world = createWorld();
  world.boot();
  world.supabase.auth.setSession = async (tokens) => {
    calls.setSession.push(tokens);
    return { data: { session: { user: { id: 'attacker-user' } } }, error: null };
  };
  world.supabase.auth.exchangeCodeForSession = async (code, options) => {
    calls.exchange.push({ code, options });
    if (exchange) return exchange(code);
    return { data: { session: { user: { id: 'code-user' } }, redirectType: null }, error: null };
  };
  const { useAuthStore } = require(path.join(ROOT, 'store', 'auth.ts'));
  if (existingUser) useAuthStore.setState({ session: { user: { id: existingUser } } });
  return useAuthStore;
}

test('auth mağazası: geçerli kayıt doğrulama bağlantısı kodu değiştirir ve oturumu kurar (normal akış)', async () => {
  const auth = bootAuth();
  assert.equal(await auth.getState().handleAuthUrl(`wortly://auth/callback?code=${CODE}`), true);
  assert.deepEqual(calls.exchange, [{ code: CODE, options: undefined }]);
  assert.equal(auth.getState().session.user.id, 'code-user');
  assert.deepEqual(calls.replace, [], 'kayıt doğrulaması şifre ekranına yönlendirmez');
  assert.deepEqual(calls.setSession, []);
});

test('auth mağazası: şifre sıfırlama kodu (redirectType=recovery) oturumu kurar ve sıfırlama yetkisini verir (yönlendirme _layout efektinde)', async () => {
  const auth = bootAuth({ exchange: async () => ({ data: { session: { user: { id: 'u' } }, redirectType: 'recovery' }, error: null }) });
  assert.equal(await auth.getState().handleAuthUrl(`wortly://auth/reset?code=${CODE}`), true);
  assert.equal(auth.getState().recoveryStatus, 'ready');
  assert.equal(auth.getState().recoveryUserId, 'u');
  assert.deepEqual(calls.replace, [], 'store anlık yönlendirme yapmaz (Stack.Protected güncellenmeden yönlendirme ana ekrana düşerdi)');
  assert.deepEqual(calls.setSession, []);
});

test('auth mağazası: SALDIRGAN belirteçli bağlantılar HİÇBİR oturum işlemi yapmaz ve açık oturumu değiştirmez', async () => {
  const attacks = [
    ...['auth/callback', 'auth/reset', 'profile', 'hesabi-sil', 'evil.example/auth/callback', 'auth/callback/../profile']
      .flatMap(route => ['signup', 'recovery', 'magiclink', 'invite', 'email_change', null].map(type => `wortly://${route}${tokens(type)}`)),
    `wortly://auth/callback?access_token=${ATTACKER}&refresh_token=${ATTACKER_R}&type=signup`,
    `wortly://auth/reset?code=${CODE}${tokens('recovery')}`,
    `https://evil.example/auth/callback?code=${CODE}`, `evil://auth/reset?code=${CODE}`, `exp://evil.example/--/auth/callback?code=${CODE}`,
    `wortly://profile?code=${CODE}`,
  ];
  const auth = bootAuth({ existingUser: 'real-user' });
  for (const url of attacks) assert.equal(await auth.getState().handleAuthUrl(url), false, url);
  assert.deepEqual(calls.setSession, [], 'saldırgan belirteciyle setSession çağrıldı');
  assert.deepEqual(calls.exchange, [], 'geçersiz bağlantıyla kod değişimi denendi');
  assert.deepEqual(calls.replace, []);
  assert.equal(auth.getState().session.user.id, 'real-user', 'açık oturum değişmemeliydi');
});

test('auth mağazası: kod değişimi başarısız olursa (cihazda doğrulayıcı yok / eşleşmiyor) açık oturum DEĞİŞMEZ ve false döner', async () => {
  const failures = [
    async () => ({ data: { session: null, user: null, redirectType: null }, error: { name: 'AuthPKCECodeVerifierMissingError', message: 'PKCE code verifier not found in storage.' } }),
    async () => ({ data: { session: null, user: null, redirectType: null }, error: { message: 'code challenge does not match previously saved code verifier' } }),
    async () => { throw new Error('ağ hatası'); },
  ];
  for (const exchange of failures) {
    const auth = bootAuth({ existingUser: 'real-user', exchange });
    assert.equal(await auth.getState().handleAuthUrl(`wortly://auth/callback?code=${CODE}`), false);
    assert.equal(auth.getState().session.user.id, 'real-user');
    assert.deepEqual(calls.replace, []);
    assert.deepEqual(calls.setSession, []);
  }
});

test('auth mağazası: aynı kod bir kez değiştirilir (layout + callback ekranı aynı bağlantıyı iki kez işlese de)', async () => {
  const auth = bootAuth();
  const url = `wortly://auth/callback?code=${CODE}`;
  const [a, b] = await Promise.all([auth.getState().handleAuthUrl(url), auth.getState().handleAuthUrl(url)]);
  assert.deepEqual([a, b], [true, true]);
  assert.equal(await auth.getState().handleAuthUrl(url), true, 'sonradan tekrar da aynı sonucu verir');
  assert.equal(calls.exchange.length, 1, 'tek kullanımlık kod ikinci kez gönderilmemeli');
});

test('auth mağazası: __DEV__ kapalıyken exp:// bağlantısı kabul edilmez; açıkken yalnızca doğru yol kabul edilir', async () => {
  const auth = bootAuth();
  const link = `exp://192.168.0.5:8081/--/auth/callback?code=${CODE}`;
  assert.equal(await auth.getState().handleAuthUrl(link), false);
  assert.equal(calls.exchange.length, 0);
  globalThis.__DEV__ = true;
  try {
    assert.equal(await auth.getState().handleAuthUrl(link), true);
    assert.equal(await auth.getState().handleAuthUrl(`exp://192.168.0.5:8081/--/profile?code=${'b'.repeat(20)}`), false);
    assert.equal(calls.exchange.length, 1);
  } finally {
    globalThis.__DEV__ = false;
  }
});

test('uygulamada setSession YOK; exchangeCodeForSession yalnızca store/auth.ts içinde ve yalnızca ayrıştırıcıdan sonra', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const files = ['app', 'components', 'hooks', 'store', 'utils', 'constants'].flatMap(d => walk(path.join(ROOT, d))).filter(f => /\.(ts|tsx)$/.test(f));
  const using = (re) => files.filter(f => re.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(ROOT, f).replace(/\\/g, '/'));
  assert.deepEqual(using(/\.setSession\(/), [], 'ham belirteçle oturum kurma kaldırıldı');
  assert.deepEqual(using(/\.exchangeCodeForSession\(/), ['store/auth.ts']);
  const src = fs.readFileSync(path.join(ROOT, 'store', 'auth.ts'), 'utf8');
  const body = src.slice(src.indexOf('handleAuthUrl: async'), src.indexOf('signOut: async'));
  assert.ok(body.indexOf('parseAuthLink(') !== -1 && body.indexOf('parseAuthLink(') < body.indexOf('exchangeCodeForSession('));
  assert.doesNotMatch(body, /Linking\.parse|hashParams|queryParams|access_token|refresh_token/, 'ham belirteç/URL ayrıştırması kalmamalı');
});

test('istemci PKCE akışıyla kurulur ve URL\'den oturum algılama kapalıdır (utils/supabase.ts)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'utils', 'supabase.ts'), 'utf8');
  assert.match(src, /flowType:\s*'pkce'/);
  assert.match(src, /detectSessionInUrl:\s*false/);
});
