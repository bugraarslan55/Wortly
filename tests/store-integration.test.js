// GERÇEK mağaza entegrasyon testleri (store/index.ts + data-isolation + access-gate gerçek kodla çalışır).
//
// KATMANLAR (bu dosya):
//  - GERÇEK: zustand mağazaları, reconcile/park/restore, sync*, resetLocal, bekleyen değişiklik kuyruğu, sahip anahtarları,
//            layout kapısı karar işlevi (computeAccessGate) — repodaki gerçek TypeScript kaynakları.
//  - SAHTE : AsyncStorage (bellekte kalıcı disk, hata/çökme enjeksiyonu) ve Supabase (bellekte, kontrollü). Production'a
//            bağlanılmaz; kullanıcılar A ve B sentetiktir.
//  - YOK   : gerçek (native) AsyncStorage, gerçek Supabase/RLS, React bileşenleri (RootLayout, SyncProblemScreen,
//            LegacyRecordsCard), ekranlar ve cihaz davranışı → cihazda ayrıca denenmelidir.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorld } = require('./support/store-harness.js');

const KEY = {
  words: '@wortly:words', wordsOwner: '@wortly:words-owner', review: '@wortly:review-states', reviewOwner: '@wortly:review-owner',
  profile: '@wortly:profile', profileOwner: '@wortly:profile-owner', sessions: '@wortly:sessions', sessionsOwner: '@wortly:sessions-owner',
  pending: '@wortly:pending-changes',
};
const parkedKeys = (world) => [...world.disk.keys()].filter(key => key.startsWith('@wortly:parked:'));
const parkedOf = (world, owner, dataset) => parkedKeys(world).filter(key => key.startsWith(`@wortly:parked:${owner}:${dataset}:`));
const idsOf = (list) => list.map(item => item.id).sort();
const germanOf = (list) => list.map(item => item.german).sort();
const diskJson = (world, key) => (world.disk.has(key) ? JSON.parse(world.disk.get(key)) : null);
const session = (id, extra = {}) => ({ id, type: 'yazma', wordIds: [], score: 4, total: 5, date: Date.now() - 1000, ...extra });

async function login(world, app, userId) {
  world.cloud.session = userId;
  await app.sync(userId);
}
async function logoutWithWipe(world, app) {
  world.cloud.session = null;
  await app.wipe();
}
async function addWord(app, german) {
  return app.W.getState().addWord({ german, article: '', turkish: german + '-tr', isCustom: true });
}

// ─── Temel: oluşturma, damga, çevrimdışı ─────────────────────────────────────
test('A giriş yapar ve kelime ekler: buluta gider, kuyruk boşalır, sahip damgası A', async () => {
  const world = createWorld();
  const app = world.boot();
  await app.load();
  await login(world, app, 'A');
  assert.deepEqual(await addWord(app, 'Haus'), { ok: true });
  assert.equal(world.cloud.tables.user_words.size, 1);
  assert.equal(world.disk.get(KEY.wordsOwner), 'A');
  assert.equal(await app.store.getPendingChangeCount('A'), 0);
});

test('A çevrimdışı kelime oluşturur: yerelde, kuyrukta ve sahip A; yeniden açılışta çevrimdışı erişilebilir', async () => {
  const world = createWorld();
  let app = world.boot();
  await app.load();
  await login(world, app, 'A');
  world.cloud.online = false;
  await addWord(app, 'Offline');
  assert.equal(await app.store.getPendingChangeCount('A'), 1);
  assert.equal(world.disk.get(KEY.wordsOwner), 'A', 'çevrimdışı oluşturulan veri de sahipli');

  app = world.boot();                 // uygulama yeniden açıldı, hâlâ çevrimdışı
  await app.load();
  await app.sync('A');                // eşitleme başarısız (çevrimdışı)
  assert.deepEqual(germanOf(app.W.getState().words), ['Offline']);
  const gate = app.gateFor('A', { dataSynced: true });
  assert.equal(gate.isUserDataSynced, true, 'sahibi doğrulanmış çevrimdışı veri erişilebilir');
  world.cloud.online = true;
  await app.sync('A');                // bağlantı gelince bekleyen kayıt yüklenir
  assert.equal(world.cloud.tables.user_words.size, 1);
  assert.equal(await app.store.getPendingChangeCount('A'), 0);
});

// ─── A → B → A (normal çıkış: yerel temizlik) ────────────────────────────────
test('A kelime/profil/oturum/tekrar/senaryo oluşturur → çıkış → B hiçbirini göremez → B kendi verisini oluşturur → çıkış → A\'nın bulut verisi geri gelir', async () => {
  const world = createWorld();
  let app = world.boot();
  await app.load();
  await login(world, app, 'A');
  await addWord(app, 'A-Wort');
  await app.U.getState().completeOnboarding('Ayşe', 'A2');
  await app.S.getState().saveSession(session('sA'));
  await app.W.getState().updateMastery('goethe-a1-haus', true);
  await app.S.getState().saveScenarioResult('A', { scenarioId: 'yol-tarifi', score: 4, total: 5 });

  await logoutWithWipe(world, app);
  assert.equal(world.disk.has(KEY.words), false);
  assert.equal(world.disk.has(KEY.wordsOwner), false);
  assert.deepEqual(app.W.getState().words, []);

  app = world.boot();
  await app.load();
  await login(world, app, 'B');
  assert.deepEqual(app.W.getState().words, [], 'B A\'nın kelimelerini göremez');
  assert.deepEqual(app.W.getState().reviewStates, {}, 'B A\'nın tekrar durumlarını göremez');
  assert.deepEqual(app.S.getState().sessions, [], 'B A\'nın oturumlarını göremez');
  assert.notEqual(app.U.getState().profile.name, 'Ayşe', 'B A\'nın profilini göremez');
  await app.S.getState().loadScenarioResults('B');
  assert.deepEqual(app.S.getState().scenarioResults, [], 'senaryo sonuçları kullanıcıya özel');
  assert.equal(await app.store.getPendingChangeCount('B'), 0);

  await addWord(app, 'B-Wort');
  await app.S.getState().saveSession(session('sB'));
  await logoutWithWipe(world, app);

  app = world.boot();
  await app.load();
  await login(world, app, 'A');
  assert.deepEqual(germanOf(app.W.getState().words), ['A-Wort'], 'A kendi bulut verisini geri alır, B\'ninkini görmez');
  assert.deepEqual(idsOf(app.S.getState().sessions), ['sA']);
  assert.equal(app.U.getState().profile.name, 'Ayşe');
  await app.S.getState().loadScenarioResults('A');
  assert.equal(app.S.getState().scenarioResults.length, 1, 'A\'nın senaryo sonuçları (kullanıcıya özel anahtar) korunmuş');
  await app.S.getState().loadScenarioResults('B');
  assert.equal(app.S.getState().scenarioResults.length, 0);
});

