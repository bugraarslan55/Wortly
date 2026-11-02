// Öğrenme senkronu (user_word_progress + scenario_results) ENTEGRASYON testleri.
//
// KATMANLAR:
//  - GERÇEK: store/index.ts (kelime/oturum/profil mağazaları, uzlaştırma-park, kuyruk, syncProgress, syncScenarioResults,
//            flushPendingChanges, resetLocal), utils/learning-sync.ts, learning-transports.ts, feature-flags.ts.
//  - SAHTE : AsyncStorage (bellekte kalıcı disk) ve Supabase (bellekte; RLS benzeri sahiplik denetimi, sunucu tetikleyicisi
//            benzeri "eski kayıt yeniyi ezmez", ON CONFLICT DO NOTHING). Production'a bağlanılmaz; kullanıcılar A ve B sentetiktir.
//  - YOK   : gerçek Supabase/RLS/tetikleyiciler, gerçek AsyncStorage, React bileşenleri → staging + cihaz testi gerekir.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorld } = require('./support/store-harness.js');

const KEY = {
  words: '@wortly:words', wordsOwner: '@wortly:words-owner', review: '@wortly:review-states', reviewOwner: '@wortly:review-owner',
  profile: '@wortly:profile', sessions: '@wortly:sessions', pending: '@wortly:pending-changes',
};
const NEW_TABLES = ['user_word_progress', 'scenario_results'];
const newTableRequests = (world) => world.cloud.requests.filter(r => NEW_TABLES.includes(r.table));
const callsOn = (world, table) => world.cloud.calls.filter(c => c.table === table);
const parkedKeys = (world, owner, dataset) => [...world.disk.keys()].filter(k => k.startsWith(`@wortly:parked:${owner}:${dataset}:`));
const pendingOf = (world) => JSON.parse(world.disk.get(KEY.pending) ?? '[]');

async function start(world, userId, options = {}) {
  world.cloud.session = userId;
  const app = world.boot(options);
  await app.load();
  await app.sync(userId);
  await app.loadScenarios(userId);
  await app.syncLearning(userId);
  return app;
}
async function logout(world, app) {
  world.cloud.session = null;
  await app.wipe();
}
async function login(world, app, userId) {
  world.cloud.session = userId;
  await app.sync(userId);
  await app.loadScenarios(userId);
  await app.syncLearning(userId);
}
const answer = (app, id, correct = true) => app.W.getState().updateMastery(id, correct);
const scenario = (app, userId, extra = {}) => app.S.getState().saveScenarioResult(userId, { scenarioId: 'kafe', score: 3, total: 4, ...extra });
const settle = async () => { for (let i = 0; i < 10; i += 1) await new Promise(resolve => setImmediate(resolve)); };

// ─── Bayrak KAPALI (varsayılan): mevcut davranış, yeni tablolara istek yok ───────────────────────────
test('bayrak varsayılan KAPALI: ilerleme ve senaryo yalnızca yerelde; yeni tablolara HİÇ istek gitmez; kuyruğa yeni tür girmez', async () => {
  const world = createWorld();
  const app = await start(world, 'A');            // varsayılan boot: env yok → kapalı
  const [staticId] = app.staticIds();
  await answer(app, staticId);
  await scenario(app, 'A');
  await app.syncLearning('A');
  await app.store.flushPendingChanges('A');
  await app.store.refreshLearningData('A');
  await settle();
  assert.equal(newTableRequests(world).length, 0, 'user_word_progress / scenario_results sorgulanmadı');
  assert.deepEqual(pendingOf(world).filter(item => item.entity === 'progress' || item.entity === 'scenario'), []);
  assert.equal(app.W.getState().reviewStates[staticId].masteryLevel, 1, 'yerel ilerleme çalışıyor');
  assert.equal(app.S.getState().scenarioResults.length, 1, 'yerel senaryo sonucu çalışıyor');
  assert.equal(app.W.getState().progressSyncedUserId, null);
  assert.equal(app.S.getState().scenarioTotal, null);
});

test('bayrak KAPALI: senaryo listesi eskisi gibi yerelde 100 ile sınırlı kalır', async () => {
  const world = createWorld();
  const app = await start(world, 'A');
  for (let i = 0; i < 105; i += 1) await scenario(app, 'A', { score: 1, total: 1 });
  assert.equal(app.S.getState().scenarioResults.length, 100);
  assert.equal(newTableRequests(world).length, 0);
});

