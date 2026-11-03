// Ortak backend (TEST MODU): bağlantı kararı, hesap kapısı, doğrulayıcı yarışları ve uygulamaya bağlantı (kaynak taraması).
// @utils: env-safety, shared-backend, latest-guard
//
// Gerçek Supabase'e HİÇ bağlanılmaz; sahte kimlikler kullanılır. Hesap kapısı İSTEMCİ TARAFLI bir emniyet önlemidir; gerçek güvenlik
// sınırı Supabase Auth/RLS'tir. Kapsam DIŞI (cihazda denenmeli): şeridin görünümü, gerçek getUser ağ çağrısı, Expo Go akışı.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const E = require(path.join(out, 'utils', 'env-safety.js'));
const S = require(path.join(out, 'utils', 'shared-backend.js'));
const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

const PROD = 'fakeprodref01';
const PROD_URL = `https://${PROD}.supabase.co`;
const OTHER_URL = 'https://fakeotherref2.supabase.co';
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const ID_REAL = '99999999-9999-4999-8999-999999999999';
const PHRASE = E.SHARED_BACKEND_PHRASE;

// Varsayılan: Expo Go geliştirmesi (isDev, profil yok), production adresi, dürüst production işareti, tam izin, izinli hesap.
const shared = (extra = {}) => ({
  isDev: true, buildProfile: undefined, easProfile: undefined, url: PROD_URL, hasKey: true,
  appEnv: 'production', productionRefs: PROD, sharedBackend: PHRASE, allowedUserIds: ID_A, ...extra,
});

// ─── Bağlantı kararı ────────────────────────────────────────────────────────────────────────
test('varsayılan geliştirme + production → ENGEL (izin anahtarı yoksa)', () => {
  for (const sharedBackend of [undefined, null, '', 0]) {
    const verdict = E.evaluateConnection(shared({ sharedBackend }));
    assert.equal(verdict.allow, false);
    assert.equal(verdict.reason, 'is-production');
  }
});

test('açık izin + doğru production kimliği + dürüst işaret + izinli hesap → YALNIZCA geliştirmede izin', () => {
  const verdict = E.evaluateConnection(shared());
  assert.equal(verdict.allow, true);
  assert.equal(verdict.mode, 'dev-shared-production');
  assert.equal(verdict.sharedBackend, true);
  // EAS development client de geliştirmedir.
  assert.equal(E.evaluateConnection(shared({ easProfile: 'development' })).allow, true);
});

test('Preview + açık izin → ENGEL (release modunda da, geliştirme modunda preview profiliyle de)', () => {
  assert.equal(E.evaluateConnection(shared({ isDev: false, easProfile: 'preview' })).reason, 'shared-backend-invalid');
  assert.equal(E.evaluateConnection(shared({ isDev: false, buildProfile: 'preview' })).reason, 'shared-backend-invalid');
  assert.equal(E.evaluateConnection(shared({ isDev: true, easProfile: 'preview' })).reason, 'shared-backend-invalid');
  assert.equal(E.evaluateConnection(shared({ isDev: false, easProfile: 'qa' })).reason, 'shared-backend-invalid');
});

test('Production build + izin anahtarı → geliştirme modu ETKİNLEŞMEZ (yayın normal yolundan izinli, ortak mod kapalı)', () => {
  const verdict = E.evaluateConnection(shared({ isDev: false, easProfile: 'production', buildProfile: 'production' }));
  assert.equal(verdict.allow, true);
  assert.equal(verdict.mode, 'release');
  assert.equal(verdict.sharedBackend, undefined);
  const noProfile = E.evaluateConnection(shared({ isDev: false }));
  assert.equal(noProfile.mode, 'release');
  assert.equal(noProfile.sharedBackend, undefined);
  // Geliştirmede "production" profili iddiası da modu açmaz.
  assert.equal(E.evaluateConnection(shared({ easProfile: 'production' })).reason, 'shared-backend-invalid');
});

test('yanlış proje kimliği: ortak mod açılmaz; normal (staging) kurallar işler', () => {
  // Listede olmayan proje + production işareti → "marked-production" engeli; staging işaretiyle normal staging izni (ortak mod DEĞİL).
  assert.equal(E.evaluateConnection(shared({ url: OTHER_URL })).reason, 'marked-production');
  const staging = E.evaluateConnection(shared({ url: OTHER_URL, appEnv: 'staging' }));
  assert.equal(staging.allow, true);
  assert.equal(staging.sharedBackend, undefined);
  // Kimlik listesi boş → karşılaştırılamaz.
  assert.equal(E.evaluateConnection(shared({ productionRefs: '' })).reason, 'production-unknown');
});

