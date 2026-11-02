// user_word_progress ve scenario_results için GERÇEK Supabase TEST projesinde entegrasyon testi.
// (PostgREST + GoTrue + RLS + tetikleyiciler; uygulamanın kullandığı taşıyıcı kodunun aynısıyla.)
//
// ÜRETİMDE ÇALIŞTIRMA. Betik, aşağıdaki koşullarda HİÇBİR istek atmadan çıkar (çıkış kodu 2):
//   * STAGING_URL / STAGING_PROJECT_REF / STAGING_ANON_KEY / STAGING_SERVICE_ROLE_KEY / STAGING_CONFIRM eksik,
//   * STAGING_PROJECT_REF, STAGING_URL ile eşleşmiyor,
//   * STAGING_URL kök .env dosyasındaki (üretim) adresle veya PRODUCTION_SUPABASE_URL ile aynı,
//   * publishable/secret anahtarlar karışmış.
// Ağ denetimi: projede test dışı (@wortly-test.invalid olmayan) kullanıcı varsa durur.
// Yalnızca sentetik kullanıcı/veri kullanır, sonunda kullanıcıları siler (veriler cascade ile silinir).
// service_role yalnızca test kullanıcısı oluşturma/silme ve doğrulama sayımları içindir; veri yazma/okuma
// testleri oturum açmış kullanıcı istemcileriyle (RLS altında) yapılır.
//
// Çalıştırma: bkz. STAGING_TEST_PLAN.md ("Öğrenme senkronizasyonu tabloları").
//   node supabase/tests/learning-sync.staging.test.js
// Gerçek bir test projesi olmadan bu testler ÇALIŞMAZ ve başarılı sayılmaz.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { spawnSync } = require('child_process');
const guard = require('./staging-guard');

const root = path.resolve(__dirname, '..', '..');

let target;
try {
  target = guard.assertSafeStagingEnv(process.env, { productionUrls: guard.readProductionUrls(root) });
} catch (error) {
  console.error('DURDURULDU: ' + guard.redact(error.message));
  process.exit(2);
}

// Uygulamanın kullandığı saf çekirdek ve taşıyıcılar geçici klasöre derlenir (aynı kod, aynı sorgular).
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wortly-sync-it-'));
const tsc = require.resolve('typescript/bin/tsc', { paths: [root] });
const compiled = spawnSync(process.execPath, [
  tsc, 'utils/learning-sync.ts', 'utils/learning-transports.ts', 'utils/progress-merge.ts',
  '--ignoreConfig', '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck',
  '--types', 'node', '--rootDir', root,
], { cwd: root, stdio: 'inherit' });
if (compiled.status !== 0) { console.error('Derleme başarısız.'); process.exit(1); }
const sync = require(path.join(outDir, 'utils', 'learning-sync.js'));
const { createProgressTransport, createScenarioTransport } = require(path.join(outDir, 'utils', 'learning-transports.js'));

const { createClient } = require(path.join(root, 'node_modules', '@supabase', 'supabase-js'));
const admin = createClient(target.url, process.env.STAGING_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = crypto.randomBytes(4).toString('hex');
const created = [];

async function makeUser(label) {
  const email = `wortly-test-${run}-${label}${guard.TEST_EMAIL_DOMAIN}`;
  const password = crypto.randomBytes(16).toString('hex');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error('kullanıcı oluşturulamadı: ' + error.message);
  created.push(data.user.id);
  return { id: data.user.id, email, password, devices: [] };
}
/** Aynı hesapla yeni bir "cihaz" (ayrı oturum/istemci). */
async function signInDevice(user) {
  const client = createClient(target.url, process.env.STAGING_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error('giriş başarısız: ' + error.message);
  user.devices.push(client);
  return client;
}

const H = 3600 * 1000;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const adminCount = async (table, userId, extra = (q) => q) => {
  const { count, error } = await extra(admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId));
  if (error) throw new Error(error.message);
  return count;
};
const row = (id, mastery, ms) => ({ word_id: id, mastery_level: mastery, last_reviewed: iso(ms) });
const scenarioRow = (id, ms, score = 3, total = 4) => ({ id, scenario_id: 'cafe', score, total, completed_at: iso(ms) });
const adminRow = async (userId, wordId) =>
  (await admin.from('user_word_progress').select('*').eq('user_id', userId).eq('word_id', wordId).maybeSingle()).data;

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([name, true]); }
  catch (error) { results.push([name, false, guard.redact(String(error.message || error).split('\n')[0])]); }
}