// ─── Bayrak AÇIK: sahte bulutla eşitleme ────────────────────────────────────────────────────────────
test('bayrak AÇIK: ilerleme ve senaryo sonucu buluta GİDER, kuyruk boşalır, aynı kayıt ikinci eşitlemede TEKRAR gönderilmez', async () => {
  const world = createWorld();
  const app = await start(world, 'A', { learningSync: true });
  const [staticId] = app.staticIds();
  await answer(app, staticId);
  await scenario(app, 'A');
  await app.store.flushPendingChanges('A');
  assert.equal(world.cloud.tables.user_word_progress.size, 1);
  assert.equal(world.cloud.tables.user_word_progress.get(staticId).user_id, 'A');
  assert.equal(world.cloud.tables.scenario_results.size, 1);
  assert.deepEqual(pendingOf(world).filter(item => item.entity === 'progress' || item.entity === 'scenario'), [], 'kuyruk boşaldı');
  assert.equal(world.disk.get(KEY.reviewOwner), 'A');

  const uploads = () => callsOn(world, 'user_word_progress').length + callsOn(world, 'scenario_results').length;
  const before = uploads();
  await app.syncLearning('A');
  await app.store.flushPendingChanges('A');
  assert.equal(uploads(), before, 'değişmeyen kayıt yeniden gönderilmedi');
  assert.equal(world.cloud.tables.scenario_results.size, 1, 'çoğalma yok');
});

test('bayrak AÇIK: A→B→A — B, A\'nın ilerleme/senaryosunu görmez ve buluta B adına yazılmaz; A geri dönünce verisi buluttan gelir', async () => {
  const world = createWorld();
  let app = await start(world, 'A', { learningSync: true });
  const [staticId] = app.staticIds();
  await answer(app, staticId);
  await scenario(app, 'A');
  await app.store.flushPendingChanges('A');
  await logout(world, app);

  app = world.boot({ learningSync: true });
  await app.load();
  await login(world, app, 'B');
  assert.deepEqual(app.W.getState().reviewStates, {});
  assert.deepEqual(app.S.getState().scenarioResults, []);
  assert.equal([...world.cloud.tables.user_word_progress.values()].some(row => row.user_id === 'B'), false);
  assert.equal(callsOn(world, 'user_word_progress').every(c => c.userId === 'A'), true, 'B adına yazma yok');
  await logout(world, app);

  app = world.boot({ learningSync: true });
  await app.load();
  await login(world, app, 'A');
  assert.equal(app.W.getState().reviewStates[staticId].masteryLevel, 1, 'A ilerlemesi buluttan döndü');
  assert.equal(app.S.getState().scenarioResults.length, 1, 'A senaryosu buluttan döndü');
});

test('çevrimdışı kuyruk: bayrak açıkken çevrimdışı ilerleme/senaryo kuyrukta kalır, silinmez; bağlantı gelince bir kez gönderilir', async () => {
  const world = createWorld();
  const app = await start(world, 'A', { learningSync: true });
  const [staticId] = app.staticIds();
  world.cloud.online = false;
  await answer(app, staticId);
  await scenario(app, 'A');
  await settle();
  const queued = pendingOf(world).filter(item => item.entity === 'progress' || item.entity === 'scenario');
  assert.equal(queued.length, 2);
  assert.ok(queued.every(item => item.userId === 'A'), 'kuyruk girdileri A\'ya ait');
  assert.equal(world.cloud.tables.user_word_progress.size, 0);

  world.cloud.online = true;
  await app.store.flushPendingChanges('A');
  assert.equal(world.cloud.tables.user_word_progress.size, 1);
  assert.equal(world.cloud.tables.scenario_results.size, 1);
  assert.deepEqual(pendingOf(world).filter(item => item.entity === 'progress' || item.entity === 'scenario'), []);
});