test('A\'nın bekleyen (gönderilmemiş) değişiklikleri B\'ye ASLA uygulanmaz', async () => {
  const world = createWorld();
  let app = world.boot();
  await app.load();
  await login(world, app, 'A');
  world.cloud.online = false;
  await addWord(app, 'A-bekleyen');
  assert.equal(await app.store.getPendingChangeCount('A'), 1);
  await logoutWithWipe(world, app);                       // bekleyen kayıt kuyrukta kalır

  world.cloud.online = true;
  app = world.boot();
  await app.load();
  await login(world, app, 'B');
  assert.equal(await app.store.getPendingChangeCount('B'), 0);
  assert.equal(world.cloud.calls.filter(call => call.table === 'user_words').length, 0, 'B oturumunda A\'nın kaydı gönderilmedi');
  assert.equal([...world.cloud.tables.user_words.values()].filter(row => row.user_id === 'B').length, 0);
  const raw = diskJson(world, KEY.pending);
  assert.ok(raw.some(change => change.userId === 'A'), 'A\'nın kuyruk kaydı silinmedi');
});

// ─── Yarıda kalan çıkış: park etme ve A→B→A ──────────────────────────────────
async function seedUserA(world) {
  const app = world.boot();
  await app.load();
  await login(world, app, 'A');
  await addWord(app, 'A-senkron');
  await app.U.getState().completeOnboarding('Ayşe', 'A2');
  await app.S.getState().saveSession(session('sA1'));
  await app.W.getState().updateMastery('goethe-a1-haus', true);
  world.cloud.online = false;
  await addWord(app, 'A-çevrimdışı');                         // gönderilmemiş
  world.cloud.online = true;
  return app;
}

test('çıkış yarıda kalır (yerel temizlik yok): B giriş yapınca A\'nın verisi gösterilmez, silinmez, park edilir', async () => {
  const world = createWorld();
  await seedUserA(world);
  // Uygulama kapandı; çıkış yerel temizliği çalışmadı. B oturumuyla yeniden açılış:
  world.cloud.session = 'B';
  const app = world.boot();
  await app.load();

  // Eşitleme BİTMEDEN: A'nın verisi bellekte; zaman aşımı kapıyı AÇMAMALI.
  const before = app.gateFor('B', { dataSynced: false, forceOpen: true });
  assert.equal(before.isUserDataSynced, false, '12 sn zaman aşımı sahiplik kontrolünü atlamaz');
  assert.equal(before.syncProblem, true);
  assert.ok(before.access.blocked.includes('words'));

  await app.sync('B');
  assert.deepEqual(app.W.getState().words, []);
  assert.deepEqual(app.W.getState().reviewStates, {});
  assert.deepEqual(app.S.getState().sessions, []);
  assert.notEqual(app.U.getState().profile.name, 'Ayşe');
  for (const dataset of ['words', 'review', 'profile', 'sessions']) {
    assert.equal(parkedOf(world, 'A', dataset).length, 1, `A'nın ${dataset} verisi park edildi`);
  }
  const after = app.gateFor('B', { dataSynced: true });
  assert.equal(after.isUserDataSynced, true);
  assert.equal(after.access.verified, true);
  assert.equal(world.disk.get(KEY.wordsOwner), 'B');
  assert.equal([...world.cloud.tables.user_words.values()].filter(row => row.user_id === 'B').length, 0, 'A\'nın verisi B adına yüklenmedi');
});

test('A→B→A (yarım çıkışlarla): A geri dönünce park edilen yerel verisi (gönderilmemiş kelime dahil) geri gelir ve yüklenir; B\'ninki B için park kalır', async () => {
  const world = createWorld();
  await seedUserA(world);

  world.cloud.session = 'B';
  let app = world.boot();
  await app.load();
  await app.sync('B');
  await addWord(app, 'B-Wort');
  await app.S.getState().saveSession(session('sB1'));

  world.cloud.session = 'A';                                    // yine çıkış temizliği yok
  app = world.boot();
  await app.load();
  assert.equal(app.gateFor('A', { dataSynced: false, forceOpen: true }).isUserDataSynced, false);
  await app.sync('A');

  assert.deepEqual(germanOf(app.W.getState().words), ['A-senkron', 'A-çevrimdışı'], 'A\'nın tüm yerel kelimeleri geri geldi');
  assert.deepEqual(idsOf(app.S.getState().sessions), ['sA1']);
  assert.equal(app.U.getState().profile.name, 'Ayşe');
  assert.ok(app.W.getState().reviewStates['goethe-a1-haus'], 'tekrar durumu geri geldi');
  assert.ok(!germanOf(app.W.getState().words).includes('B-Wort'), 'B\'nin verisi A\'ya karışmadı');
  assert.equal(parkedOf(world, 'A', 'words').length, 0, 'geri yüklenen park kaydı kaldırıldı');
  assert.equal(parkedOf(world, 'B', 'words').length, 1, 'B\'nin verisi B için park');
  assert.equal(await app.store.getPendingChangeCount('A'), 0, 'çevrimdışı kelime geri yüklenince buluta gönderildi');
  assert.ok([...world.cloud.tables.user_words.values()].some(row => row.user_id === 'A' && row.german === 'A-çevrimdışı'));
  assert.equal(app.gateFor('A').access.verified, true);
});

test('eşitleme tekrar edilirse (Tekrar dene) park kayıtları çoğalmaz ve veri kaybolmaz', async () => {
  const world = createWorld();
  await seedUserA(world);
  world.cloud.session = 'B';
  const app = world.boot();
  await app.load();
  for (let i = 0; i < 3; i += 1) await app.sync('B');
  assert.equal(parkedOf(world, 'A', 'words').length, 1);
  assert.equal(parkedOf(world, 'A', 'sessions').length, 1);
  const parkedWords = JSON.parse(JSON.parse(world.disk.get(parkedOf(world, 'A', 'words')[0])).raw);
  assert.deepEqual(germanOf(parkedWords), ['A-senkron', 'A-çevrimdışı']);
});

