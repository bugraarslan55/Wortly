// PKCE akışının GERÇEK istemci (@supabase/supabase-js, kurulu sürüm) davranışı: kayıt doğrulama ve şifre sıfırlama.
//
// Gerçek Supabase'e HİÇ bağlanılmaz: GoTrue'nun ilgili uçları (signup, recover, token?grant_type=pkce) sahte bir `fetch` ile
// taklit edilir. Taklit, gerçek sunucunun temel kuralını uygular: kod yalnızca KENDİ code_challenge'ına karşılık gelen
// doğrulayıcıyla (SHA-256) ve bir kez değiştirilir. Böylece "cihazda başlatılmış akış dışında oturum kurulamaz" iddiası,
// kütüphanenin gerçek kodu üzerinde sınanır. Kapsam DIŞI: gerçek e-posta şablonları, Redirect URL listesi, gerçek GoTrue.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const URL_BASE = 'https://staging-fake.supabase.co';
const LEGACY_VERIFIER_KEY = 'sb-staging-fake-auth-token-code-verifier'; // sb-<alt alan adı>-auth-token + -code-verifier
const b64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const challengeOf = (verifier) => b64url(crypto.createHash('sha256').update(verifier).digest());
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function createFakeGoTrue() {
  const requests = [];
  const pending = new Map();   // e-posta → { challenge, type, redirectTo }
  const codes = new Map();     // tek kullanımlık kod → { challenge, email, type }
  const tokenUsers = new Map(); // erişim belirteci → e-posta (PUT /user hangi hesabı güncelledi?)
  const passwordChanges = [];  // şifresi güncellenen hesapların e-postaları
  let counter = 0;
  const userOf = (email) => ({ id: `user-${email}`, aud: 'authenticated', role: 'authenticated', email, created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} });
  async function fetch(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const body = init.body ? JSON.parse(init.body) : null;
    requests.push({ method: init.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), body });
    if (url.pathname === '/auth/v1/signup') {
      pending.set(body.email, { challenge: body.code_challenge, type: 'signup', redirectTo: url.searchParams.get('redirect_to') });
      return json(200, userOf(body.email));
    }
    if (url.pathname === '/auth/v1/recover') {
      pending.set(body.email, { challenge: body.code_challenge, type: 'recovery', redirectTo: url.searchParams.get('redirect_to') });
      return json(200, {});
    }
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const entry = codes.get(body.auth_code);
      codes.delete(body.auth_code); // tek kullanım: başarısız deneme de kodu tüketir
      if (!entry || !body.code_verifier || challengeOf(body.code_verifier) !== entry.challenge) {
        return json(400, { code: 400, error_code: 'flow_state_not_found', msg: 'invalid flow state, no valid flow state found' });
      }
      counter += 1;
      tokenUsers.set(`at-${counter}`, entry.email);
      return json(200, {
        access_token: `at-${counter}`, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: `rt-${counter}`, user: userOf(entry.email),
      });
    }
    if (url.pathname === '/auth/v1/user' && (init.method ?? 'GET') === 'PUT') {
      // Gerçek GoTrue gibi: güncelleme, İSTEKTEKİ belirtecin sahibine uygulanır (istemci başka hesap seçemez).
      const bearer = String((init.headers && (init.headers.Authorization ?? init.headers.authorization)) || '').replace(/^Bearer\s+/i, '');
      const email = tokenUsers.get(bearer);
      if (!email) return json(401, { code: 401, msg: 'invalid JWT' });
      if (body && body.password) passwordChanges.push(email);
      return json(200, userOf(email));
    }
    return json(404, { msg: `beklenmeyen uç ${url.pathname}` });
  }
  return {
    fetch, requests, passwordChanges,
    /** Kullanıcının e-postadaki bağlantıya tıklaması: sunucu, o isteğin code_challenge'ına bağlı kod üretir. */
    clickEmailLink(email) {
      const flow = pending.get(email);
      const code = `code-${crypto.randomUUID()}`;
      codes.set(code, { challenge: flow.challenge, email, type: flow.type });
      return { code, redirectTo: flow.redirectTo };
    },
    /** Saldırganın KENDİ cihazında başlattığı akışın kodu: doğrulayıcı yalnızca saldırganda vardır. */
    attackerCode(email = 'attacker@wortly-test.invalid') {
      const code = `code-${crypto.randomUUID()}`;
      codes.set(code, { challenge: challengeOf(b64url(crypto.randomBytes(48))), email, type: 'signup' });
      return code;
    },
  };
}