test('başarısız ağ/tablo hatası: yerel veri korunur, "doğrulandı" işaretlenmez, kayıtlar kuyrukta kalır; düzelince tekrar deneme tamamlar', async () => {
  const world = createWorld();
  const app = await start(world, 'A', { learningSync: true });
  const [staticId] = app.staticIds();
  world.cloud.failTables = new Set(NEW_TABLES);
  await answer(app, staticId);
  await scenario(app, 'A');
  await app.syncLearning('A');
  await app.store.flushPendingChanges('A');
  assert.equal(app.W.getState().reviewStates[staticId].masteryLevel, 1, 'yerel ilerleme silinmedi');
  assert.equal(app.S.getState().scenarioResults.length, 1);
  assert.ok(pendingOf(world).filter(item => item.entity === 'progress' || item.entity === 'scenario').length >= 2);
  assert.equal(app.S.getState().scenarioTotal.count, 0, 'başarısız eşitleme toplamı değiştirmedi (önceki doğrulanmış değer)');

  world.cloud.failTables = null;
  await app.syncLearning('A');
  await app.store.flushPendingChanges('A');
  assert.equal(world.cloud.tables.user_word_progress.size, 1);
  assert.equal(world.cloud.tables.scenario_results.size, 1);
  assert.equal(app.W.getState().progressSyncedUserId, 'A');
});

test('iki cihaz: senaryo sonuçları kimliğe göre birleşir, tekrar eşitleme çoğaltmaz; ilerlemede son tekrar kazanır', async () => {
  const world = createWorld();
  const app = await start(world, 'A', { learningSync: true });
  const [staticId] = app.staticIds();
  const cloudTime = new Date(Date.now() - 3600_000).toISOString();
  world.cloud.tables.scenario_results.set('dev2-result-1', { id: 'dev2-result-1', user_id: 'A', scenario_id: 'kafe', score: 2, total: 4, completed_at: cloudTime });
  world.cloud.tables.user_word_progress.set(staticId, { word_id: staticId, user_id: 'A', mastery_level: 3, last_reviewed: cloudTime });
  await scenario(app, 'A');
  await app.syncLearning('A');
  await app.syncLearning('A');
  const ids = app.S.getState().scenarioResults.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'yinelenen kayıt yok');
  assert.ok(ids.includes('dev2-result-1'), 'diğer cihazın sonucu geldi');
  assert.equal(world.cloud.tables.scenario_results.size, 2);
  assert.equal(app.W.getState().reviewStates[staticId].masteryLevel, 3, 'diğer cihazın ilerlemesi geldi');
  assert.equal(app.S.getState().scenarioTotal.count, 2);
});

test('sayfalama: 2300 bulut senaryo sonucu tüm sayfalarla okunur; yerel liste sınırlı kalır, gerçek toplam bilinir', async () => {
  const world = createWorld();
  const base = Date.now() - 10_000_000;
  for (let i = 0; i < 2300; i += 1) {
    const id = `cloud-result-${String(i).padStart(5, '0')}`;
    world.cloud.tables.scenario_results.set(id, { id, user_id: 'A', scenario_id: 'kafe', score: 1, total: 1, completed_at: new Date(base + i * 1000).toISOString() });
  }
  const app = await start(world, 'A', { learningSync: true });
  assert.equal(app.S.getState().scenarioTotal.count, 2300);
  const pages = world.cloud.requests.filter(r => r.table === 'scenario_results' && r.op === 'select').length;
  assert.ok(pages >= 4, `en az 3 sayfa + sayım isteği (gerçek: ${pages})`);
  assert.ok(app.S.getState().scenarioResults.length <= 2300);
});

test('kelime silme: kişisel kelime silinince bulut kelimesi silinir ve onun için ilerleme satırı OLUŞMAZ', async () => {
  const world = createWorld();
  const app = await start(world, 'A', { learningSync: true });
  await app.W.getState().addWord({ german: 'Löschen', article: '', turkish: 'sil', isCustom: true });
  const id = app.W.getState().words.find(w => w.german === 'Löschen').id;
  await answer(app, id);
  await app.syncLearning('A');
  assert.equal(world.cloud.tables.user_words.size, 1);
  await app.W.getState().deleteWord(id);
  await app.store.flushPendingChanges('A');
  assert.equal(world.cloud.tables.user_words.size, 0, 'bulut kelimesi silindi');
  assert.equal(world.cloud.tables.user_word_progress.has(id), false, 'kişisel kelime ilerlemesi konu tablosuna gitmedi');
});