test('park yazılamıyorsa: A\'nın verisi YERİNDE kalır, kapı kapalı kalır (zaman aşımına rağmen); sorun giderilince Tekrar dene başarılı olur', async () => {
  const world = createWorld();
  await seedUserA(world);
  world.cloud.session = 'B';
  const app = world.boot();
  await app.load();
  app.storage.faults.failWriteMatch.push(/@wortly:parked:/);
  await app.sync('B');
  assert.deepEqual(germanOf(app.W.getState().words), ['A-senkron', 'A-çevrimdışı'], 'veri silinmedi');
  const gate = app.gateFor('B', { dataSynced: true, forceOpen: true });
  assert.equal(gate.isUserDataSynced, false);
  assert.equal(gate.syncProblem, true, 'güvenli hata ekranı');
  assert.equal(world.disk.get(KEY.wordsOwner), 'A', 'sahip B\'ye devredilmedi');

  app.storage.faults.failWriteMatch.length = 0;                  // sorun giderildi
  await app.sync('B');                                            // Tekrar dene
  assert.deepEqual(app.W.getState().words, []);
  assert.equal(parkedOf(world, 'A', 'words').length, 1);
  assert.equal(app.gateFor('B').isUserDataSynced, true);
});

test('çevrimdışı B girişi: ağ yokken bile A\'nın verisi B\'ye açılmaz (uzlaştırma ağ gerektirmez)', async () => {
  const world = createWorld();
  await seedUserA(world);
  world.cloud.session = 'B';
  world.cloud.online = false;
  const app = world.boot();
  await app.load();
  await app.sync('B');                                            // bulut hatası
  assert.deepEqual(app.W.getState().words, []);
  assert.equal(app.gateFor('B', { dataSynced: true }).isUserDataSynced, true, 'yerel veri B\'ye ait değil ama boşaltıldı: B\'nin boş verisi güvenli');
  assert.equal(parkedOf(world, 'A', 'words').length, 1);
});

// ─── Eski (sahibi bilinmeyen) kayıtlar ───────────────────────────────────────
function seedLegacy(world, { sessions = 2, words = 2 } = {}) {
  world.disk.set(KEY.words, JSON.stringify(Array.from({ length: words }, (_, i) => ({
    id: 'leg' + i, german: 'Alt' + i, article: '', turkish: 'eski' + i, addedAt: 1, masteryLevel: 0, isCustom: true,
  }))));
  world.disk.set(KEY.review, JSON.stringify({ 'goethe-a1-haus': { masteryLevel: 2, lastReviewed: Date.now() - 5000 } }));
  world.disk.set(KEY.profile, JSON.stringify({
    name: 'Eski Kullanıcı', level: 'A2', onboardingCompleted: true, streak: 3, totalWordsLearned: 5, dailyGoal: 10,
  }));
  world.disk.set(KEY.sessions, JSON.stringify(Array.from({ length: sessions }, (_, i) => session('legS' + i, { date: Date.now() - i * 1000 }))));
}

test('sahibi bilinmeyen eski kayıtlar: kapı kapalı, giriş yapan kullanıcıya otomatik bağlanmaz, buluta GİTMEZ', async () => {
  const world = createWorld();
  seedLegacy(world);
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  assert.equal(app.gateFor('A', { dataSynced: false, forceOpen: true }).isUserDataSynced, false);

  await app.sync('A');
  assert.deepEqual(app.W.getState().words, []);
  assert.deepEqual(app.S.getState().sessions, []);
  assert.notEqual(app.U.getState().profile.name, 'Eski Kullanıcı', 'eski profil kullanıcıya bağlanmadı');
  assert.equal(world.cloud.tables.user_words.size, 0, 'eski kelimeler buluta yüklenmedi');
  assert.equal(world.cloud.tables.study_sessions.size, 0, 'eski oturumlar buluta yüklenmedi');
  const profileRow = world.cloud.tables.profiles.get('A');
  assert.ok(!profileRow || profileRow.name !== 'Eski Kullanıcı', 'eski profil buluta yüklenmedi');
  for (const dataset of ['words', 'review', 'profile', 'sessions']) {
    assert.equal(parkedOf(world, '__unknown__', dataset).length, 1, `${dataset} karantinada`);
  }
  assert.equal(app.gateFor('A').isUserDataSynced, true, 'karantina sonrası kapı güvenle açık');

  // Başka bir kullanıcı da göremez/sahiplenemez.
  world.cloud.session = 'B';
  const second = world.boot();
  await second.load();
  await second.sync('B');
  assert.deepEqual(second.W.getState().words, []);
  assert.equal(parkedOf(world, '__unknown__', 'words').length, 1);
});

test('kurtarma: özet doğru; onayla kayıtlar eklenir, kuyruğa alınır, eşitlemede yüklenir; mevcut kayıt ezilmez; ikinci çalıştırma çoğaltmaz', async () => {
  const world = createWorld();
  seedLegacy(world);
  world.cloud.session = 'A';
  let app = world.boot();
  await app.load();
  await app.sync('A');
  await app.W.getState().addWord({ german: 'Alt0', article: '', turkish: 'YENİ-ÇEVİRİ', isCustom: true }); // leg0 ile aynı almanca, farklı kimlik

  const summary = await app.store.summarizeLegacyRecords();
  assert.deepEqual({ w: summary.words, s: summary.sessions, r: summary.reviewStates }, { w: 2, s: 2, r: 1 });
  assert.equal(world.cloud.tables.user_words.size, 1, 'onaydan önce eski kayıtlar yüklenmedi');

  const restored = await app.store.restoreLegacyRecords('A');
  assert.equal(restored.words, 2);
  assert.deepEqual(idsOf(app.S.getState().sessions), ['legS0', 'legS1']);
  assert.equal(world.disk.get(KEY.wordsOwner), 'A');
  assert.equal(parkedOf(world, '__unknown__', 'words').length, 0);
  assert.ok(await app.store.getPendingChangeCount('A') >= 4, 'geri yüklenenler yükleme için kuyrukta');
  assert.equal(world.cloud.tables.study_sessions.size, 0, 'henüz eşitlenmedi');

  const again = await app.store.restoreLegacyRecords('A');          // ikinci onay
  assert.equal(again.total, 0);
  assert.equal(app.W.getState().words.length, 3, 'çoğalmadı');

  await app.sync('A');
  assert.equal(world.cloud.tables.study_sessions.size, 2);
  assert.equal(world.cloud.tables.user_words.size, 3);
  assert.equal(await app.store.getPendingChangeCount('A'), 0);
});