test('staging işareti ile production bağlantısı GİZLENEMEZ; işaret yoksa da engel', () => {
  for (const appEnv of ['staging', 'local', undefined, '', 'test']) {
    const verdict = E.evaluateConnection(shared({ appEnv }));
    assert.equal(verdict.allow, false, String(appEnv));
    assert.equal(verdict.reason, 'shared-backend-invalid');
  }
});

test('izin metni TAM eşleşmeli: küçük harf, boşluk, kısmi veya metin olmayan değerler reddedilir', () => {
  for (const sharedBackend of [PHRASE.toLowerCase(), PHRASE + ' ', ' ' + PHRASE, 'true', '1', 'yes', PHRASE.slice(0, -1), true, 1, {}]) {
    const verdict = E.evaluateConnection(shared({ sharedBackend }));
    assert.equal(verdict.allow, false, String(sharedBackend));
    // Metin olmayan değer 'verilmemiş' sayılır (is-production); yanlış metin 'geçersiz' sayılır. İkisi de ENGELDİR.
    assert.ok(['shared-backend-invalid', 'is-production'].includes(verdict.reason), verdict.reason);
  }
});

test('izinli hesap tanımlı değilse (boş/geçersiz kimlik) ortak mod açılmaz', () => {
  for (const allowedUserIds of [undefined, '', 'a@b.invalid', 'abc', '1234']) {
    const verdict = E.evaluateConnection(shared({ allowedUserIds }));
    assert.equal(verdict.allow, false);
    assert.equal(verdict.reason, 'shared-backend-no-accounts');
  }
});

test('geçersiz bağlantı bilgileri hâlâ engellenir (ortak modda da)', () => {
  assert.equal(E.evaluateConnection(shared({ url: undefined })).reason, 'missing-config');
  assert.equal(E.evaluateConnection(shared({ hasKey: false })).reason, 'missing-config');
  assert.equal(E.evaluateConnection(shared({ url: 'https://example.com' })).reason, 'invalid-url');
});

test('engel mesajları adres, anahtar, kimlik veya izin metni içermez', () => {
  for (const reason of ['shared-backend-invalid', 'shared-backend-no-accounts']) {
    assert.doesNotMatch(E.blockMessage(reason), /supabase\.co|https?:|sb_|eyJ|I-UNDERSTAND|[0-9a-f]{8}-[0-9a-f]{4}-/i);
  }
});

// ─── Hesap kapısı ─────────────────────────────────────────────────────────────────────────────
const gate = (extra = {}) => S.evaluateAccountGate({
  sharedMode: true, authLoaded: true, sessionUserId: ID_A, verification: { status: 'ok', serverUserId: ID_A }, allowedUserIds: [ID_A], ...extra,
});

test('ortak mod kapalıyken kapı her zaman açık (normal uygulama etkilenmez)', () => {
  assert.equal(gate({ sharedMode: false, verification: { status: 'pending' }, allowedUserIds: [] }), 'open');
});

test('oturum yüklenmeden veri akışı başlamaz; oturum yoksa yalnızca giriş ekranı (açık)', () => {
  assert.equal(gate({ authLoaded: false }), 'initializing');
  assert.equal(gate({ sessionUserId: null }), 'open');
  assert.equal(gate({ sessionUserId: '' }), 'open');
});

test('girişten önce/doğrulama sürerken veri erişimi KAPALI: bekleme, hata ve belirsiz durumlar asla "open" değildir', () => {
  assert.equal(gate({ verification: { status: 'pending' } }), 'verifying');
  assert.equal(gate({ verification: { status: 'error' } }), 'unverifiable');
});

test('izinli hesap → açık; izin listesinde olmayan hesap → reddedilir; boş liste → reddedilir (fail-closed)', () => {
  assert.equal(gate(), 'open');
  assert.equal(gate({ sessionUserId: ID_REAL, verification: { status: 'ok', serverUserId: ID_REAL } }), 'denied');
  assert.equal(gate({ allowedUserIds: [] }), 'denied');
  assert.equal(gate({ sessionUserId: ID_A.toUpperCase(), verification: { status: 'ok', serverUserId: ID_A } }), 'open', 'büyük/küçük harf duyarsız');
});