function createStorage() {
  const map = new Map();
  return {
    map,
    getItem: async (key) => (map.has(key) ? map.get(key) : null),
    setItem: async (key, value) => { map.set(key, value); },
    removeItem: async (key) => { map.delete(key); },
    verifierKeys: () => [...map.keys()].filter((key) => key.includes('code-verifier')),
    /** Kod değişiminin okuduğu "son başlatılan akış" doğrulayıcısı (istemci akış kimliğini URL'den almaz). */
    pendingVerifier: () => (map.has(LEGACY_VERIFIER_KEY) ? JSON.parse(map.get(LEGACY_VERIFIER_KEY)) : null),
  };
}

function createDevice(server, storage = createStorage()) {
  const client = createClient(URL_BASE, 'sb_publishable_fake', {
    auth: { flowType: 'pkce', storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: server.fetch },
  });
  const events = [];
  client.auth.onAuthStateChange((event) => { events.push(event); });
  return { client, storage, events };
}

const REDIRECT_CALLBACK = 'wortly://auth/callback';
const REDIRECT_RESET = 'wortly://auth/reset';
const sessionUser = async (client) => (await client.auth.getSession()).data.session?.user?.id ?? null;
const networkCalls = (server) => server.requests.length;

test('kayıt: signUp, S256 code_challenge gönderir; doğrulayıcı YALNIZCA cihazda kalır ve yönlendirme adresi aynen korunur', async () => {
  const server = createFakeGoTrue();
  const device = createDevice(server);
  const { error } = await device.client.auth.signUp({ email: 'a@wortly-test.invalid', password: 'secret-1', options: { emailRedirectTo: REDIRECT_CALLBACK } });
  assert.equal(error, null);
  const signup = server.requests[0];
  assert.equal(signup.body.code_challenge_method, 's256');
  assert.ok(signup.body.code_challenge && signup.body.code_challenge.length >= 43);
  assert.equal(signup.query.redirect_to, REDIRECT_CALLBACK, 'Redirect URL listesindeki tam adres: sorgu parametresi eklenmez');
  const verifier = String(device.storage.pendingVerifier()).split('/')[0];
  assert.equal(challengeOf(verifier), signup.body.code_challenge);
  assert.equal(JSON.stringify(server.requests).includes(verifier), false, 'doğrulayıcı ağa hiç gönderilmez');
});

test('kayıt doğrulama (aynı cihaz): kod yerel doğrulayıcıyla değişir, oturum kurulur, doğrulayıcı tüketilir', async () => {
  const server = createFakeGoTrue();
  const device = createDevice(server);
  await device.client.auth.signUp({ email: 'a@wortly-test.invalid', password: 'secret-1', options: { emailRedirectTo: REDIRECT_CALLBACK } });
  const { code } = server.clickEmailLink('a@wortly-test.invalid');

  const { data, error } = await device.client.auth.exchangeCodeForSession(code);

  assert.equal(error, null);
  assert.equal(data.session.user.email, 'a@wortly-test.invalid');
  assert.equal(data.redirectType, null, 'kayıt doğrulaması: şifre ekranına yönlendirme yok');
  assert.equal(await sessionUser(device.client), 'user-a@wortly-test.invalid');
  assert.ok(device.events.includes('SIGNED_IN'));
  assert.equal(device.storage.pendingVerifier(), null, 'doğrulayıcı tek kullanımlık');
  const before = networkCalls(server);
  const again = await device.client.auth.exchangeCodeForSession(code);
  assert.ok(again.error, 'aynı kod ikinci kez değiştirilemez');
  assert.equal(networkCalls(server), before, 'doğrulayıcı olmadığından ağ çağrısı bile yapılmaz');
});

test('şifre sıfırlama (aynı cihaz): PKCE kodu PASSWORD_RECOVERY olayı ve redirectType=recovery ile oturum kurar', async () => {
  const server = createFakeGoTrue();
  const device = createDevice(server);
  const { error } = await device.client.auth.resetPasswordForEmail('a@wortly-test.invalid', { redirectTo: REDIRECT_RESET });
  assert.equal(error, null);
  const recover = server.requests.find((r) => r.path === '/auth/v1/recover');
  assert.equal(recover.body.code_challenge_method, 's256');
  assert.equal(recover.query.redirect_to, REDIRECT_RESET);
  const { code } = server.clickEmailLink('a@wortly-test.invalid');

  const { data, error: exchangeError } = await device.client.auth.exchangeCodeForSession(code);

  assert.equal(exchangeError, null);
  assert.equal(data.redirectType, 'recovery');
  assert.ok(device.events.includes('PASSWORD_RECOVERY'));
  assert.equal(await sessionUser(device.client), 'user-a@wortly-test.invalid');
});