test('kurtarma sırasında uygulama HER adımda kapansa bile: kayıt kaybolmaz, tekrar çalıştırmak tamamlar ve çoğaltmaz', async () => {
  for (let crashAfter = 0; crashAfter <= 60; crashAfter += 2) {
    const world = createWorld();
    seedLegacy(world, { sessions: 3, words: 3 });
    world.cloud.session = 'A';
    let app = world.boot();
    await app.load();
    await app.sync('A');

    app = world.boot();                                             // yeniden açılış
    await app.load();
    app.storage.faults.crashAfter = crashAfter;
    await app.store.restoreLegacyRecords('A').catch(() => null);    // kapanma

    app = world.boot();                                             // sağlıklı yeniden açılış
    await app.load();
    await app.store.restoreLegacyRecords('A');
    assert.deepEqual(germanOf(app.W.getState().words), ['Alt0', 'Alt1', 'Alt2'], 'kelimeler eksiksiz ' + crashAfter);
    assert.deepEqual(idsOf(app.S.getState().sessions), ['legS0', 'legS1', 'legS2'], 'oturumlar eksiksiz ' + crashAfter);
    assert.equal(parkedOf(world, '__unknown__', 'words').length, 0, 'tamamlandı ' + crashAfter);
  }
});

test('büyük kayıt listesi: yerel 100 sınırını aşan eski oturumlar sessizce kaybolmaz (taşanlar karantinada kalır)', async () => {
  const world = createWorld();
  seedLegacy(world, { sessions: 250, words: 1 });
  world.cloud.session = 'A';
  let app = world.boot();
  await app.load();
  await app.sync('A');
  const restored = await app.store.restoreLegacyRecords('A');
  const local = idsOf(app.S.getState().sessions);
  assert.equal(local.length, 100);
  const leftover = parkedSessionIds(world);
  assert.equal(new Set([...local, ...leftover]).size, 250, 'hiçbir oturum kaybolmadı');
  assert.equal(restored.sessions, 100);

  const again = await app.store.restoreLegacyRecords('A');          // ikinci onay: taşanlar kaybolmaz, çoğalmaz
  const leftoverAfter = parkedSessionIds(world);
  assert.equal(new Set([...idsOf(app.S.getState().sessions), ...leftoverAfter]).size, 250);
  assert.ok(again.total >= 0);
});

// ─── Çıkış, bozuk veri, eşzamanlılık ─────────────────────────────────────────
test('çıkış sırasında devam eden yazma: resetLocal yazmayı bekler, silinen veri sahipsiz olarak geri GELMEZ', async () => {
  const world = createWorld();
  const app = world.boot();
  await app.load();
  await login(world, app, 'A');
  // Zamanlayıcı yok: bulut isteği kapıda bekler, çıkış başlatılır, SONRA kapı açılır (yük altında da aynı sıra).
  let release;
  world.cloud.gate = new Promise(resolve => { release = resolve; });
  const pending = addWord(app, 'Geç-Yazılan');
  for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve));
  world.cloud.session = null;
  const wiping = app.wipe();                                        // çıkış, yazma sürerken
  release();
  await wiping;
  await pending;
  assert.equal(world.disk.has(KEY.words), false, 'yerel kelime listesi çıkıştan sonra yeniden oluşmadı');
  assert.equal(world.disk.has(KEY.wordsOwner), false);
  assert.deepEqual(app.W.getState().words, []);
});

test('eşzamanlı iki yerel ekleme: ikisi de kalıcı olarak yazılır', async () => {
  const world = createWorld();
  const app = world.boot();
  await app.load();
  await login(world, app, 'A');
  await Promise.all([addWord(app, 'Eins'), addWord(app, 'Zwei')]);
  assert.deepEqual(germanOf(diskJson(world, KEY.words)), ['Eins', 'Zwei']);
  assert.deepEqual(germanOf(app.W.getState().words), ['Eins', 'Zwei']);
});

test('bozuk JSON: ham veri ayrı anahtara yedeklenir; sağlıklı yeniden açılışta uygulama çalışır', async () => {
  const world = createWorld();
  world.disk.set(KEY.words, '{bozuk json');
  world.disk.set(KEY.wordsOwner, 'A');
  const app = world.boot();
  await app.load();
  assert.deepEqual(app.W.getState().words, []);
  const backups = [...world.disk.keys()].filter(key => key.startsWith('@wortly:corrupt:' + KEY.words));
  assert.equal(backups.length, 1);
  assert.equal(world.disk.get(backups[0]), '{bozuk json');
  await login(world, app, 'A');
  await addWord(app, 'Yeni');                                         // artık yazılabilir
  assert.deepEqual(germanOf(diskJson(world, KEY.words)), ['Yeni']);
  assert.equal(world.disk.get(backups[0]), '{bozuk json', 'yedek korunuyor');
});

test('bozuk veri yedeği DOĞRULANAMAZSA o anahtara yazılmaz (bozuk ama kurtarılabilir veri ezilmez)', async () => {
  const world = createWorld();
  world.disk.set(KEY.words, '{bozuk json');
  world.disk.set(KEY.wordsOwner, 'A');
  let app = world.boot();
  app.storage.faults.failWriteMatch.push(/@wortly:corrupt:/);
  await app.load();
  world.cloud.session = 'A';
  await addWord(app, 'Yeni');
  assert.equal(world.disk.get(KEY.words), '{bozuk json', 'bozuk veri ezilmedi');
  assert.deepEqual(germanOf(app.W.getState().words), ['Yeni'], 'bellekte çalışmaya devam');
});

test('yerel silme hatası: uzlaştırma "failed", A\'nın verisi parkta GÜVENDE ve kapı kapalı kalır', async () => {
  const world = createWorld();
  await seedUserA(world);
  world.cloud.session = 'B';
  const app = world.boot();
  await app.load();
  app.storage.faults.failRemove.add(KEY.words);                      // yerel kelime listesi silinemiyor
  await app.sync('B');
  assert.equal(parkedOf(world, 'A', 'words').length, 1, 'park yazıldı');
  const gate = app.gateFor('B', { dataSynced: true, forceOpen: true });
  assert.ok(gate.isUserDataSynced === true || gate.syncProblem === true);
  assert.deepEqual(app.W.getState().words, [], 'bellekte A\'nın kelimesi B\'ye gösterilmez');
  app.storage.faults.failRemove.clear();
  await app.sync('B');
  assert.equal(world.disk.has(KEY.words) ? diskJson(world, KEY.words).length : 0, 0);
  assert.equal(parkedOf(world, 'A', 'words').length, 1);
});

test('okuma hatası (sahip anahtarı): kullanıcının kendi verisi park EDİLMEZ, silinmez', async () => {
  const world = createWorld();
  const app = world.boot();
  await app.load();
  await login(world, app, 'A');
  await addWord(app, 'Haus');
  const second = world.boot();
  await second.load();
  second.storage.faults.failRead.add(KEY.wordsOwner);
  await second.sync('A');
  assert.equal(parkedKeys(world).length, 0, 'kendi verisi yanlışlıkla park edilmedi');
  assert.deepEqual(germanOf(diskJson(world, KEY.words)), ['Haus']);
});