test('sunucu başka kullanıcı diyorsa (yerel oturum ile sunucu kimliği uyuşmuyor) izinli listede olsa bile REDDEDİLİR', () => {
  assert.equal(gate({ sessionUserId: ID_A, verification: { status: 'ok', serverUserId: ID_B }, allowedUserIds: [ID_A, ID_B] }), 'denied');
  assert.equal(gate({ verification: { status: 'ok', serverUserId: '' } }), 'denied');
});

test('MÜLK: oturum varken kapı yalnızca "sunucu doğruladı VE izinli" ise açılır (tüm durum kombinasyonları)', () => {
  const verifications = [{ status: 'pending' }, { status: 'error' }, { status: 'ok', serverUserId: ID_A }, { status: 'ok', serverUserId: ID_B }, { status: 'ok', serverUserId: ID_REAL }];
  for (const verification of verifications) {
    for (const sessionUserId of [ID_A, ID_B, ID_REAL]) {
      for (const allowedUserIds of [[], [ID_A], [ID_A, ID_B]]) {
        const result = gate({ sessionUserId, verification, allowedUserIds });
        if (result === 'open') {
          assert.equal(verification.status, 'ok');
          assert.equal(verification.serverUserId, sessionUserId);
          assert.ok(allowedUserIds.includes(sessionUserId));
        }
      }
    }
  }
});

test('izin kimlikleri ayrıştırma: yalnızca UUID, tekilleştirilir; e-posta kabul edilmez', () => {
  assert.deepEqual(S.parseAllowedUserIds(`${ID_A.toUpperCase()}, ${ID_B};${ID_A}`), [ID_A, ID_B]);
  assert.deepEqual(S.parseAllowedUserIds('test@example.invalid, 123, '), []);
  assert.deepEqual(S.parseAllowedUserIds(undefined), []);
});