test('SALDIRGAN kodu, cihazda bekleyen akış YOKKEN: doğrulayıcı bulunamaz, ağ çağrısı yapılmaz, açık oturum değişmez', async () => {
  const server = createFakeGoTrue();
  const device = createDevice(server);
  await device.client.auth.signUp({ email: 'victim@wortly-test.invalid', password: 'secret-1', options: { emailRedirectTo: REDIRECT_CALLBACK } });
  await device.client.auth.exchangeCodeForSession(server.clickEmailLink('victim@wortly-test.invalid').code);
  assert.equal(await sessionUser(device.client), 'user-victim@wortly-test.invalid');

  const before = networkCalls(server);
  const { data, error } = await device.client.auth.exchangeCodeForSession(server.attackerCode());

  assert.ok(error, 'saldırgan kodu reddedilmeli');
  assert.equal(error.name, 'AuthPKCECodeVerifierMissingError');
  assert.equal(data.session, null);
  assert.equal(networkCalls(server), before, 'sunucuya hiç gidilmedi');
  assert.equal(await sessionUser(device.client), 'user-victim@wortly-test.invalid', 'açık oturum değişmedi');
});

test('SALDIRGAN kodu, kullanıcının bekleyen akışı VARKEN: sunucu doğrulayıcı uyuşmazlığını reddeder, oturum değişmez', async () => {
  const server = createFakeGoTrue();
  const device = createDevice(server);
  await device.client.auth.signUp({ email: 'victim@wortly-test.invalid', password: 'secret-1', options: { emailRedirectTo: REDIRECT_CALLBACK } });
  await device.client.auth.exchangeCodeForSession(server.clickEmailLink('victim@wortly-test.invalid').code);
  await device.client.auth.resetPasswordForEmail('victim@wortly-test.invalid', { redirectTo: REDIRECT_RESET }); // bekleyen akış

  const { data, error } = await device.client.auth.exchangeCodeForSession(server.attackerCode());

  assert.ok(error, 'saldırganın kodu kullanıcının doğrulayıcısıyla eşleşmez');
  assert.equal(data.session, null);
  assert.equal(await sessionUser(device.client), 'user-victim@wortly-test.invalid', 'açık oturum değişmedi');
  assert.equal(device.events.includes('PASSWORD_RECOVERY'), false);
});

test('BİLİNEN SINIR (hizmet engelleme, veri sızıntısı değil): uyuşmayan kod, bekleyen akışın doğrulayıcısını tüketir; kullanıcı yeni bağlantı istemelidir', async () => {
  const server = createFakeGoTrue();
  const device = createDevice(server);
  await device.client.auth.resetPasswordForEmail('victim@wortly-test.invalid', { redirectTo: REDIRECT_RESET });
  const legit = server.clickEmailLink('victim@wortly-test.invalid');

  await device.client.auth.exchangeCodeForSession(server.attackerCode()); // kullanıcı saldırganın bağlantısına dokundu

  assert.equal(device.storage.pendingVerifier(), null, 'bekleyen doğrulayıcı tüketildi');
  const result = await device.client.auth.exchangeCodeForSession(legit.code);
  assert.ok(result.error, 'önceden istenen e-posta bağlantısı artık çalışmaz');
  assert.equal(await sessionUser(device.client), null);
  // Kurtarma: yeni istek yeni doğrulayıcı üretir ve akış yeniden çalışır.
  await device.client.auth.resetPasswordForEmail('victim@wortly-test.invalid', { redirectTo: REDIRECT_RESET });
  const retry = await device.client.auth.exchangeCodeForSession(server.clickEmailLink('victim@wortly-test.invalid').code);
  assert.equal(retry.error, null);
  assert.equal(retry.data.redirectType, 'recovery');
});