// ─── Sahiplik, park, arşiv ──────────────────────────────────────────────────────────────────────
test('sahibi bilinmeyen eski ilerleme: bayrak açıkken bile hesaba otomatik bağlanmaz ve buluta GİTMEZ (parkta kalır)', async () => {
  const world = createWorld();
  const probe = world.boot();
  const staticId = probe.staticIds()[0];
  world.disk.set(KEY.review, JSON.stringify({ [staticId]: { masteryLevel: 2, lastReviewed: Date.now() - 5000 } }));
  const app = await start(world, 'A', { learningSync: true });
  assert.deepEqual(app.W.getState().reviewStates, {}, 'eski ilerleme A\'ya bağlanmadı');
  assert.equal(world.cloud.tables.user_word_progress.size, 0, 'buluta gitmedi');
  assert.equal(callsOn(world, 'user_word_progress').length, 0);
  assert.equal(parkedKeys(world, '__unknown__', 'review').length, 1, 'silinmeden parkta');
});

test('hesap değişimi çıkışsız (A\'nın yerel verisi kaldı): B eşitlemesi A\'nın ilerlemesini parka alır, B adına YÜKLEMEZ; A dönünce geri gelir', async () => {
  const world = createWorld();
  let app = await start(world, 'A', { learningSync: true });
  const [staticId] = app.staticIds();
  world.cloud.online = false;
  await answer(app, staticId);                     // A çevrimdışı ilerleme (kuyrukta)
  world.cloud.online = true;

  app = world.boot({ learningSync: true });        // çıkış yapılmadan yeniden açılış, oturum artık B
  await app.load();
  await login(world, app, 'B');
  assert.deepEqual(app.W.getState().reviewStates, {});
  assert.equal(parkedKeys(world, 'A', 'review').length, 1, 'A\'nın ilerlemesi parkta');
  assert.equal([...world.cloud.tables.user_word_progress.values()].some(row => row.user_id === 'B'), false);
  assert.equal(callsOn(world, 'user_word_progress').some(c => c.userId === 'B'), false);

  app = world.boot({ learningSync: true });
  await app.load();
  await login(world, app, 'A');
  assert.equal(app.W.getState().reviewStates[staticId].masteryLevel, 1, 'A\'nın çevrimdışı ilerlemesi geri geldi');
  assert.equal(world.cloud.tables.user_word_progress.get(staticId).user_id, 'A', 'A adına gönderildi');
});

test('çıkış sırasında devam eden senkron: sonuç silinen/başka kullanıcının yerel verisine yazılmaz, "doğrulandı" işaretlenmez', async () => {
  const world = createWorld();
  const app = await start(world, 'A', { learningSync: true });
  const [staticId] = app.staticIds();
  world.cloud.tables.user_word_progress.set(staticId, { word_id: staticId, user_id: 'A', mastery_level: 2, last_reviewed: new Date(Date.now() - 1000).toISOString() });
  world.cloud.tables.scenario_results.set('late-result-1', { id: 'late-result-1', user_id: 'A', scenario_id: 'kafe', score: 1, total: 1, completed_at: new Date(Date.now() - 1000).toISOString() });
  let release;
  world.cloud.gate = new Promise(resolve => { release = resolve; });     // bulut yanıtı kapıda bekler
  const syncing = app.syncLearning('A');
  for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve));
  world.cloud.session = null;
  const wiping = app.wipe();                                              // çıkış, senkron sürerken
  release();
  await wiping;
  await syncing;
  await settle();
  assert.deepEqual(app.W.getState().reviewStates, {}, 'A\'nın ilerlemesi çıkıştan sonra geri gelmedi');
  assert.equal(app.W.getState().progressSyncedUserId, null);
  assert.deepEqual(app.S.getState().scenarioResults, []);
  assert.equal(world.disk.has(KEY.review), false);
  const savedScenarios = JSON.parse(world.disk.get('@wortly:scenario-results:A') ?? '[]');
  assert.equal(savedScenarios.some(r => r.id === 'late-result-1'), false, 'geç gelen yanıt çıkıştan sonra yerel kayda yazılmadı');
});