// ─── Doğrulayıcı: gecikmiş yanıtlar ve hesap değişimi ───────────────────────────────────────────
function deferred() {
  let resolve; const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('doğrulayıcı: sunucunun kimliğini iletir; hata ve istisna "error" olur', async () => {
  const seen = [];
  const ok = S.createAccountVerifier(async () => ({ data: { user: { id: ID_A } }, error: null }), (id, v) => seen.push([id, v]));
  await ok.verify(ID_A);
  const failing = S.createAccountVerifier(async () => ({ data: { user: null }, error: { message: 'x' } }), (id, v) => seen.push([id, v]));
  await failing.verify(ID_A);
  const rejecting = S.createAccountVerifier(() => Promise.reject(new Error('ağ')), (id, v) => seen.push([id, v]));
  await rejecting.verify(ID_A);
  const throwing = S.createAccountVerifier(() => { throw new Error('senkron'); }, (id, v) => seen.push([id, v]));
  await throwing.verify(ID_A);
  assert.deepEqual(seen.map(item => item[1].status), ['ok', 'error', 'error', 'error']);
  assert.equal(seen[0][1].serverUserId, ID_A);
});

test('A→B geçişi: A için geç gelen yanıt UYGULANMAZ; yalnızca B\'nin sonucu kalır (izin kontrolü atlanamaz)', async () => {
  const slowA = deferred();
  const fastB = deferred();
  const queue = [slowA.promise, fastB.promise];
  const results = [];
  const verifier = S.createAccountVerifier(() => queue.shift(), (id, v) => results.push([id, v]));
  const pendingA = verifier.verify(ID_A);        // A için doğrulama başladı (yavaş)
  const pendingB = verifier.verify(ID_B);        // kullanıcı B'ye geçti
  fastB.resolve({ data: { user: { id: ID_B } }, error: null });
  slowA.resolve({ data: { user: { id: ID_A } }, error: null });   // A'nın yanıtı B'den SONRA geldi
  await Promise.all([pendingA, pendingB]);
  assert.deepEqual(results, [[ID_B, { status: 'ok', serverUserId: ID_B }]]);
});

test('A→B→A: her geçişte yalnızca en son isteğin sonucu geçerli; çıkıştan sonra (cancel) hiçbir sonuç uygulanmaz', async () => {
  const gates = [deferred(), deferred(), deferred()];
  const results = [];
  const verifier = S.createAccountVerifier(() => gates.shift().promise, (id, v) => results.push(id));
  const first = [];
  gates.forEach((g, i) => first.push(g));
  const p1 = verifier.verify(ID_A);
  const p2 = verifier.verify(ID_B);
  const p3 = verifier.verify(ID_A);
  first[2].resolve({ data: { user: { id: ID_A } }, error: null });
  first[0].resolve({ data: { user: { id: ID_A } }, error: null });
  first[1].resolve({ data: { user: { id: ID_B } }, error: null });
  await Promise.all([p1, p2, p3]);
  assert.deepEqual(results, [ID_A], 'yalnızca son A isteği uygulandı');

  const late = deferred();
  const cancelled = [];
  const v2 = S.createAccountVerifier(() => late.promise, (id) => cancelled.push(id));
  const pending = v2.verify(ID_A);
  v2.cancel();                                    // çıkış
  late.resolve({ data: { user: { id: ID_A } }, error: null });
  await pending;
  assert.deepEqual(cancelled, [], 'iptal edilen doğrulama sonucu uygulanmaz');
});

// ─── Uygulamaya bağlantı (kaynak taraması; çalışma zamanı davranışı Expo Go'da denenmeli) ─────────────
test('kayıt (sign-up) ve şifre sıfırlama e-postası ortak backend modunda Supabase\'e hiç istek göndermeden reddedilir', () => {
  const auth = read('store', 'auth.ts');
  const signUp = auth.slice(auth.indexOf('signUp: async'), auth.indexOf('resetPasswordForEmail: async'));
  assert.ok(signUp.indexOf('isSharedBackendMode') > 0 && signUp.indexOf('isSharedBackendMode') < signUp.indexOf('supabase.auth.signUp'));
  const reset = auth.slice(auth.indexOf('resetPasswordForEmail: async'), auth.indexOf('handleAuthUrl: async'));
  assert.ok(reset.indexOf('isSharedBackendMode') > 0 && reset.indexOf('isSharedBackendMode') < reset.indexOf('supabase.auth.resetPasswordForEmail'));
});

test('kök yerleşim: ortak modda AppRoot yalnızca hesap kapısının içinde ve uyarı şeridiyle render edilir', () => {
  const layout = read('app', '_layout.tsx');
  const root = layout.slice(layout.indexOf('export default function RootLayout'));
  assert.match(root, /if \(isSharedBackendMode\) \{[\s\S]*<SharedBackendFrame>[\s\S]*<SharedBackendGate[\s\S]*<AppRoot \/>[\s\S]*<\/SharedBackendGate>[\s\S]*<\/SharedBackendFrame>/);
  assert.ok(root.indexOf('isSharedBackendMode') > root.indexOf('connectionVerdict.allow'), 'bağlantı engeli kapıdan önce');
});

test('hesap kapısı veri akışı başlatmaz: mağaza yükleme/senkron/bildirim işlevlerini içermez; ekranlar kimlik/e-posta göstermez', () => {
  const source = read('components', 'shared-backend-gate.tsx');
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /loadWords|loadProfile|loadSessions|syncWords|syncProfile|syncSessions|replanReminders|useReminderSync|subscribeToNotificationResponses/);
  assert.doesNotMatch(source, /console\.|session\?\.user\?\.email|\.email\b/);
  assert.match(source, /TEST MODU — ORTAK VERİTABANI/);
  assert.match(source, /İSTEMCİ TARAFLI/);
  // Çıkış yerel veriyi silmez (mağaza sıfırlama/wipe çağrısı yok).
  assert.doesNotMatch(source, /resetLocal|wipeLocal|clearPronunciation/);
});

test('ortam değişkenleri ve anahtarlar hiçbir yerde loglanmaz; izin varsayılan olarak KAPALI (.env.example boş)', () => {
  for (const file of ['utils/supabase.ts', 'utils/env-safety.ts', 'utils/shared-backend.ts', 'components/shared-backend-gate.tsx', 'components/connection-blocked-screen.tsx']) {
    const code = read(...file.split('/')).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /console\.(log|info|debug|error)\(/, file);
  }
  const supabase = read('utils', 'supabase.ts');
  assert.doesNotMatch(supabase, /console\.warn\([^)]*(supabaseUrl|supabasePublishableKey|process\.env)/);
  const example = read('.env.example');
  assert.match(example, /^EXPO_PUBLIC_DEV_SHARED_BACKEND=\s*$/m);
  assert.match(example, /^EXPO_PUBLIC_DEV_ALLOWED_USER_IDS=\s*$/m);
});

test('öğrenme senkronu bayrağı bu modda otomatik açılmaz', () => {
  const source = read('utils', 'supabase.ts') + read('utils', 'env-safety.ts') + read('components', 'shared-backend-gate.tsx');
  assert.doesNotMatch(source, /LEARNING_SYNC|setLearningSyncOverride/);
});
