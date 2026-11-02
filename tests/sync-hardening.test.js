// Staging güvenliği, taşıyıcı sorguları, senkron sıralayıcı ve kimlik ayrımı için testler.
// @utils: learning-sync, learning-transports, sync-serializer, progress-stats
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const load = (name) => require(path.join(out, 'utils', `${name}.js`));

const guard = require('../supabase/tests/staging-guard');
const sync = load('learning-sync');
const { createProgressTransport, createScenarioTransport } = load('learning-transports');
const { createSyncSerializer } = load('sync-serializer');
const stats = load('progress-stats');

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const GOOD_ENV = {
  STAGING_URL: 'https://abcdefghijklmnop.supabase.co',
  STAGING_PROJECT_REF: 'abcdefghijklmnop',
  STAGING_ANON_KEY: 'sb_publishable_test_key_1234567890',
  STAGING_SERVICE_ROLE_KEY: 'sb_secret_test_key_1234567890',
  STAGING_CONFIRM: 'EVET-BU-URETIM-DEGIL',
};
const PROD = ['https://prodprojectref12345.supabase.co'];

// ─── Staging güvenlik kontrolü ──────────────────────────────────────────────

test('güvenli ortam kabul edilir', () => {
  const result = guard.assertSafeStagingEnv(GOOD_ENV, { productionUrls: PROD });
  assert.equal(result.ref, 'abcdefghijklmnop');
});

test('eksik değişken (açıkça tanımlı test projesi şart) reddedilir', () => {
  for (const name of Object.keys(GOOD_ENV)) {
    const env = { ...GOOD_ENV };
    delete env[name];
    assert.throws(() => guard.assertSafeStagingEnv(env, { productionUrls: PROD }), new RegExp(name));
  }
});

test('onay değeri yanlışsa reddedilir', () => {
  assert.throws(() => guard.assertSafeStagingEnv({ ...GOOD_ENV, STAGING_CONFIRM: 'evet' }), /STAGING_CONFIRM/);
});

test('üretim adresi (büyük/küçük harf, sondaki eğik çizgi fark etmez) reddedilir', () => {
  const env = { ...GOOD_ENV, STAGING_URL: 'https://PRODPROJECTREF12345.supabase.co/', STAGING_PROJECT_REF: 'prodprojectref12345' };
  assert.throws(() => guard.assertSafeStagingEnv(env, { productionUrls: PROD }), /üretim projesiyle aynı/);
});

test('proje referansı URL ile uyuşmazsa reddedilir', () => {
  assert.throws(() => guard.assertSafeStagingEnv({ ...GOOD_ENV, STAGING_PROJECT_REF: 'baska' }), /eşleşmiyor/);
});

test('geçersiz/yanlış adresler reddedilir (http, başka alan adı, ref yok)', () => {
  for (const url of ['http://abcdefghijklmnop.supabase.co', 'https://example.com', 'abcdefghijklmnop', 'https://supabase.co']) {
    assert.throws(
      () => guard.assertSafeStagingEnv({ ...GOOD_ENV, STAGING_URL: url }),
      /geçerli bir Supabase proje adresi/,
      url,
    );
  }
});

test('yerel Supabase yığını (localhost) test projesi olarak kabul edilir', () => {
  const env = { ...GOOD_ENV, STAGING_URL: 'http://127.0.0.1:54321', STAGING_PROJECT_REF: 'local' };
  assert.equal(guard.assertSafeStagingEnv(env, { productionUrls: PROD }).ref, 'local');
});

test('anahtar türleri karışırsa reddedilir (secret anon yerine, publishable service yerine, aynı anahtar)', () => {
  assert.throws(() => guard.assertSafeStagingEnv({ ...GOOD_ENV, STAGING_ANON_KEY: 'sb_secret_x' }), /gizli/);
  assert.throws(() => guard.assertSafeStagingEnv({ ...GOOD_ENV, STAGING_SERVICE_ROLE_KEY: 'sb_publishable_x' }), /publishable/);
  assert.throws(() => guard.assertSafeStagingEnv({ ...GOOD_ENV, STAGING_ANON_KEY: 'unknown-key-1', STAGING_SERVICE_ROLE_KEY: 'unknown-key-1' }), /aynı olamaz/);
});

test('JWT biçimli anahtarların rolü ayırt edilir', () => {
  const jwt = (role) => `h.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.s`;
  assert.equal(guard.keyKind(jwt('anon')), 'public');
  assert.equal(guard.keyKind(jwt('service_role')), 'secret');
  assert.throws(() => guard.assertSafeStagingEnv({ ...GOOD_ENV, STAGING_ANON_KEY: jwt('service_role') }), /gizli/);
});