test('250 eski oturum + bayrak açık: yalnızca yerel 100 oturum buluta gider; salt okunur arşiv (150) ve park ASLA gönderilmez', async () => {
  const world = createWorld();
  world.disk.set(KEY.sessions, JSON.stringify(Array.from({ length: 250 }, (_, i) => (
    { id: 'leg' + i, type: 'yazma', wordIds: [], score: 4, total: 5, date: Date.now() - 10_000 - i * 1000 }
  ))));
  const app = await start(world, 'A', { learningSync: true });
  await app.store.restoreLegacyRecords('A');
  await app.sync('A');
  await app.syncLearning('A');
  await app.store.flushPendingChanges('A');
  assert.equal(world.cloud.tables.study_sessions.size, 100);
  assert.equal((await app.store.loadArchivedSessions('A')).length, 150);
  const sentIds = new Set(callsOn(world, 'study_sessions').flatMap(c => c.ids));
  for (const archived of await app.store.loadArchivedSessions('A')) assert.equal(sentIds.has(archived.id), false, 'arşiv kaydı gönderilmedi');
});

test('onaylı kurtarma + bayrak açık: eski ilerleme onaydan ÖNCE gitmez, onaydan SONRA kuyruğa alınıp gönderilir; ikinci kurtarma çoğaltmaz', async () => {
  const world = createWorld();
  const probe = world.boot();
  const staticId = probe.staticIds()[0];
  world.disk.set(KEY.review, JSON.stringify({ [staticId]: { masteryLevel: 2, lastReviewed: Date.now() - 5000 } }));
  const app = await start(world, 'A', { learningSync: true });
  assert.equal(world.cloud.tables.user_word_progress.size, 0, 'onaydan önce gitmedi');
  const restored = await app.store.restoreLegacyRecords('A');
  assert.equal(restored.reviewStates, 1);
  await app.store.flushPendingChanges('A');
  assert.equal(world.cloud.tables.user_word_progress.get(staticId).mastery_level, 2);
  const uploads = callsOn(world, 'user_word_progress').length;
  await app.store.restoreLegacyRecords('A');
  await app.store.flushPendingChanges('A');
  assert.equal(callsOn(world, 'user_word_progress').length, uploads, 'ikinci kurtarma yeniden göndermedi');
});

test('cihazda iki hesap kullanıldıysa (bekletme) bayrak açık olsa da eski ilerleme aktarılmaz ve gönderilmez', async () => {
  const world = createWorld();
  const probe = world.boot();
  const staticId = probe.staticIds()[0];
  world.disk.set(KEY.review, JSON.stringify({ [staticId]: { masteryLevel: 2, lastReviewed: Date.now() - 5000 } }));
  let app = await start(world, 'A', { learningSync: true });
  await logout(world, app);
  app = await start(world, 'B', { learningSync: true });
  const result = await app.store.restoreLegacyRecords('B');
  assert.equal(result.blocked, true);
  await app.store.flushPendingChanges('B');
  assert.equal(world.cloud.tables.user_word_progress.size, 0);
  assert.equal(parkedKeys(world, '__unknown__', 'review').length, 1);
});

test('bayrak geri alınırsa: kuyruktaki ilerleme/senaryo girdileri "gönderilmemiş değişiklik" uyarısı üretmez ama SİLİNMEZ; bayrak açılınca gönderilir', async () => {
  const world = createWorld();
  let app = await start(world, 'A', { learningSync: true });
  const [staticId] = app.staticIds();
  world.cloud.online = false;
  await answer(app, staticId);
  await scenario(app, 'A');
  await settle();
  assert.equal(await app.store.getPendingChangeCount('A'), 2);

  world.cloud.online = true;
  app = world.boot();                               // bayrak kapalı (varsayılan)
  await app.load();
  await app.sync('A');
  await app.loadScenarios('A');
  assert.equal(await app.store.getPendingChangeCount('A'), 0, 'kapalıyken uyarı sayısına girmez');
  assert.equal(pendingOf(world).filter(item => item.entity === 'progress' || item.entity === 'scenario').length, 2, 'girdiler silinmedi');
  assert.equal(world.cloud.tables.user_word_progress.size, 0);

  app = world.boot({ learningSync: true });
  await app.load();
  await login(world, app, 'A');
  await app.store.flushPendingChanges('A');
  assert.equal(world.cloud.tables.user_word_progress.size, 1);
  assert.equal(world.cloud.tables.scenario_results.size, 1);
});
