// Şifre sıfırlama kapısı: yeni şifre YALNIZCA bu cihazda doğrulanmış sıfırlama oturumunun hesabına uygulanır.
// @utils: recovery-gate
//
// Olay (Staging, 2026-11-16/17): sıfırlama e-postası hotmail test hesabına gitti ama uygulamada açık olan oturum gmail
// hesabınındı. Sıfırlama bağlantısı hiç değiştirilmedi (kod bir tarayıcıda harcandı); ekran yine de açıldı ve
// `updateUser({ password })` AÇIK OTURUMUN hesabına (gmail) uygulandı. Kök neden: ekran, sıfırlama oturumunu doğrulamıyordu.
// Düzeltme: store `recoveryStatus/recoveryUserId` tutar; ekran yalnızca durum 'ready' ve oturum == sıfırlama hesabı ise formu
// gösterir. Gerçek Supabase'e bağlanılmaz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createWorld } = require('./support/store-harness');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const G = require(path.join(out, 'utils', 'recovery-gate.js'));
const ROOT = path.resolve(__dirname, '..');

const GMAIL = 'gmail-user-id';
const HOTMAIL = 'hotmail-user-id';

// ─── Saf mantık ───────────────────────────────────────────────────────────────────────────────────────────────

test('kapı: yalnızca durum "ready" ve oturum == sıfırlama hesabı ise form açılır', () => {
  const gate = (o) => G.resetGate({ sessionUserId: GMAIL, recoveryUserId: GMAIL, status: 'ready', waited: true, ...o });
  assert.equal(gate({}), 'ready');
  assert.equal(gate({ sessionUserId: GMAIL, recoveryUserId: HOTMAIL }), 'blocked', 'oturum başka hesabın: ENGELLE (olayın kendisi)');
  assert.equal(gate({ recoveryUserId: null }), 'blocked');
  assert.equal(gate({ sessionUserId: null }), 'blocked', 'oturum yok');
  assert.equal(gate({ status: 'none' }), 'blocked', 'sıfırlama doğrulanmadı');
  assert.equal(gate({ status: 'failed' }), 'blocked', 'kod değişimi başarısız');
});

test('kapı: doğrulama sürerken ve ilk bekleme süresinde "doğrulanıyor" gösterilir (yanlış engel mesajı çıkmaz)', () => {
  assert.equal(G.resetGate({ sessionUserId: GMAIL, recoveryUserId: null, status: 'verifying', waited: false }), 'verifying');
  assert.equal(G.resetGate({ sessionUserId: GMAIL, recoveryUserId: null, status: 'verifying', waited: true }), 'verifying');
  assert.equal(G.resetGate({ sessionUserId: GMAIL, recoveryUserId: null, status: 'none', waited: false }), 'verifying', 'bağlantı henüz işlenmemiş olabilir');
  assert.equal(G.resetGate({ sessionUserId: GMAIL, recoveryUserId: null, status: 'none', waited: true }), 'blocked');
});

test('e-posta maskeleme: hangi hesabın sıfırlandığı görünür ama tam adres gösterilmez', () => {
  assert.equal(G.maskEmail('bugra_55_nn_55@hotmail.com'), 'bu***@hotmail.com');
  assert.equal(G.maskEmail('a@b.co'), 'a***@b.co');
  assert.equal(G.maskEmail(''), '');
  assert.equal(G.maskEmail(null), '');
  assert.equal(G.maskEmail('bozuk'), '');
});

// ─── GERÇEK auth mağazası ─────────────────────────────────────────────────────────────────────────────────────

const calls = { exchange: [], replace: [] };
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

const CODE = '34e770dd-9ff9-416c-87fa-43b31d7ef225';
const session = (id) => ({ user: { id, email: `${id}@x.test` } });

/** exchange: kod → { data, error }. `listener` auth olaylarını (PASSWORD_RECOVERY vb.) tetiklemek için döner. */
function bootAuth({ existing = null, exchange } = {}) {
  calls.exchange.length = 0; calls.replace.length = 0;
  const world = createWorld();
  world.boot();
  let listener = null;
  world.supabase.auth.exchangeCodeForSession = async (code) => { calls.exchange.push(code); return exchange(code); };
  world.supabase.auth.onAuthStateChange = (callback) => { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; };
  world.supabase.auth.signInWithPassword = async () => ({ data: { session: session('signed-in-user') }, error: null });
  world.supabase.auth.signOut = async () => ({ error: null });
  // Cihazda zaten açık oturum varsa `initialize()` onu geri yükler (gerçek istemcinin AsyncStorage oturumu gibi).
  world.supabase.auth.getSession = async () => ({ data: { session: existing ? session(existing) : null }, error: null });
  const { useAuthStore } = require(path.join(ROOT, 'store', 'auth.ts'));
  if (existing) useAuthStore.setState({ session: session(existing) });
  const state = () => useAuthStore.getState();
  const gate = (waited = true) => G.resetGate({
    sessionUserId: state().session?.user.id, recoveryUserId: state().recoveryUserId, status: state().recoveryStatus, waited,
  });
  return { auth: useAuthStore, state, gate, emit: (event, s) => listener?.(event, s), world };
}