test('hata mesajları ve redact anahtar değerlerini sızdırmaz', () => {
  const env = { ...GOOD_ENV, STAGING_URL: 'https://prodprojectref12345.supabase.co', STAGING_PROJECT_REF: 'prodprojectref12345' };
  try {
    guard.assertSafeStagingEnv(env, { productionUrls: PROD });
    assert.fail('reddedilmeliydi');
  } catch (error) {
    assert.doesNotMatch(error.message, /sb_publishable|sb_secret|prodprojectref/);
  }
  const masked = guard.redact(`istek ${GOOD_ENV.STAGING_SERVICE_ROLE_KEY} başarısız sb_secret_abc123`, GOOD_ENV);
  assert.doesNotMatch(masked, /sb_secret_/);
});

test('test dışı kullanıcı bulunan proje reddedilir; yalnızca sentetik kullanıcılar kabul edilir', async () => {
  const adminWith = (users) => ({ auth: { admin: { listUsers: async () => ({ data: { users }, error: null }) } } });
  await assert.rejects(guard.assertNoRealUsers(adminWith([{ email: 'gercek@kisi.com' }])), /test dışı kullanıcı/);
  await guard.assertNoRealUsers(adminWith([{ email: 'wortly-test-1-a@wortly-test.invalid' }, { email: 'WORTLY-TEST-2@WORTLY-TEST.INVALID' }]));
  await guard.assertNoRealUsers(adminWith([{ email: 'gercek@kisi.com' }]), { allowOthers: true });
  const failing = { auth: { admin: { listUsers: async () => ({ data: null, error: { message: 'x' } }) } } };
  await assert.rejects(guard.assertNoRealUsers(failing), /doğrulanamadığı/);
});

// ─── Taşıyıcılar uygulamayla aynı sorguları üretir ──────────────────────────

function recordingClient(response) {
  const calls = [];
  const builder = (table) => {
    const call = { table, ops: [] };
    calls.push(call);
    const chain = new Proxy({}, {
      get: (_, op) => {
        if (op === 'then') return (resolve) => resolve(response(call));
        return (...args) => { call.ops.push([op, args]); return chain; };
      },
    });
    return chain;
  };
  return { client: { from: builder }, calls };
}
const opsOf = (call, name) => call.ops.filter(([op]) => op === name).map(([, args]) => args);

test('ilerleme taşıyıcısı: kullanıcıya göre filtreler, sabit sıralar, aralıkla sayfalar ve user_id ekler', async () => {
  const { client, calls } = recordingClient(() => ({ data: [], error: null }));
  const transport = createProgressTransport(client, 'user-1');
  await transport.fetchPage(1000, 1999);
  await transport.upsert([{ word_id: 'w', mastery_level: 1, last_reviewed: iso(NOW) }]);
  const [fetchCall, upsertCall] = calls;
  assert.equal(fetchCall.table, 'user_word_progress');
  assert.deepEqual(opsOf(fetchCall, 'eq'), [['user_id', 'user-1']]);
  assert.deepEqual(opsOf(fetchCall, 'order'), [['word_id', { ascending: true }]]);
  assert.deepEqual(opsOf(fetchCall, 'range'), [[1000, 1999]]);
  const [rows, options] = opsOf(upsertCall, 'upsert')[0];
  assert.equal(rows[0].user_id, 'user-1');
  assert.deepEqual(options, { onConflict: 'user_id,word_id' });
});

test('senaryo taşıyıcısı: tekrarları yok sayan ekleme (UPDATE yetkisi gerektirmez) ve satır indirmeden sayım', async () => {
  const { client, calls } = recordingClient((call) => (opsOf(call, 'select')[0]?.[1]?.head ? { count: 42, error: null } : { data: [], error: null }));
  const transport = createScenarioTransport(client, 'user-1');
  await transport.insert([{ id: 'sc-00000001', scenario_id: 'cafe', score: 1, total: 2, completed_at: iso(NOW) }]);
  const count = await transport.count();
  const [, options] = opsOf(calls[0], 'upsert')[0];
  assert.deepEqual(options, { onConflict: 'user_id,id', ignoreDuplicates: true });
  assert.equal(count, 42);
  assert.deepEqual(opsOf(calls[1], 'select')[0], ['id', { count: 'exact', head: true }]);
});

test('taşıyıcı hataları başarısızlık olarak döner (başarılı sayılmaz) ve mesajlar bildirilir', async () => {
  const reported = [];
  const { client } = recordingClient(() => ({ data: null, error: { message: 'permission denied' } }));
  const progress = createProgressTransport(client, 'u', { onError: m => reported.push(m) });
  const scenario = createScenarioTransport(client, 'u', { onError: m => reported.push(m) });
  assert.deepEqual(await progress.fetchPage(0, 999), { rows: null, error: true });
  assert.equal(await progress.upsert([]), false);
  assert.equal(await scenario.insert([]), false);
  assert.equal(await scenario.count(), null);
  assert.equal(reported.length, 3);
});