test('sahip anahtarı eksik ama bu kullanıcı adına bekleyen değişiklik var: veri kullanıcının sayılır (park yok)', async () => {
  const world = createWorld();
  let app = world.boot();
  await app.load();
  await login(world, app, 'A');
  world.cloud.online = false;
  await addWord(app, 'Bekleyen');
  world.disk.delete(KEY.wordsOwner);                                  // eski biçim: sahip anahtarı yok
  world.cloud.online = true;
  app = world.boot();
  await app.load();
  await app.sync('A');
  assert.equal(parkedKeys(world).length, 0);
  assert.equal(world.cloud.tables.user_words.size, 1, 'bekleyen kelime A adına yüklendi');
  assert.deepEqual(germanOf(app.W.getState().words), ['Bekleyen']);
});

test('sahibi başka kullanıcı olan veriler hiçbir koşulda "bu kullanıcıya ait" yazılmaz (RLS gibi sahte bulut da reddeder)', async () => {
  const world = createWorld();
  await seedUserA(world);
  world.cloud.session = 'B';
  const app = world.boot();
  await app.load();
  await app.sync('B');
  const wrongOwner = world.cloud.calls.filter(call => call.op === 'upsert-reddedildi');
  assert.equal(wrongOwner.length, 0, 'B oturumunda A kimlikli yazma denenmedi');
  assert.equal([...world.cloud.tables.user_words.values()].filter(row => row.user_id === 'B').length, 0);
});

test('zaman aşımı (forceOpen) yalnızca SAHİBİ DOĞRULANMIŞ yerel veri varken kapıyı açar (çevrimdışı kullanım)', async () => {
  const world = createWorld();
  let app = world.boot();
  await app.load();
  await login(world, app, 'A');
  await addWord(app, 'Haus');
  world.cloud.online = false;
  app = world.boot();
  await app.load();                                                  // eşitleme hiç bitmedi
  assert.equal(app.gateFor('A', { dataSynced: false, forceOpen: false }).isUserDataSynced, false, 'bekleme sürerken kapalı');
  assert.equal(app.gateFor('A', { dataSynced: false, forceOpen: true }).isUserDataSynced, true, 'sahibi A doğrulanmış: açık');
  assert.equal(app.gateFor('B', { dataSynced: false, forceOpen: true }).isUserDataSynced, false, 'B için hiçbir koşulda açılmaz');
});

test('eşzamanlı iki eşitleme (üst üste tetikleyiciler) aynı veriyi iki kez park etmez', async () => {
  const world = createWorld();
  await seedUserA(world);
  world.cloud.session = 'B';
  const app = world.boot();
  await app.load();
  await Promise.all([app.sync('B'), app.sync('B')]);
  assert.equal(parkedOf(world, 'A', 'words').length, 1);
  assert.equal(parkedOf(world, 'A', 'sessions').length, 1);
});

test('büyük veri: 3000 kelimelik eski kayıt karantinaya alınır ve onayla eksiksiz geri yüklenir', async () => {
  const world = createWorld();
  seedLegacy(world, { sessions: 1, words: 3000 });
  world.cloud.session = 'A';
  let app = world.boot();
  await app.load();
  await app.sync('A');
  assert.equal((await app.store.summarizeLegacyRecords()).words, 3000);
  assert.deepEqual(app.W.getState().words, []);
  await app.store.restoreLegacyRecords('A');
  assert.equal(app.W.getState().words.length, 3000);
  assert.equal(diskJson(world, KEY.words).length, 3000);
  assert.equal(parkedOf(world, '__unknown__', 'words').length, 0);
});

// ─── Kısmi kurtarma (oturum listesi 100 kayıtla sınırlı) ─────────────────────
const legacySessionsOnDisk = (world, n) => world.disk.set(KEY.sessions, JSON.stringify(
  Array.from({ length: n }, (_, i) => session('leg' + i, { date: Date.now() - 10_000 - i * 1000 })),
));
// Listeye sığmayan oturumlar: onaydan önce sahibi bilinmeyen parkta, onaydan sonra kullanıcının salt okunur arşivinde.
const parkedSessionIds = (world) => parkedKeys(world)
  .filter(key => /^@wortly:parked:[^:]+:(sessions|archive):/.test(key) && !/^@wortly:parked:(?!__unknown__)[^:]+:sessions:/.test(key))
  .flatMap(key => JSON.parse(JSON.parse(world.disk.get(key)).raw).map(s => s.id));

test('250 eski oturum: özet 100 eklenebilir + 150 bekleyen; kurtarma kısmi sonuç verir ve kısmi mesaj üretir', async () => {
  const { describeRestoreOutcome } = require('./support/legacy-restore-loader.js');
  const world = createWorld();
  legacySessionsOnDisk(world, 250);
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');

  const before = await app.store.summarizeLegacyRecords();
  assert.equal(before.sessions, 100);
  assert.equal(before.waiting, 150);

  const result = await app.store.restoreLegacyRecords('A');
  assert.equal(result.sessions, 100);
  assert.equal(result.waiting, 150);
  const message = describeRestoreOutcome({ restored: result.total, waiting: result.waiting });
  assert.equal(message.tone, 'partial');
  assert.equal(app.S.getState().sessions.length, 100);
  assert.equal(new Set([...idsOf(app.S.getState().sessions), ...parkedSessionIds(world)]).size, 250, 'hiçbir kayıt kaybolmadı');

  const after = await app.store.summarizeLegacyRecords();
  assert.equal(after.sessions, 0, 'eklenebilecek yeni kayıt kalmadı');
  assert.equal(after.waiting, 0, 'sahibi bilinmeyen parkta bekleyen kalmadı: sığmayanlar A hesabının arşivinde');
  assert.equal((await app.store.loadArchivedSessions('A')).length, 150);
});

test('ikinci kurtarma denemesi ve çift onay: bekleyenleri çoğaltmaz, hiçbir şey eklemez, mesaj "yeni kayıt eklenmedi"', async () => {
  const { describeRestoreOutcome } = require('./support/legacy-restore-loader.js');
  const world = createWorld();
  legacySessionsOnDisk(world, 250);
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');
  await app.store.restoreLegacyRecords('A');

  const [second, third] = await Promise.all([app.store.restoreLegacyRecords('A'), app.store.restoreLegacyRecords('A')]);
  for (const result of [second, third]) {
    assert.equal(result.total, 0);
    assert.equal(result.waiting, 150);
    assert.equal(describeRestoreOutcome({ restored: result.total, waiting: result.waiting }).tone, 'nothing');
  }
  assert.equal(app.S.getState().sessions.length, 100);
  assert.equal(new Set(parkedSessionIds(world)).size, 150);
  assert.equal(parkedSessionIds(world).length, 150, 'park kaydında çoğalma yok');
});