const ok = (id, redirectType) => async () => ({ data: { session: session(id), redirectType }, error: null });
const failing = async () => ({ data: { session: null, user: null, redirectType: null }, error: { name: 'AuthPKCECodeVerifierMissingError', message: 'PKCE code verifier not found in storage.' } });

test('OLAY: açık oturum gmail iken hotmail sıfırlama kodu DEĞİŞTİRİLEMEZSE form açılmaz (gmail şifresi değiştirilemez)', async () => {
  const t = bootAuth({ existing: GMAIL, exchange: failing });
  await t.state().initialize();
  assert.equal(await t.state().handleAuthUrl(`wortly://auth/reset?code=${CODE}`), false);
  assert.equal(t.state().session.user.id, GMAIL, 'açık oturum değişmedi');
  assert.equal(t.state().recoveryUserId, null);
  assert.equal(t.state().recoveryStatus, 'failed');
  assert.equal(t.gate(), 'blocked', 'şifre güncelleme formu açılmamalı');
});

test('düz "wortly://auth/reset" (kodsuz) bağlantısı açık oturumun şifresini değiştirme yolu AÇMAZ', async () => {
  const t = bootAuth({ existing: GMAIL, exchange: ok('x') });
  await t.state().initialize();
  assert.equal(await t.state().handleAuthUrl('wortly://auth/reset'), false);
  assert.equal(t.gate(false), 'verifying', 'ilk anda bağlantı işleniyor olabilir');
  assert.equal(t.gate(true), 'blocked', 'bekleme sonrası engellenir');
  assert.deepEqual(calls.exchange, []);
});

test('geçerli sıfırlama: kod değişir, oturum HOTMAIL hesabına geçer ve form yalnızca o hesap için açılır', async () => {
  const t = bootAuth({ existing: GMAIL, exchange: ok(HOTMAIL, 'recovery') });
  await t.state().initialize();
  const pending = t.state().handleAuthUrl(`wortly://auth/reset?code=${CODE}`);
  assert.equal(t.state().recoveryStatus, 'verifying', 'değişim sürerken "doğrulanıyor"');
  assert.equal(t.gate(), 'verifying');
  assert.equal(await pending, true);
  assert.equal(t.state().session.user.id, HOTMAIL);
  assert.equal(t.state().recoveryUserId, HOTMAIL);
  assert.equal(t.gate(), 'ready');
  assert.deepEqual(calls.replace, [], 'store anlık yönlendirme YAPMAZ: koruma güncellenmeden yapılan yönlendirme ana ekrana düşerdi');
});

test('sıfırlama yolundan gelen ama "recovery" olmayan kod (ör. kayıt kodu) şifre formunu AÇMAZ', async () => {
  const t = bootAuth({ existing: GMAIL, exchange: ok(HOTMAIL, null) });
  await t.state().initialize();
  await t.state().handleAuthUrl(`wortly://auth/reset?code=${CODE}`);
  assert.equal(t.state().recoveryStatus, 'failed');
  assert.equal(t.gate(), 'blocked');
});

test('kayıt doğrulama kodu (auth/callback) şifre sıfırlama durumuna dokunmaz', async () => {
  const t = bootAuth({ exchange: ok(HOTMAIL, null) });
  await t.state().initialize();
  assert.equal(await t.state().handleAuthUrl(`wortly://auth/callback?code=${CODE}`), true);
  assert.equal(t.state().recoveryStatus, 'none');
  assert.equal(t.state().recoveryUserId, null);
  assert.equal(t.gate(), 'blocked');
});