(async () => {
  let A, B, devA1, devA2, devB;
  try {
    await guard.assertNoRealUsers(admin, { allowOthers: process.env.STAGING_ALLOW_OTHER_USERS === 'EVET' });

    // Tablolar bu projede var mı? (migration uygulanmamışsa net bir mesajla dur; başarılı sayılmaz.)
    for (const table of ['user_word_progress', 'scenario_results']) {
      const { error } = await admin.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.error(`DURDURULDU: '${table}' tablosuna erişilemedi (migration uygulanmamış olabilir): ${guard.redact(error.message)}`);
        process.exit(3);
      }
    }

    A = await makeUser('a');
    B = await makeUser('b');
    devA1 = await signInDevice(A);
    devA2 = await signInDevice(A);
    devB = await signInDevice(B);
    const tA1 = createProgressTransport(devA1, A.id);
    const tA2 = createProgressTransport(devA2, A.id);
    const tB = createProgressTransport(devB, B.id);
    const allStatic = () => true;

    await test('1 INSERT/SELECT: kullanıcı kendi ilerlemesini yazar ve okur', async () => {
      assert.equal(await tA1.upsert([row('itest-w1', 1, NOW - 5 * H)]), true);
      const page = await tA1.fetchPage(0, 999);
      assert.equal(page.error, false);
      assert.ok(page.rows.some((r) => r.word_id === 'itest-w1'));
    });

    await test('2 UPDATE: daha yeni tekrar uygulanır, yanlış cevapla düşen seviye de', async () => {
      assert.equal(await tA1.upsert([row('itest-w1', 3, NOW - 4 * H)]), true);
      assert.equal((await adminRow(A.id, 'itest-w1')).mastery_level, 3);
      assert.equal(await tA1.upsert([row('itest-w1', 1, NOW - 3 * H)]), true);
      assert.equal((await adminRow(A.id, 'itest-w1')).mastery_level, 1);
    });

    await test('3 geç gelen eski kayıt yeni ilerlemeyi ezemez (hatasız yok sayılır)', async () => {
      assert.equal(await tA2.upsert([row('itest-w1', 3, NOW - 10 * H)]), true);
      const current = await adminRow(A.id, 'itest-w1');
      assert.equal(current.mastery_level, 1);
      assert.equal(new Date(current.last_reviewed).getTime(), NOW - 3 * H);
    });

    await test('4 aynı tarih: yüksek seviye kazanır (sıradan bağımsız)', async () => {
      await tA1.upsert([row('itest-tie', 1, NOW - 2 * H)]);
      await tA2.upsert([row('itest-tie', 3, NOW - 2 * H)]);
      await tA1.upsert([row('itest-tie', 2, NOW - 2 * H)]);
      assert.equal((await adminRow(A.id, 'itest-tie')).mastery_level, 3);
    });

    await test('5 aynı kaydın tekrar gönderilmesi ikinci satır oluşturmaz', async () => {
      for (let i = 0; i < 3; i += 1) await tA1.upsert([row('itest-dup', 2, NOW - H)]);
      const { count } = await admin.from('user_word_progress').select('*', { count: 'exact', head: true })
        .eq('user_id', A.id).eq('word_id', 'itest-dup');
      assert.equal(count, 1);
    });

    await test('6 gelecekteki damga sunucuda çekilir', async () => {
      await tA1.upsert([row('itest-future', 2, NOW + 400 * 24 * H)]);
      const stored = await adminRow(A.id, 'itest-future');
      assert.ok(new Date(stored.last_reviewed).getTime() <= Date.now() + 10 * 60 * 1000);
    });

    await test('7 izolasyon: B, A\'nın ilerlemesini okuyamaz ve A adına yazamaz', async () => {
      const page = await tB.fetchPage(0, 999);
      assert.equal(page.rows.length, 0);
      const forged = await devB.from('user_word_progress').insert({ user_id: A.id, ...row('itest-forged', 1, NOW - H) });
      assert.ok(forged.error, 'B, A adına yazabildi');
      assert.equal(await adminRow(A.id, 'itest-forged'), null);
    });

    await test('8 istemci ilerleme kaydını silemez', async () => {
      const del = await devA1.from('user_word_progress').delete().eq('user_id', A.id).eq('word_id', 'itest-w1');
      assert.ok(del.error, 'silme engellenmeliydi');
      assert.ok(await adminRow(A.id, 'itest-w1'));
    });

    await test('9 geçersiz değerler reddedilir', async () => {
      assert.equal(await tA1.upsert([{ word_id: 'itest-bad', mastery_level: 4, last_reviewed: iso(NOW - H) }]), false);
      assert.equal(await tA1.upsert([{ word_id: 'itest-bad2', mastery_level: 1, last_reviewed: '2001-01-01T00:00:00Z' }]), false);
    });

    // ───────── scenario_results ─────────
    const sA1 = createScenarioTransport(devA1, A.id);
    const sA2 = createScenarioTransport(devA2, A.id);
    const sB = createScenarioTransport(devB, B.id);

    await test('10 senaryo INSERT/SELECT ve tekrar gönderimde ikinci satır yok', async () => {
      assert.equal(await sA1.insert([scenarioRow('itest-sc-0001', NOW - 2 * H)]), true);
      assert.equal(await sA1.insert([scenarioRow('itest-sc-0001', NOW - 2 * H)]), true);
      assert.equal(await sA2.insert([scenarioRow('itest-sc-0001', NOW - 2 * H)]), true);
      const { count } = await admin.from('scenario_results').select('*', { count: 'exact', head: true })
        .eq('user_id', A.id).eq('id', 'itest-sc-0001');
      assert.equal(count, 1);
      const page = await sA1.fetchPage(0, 999);
      assert.ok(page.rows.some((r) => r.id === 'itest-sc-0001'));
    });

    await test('11 senaryo UPDATE ve DELETE engellenir (değiştirilemez)', async () => {
      const upd = await devA1.from('scenario_results').update({ score: 0 }).eq('user_id', A.id).eq('id', 'itest-sc-0001').select();
      const del = await devA1.from('scenario_results').delete().eq('user_id', A.id).eq('id', 'itest-sc-0001').select();
      assert.ok(upd.error || (upd.data || []).length === 0, 'UPDATE engellenmeliydi');
      assert.ok(del.error || (del.data || []).length === 0, 'DELETE engellenmeliydi');
      const stored = (await admin.from('scenario_results').select('score').eq('user_id', A.id).eq('id', 'itest-sc-0001').single()).data;
      assert.equal(stored.score, 3);
    });

    await test('12 senaryo izolasyonu ve geçersiz değerler', async () => {
      assert.equal((await sB.fetchPage(0, 999)).rows.length, 0);
      const forged = await devB.from('scenario_results').insert({ user_id: A.id, ...scenarioRow('itest-sc-forge', NOW - H) });
      assert.ok(forged.error);
      assert.equal(await sA1.insert([scenarioRow('itest-sc-bad01', NOW - H, 9, 4)]), false); // puan > toplam
      // Aynı kimlik farklı kullanıcıda engel olmaz.
      assert.equal(await sB.insert([scenarioRow('itest-sc-0001', NOW - H)]), true);
    });

    // ───────── Sayfalama (1000'den fazla kayıt) ─────────
    await test('13 1000\'den fazla ilerleme kaydı sayfalı okunur', async () => {
      const extra = Array.from({ length: 1250 }, (_, i) => row(`itest-bulk-${String(i).padStart(5, '0')}`, 1, NOW - H));
      for (let i = 0; i < extra.length; i += 500) assert.equal(await tA1.upsert(extra.slice(i, i + 500)), true);
      const fetched = await sync.fetchAllPages(tA2.fetchPage);
      assert.equal(fetched.ok, true);
      assert.ok(fetched.rows.length >= 1250, `okunan ${fetched.rows.length}`);
      assert.equal(new Set(fetched.rows.map((r) => r.word_id)).size, fetched.rows.length, 'sayfalar arasında yinelenen/atlanan satır var');
    });

    await test('14 1000\'den fazla senaryo sonucu sayfalı okunur ve toplam sayı doğrudur', async () => {
      const rows = Array.from({ length: 1100 }, (_, i) => scenarioRow(`itest-sc-bulk-${String(i).padStart(5, '0')}`, NOW - (i + 5) * 60000));
      for (let i = 0; i < rows.length; i += 500) assert.equal(await sA1.insert(rows.slice(i, i + 500)), true);
      const result = await sync.syncScenariosWithCloud({ local: [], transport: sA2, cap: 5000 });
      assert.equal(result.ok, true);
      assert.equal(result.merged.length, 1101); // 1100 + önceki test sonucu
      assert.equal(await sA2.count(), 1101);
    });

    // ───────── Çevrimdışı kuyruk ve iki cihaz ─────────
    await test('15 çevrimdışı kuyruk: bağlantı gelince gönderilir, kayıp yok', async () => {
      let offline = true;
      const flaky = {
        fetchPage: tA1.fetchPage,
        upsert: async (rows) => (offline ? false : tA1.upsert(rows)),
      };
      const states = { 'itest-queued': { masteryLevel: 2, lastReviewed: NOW - H } };
      const failed = await sync.flushProgressIds(['itest-queued'], states, allStatic, flaky);
      assert.equal(failed.ok, false);
      assert.equal(await adminRow(A.id, 'itest-queued'), null);
      offline = false;
      const retried = await sync.flushProgressIds(['itest-queued'], states, allStatic, flaky);
      assert.equal(retried.ok, true);
      assert.equal((await adminRow(A.id, 'itest-queued')).mastery_level, 2);
    });

    await test('16 iki cihaz aynı hesabın ilerlemesini birleştirir', async () => {
      // Telefon (cihaz 1) ve tablet (cihaz 2) farklı kelimeleri çalışır; aynı kelimeyi farklı zamanlarda.
      const phone = { 'itest-d1': { masteryLevel: 2, lastReviewed: NOW - 6 * H }, 'itest-shared': { masteryLevel: 3, lastReviewed: NOW - 7 * H } };
      const tablet = { 'itest-d2': { masteryLevel: 1, lastReviewed: NOW - 5 * H }, 'itest-shared': { masteryLevel: 1, lastReviewed: NOW - 4 * H } };
      const r1 = await sync.syncProgressWithCloud({ localStates: phone, isStaticId: allStatic, transport: tA1 });
      const r2 = await sync.syncProgressWithCloud({ localStates: tablet, isStaticId: allStatic, transport: tA2 });
      assert.equal(r1.ok && r2.ok, true);
      // Tablet, telefonun d1 kaydını alır; paylaşılan kelimede tabletin daha yeni (düşük seviyeli) kaydı kazanır.
      assert.equal(r2.pulled['itest-d1'].masteryLevel, 2);
      assert.equal((await adminRow(A.id, 'itest-shared')).mastery_level, 1);
      // Telefon yeniden senkronlayınca tabletin kayıtlarını alır; iki cihaz aynı sonuca varır.
      const r3 = await sync.syncProgressWithCloud({ localStates: phone, isStaticId: allStatic, transport: tA1 });
      assert.equal(r3.pulled['itest-d2'].masteryLevel, 1);
      assert.equal(r3.pulled['itest-shared'].masteryLevel, 1);
    });

    await test('17 iki cihazda senaryo sonuçları birleşir, yinelenmez', async () => {
      const phone = await sync.syncScenariosWithCloud({ local: [{ id: 'itest-ph-0001', scenarioId: 'cafe', score: 2, total: 3, date: NOW - 9 * H }], transport: sA1, cap: 5000 });
      const tablet = await sync.syncScenariosWithCloud({ local: [{ id: 'itest-tb-0001', scenarioId: 'cafe', score: 1, total: 3, date: NOW - 8 * H }], transport: sA2, cap: 5000 });
      assert.equal(phone.ok && tablet.ok, true);
      const ids = tablet.merged.map((r) => r.id);
      assert.ok(ids.includes('itest-ph-0001') && ids.includes('itest-tb-0001'));
      assert.equal(new Set(ids).size, ids.length);
    });

    await test('18 çıkış ve yeniden giriş: temiz cihaz ilerlemeyi buluttan geri alır', async () => {
      const fresh = await signInDevice(A);
      const t = createProgressTransport(fresh, A.id);
      const result = await sync.syncProgressWithCloud({ localStates: {}, isStaticId: allStatic, transport: t });
      assert.equal(result.ok, true);
      assert.ok(result.pulled['itest-w1'] && result.pulled['itest-d1']);
    });

    await test('19 hesap silinince ilerleme ve senaryo sonuçları temizlenir (cascade)', async () => {
      const victim = await makeUser('victim');
      const dev = await signInDevice(victim);
      await createProgressTransport(dev, victim.id).upsert([row('itest-v', 1, NOW - H)]);
      await createScenarioTransport(dev, victim.id).insert([scenarioRow('itest-sc-v001', NOW - H)]);
      const { error } = await admin.auth.admin.deleteUser(victim.id);
      assert.ifError(error);
      created.splice(created.indexOf(victim.id), 1);
      assert.equal(await adminCount('user_word_progress', victim.id), 0);
      assert.equal(await adminCount('scenario_results', victim.id), 0);
    });
  } catch (error) {
    results.push(['ortam / hazırlık', false, guard.redact(String(error.message || error))]);
  } finally {
    for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  for (const [name, ok, message] of results) console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' -> ' + message));
  const failed = results.filter((r) => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} test geçti`);
  process.exit(failed ? 1 : 0);
})();