test('mevcut oturumlar kurtarma sırasında EZİLMEZ ve listeden çıkarılmaz: yalnızca boş yer (40) kadar eklenir', async () => {
  const world = createWorld();
  legacySessionsOnDisk(world, 250);
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');
  for (let i = 0; i < 60; i += 1) await app.S.getState().saveSession(session('loc' + i, { date: Date.now() - i }));
  const localBefore = idsOf(app.S.getState().sessions);
  assert.equal(localBefore.length, 60);

  const summary = await app.store.summarizeLegacyRecords();
  assert.equal(summary.sessions, 40);
  assert.equal(summary.waiting, 210);
  const result = await app.store.restoreLegacyRecords('A');
  assert.equal(result.sessions, 40);
  assert.equal(result.waiting, 210);
  const localAfter = idsOf(app.S.getState().sessions);
  assert.equal(localAfter.length, 100);
  for (const id of localBefore) assert.ok(localAfter.includes(id), 'mevcut oturum korundu ' + id);
  assert.equal(new Set([...localAfter, ...parkedSessionIds(world)]).size, 310, '60 + 250: hiçbiri kaybolmadı');
});

test('tamamı sığıyorsa başarı mesajı; kelimeler ve tekrar durumları yalnızca gerçekten yeni olanlar kadar sayılır', async () => {
  const { describeRestoreOutcome } = require('./support/legacy-restore-loader.js');
  const world = createWorld();
  seedLegacy(world, { sessions: 30, words: 3 });
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');
  await app.W.getState().addWord({ german: 'Mevcut', article: '', turkish: 'm', isCustom: true });

  const result = await app.store.restoreLegacyRecords('A');
  assert.equal(result.words, 3);
  assert.equal(result.sessions, 30);
  assert.equal(result.reviewStates, 1);
  assert.equal(result.waiting, 0);
  assert.equal(describeRestoreOutcome({ restored: result.total, waiting: result.waiting }).tone, 'success');
  const again = await app.store.restoreLegacyRecords('A');
  assert.equal(again.total, 0, 'ikinci onayda sayılar şişmez');
});

test('A→B→A: kısmi kurtarmadan sonra bekleyen kayıtlar B\'ye eklenmez ve silinmez; A\'nın eklenenleri A için kalır', async () => {
  const world = createWorld();
  legacySessionsOnDisk(world, 120);
  world.cloud.session = 'A';
  let app = world.boot();
  await app.load();
  await app.sync('A');
  await app.store.restoreLegacyRecords('A');                       // 100 eklendi, 20 bekliyor
  await app.sync('A');                                             // eklenenler buluta gider
  assert.equal(world.cloud.tables.study_sessions.size, 100);
  await logoutWithWipe(world, app);

  app = world.boot();
  await app.load();
  await login(world, app, 'B');
  assert.deepEqual(app.S.getState().sessions, [], 'B A\'nın kurtarılan oturumlarını görmez');
  assert.equal(world.cloud.tables.study_sessions.size, 100, 'B adına hiçbir oturum yüklenmedi');
  assert.equal(parkedSessionIds(world).length, 20, 'bekleyen 20 kayıt silinmedi');
  await logoutWithWipe(world, app);

  app = world.boot();
  await app.load();
  await login(world, app, 'A');
  assert.equal(app.S.getState().sessions.length, 100, 'A bulut verisini geri alır');
});

test('eşitleme hatası: kısmi kurtarma sonrası çevrimdışıyken kayıtlar kuyrukta, bekleyenler parkta; hiçbiri kaybolmaz', async () => {
  const world = createWorld();
  legacySessionsOnDisk(world, 130);
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');
  world.cloud.online = false;
  const result = await app.store.restoreLegacyRecords('A');
  assert.equal(result.sessions, 100);
  assert.equal(result.waiting, 30);
  assert.ok(await app.store.getPendingChangeCount('A') >= 100);
  assert.equal(world.cloud.tables.study_sessions.size, 0);
  world.cloud.online = true;
  await app.sync('A');
  assert.equal(world.cloud.tables.study_sessions.size, 100);
  assert.equal(parkedSessionIds(world).length, 30);
});

// ─── Sahibi bilinmeyen kayıtlar: açık onay, bekletme, arşiv ──────────────────
const deviceAccounts = (world) => JSON.parse(world.disk.get('@wortly:device-accounts') ?? '[]');

test('tek hesap kullanıldıysa teklif "offer"; onay verilmeden hiçbir şey eklenmez/yüklenmez; cihaz geçmişi yalnızca A', async () => {
  const world = createWorld();
  seedLegacy(world);
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');
  const offer = await app.store.getLegacyOffer('A');
  assert.equal(offer.state, 'offer');
  assert.deepEqual({ w: offer.summary.words, s: offer.summary.sessions, r: offer.summary.reviewStates }, { w: 2, s: 2, r: 1 });
  assert.deepEqual(deviceAccounts(world), ['A']);
  assert.deepEqual(app.W.getState().words, [], 'onay yok: eklenmedi');
  assert.equal(world.cloud.tables.study_sessions.size, 0);
  assert.equal(parkedOf(world, '__unknown__', 'words').length, 1, 'kayıtlar silinmeden parkta');
});

test('iki hesap kullanıldıysa teklif "hold": kurtarma ENGELLENİR, başka hesaba aktarım yok, kayıtlar parkta kalır', async () => {
  const world = createWorld();
  seedLegacy(world);
  let app = world.boot();
  await app.load();
  await login(world, app, 'A');
  await logoutWithWipe(world, app);
  app = world.boot();
  await app.load();
  await login(world, app, 'B');
  assert.deepEqual(deviceAccounts(world), ['A', 'B']);

  assert.equal((await app.store.getLegacyOffer('B')).state, 'hold', 'B: belirsiz sahiplik');
  assert.equal((await app.store.getLegacyOffer('A')).state, 'hold', 'A: belirsiz sahiplik');
  const attempt = await app.store.restoreLegacyRecords('B');
  assert.equal(attempt.blocked, true);
  assert.equal(attempt.total, 0);
  assert.deepEqual(app.W.getState().words, [], 'B ye hiçbir kelime aktarılmadı');
  assert.deepEqual(app.S.getState().sessions, []);
  assert.equal(world.cloud.tables.user_words.size, 0);
  assert.equal(parkedOf(world, '__unknown__', 'words').length, 1, 'kayıtlar silinmedi');
  assert.equal(parkedOf(world, '__unknown__', 'sessions').length, 1);
});