test('BAŞKA CİHAZ: doğrulayıcısı olmayan ikinci cihaz GEÇERLİ kodu da değiştiremez (oturum açılmaz, sunucuya gidilmez)', async () => {
  const server = createFakeGoTrue();
  const phone = createDevice(server);
  await phone.client.auth.signUp({ email: 'a@wortly-test.invalid', password: 'secret-1', options: { emailRedirectTo: REDIRECT_CALLBACK } });
  const { code } = server.clickEmailLink('a@wortly-test.invalid');

  const tablet = createDevice(server); // e-postanın açıldığı, akışın başlatılmadığı cihaz
  const before = networkCalls(server);
  const { data, error } = await tablet.client.auth.exchangeCodeForSession(code);

  assert.ok(error);
  assert.equal(error.name, 'AuthPKCECodeVerifierMissingError');
  assert.equal(data.session, null);
  assert.equal(networkCalls(server), before);
  assert.equal(await sessionUser(tablet.client), null);
  // Kodu isteği başlatan cihaz hâlâ kullanabilir (diğer cihazın denemesi kodu tüketmedi).
  const ok = await phone.client.auth.exchangeCodeForSession(code);
  assert.equal(ok.error, null);
});

test('birden çok bekleyen akış: sonuncusu geçerlidir (kayıt isteğinden sonra şifre sıfırlama istenirse eski kayıt bağlantısı çalışmaz)', async () => {
  const server = createFakeGoTrue();
  const device = createDevice(server);
  await device.client.auth.signUp({ email: 'a@wortly-test.invalid', password: 'secret-1', options: { emailRedirectTo: REDIRECT_CALLBACK } });
  const signupLink = server.clickEmailLink('a@wortly-test.invalid');
  await device.client.auth.resetPasswordForEmail('a@wortly-test.invalid', { redirectTo: REDIRECT_RESET });

  const stale = await device.client.auth.exchangeCodeForSession(signupLink.code);

  assert.ok(stale.error, 'eski akışın kodu, yeni akışın doğrulayıcısıyla eşleşmez');
  assert.equal(await sessionUser(device.client), null);
});

test('oturum kapatma bekleyen TÜM doğrulayıcıları temizler (hesap silme / çıkış sonrası eski akış kodu değiştirilemez)', async () => {
  const server = createFakeGoTrue();
  const device = createDevice(server);
  await device.client.auth.signUp({ email: 'a@wortly-test.invalid', password: 'secret-1', options: { emailRedirectTo: REDIRECT_CALLBACK } });
  await device.client.auth.resetPasswordForEmail('a@wortly-test.invalid', { redirectTo: REDIRECT_RESET });
  assert.ok(device.storage.verifierKeys().length > 0, 'bekleyen akışlar var (kod değişimi yuva anahtarlarını geride bırakabilir)');

  await device.client.auth.signOut({ scope: 'local' });

  assert.deepEqual(device.storage.verifierKeys(), []);
});

test('KÖK NEDEN KANITI: açık oturum A iken B\'nin sıfırlama kodu değişmezse, updateUser A\'nın şifresini değiştirir (kütüphane oturumu seçer, uygulama doğrulamalıdır)', async () => {
  const server = createFakeGoTrue();
  // Cihazda A (ör. gerçek hesap) açık.
  const device = createDevice(server);
  await device.client.auth.signUp({ email: 'a@wortly-test.invalid', password: 'secret-1', options: { emailRedirectTo: REDIRECT_CALLBACK } });
  await device.client.auth.exchangeCodeForSession(server.clickEmailLink('a@wortly-test.invalid').code);
  assert.equal(await sessionUser(device.client), 'user-a@wortly-test.invalid');
  // B'nin sıfırlaması BAŞKA yerde başlatıldı (ya da kod bir tarayıcıda harcandı): bu cihazda doğrulayıcı yok.
  const other = createDevice(server);
  await other.client.auth.resetPasswordForEmail('b@wortly-test.invalid', { redirectTo: REDIRECT_RESET });
  const { code } = server.clickEmailLink('b@wortly-test.invalid');

  const exchange = await device.client.auth.exchangeCodeForSession(code);
  assert.ok(exchange.error, 'B\'nin kodu bu cihazda değiştirilemez');
  assert.equal(await sessionUser(device.client), 'user-a@wortly-test.invalid', 'oturum hâlâ A');

  // Ekran bunu doğrulamadan "Şifreyi Güncelle" derse:
  const update = await device.client.auth.updateUser({ password: 'new-password-1' });
  assert.equal(update.error, null);
  assert.deepEqual(server.passwordChanges, ['a@wortly-test.invalid'], 'şifre B\'nin DEĞİL, açık oturum A\'nın hesabında değişti (olayın kendisi)');
});