test('sıfırlama durumu başka hesaba geçince/çıkışta/yeni girişte TEMİZLENİR (eski sıfırlama yetkisi başka hesaba uygulanmaz)', async () => {
  // Başka hesabın oturumu açılırsa (SIGNED_IN) sıfırlama yetkisi düşer.
  let t = bootAuth({ exchange: ok(HOTMAIL, 'recovery') });
  await t.state().initialize();
  await t.state().handleAuthUrl(`wortly://auth/reset?code=${CODE}`);
  assert.equal(t.gate(), 'ready');
  t.emit('SIGNED_IN', session(GMAIL));
  assert.equal(t.state().session.user.id, GMAIL);
  assert.equal(t.gate(), 'blocked', 'oturum gmail oldu: hotmail sıfırlama yetkisi geçersiz');

  // Aynı hesabın jeton yenilemesi yetkiyi KORUR.
  t = bootAuth({ exchange: ok(HOTMAIL, 'recovery') });
  await t.state().initialize();
  await t.state().handleAuthUrl(`wortly://auth/reset?code=${CODE}`);
  t.emit('TOKEN_REFRESHED', session(HOTMAIL));
  assert.equal(t.gate(), 'ready');

  // Çıkış olayı yetkiyi siler.
  t.emit('SIGNED_OUT', null);
  assert.equal(t.state().session, null);
  assert.equal(t.gate(), 'blocked');

  // Parolayla yeni giriş yetkiyi siler.
  t = bootAuth({ exchange: ok(HOTMAIL, 'recovery') });
  await t.state().initialize();
  await t.state().handleAuthUrl(`wortly://auth/reset?code=${CODE}`);
  await t.state().signIn('a@b.co', 'x');
  assert.equal(t.state().recoveryUserId, null);
  assert.equal(t.gate(), 'blocked');
});

test('PASSWORD_RECOVERY olayı (kütüphane) yetkiyi OLAYI TAŞIYAN oturumun hesabına bağlar', async () => {
  const t = bootAuth({ existing: GMAIL, exchange: failing });
  await t.state().initialize();
  t.emit('PASSWORD_RECOVERY', session(HOTMAIL));
  assert.equal(t.state().session.user.id, HOTMAIL);
  assert.equal(t.state().recoveryUserId, HOTMAIL);
  assert.equal(t.state().recoveryStatus, 'ready');
  assert.equal(t.gate(), 'ready');
});

test('şifre güncelleme tamamlanınca sıfırlama yetkisi tüketilir (aynı ekran ikinci kez şifre değiştiremez)', async () => {
  const t = bootAuth({ exchange: ok(HOTMAIL, 'recovery') });
  await t.state().initialize();
  await t.state().handleAuthUrl(`wortly://auth/reset?code=${CODE}`);
  assert.equal(t.gate(), 'ready');
  t.state().finishRecovery();
  assert.equal(t.state().recoveryUserId, null);
  assert.equal(t.state().recoveryStatus, 'none');
  assert.equal(t.gate(), 'blocked');
});

// ─── Ekran bağlantısı (statik) ────────────────────────────────────────────────────────────────────────────────

test('ekran: şifre formu kapıdan geçmeden gösterilmez, updateUser kapı kontrolünden SONRA ve yalnızca "ready" iken çağrılır', () => {
  const src = fs.readFileSync(path.join(ROOT, 'app', 'auth', 'reset.tsx'), 'utf8');
  assert.match(src, /resetGate\(/);
  assert.match(src, /maskEmail\(/, 'hangi hesabın sıfırlandığı gösterilir');
  const submit = src.slice(src.indexOf('const handleSubmit'), src.indexOf('return (', src.indexOf('const handleSubmit')));
  assert.ok(submit.indexOf("gate !== 'ready'") !== -1 && submit.indexOf("gate !== 'ready'") < submit.indexOf('updateUser('), 'kapı, updateUser öncesinde denetlenir');
  assert.match(submit, /finishRecovery\(\)/);
  // Form (PasswordField) yalnızca kapı "ready" iken render edilir: engel/doğrulanıyor dalları önce döner.
  const render = src.slice(src.indexOf('return (', src.indexOf('const handleSubmit')));
  assert.ok(src.indexOf("gate === 'blocked'") !== -1 && src.indexOf("gate === 'verifying'") !== -1);
  assert.ok(src.indexOf("gate === 'blocked'") < src.indexOf('<PasswordField'), 'engel dalı formdan önce gelir');
  assert.ok(src.indexOf("gate === 'verifying'") < src.indexOf('<PasswordField'), 'doğrulanıyor dalı formdan önce gelir');
  assert.ok(render.includes('<PasswordField'));
});

test('yönlendirme: auth/reset, oturum ve Stack.Protected güncellendikten SONRA _layout efektiyle açılır; store anlık router.replace kullanmaz', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'app', '_layout.tsx'), 'utf8');
  assert.match(layout, /state\.recoveryStatus === 'ready' && !!state\.session && state\.recoveryUserId === state\.session\.user\.id/);
  const effect = layout.slice(layout.indexOf('if (recoveryReady)'), layout.indexOf('if (recoveryReady)') + 90);
  assert.match(effect, /router\.replace\('\/auth\/reset'/);
  assert.match(layout, /<Stack\.Protected guard=\{!!session\?\.user\.id\}>[\s\S]*name="auth\/reset"/, 'auth/reset yalnızca oturumlu grupta');
  const store = fs.readFileSync(path.join(ROOT, 'store', 'auth.ts'), 'utf8');
  assert.doesNotMatch(store, /router\.replace/, 'store anlık yönlendirme yapmamalı');
});