test('hesap geçmişi bozuksa güvenli taraf: "hold" ve geçmişin üzerine yazılmaz', async () => {
  const world = createWorld();
  seedLegacy(world);
  world.disk.set('@wortly:device-accounts', '{bozuk');
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');
  assert.equal((await app.store.getLegacyOffer('A')).state, 'hold');
  assert.equal((await app.store.restoreLegacyRecords('A')).blocked, true);
  assert.equal(world.disk.get('@wortly:device-accounts'), '{bozuk', 'bozuk geçmiş ezilmedi');
});

test('250 oturum + tek hesap: 100 yerelde, 150 hesabın arşivinde; arşiv kuyruğa/buluta KATILMAZ; çift kurtarma çoğaltmaz', async () => {
  const world = createWorld();
  legacySessionsOnDisk(world, 250);
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');
  const first = await app.store.restoreLegacyRecords('A');
  const [second, third] = await Promise.all([app.store.restoreLegacyRecords('A'), app.store.restoreLegacyRecords('A')]);
  assert.equal(first.sessions, 100);
  assert.equal(first.waiting, 150);
  for (const result of [second, third]) { assert.equal(result.total, 0); assert.equal(result.waiting, 150); }

  const local = idsOf(app.S.getState().sessions);
  assert.equal(local.length, 100, '100 sınırı aşılmadı');
  const archived = await app.store.loadArchivedSessions('A');
  assert.equal(archived.length, 150);
  assert.equal(new Set(archived.map(s => s.id)).size, 150, 'çoğalma yok');
  for (const item of archived) assert.ok(!local.includes(item.id), 'arşiv ile yerel liste ayrık');
  assert.deepEqual(archived.map(s => s.date), archived.map(s => s.date).sort((a, b) => b - a), 'yeniden eskiye');

  await app.sync('A');
  assert.equal(world.cloud.tables.study_sessions.size, 100, 'arşiv buluta gitmedi');
  assert.equal(await app.store.getPendingChangeCount('A'), 0);
  assert.equal(parkedOf(world, '__unknown__', 'sessions').length, 0, 'sahibi bilinmeyen park boşaldı (arşive bağlandı)');
  assert.equal(parkedOf(world, 'A', 'archive').length, 1);
});

test('arşiv otomatik geri yüklenmez: yeniden açılış + eşitleme sonrası liste 100 kalır, arşiv korunur', async () => {
  const world = createWorld();
  legacySessionsOnDisk(world, 130);
  world.cloud.session = 'A';
  let app = world.boot();
  await app.load();
  await app.sync('A');
  await app.store.restoreLegacyRecords('A');
  app = world.boot();
  await app.load();
  await app.sync('A');
  assert.equal(app.S.getState().sessions.length, 100);
  assert.equal((await app.store.loadArchivedSessions('A')).length, 30);
});

test('B, A nın arşivini göremez; A→B→A sonrası A arşivini geri görür', async () => {
  const world = createWorld();
  legacySessionsOnDisk(world, 120);
  world.cloud.session = 'A';
  let app = world.boot();
  await app.load();
  await app.sync('A');
  await app.store.restoreLegacyRecords('A');
  await app.sync('A');
  await logoutWithWipe(world, app);

  app = world.boot();
  await app.load();
  await login(world, app, 'B');
  assert.deepEqual(await app.store.loadArchivedSessions('B'), [], 'B arşivi görmez');
  assert.equal((await app.store.getLegacyOffer('B')).archived, 0);
  assert.deepEqual(app.S.getState().sessions, []);
  assert.equal(parkedOf(world, 'A', 'archive').length, 1, 'A nın arşivi silinmedi');
  await logoutWithWipe(world, app);

  app = world.boot();
  await app.load();
  await login(world, app, 'A');
  assert.equal((await app.store.loadArchivedSessions('A')).length, 20);
  assert.equal(app.S.getState().sessions.length, 100);
});

test('çevrimdışı: kurtarma ve arşiv okuma ağ gerektirmez; kuyruk yalnızca yerel 100 kaydı içerir', async () => {
  const world = createWorld();
  legacySessionsOnDisk(world, 150);
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');
  world.cloud.online = false;
  const callsBefore = world.cloud.calls.length;
  const result = await app.store.restoreLegacyRecords('A');
  assert.equal(result.sessions, 100);
  assert.equal((await app.store.loadArchivedSessions('A')).length, 50);
  assert.equal(world.cloud.calls.length, callsBefore, 'kurtarma ağ çağrısı yapmadı');
  assert.equal(await app.store.getPendingChangeCount('A'), 100);
});

test('başka kimlik, tek-hesap cihazda aktarım yapamaz; boş kimlikle arşiv boş', async () => {
  const world = createWorld();
  legacySessionsOnDisk(world, 120);
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');
  assert.deepEqual(await app.store.loadArchivedSessions(''), []);
  const blocked = await app.store.restoreLegacyRecords('NOT-A');
  assert.equal(blocked.blocked, true);
  assert.deepEqual(app.S.getState().sessions, []);
});

test('aynı milisaniyede başlatılan iki oturum farklı kimlik alır (kimlik çakışması kaydı sessizce düşürmez)', async () => {
  const world = createWorld();
  const app = world.boot();
  await app.load();
  const ids = new Set();
  for (let i = 0; i < 200; i += 1) {
    app.S.getState().startSession({ type: 'yazma', wordIds: [], score: 0, total: 1 });
    ids.add(app.S.getState().currentSession.id);
  }
  assert.equal(ids.size, 200);
});

// ─── Mini quiz bildirimi: hesap sahipliği (GERÇEK mağaza + sahte depolama/bulut) ───────────────────────
async function onboarded(world, userId, words = ['Haus', 'Baum', 'Auto']) {
  world.cloud.session = userId;
  const app = world.boot();
  await app.load();
  await app.sync(userId);
  await app.U.getState().completeOnboarding('Test ' + userId, 'A1');
  for (const german of words) await addWord(app, german);
  return app;
}

