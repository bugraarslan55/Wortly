// Cihazlar arası öğrenme senkronizasyonunun çekirdeği için testler (sahte taşıyıcı ile; ağ yok).
// @utils: learning-sync, feature-flags, signout-plan
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const load = (name) => require(path.join(out, 'utils', `${name}.js`));

const sync = load('learning-sync');
const flags = load('feature-flags');
const { countUnverifiedProgress } = load('signout-plan');

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const H = 3600 * 1000;
const iso = (ms) => new Date(ms).toISOString();

// ─── Sahte taşıyıcılar ──────────────────────────────────────────────────────

/** Sunucu davranışını taklit eder: kelime başına en yeni last_reviewed kazanır, eşitlikte yüksek seviye. */
function fakeProgressServer(initialRows = [], { failFetch = false, failUpsertTimes = 0 } = {}) {
  const rows = new Map(initialRows.map(r => [r.word_id, { ...r }]));
  const log = { fetches: [], upserts: [], rejected: 0 };
  let failures = failUpsertTimes;
  const transport = {
    fetchPage: async (from, to) => {
      log.fetches.push([from, to]);
      if (failFetch) return { rows: null, error: true };
      const sorted = [...rows.values()].sort((a, b) => (a.word_id < b.word_id ? -1 : 1));
      return { rows: sorted.slice(from, to + 1), error: false };
    },
    upsert: async (batch) => {
      log.upserts.push(batch.map(r => r.word_id));
      if (failures > 0) { failures -= 1; log.rejected += 1; return false; }
      for (const row of batch) {
        const old = rows.get(row.word_id);
        if (!old) { rows.set(row.word_id, { ...row }); continue; }
        const oldT = Date.parse(old.last_reviewed);
        const newT = Date.parse(row.last_reviewed);
        if (newT < oldT) continue;
        if (newT === oldT && row.mastery_level <= old.mastery_level) continue;
        rows.set(row.word_id, { ...row });
      }
      return true;
    },
  };
  return { rows, transport, log };
}