test('taşıyıcı: istek zaman aşımına uğrarsa hata sayılır', async () => {
  const { client } = recordingClient(() => ({ data: [], error: null }));
  const transport = createProgressTransport(client, 'u', {
    withTimeout: async (_promise, fallback) => fallback, // zaman aşımı
    timeoutError: { message: 'zaman aşımı' },
  });
  assert.deepEqual(await transport.fetchPage(0, 999), { rows: null, error: true });
  assert.equal(await transport.upsert([]), false);
});

// ─── Tam / hafif senkron sıralayıcı ─────────────────────────────────────────

test('hafif senkron sürerken gelen TAM senkron atlanmaz, sırayla çalışır', async () => {
  const run = createSyncSerializer();
  const log = [];
  const light = run('progress:u', 'light', async () => { log.push('light-start'); await wait(20); log.push('light-end'); });
  const full = run('progress:u', 'full', async () => { log.push('full-start'); await wait(5); log.push('full-end'); });
  await Promise.all([light, full]);
  assert.deepEqual(log, ['light-start', 'light-end', 'full-start', 'full-end']);
});

test('aynı kipteki eşzamanlı istekler tek çalışmada birleşir', async () => {
  const run = createSyncSerializer();
  let runs = 0;
  const task = async () => { runs += 1; await wait(10); };
  await Promise.all([run('k', 'full', task), run('k', 'full', task), run('k', 'full', task)]);
  assert.equal(runs, 1);
  await run('k', 'full', task); // bitince yeni istek yeniden çalışır
  assert.equal(runs, 2);
});

test('farklı kullanıcılar birbirini beklemez; bir görevin hatası zinciri bozmaz', async () => {
  const run = createSyncSerializer();
  const order = [];
  const a = run('p:a', 'full', async () => { await wait(20); order.push('a'); });
  const b = run('p:b', 'full', async () => { order.push('b'); });
  await Promise.all([a, b]);
  assert.deepEqual(order, ['b', 'a']);

  const failing = run('p:c', 'full', async () => { throw new Error('boom'); });
  await assert.rejects(failing, /boom/);
  let ran = false;
  await run('p:c', 'light', async () => { ran = true; });
  assert.equal(ran, true);
});

// ─── Statik kimlik ayrımı ───────────────────────────────────────────────────

test('yalnızca bilinen statik kimlikler gönderilir; kişisel, silinmiş ve bilinmeyen kimlikler gönderilmez', async () => {
  const known = new Set(['goethe-a1-haus', 'a1-renkler-rot']);
  const uploaded = [];
  const transport = {
    fetchPage: async () => ({ rows: [{ word_id: 'goethe-b1-bilinmeyen', mastery_level: 3, last_reviewed: iso(NOW - H) }], error: false }),
    upsert: async rows => { uploaded.push(...rows.map(r => r.word_id)); return true; },
  };
  const result = await sync.syncProgressWithCloud({
    localStates: {
      'goethe-a1-haus': { masteryLevel: 1, lastReviewed: NOW - H },
      'a1-renkler-rot': { masteryLevel: 2, lastReviewed: NOW - H },
      'k3j2h1g0': { masteryLevel: 3, lastReviewed: NOW - H }, // kişisel (veya silinmiş kişisel) kelime
      'goethe-eski-kaldirilmis': { masteryLevel: 1, lastReviewed: NOW - H }, // artık veri setinde yok
    },
    isStaticId: id => known.has(id),
    transport,
    now: NOW,
  });
  assert.deepEqual(uploaded.sort(), ['a1-renkler-rot', 'goethe-a1-haus']);
  assert.deepEqual(result.pulled, {}, 'bilinmeyen bulut kaydı yerele uygulanmaz');
});

// ─── Senaryo geçmişi: bulut toplamı ─────────────────────────────────────────

test('bulut senaryo toplamı biliniyorsa yerel 100 sınırı sayıyı kısıtlamaz', () => {
  // Tamamlanmış kayıt tanımı tek yerde (isCompletedRecord): geçerli skor/toplam/tarih gerekir.
  const record = (id) => ({ id, score: 1, total: 1, date: Date.now() });
  const sessions = Array.from({ length: 10 }, (_, i) => record(String(i)));
  const local = Array.from({ length: 100 }, (_, i) => record(`s${i}`));
  assert.deepEqual(stats.summarizeCompletedExercises(10, sessions, local, 340), { count: 350, exact: true });
  assert.deepEqual(stats.summarizeCompletedExercises(10, sessions, local, null), { count: 110, exact: false });
});