test('mini quiz bildirimi: kelime yalnızca bildirimi alan hesabın kendi verisinden seçilir; hariç tutulan kelime tekrarlanmaz', async () => {
  const world = createWorld();
  const app = await onboarded(world, 'A');
  const first = app.mini.getMiniQuizReminderContent('A');
  assert.ok(first && first.wordId, 'içerik üretildi');
  assert.equal(first.body, require('../utils/reminder-quiz.ts').QUIZ_REMINDER_BODY, 'bildirim gövdesi sabit: kelime/çeviri yok');
  for (const word of app.W.getState().words) {
    assert.ok(!first.body.includes(word.german) && !first.body.includes(word.turkish), 'gövdede kullanıcı verisi yok');
  }
  const second = app.mini.getMiniQuizReminderContent('A', [first.wordId]);
  assert.ok(!second || second.wordId !== first.wordId, 'hariç tutulan kelime tekrarlanmaz');
  assert.equal(app.mini.getMiniQuizReminderContent(''), null, 'kullanıcı kimliği yoksa içerik yok');
});

test('mini quiz: bellekteki veri başka hesaba aitse (hesap değişimi/yarım çıkış) HİÇBİR kelime seçilmez ve A\'nın kelimesi B\'ye sızmaz', async () => {
  const world = createWorld();
  let app = await onboarded(world, 'A', ['GeheimWort', 'Baum', 'Auto']);
  const secretId = app.W.getState().words.find(w => w.german === 'GeheimWort').id;

  // Oturum B'ye geçti ama çıkış temizliği yapılmadı (uygulama kapandı): henüz eşitleme olmadan bellekte A'nın verisi var.
  world.cloud.session = 'B';
  app = world.boot();
  await app.load();
  assert.equal(app.mini.getMiniQuizReminderContent('B'), null, 'sahibi başka hesap: içerik yok');

  await app.sync('B');
  const content = app.mini.getMiniQuizReminderContent('B');
  assert.ok(!content || (content.wordId !== secretId && !content.body.includes('GeheimWort')), 'B\'ye A\'nın kelimesi sızmadı');
  assert.equal(app.mini.getMiniQuizReminderContent('A'), null, 'bellekte B var: A için içerik üretilmez');
  assert.equal(app.route.getNotificationRoute({ wordId: secretId }).startsWith('/mini-quiz'), false, 'B, A\'nın kelime kimliğiyle mini quiz açamaz');
});

test('mini quiz: sahibi bilinmeyen eski kayıtlar bildirime/yönlendirmeye girmez (onaylanana kadar gizli)', async () => {
  const world = createWorld();
  seedLegacy(world, { sessions: 1, words: 3 });
  world.cloud.session = 'A';
  const app = world.boot();
  await app.load();
  await app.sync('A');
  await app.U.getState().completeOnboarding('A', 'A1');
  const content = app.mini.getMiniQuizReminderContent('A');
  assert.ok(!content || !/Alt\d/.test(content.body), 'eski (sahipsiz) kelime bildirim metnine girmedi');
  assert.equal(app.route.getNotificationRoute({ wordId: 'leg0' }).startsWith('/mini-quiz'), false);
});

test('bildirim rotası: bu hesapta var olan kelime mini quiz\'i açar; silinmiş/bilinmeyen kimlik tekrar akışına düşer', async () => {
  const world = createWorld();
  const app = await onboarded(world, 'A');
  const own = app.W.getState().words.find(w => w.german === 'Haus').id;
  assert.equal(app.route.getNotificationRoute({ wordId: own }), `/mini-quiz?wordId=${encodeURIComponent(own)}`);
  assert.equal(app.route.getNotificationRoute({ wordId: 'yok-boyle-bir-id' }).startsWith('/mini-quiz'), false);
  assert.equal(app.route.getNotificationRoute({}).startsWith('/mini-quiz'), false);
  await app.W.getState().deleteWord(own);
  assert.equal(app.route.getNotificationRoute({ wordId: own }).startsWith('/mini-quiz'), false, 'silinen kelime için mini quiz açılmaz');
});

test('mini quiz yanıtı (GERÇEK mağaza): kelime ilerlemesi güncellenir, çalışma oturumu OLUŞMAZ, aynı soru iki kez kaydedilmez', async () => {
  const world = createWorld();
  const app = await onboarded(world, 'A');
  const [staticId] = app.staticIds();
  const guard = require('../utils/mini-quiz-answer.ts').createMiniQuizAnswerGuard();
  const deps = { updateMastery: app.W.getState().updateMastery, updateStreak: app.U.getState().updateStreak };
  const results = await Promise.all([
    require('../utils/mini-quiz-answer.ts').recordMiniQuizAnswer(guard, '0:' + staticId, staticId, true, deps),
    require('../utils/mini-quiz-answer.ts').recordMiniQuizAnswer(guard, '0:' + staticId, staticId, true, deps),
  ]);
  assert.deepEqual(results, [true, false]);
  assert.equal(app.W.getState().reviewStates[staticId].masteryLevel, 1, 'seviye bir kez yükseldi (iki kez değil)');
  assert.deepEqual(app.S.getState().sessions, [], 'tek soruluk mini quiz çalışma oturumu kaydetmez');
  assert.equal(world.cloud.tables.study_sessions.size, 0);
  assert.deepEqual(JSON.parse(world.disk.get(KEY.sessions) ?? '[]'), [], 'diskte de oturum yok');
});

test('mini quiz yanıtı + öğrenme senkronu AÇIK: ilerleme bir kez kuyruğa girip buluta gider; bayrak kapalıyken yeni tabloya istek yok', async () => {
  for (const flag of [false, true]) {
    const world = createWorld();
    world.cloud.session = 'A';
    const app = world.boot({ learningSync: flag ? true : null });
    await app.load();
    await app.sync('A');
    await app.U.getState().completeOnboarding('A', 'A1');
    const [staticId] = app.staticIds();
    const guard = require('../utils/mini-quiz-answer.ts').createMiniQuizAnswerGuard();
    const deps = { updateMastery: app.W.getState().updateMastery, updateStreak: app.U.getState().updateStreak };
    await require('../utils/mini-quiz-answer.ts').recordMiniQuizAnswer(guard, '0:' + staticId, staticId, true, deps);
    await require('../utils/mini-quiz-answer.ts').recordMiniQuizAnswer(guard, '0:' + staticId, staticId, true, deps);
    await app.store.flushPendingChanges('A');
    if (flag) {
      assert.equal(world.cloud.tables.user_word_progress.get(staticId).mastery_level, 1);
      assert.equal(world.cloud.calls.filter(c => c.table === 'user_word_progress').length, 1, 'ilerleme yalnızca bir kez gönderildi');
    } else {
      assert.equal(world.cloud.requests.filter(r => r.table === 'user_word_progress' || r.table === 'scenario_results').length, 0);
    }
    assert.deepEqual(app.S.getState().sessions, []);
  }
});