function fakeScenarioServer(initialRows = [], { failFetch = false, failInsertTimes = 0 } = {}) {
  const rows = new Map(initialRows.map(r => [r.id, { ...r }]));
  const log = { inserts: 0, duplicatesIgnored: 0 };
  let failures = failInsertTimes;
  const transport = {
    fetchPage: async (from, to) => {
      if (failFetch) return { rows: null, error: true };
      const sorted = [...rows.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
      return { rows: sorted.slice(from, to + 1), error: false };
    },
    insert: async (batch) => {
      if (failures > 0) { failures -= 1; return false; }
      for (const row of batch) {
        if (rows.has(row.id)) { log.duplicatesIgnored += 1; continue; } // ON CONFLICT DO NOTHING
        rows.set(row.id, { ...row });
        log.inserts += 1;
      }
      return true;
    },
  };
  return { rows, transport, log };
}

const row = (id, mastery, ms) => ({ word_id: id, mastery_level: mastery, last_reviewed: iso(ms) });

// ─── Özellik bayrağı ────────────────────────────────────────────────────────

test('özellik bayrağı varsayılan olarak KAPALI (ortam değişkeni yokken)', () => {
  flags.setLearningSyncOverride(null);
  const saved = process.env.EXPO_PUBLIC_LEARNING_SYNC;
  delete process.env.EXPO_PUBLIC_LEARNING_SYNC;
  assert.equal(flags.isLearningSyncEnabled(), false);
  process.env.EXPO_PUBLIC_LEARNING_SYNC = 'false';
  assert.equal(flags.isLearningSyncEnabled(), false);
  process.env.EXPO_PUBLIC_LEARNING_SYNC = '1'; // yalnızca tam olarak "true" açar
  assert.equal(flags.isLearningSyncEnabled(), false);
  process.env.EXPO_PUBLIC_LEARNING_SYNC = 'true';
  assert.equal(flags.isLearningSyncEnabled(), true);
  if (saved === undefined) delete process.env.EXPO_PUBLIC_LEARNING_SYNC; else process.env.EXPO_PUBLIC_LEARNING_SYNC = saved;
});

test('testler bayrağı kontrollü açıp kapatabilir', () => {
  flags.setLearningSyncOverride(true);
  assert.equal(flags.isLearningSyncEnabled(), true);
  flags.setLearningSyncOverride(false);
  assert.equal(flags.isLearningSyncEnabled(), false);
  flags.setLearningSyncOverride(null);
});

test('bayrak kapalıyken çıkış uyarısı eski davranışı korur (tüm yerel konu ilerlemesi sayılır)', () => {
  const reviewStates = { 'goethe-a1-haus': { masteryLevel: 1, lastReviewed: NOW } };
  assert.equal(countUnverifiedProgress({ syncEnabled: false, syncedForUser: true, reviewStates, words: [] }), 1);
});

test('bayrak açık ama bulutla doğrulanmamışsa (tablolar yok / ağ hatası) ilerleme "senkronize" sayılmaz', () => {
  const reviewStates = { 'goethe-a1-haus': { masteryLevel: 1, lastReviewed: NOW } };
  assert.equal(countUnverifiedProgress({ syncEnabled: true, syncedForUser: false, reviewStates, words: [] }), 1);
});

test('bayrak açık ve bu kullanıcı için doğrulanmışsa uyarı yalnızca bekleyen kayıtlara bırakılır', () => {
  const reviewStates = { 'goethe-a1-haus': { masteryLevel: 1, lastReviewed: NOW } };
  assert.equal(countUnverifiedProgress({ syncEnabled: true, syncedForUser: true, reviewStates, words: [] }), 0);
});

// ─── Konu ilerlemesi: ilk cihaz, ikinci cihaz ───────────────────────────────

test('ilk cihaz: bulutta yoksa yerel ilerleme yüklenir', async () => {
  const server = fakeProgressServer();
  const result = await sync.syncProgressWithCloud({
    localStates: { a: { masteryLevel: 2, lastReviewed: NOW - H }, b: { masteryLevel: 1, lastReviewed: NOW - 2 * H } },
    isStaticId: () => true,
    transport: server.transport,
    now: NOW,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.uploadedIds.sort(), ['a', 'b']);
  assert.equal(server.rows.get('a').mastery_level, 2);
  assert.deepEqual(result.pulled, {});
});

test('ikinci cihaz: bulut ilerlemesi yerele uygulanır, yerelde olmayanlar gelir', async () => {
  const server = fakeProgressServer([row('a', 3, NOW - H), row('c', 1, NOW - 3 * H)]);
  const result = await sync.syncProgressWithCloud({
    localStates: {},
    isStaticId: () => true,
    transport: server.transport,
    now: NOW,
  });
  assert.equal(result.ok, true);
  assert.equal(result.pulled.a.masteryLevel, 3);
  assert.equal(result.pulled.c.masteryLevel, 1);
  assert.deepEqual(result.uploadedIds, []);
});

test('daha yeni yerel kayıt buluta yüklenir, daha yeni bulut kaydı yereli günceller', async () => {
  const server = fakeProgressServer([row('newerCloud', 3, NOW - H), row('newerLocal', 1, NOW - 5 * H)]);
  const result = await sync.syncProgressWithCloud({
    localStates: {
      newerCloud: { masteryLevel: 1, lastReviewed: NOW - 4 * H },
      newerLocal: { masteryLevel: 2, lastReviewed: NOW - H },
    },
    isStaticId: () => true,
    transport: server.transport,
    now: NOW,
  });
  assert.equal(result.pulled.newerCloud.masteryLevel, 3);
  assert.deepEqual(result.uploadedIds, ['newerLocal']);
  assert.equal(server.rows.get('newerLocal').mastery_level, 2);
});

test('yeni ama düşük seviyeli yerel cevap (yanlış) buluta yüklenir', async () => {
  const server = fakeProgressServer([row('w', 3, NOW - 24 * H)]);
  const result = await sync.syncProgressWithCloud({
    localStates: { w: { masteryLevel: 1, lastReviewed: NOW - H } },
    isStaticId: () => true,
    transport: server.transport,
    now: NOW,
  });
  assert.deepEqual(result.uploadedIds, ['w']);
  assert.equal(server.rows.get('w').mastery_level, 1);
});

test('aynı tarihli çakışma: yüksek seviye kazanır, iki yönde de aynı sonuç', async () => {
  const t = NOW - H;
  // yerel yüksek → buluta yüklenir
  const s1 = fakeProgressServer([row('w', 1, t)]);
  const r1 = await sync.syncProgressWithCloud({ localStates: { w: { masteryLevel: 3, lastReviewed: t } }, isStaticId: () => true, transport: s1.transport, now: NOW });
  assert.deepEqual(r1.uploadedIds, ['w']);
  assert.equal(s1.rows.get('w').mastery_level, 3);
  // bulut yüksek → yerele gelir
  const s2 = fakeProgressServer([row('w', 3, t)]);
  const r2 = await sync.syncProgressWithCloud({ localStates: { w: { masteryLevel: 1, lastReviewed: t } }, isStaticId: () => true, transport: s2.transport, now: NOW });
  assert.equal(r2.pulled.w.masteryLevel, 3);
  assert.deepEqual(r2.uploadedIds, []);
});

test('tamamen aynı kayıt için gereksiz yükleme veya yerel değişiklik yapılmaz (tekrar yükleme yok)', async () => {
  const t = NOW - H;
  const server = fakeProgressServer([row('w', 2, t)]);
  const result = await sync.syncProgressWithCloud({
    localStates: { w: { masteryLevel: 2, lastReviewed: t } }, isStaticId: () => true, transport: server.transport, now: NOW,
  });
  assert.deepEqual(result.uploadedIds, []);
  assert.deepEqual(result.pulled, {});
  assert.equal(server.log.upserts.length, 0);
});

test('ikinci senkron aynı veriyi tekrar yüklemez (idempotent)', async () => {
  const server = fakeProgressServer();
  const local = { a: { masteryLevel: 1, lastReviewed: NOW - H } };
  await sync.syncProgressWithCloud({ localStates: local, isStaticId: () => true, transport: server.transport, now: NOW });
  const again = await sync.syncProgressWithCloud({ localStates: local, isStaticId: () => true, transport: server.transport, now: NOW });
  assert.deepEqual(again.uploadedIds, []);
  assert.equal(server.log.upserts.length, 1);
});

test('kişisel kelimeler konu ilerlemesi tablosuna gönderilmez ve buluttan alınmaz', async () => {
  const server = fakeProgressServer([row('mine', 3, NOW - H)]);
  const result = await sync.syncProgressWithCloud({
    localStates: { mine: { masteryLevel: 1, lastReviewed: NOW - 2 * H }, static1: { masteryLevel: 1, lastReviewed: NOW - H } },
    isStaticId: (id) => id !== 'mine',
    transport: server.transport,
    now: NOW,
  });
  assert.deepEqual(result.uploadedIds, ['static1']);
  assert.deepEqual(result.pulled, {});
});

test('geçersiz tarihli yerel kayıt yüklenmez ama silinmez; geçerli tarihli bulut kaydı gelir', async () => {
  const server = fakeProgressServer([row('x', 2, NOW - H)]);
  const result = await sync.syncProgressWithCloud({
    localStates: { x: { masteryLevel: 3, lastReviewed: NaN }, y: { masteryLevel: 1 } },
    isStaticId: () => true,
    transport: server.transport,
    now: NOW,
  });
  assert.equal(result.pulled.x.masteryLevel, 2);
  assert.deepEqual(result.uploadedIds, []); // y: tarihi yok → gönderilemez
  assert.equal(server.rows.has('y'), false);
});

// ─── Ağ kesintisi ve yeniden gönderim ───────────────────────────────────────

test('bulut okunamazsa (ağ kesintisi) hiçbir şey yüklenmez/uygulanmaz ve ok=false döner', async () => {
  const server = fakeProgressServer([], { failFetch: true });
  const result = await sync.syncProgressWithCloud({
    localStates: { a: { masteryLevel: 1, lastReviewed: NOW - H } }, isStaticId: () => true, transport: server.transport, now: NOW,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.pulled, {});
  assert.equal(server.log.upserts.length, 0);
});

test('yükleme başarısız olursa ok=false; sonraki denemede aynı kayıtlar yeniden gönderilir', async () => {
  const server = fakeProgressServer([], { failUpsertTimes: 1 });
  const local = { a: { masteryLevel: 2, lastReviewed: NOW - H } };
  const first = await sync.syncProgressWithCloud({ localStates: local, isStaticId: () => true, transport: server.transport, now: NOW });
  assert.equal(first.ok, false);
  assert.deepEqual(first.failedIds, ['a']);
  assert.equal(server.rows.size, 0);
  const second = await sync.syncProgressWithCloud({ localStates: local, isStaticId: () => true, transport: server.transport, now: NOW });
  assert.equal(second.ok, true);
  assert.equal(server.rows.get('a').mastery_level, 2);
});

test('bekleyen kimlikler hafif akışla gönderilir; eksik yerel kayıt kuyruktan düşer; hata kuyrukta bırakır', async () => {
  const server = fakeProgressServer([], { failUpsertTimes: 1 });
  const states = { a: { masteryLevel: 1, lastReviewed: NOW - H } };
  const failed = await sync.flushProgressIds(['a', 'gone'], states, () => true, server.transport, NOW);
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.failedIds, ['a']);
  assert.deepEqual(failed.droppedIds, ['gone']);
  const retried = await sync.flushProgressIds(['a'], states, () => true, server.transport, NOW);
  assert.equal(retried.ok, true);
  assert.deepEqual(retried.uploadedIds, ['a']);
  assert.equal(server.log.fetches.length, 0, 'hafif akış bulutu okumamalı');
});

test('aynı kimlik kuyrukta birden çok kez olsa da tek satır gönderilir', async () => {
  const server = fakeProgressServer();
  const states = { a: { masteryLevel: 1, lastReviewed: NOW - H } };
  const r = await sync.flushProgressIds(['a', 'a', 'a'], states, () => true, server.transport, NOW);
  assert.deepEqual(r.uploadedIds, ['a']);
});

// ─── Sayfalama (1000'den fazla kayıt) ───────────────────────────────────────

test('1000 satırdan fazla bulut verisi sayfalanarak tamamen okunur', async () => {
  const many = Array.from({ length: 2350 }, (_, i) => row(`w${String(i).padStart(5, '0')}`, 1, NOW - H));
  const server = fakeProgressServer(many);
  const result = await sync.syncProgressWithCloud({ localStates: {}, isStaticId: () => true, transport: server.transport, now: NOW });
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.pulled).length, 2350);
  assert.deepEqual(server.log.fetches, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('tam 1000 satırda boş son sayfa da istenir ve döngü biter', async () => {
  const many = Array.from({ length: 1000 }, (_, i) => row(`w${String(i).padStart(5, '0')}`, 1, NOW - H));
  const server = fakeProgressServer(many);
  const r = await sync.fetchAllPages(server.transport.fetchPage);
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 1000);
  assert.equal(server.log.fetches.length, 2);
});

test('sayfalamada ortada hata olursa ok=false (kısmi veriyle birleştirme yapılmaz)', async () => {
  let calls = 0;
  const r = await sync.fetchAllPages(async () => (++calls === 2 ? { rows: null, error: true } : { rows: new Array(1000).fill({}), error: false }));
  assert.equal(r.ok, false);
});

test('çok sayıda yerel kayıt 500\'lük gruplarla yüklenir', async () => {
  const local = {};
  for (let i = 0; i < 1200; i += 1) local[`w${i}`] = { masteryLevel: 1, lastReviewed: NOW - H };
  const server = fakeProgressServer();
  const result = await sync.syncProgressWithCloud({ localStates: local, isStaticId: () => true, transport: server.transport, now: NOW });
  assert.equal(result.ok, true);
  assert.deepEqual(server.log.upserts.map(batch => batch.length), [500, 500, 200]);
});

// ─── Kullanıcı değişimi / sahiplik ──────────────────────────────────────────

test('başka kullanıcıya ait yerel ilerleme bu hesaba yüklenmez; sahipsiz veri devralınır', () => {
  assert.equal(sync.decideProgressOwnership('user-a', 'user-b'), 'skip');
  assert.equal(sync.decideProgressOwnership('user-a', 'user-a'), 'proceed');
  assert.equal(sync.decideProgressOwnership(null, 'user-a'), 'adopt');
  assert.equal(sync.decideProgressOwnership('', 'user-a'), 'adopt');
  assert.equal(sync.decideProgressOwnership('user-a', ''), 'skip');
});

test('çıkış ve yeniden giriş: buluttaki ilerleme temiz cihaza geri gelir', async () => {
  const server = fakeProgressServer();
  // A kullanıcısı cihazda çalışır ve senkronlar.
  await sync.syncProgressWithCloud({
    localStates: { a: { masteryLevel: 2, lastReviewed: NOW - H } }, isStaticId: () => true, transport: server.transport, now: NOW,
  });
  // Çıkış: yerel temizlendi. Yeniden giriş: boş yerel + bulut.
  const relogin = await sync.syncProgressWithCloud({ localStates: {}, isStaticId: () => true, transport: server.transport, now: NOW });
  assert.equal(relogin.pulled.a.masteryLevel, 2);
});

// ─── Senaryo sonuçları ──────────────────────────────────────────────────────

const result = (id, ms, score = 3, total = 4, scenarioId = 'cafe') => ({ id, scenarioId, score, total, date: ms });
const scenarioRow = (id, ms, score = 3, total = 4) => ({ id, scenario_id: 'cafe', score, total, completed_at: iso(ms) });

test('senaryo: yerel sonuçlar buluta gönderilir, bulut sonuçları yerelle birleşir, tekrar yok', async () => {
  const server = fakeScenarioServer([scenarioRow('cloud-0001', NOW - 5 * H)]);
  const r = await sync.syncScenariosWithCloud({
    local: [result('local-0001', NOW - H), result('cloud-0001', NOW - 5 * H)],
    transport: server.transport, cap: 100, now: NOW,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.uploadedIds, ['local-0001']);
  assert.deepEqual(r.merged.map(x => x.id), ['local-0001', 'cloud-0001']);
  assert.equal(server.rows.size, 2);
});

test('senaryo: aynı sonuç iki kez gönderilse de ikinci satır oluşmaz', async () => {
  const server = fakeScenarioServer();
  const input = { local: [result('local-0001', NOW - H)], transport: server.transport, cap: 100, now: NOW };
  await sync.syncScenariosWithCloud(input);
  await sync.syncScenariosWithCloud(input);
  // İkinci tur zaten bulutta gördüğü için hiç göndermez; doğrudan yeniden gönderim de yok sayılır.
  await sync.flushScenarioIds(['local-0001'], input.local, server.transport, NOW);
  assert.equal(server.rows.size, 1);
  assert.equal(server.log.inserts, 1);
  assert.equal(server.log.duplicatesIgnored, 1);
});

test('senaryo: ağ hatasında yerel kayıtlar korunur ve sonra yeniden gönderilir', async () => {
  const offline = fakeScenarioServer([], { failFetch: true });
  const local = [result('local-0001', NOW - H)];
  const failed = await sync.syncScenariosWithCloud({ local, transport: offline.transport, cap: 100, now: NOW });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.merged.map(x => x.id), ['local-0001']);

  const flaky = fakeScenarioServer([], { failInsertTimes: 1 });
  const firstTry = await sync.syncScenariosWithCloud({ local, transport: flaky.transport, cap: 100, now: NOW });
  assert.equal(firstTry.ok, false);
  assert.deepEqual(firstTry.failedIds, ['local-0001']);
  assert.equal(flaky.rows.size, 0);
  const retry = await sync.syncScenariosWithCloud({ local: firstTry.merged, transport: flaky.transport, cap: 100, now: NOW });
  assert.equal(retry.ok, true);
  assert.equal(flaky.rows.size, 1);
});

test('senaryo: iki cihazda sonuçlar tutarlı olur (birleşim, sıralı)', async () => {
  const server = fakeScenarioServer();
  const phone = await sync.syncScenariosWithCloud({ local: [result('phone-0001', NOW - 2 * H)], transport: server.transport, cap: 100, now: NOW });
  const tablet = await sync.syncScenariosWithCloud({ local: [result('tablet-001', NOW - H)], transport: server.transport, cap: 100, now: NOW });
  const phoneAgain = await sync.syncScenariosWithCloud({ local: phone.merged, transport: server.transport, cap: 100, now: NOW });
  assert.deepEqual(tablet.merged.map(x => x.id), ['tablet-001', 'phone-0001']);
  assert.deepEqual(phoneAgain.merged.map(x => x.id), ['tablet-001', 'phone-0001']);
});

test('senaryo: kimliksiz eski kayıtlar kararlı kimlik alır, silinmez ve yinelenmez', async () => {
  const legacy = [
    { scenarioId: 'cafe', score: 2, total: 3, date: NOW - 3 * H },
    { scenarioId: 'cafe', score: 2, total: 3, date: NOW - 3 * H }, // aynı içerik
  ];
  const first = sync.ensureScenarioIds(legacy);
  const second = sync.ensureScenarioIds(first.results);
  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(new Set(first.results.map(x => x.id)).size, 2, 'çakışan eski kayıtlar ayrı kimlik almalı');
  assert.equal(first.results.length, 2);
  assert.deepEqual(sync.ensureScenarioIds(legacy).results.map(x => x.id), first.results.map(x => x.id), 'kimlik kararlı');
});

test('senaryo: geçersiz kayıtlar buluta gönderilmez ama yerelde korunur', async () => {
  const server = fakeScenarioServer();
  const local = [
    result('ok-000001', NOW - H),
    result('bad-00001', NOW - H, 9, 4), // puan > toplam
    result('bad-00002', NaN),
    { id: 'bad-00003', score: 1, total: 2, date: NOW - H }, // senaryo kimliği yok
  ];
  const r = await sync.syncScenariosWithCloud({ local, transport: server.transport, cap: 100, now: NOW });
  assert.equal(r.ok, true);
  assert.deepEqual(r.uploadedIds, ['ok-000001']);
  assert.deepEqual(r.skippedIds.sort(), ['bad-00001', 'bad-00002', 'bad-00003']);
  assert.equal(r.merged.length, 4, 'geçersiz kayıtlar silinmemeli');
});

test('senaryo: yerel sınır yalnızca bulutta doğrulanmış kayıtları kırpar, yüklenemeyenleri korur', async () => {
  const cloud = Array.from({ length: 5 }, (_, i) => scenarioRow(`cloud-000${i}`, NOW - (10 + i) * H));
  const server = fakeScenarioServer(cloud, { failInsertTimes: 1 });
  const unsent = result('unsent-001', NOW - 100 * H); // en eski; sınırın dışında kalacaktı
  const r = await sync.syncScenariosWithCloud({ local: [unsent], transport: server.transport, cap: 3, now: NOW });
  assert.equal(r.ok, false);
  const ids = r.merged.map(x => x.id);
  assert.ok(ids.includes('unsent-001'), 'yüklenemeyen kayıt kırpılmamalı');
  assert.equal(ids.filter(id => id.startsWith('cloud')).length, 3); // cap 3: en yeni 3 bulut kaydı
  assert.equal(ids.length, 4); // + sınırın dışında korunan yüklenemeyen kayıt
});

test('senaryo: senkron sırasında kaydedilen yeni sonuç kaybolmaz', () => {
  const merged = [result('a-0000001', NOW - 2 * H)];
  const latest = [result('late-0001', NOW - 1000), result('a-0000001', NOW - 2 * H)];
  const out2 = sync.mergeLateScenarioResults(merged, latest);
  assert.deepEqual(out2.map(x => x.id), ['late-0001', 'a-0000001']);
  assert.equal(sync.mergeLateScenarioResults(merged, merged), merged);
});

test('senaryo: 1000\'den fazla bulut kaydı sayfalanarak okunur', async () => {
  const cloud = Array.from({ length: 1500 }, (_, i) => scenarioRow(`c-${String(i).padStart(6, '0')}`, NOW - (i + 1) * 1000));
  const server = fakeScenarioServer(cloud);
  const r = await sync.syncScenariosWithCloud({ local: [], transport: server.transport, cap: 2000, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.merged.length, 1500);
});

// ─── Koruma: bayrak kapalıyken yeni tablolara istek gönderilmediğinin kaynak denetimi ─────────

test('yeni tablolara yalnızca bayrak denetimli taşıyıcılar üzerinden erişilir', () => {
  const fs = require('node:fs');
  const root = path.resolve(__dirname, '..');
  const tables = ['user_word_progress', 'scenario_results'];

  // 1) Uygulama kodunda tablo adlarını yalnızca taşıyıcı modülü kullanır (migration/test/doküman hariç).
  const walk = (dir, acc = []) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.expo', 'supabase', 'docs', 'tests', 'scripts'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, acc); else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(full);
    }
    return acc;
  };
  const users = walk(root).filter(file => tables.some(t => fs.readFileSync(file, 'utf8').includes(`'${t}'`)));
  assert.deepEqual(users.map(f => path.relative(root, f).split(path.sep).join('/')), ['utils/learning-transports.ts']);
  // Taşıyıcı üreticileri yalnızca store'da kullanılır.
  const creators = walk(root).filter(file => /createProgressTransport|createScenarioTransport/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(creators.map(f => path.relative(root, f).split(path.sep).join('/')).sort(), ['store/index.ts', 'utils/learning-transports.ts']);

  // 2) Taşıyıcı üretimi yalnızca özellik bayrağı denetiminden sonra çağrılır.
  const src = fs.readFileSync(path.join(root, 'store', 'index.ts'), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const calls = src.map((line, i) => [line, i]).filter(([line]) => /make(Progress|Scenario)Transport\(userId\)/.test(line) && !/const make/.test(line));
  assert.ok(calls.length >= 2);
  for (const [, index] of calls) {
    const window = src.slice(Math.max(0, index - 20), index).join('\n');
    assert.match(window, /isLearningSyncEnabled\(\)\) return;/, `satır ${index + 1}: bayrak denetimi yok`);
  }

  // 3) Bayrağın varsayılanı kapalıdır (kaynakta açık bir true varsayılanı yok).
  const flagSrc = fs.readFileSync(path.join(root, 'utils', 'feature-flags.ts'), 'utf8');
  assert.match(flagSrc, /=== 'true'/);
  assert.doesNotMatch(flagSrc, /learningSyncOverride: boolean \| null = true/);
});
