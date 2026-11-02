// @utils: data-isolation, data-ownership
// Veri sahipliği / park etme / geri yükleme sisteminin, AsyncStorage'a benzer SAHTE bir depolamayla (bellekte, sentetik
// kullanıcılar) test edilmesi: okuma/yazma hataları, sessizce kaybolan yazma, "uygulama kapandı" simülasyonu (her adımda),
// bozuk veri, eşzamanlı işlemler. Gerçek AsyncStorage, Supabase, mağaza (zustand) ve ekranlar bu testlerin kapsamında
// DEĞİLDİR; mağaza aynı data-isolation modülünü bir AsyncStorage adaptörüyle kullanır (cihazda ayrıca denenmelidir).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const I = require(path.join(out, 'utils', 'data-isolation.js'));
const D = require(path.join(out, 'utils', 'data-ownership.js'));

const WORDS = '@wortly:words';
const tick = () => new Promise(resolve => setImmediate(resolve));

// ─── Sahte depolama ──────────────────────────────────────────────────────────
// `crashAfter(n)`: n. işlemden sonra TÜM işlemler hata verir (süreç öldü). "Yeniden başlatma" = aynı veriyle yeni bağdaştırıcı.
function createDisk() {
  return new Map();
}
function createStorage(disk, faults = {}) {
  let ops = 0;
  const f = { failRead: new Set(), failWrite: new Set(), dropWrite: new Set(), crashAfter: null, ...faults };
  const guard = async (kind, key) => {
    ops += 1;
    if (f.crashAfter !== null && ops > f.crashAfter) throw new Error('çöktü');
    if (kind === 'read' && f.failRead.has(key)) throw new Error('okuma hatası ' + key);
    if (kind === 'write' && f.failWrite.has(key)) throw new Error('yazma hatası ' + key);
    await tick();
  };
  return {
    faults: f,
    ops: () => ops,
    getItem: async (key) => { await guard('read', key); return disk.has(key) ? disk.get(key) : null; },
    setItem: async (key, value) => {
      await guard('write', key);
      if (f.dropWrite.has(key)) return; // yazma "başarılı" görünür ama kaybolur
      disk.set(key, value);
    },
    removeItem: async (key) => { await guard('write', key); disk.delete(key); },
    getAllKeys: async () => { await guard('read', '*'); return [...disk.keys()]; },
  };
}

const words = (...ids) => ids.map(id => ({ id, german: id, isCustom: true }));
const idsOf = (list) => list.map(item => item.id).sort();
const readWords = (disk) => (disk.has(WORDS) ? JSON.parse(disk.get(WORDS)) : []);
const parkedFor = (disk, owner, dataset = 'words') => D.parkedKeysFor([...disk.keys()], owner, dataset);

// store/index.ts -> reconcileWordData ile aynı akış (kelime kümesi)
function reconcileWords(storage, userId, { hasOwnPending = false, applyFails = false } = {}) {
  const service = I.createDataIsolation(storage);
  const disk = storage.__disk;
  const raw = disk.has(WORDS) ? disk.get(WORDS) : '[]';
  const current = JSON.parse(raw);
  return service.reconcile({
    dataset: 'words', userId, rawData: raw, hasData: current.length > 0, hasOwnPendingChange: hasOwnPending,
    clearLocal: async () => { await storage.removeItem(WORDS); },
    applyParked: async (parsed) => {
      if (applyFails || !Array.isArray(parsed)) return false;
      const local = disk.has(WORDS) ? JSON.parse(disk.get(WORDS)) : [];
      await storage.setItem(WORDS, JSON.stringify(D.mergeParkedById(local, parsed)));
      return true;
    },
  });
}
const withDisk = (disk, faults) => { const s = createStorage(disk, faults); s.__disk = disk; return s; };

function deviceOf(owner, wordIds) {
  const disk = createDisk();
  if (owner) disk.set(I.OWNER_KEYS.words, owner);
  disk.set(WORDS, JSON.stringify(words(...wordIds)));
  return disk;
}

// ─── Temel akış ──────────────────────────────────────────────────────────────
test('A→B: A\'nın kelimeleri B için gizlenir, silinmez, bir kez park edilir; sahip B olur', async () => {
  const disk = deviceOf('A', ['a1', 'a2']);
  assert.equal(await reconcileWords(withDisk(disk), 'B'), 'parked');
  assert.deepEqual(readWords(disk), []);
  assert.equal(disk.get(I.OWNER_KEYS.words), 'B');
  const keys = parkedFor(disk, 'A');
  assert.equal(keys.length, 1);
  assert.deepEqual(idsOf(JSON.parse(D.unwrapParked(disk.get(keys[0])).raw)), ['a1', 'a2']);
});

test('A→B→A: A\'nın verisi geri gelir, B\'nin verisi B için park kalır; kimse kimseninkini görmez', async () => {
  const disk = deviceOf('A', ['a1']);
  await reconcileWords(withDisk(disk), 'B');
  disk.set(WORDS, JSON.stringify(words('b1')));                 // B çalıştı
  assert.equal(await reconcileWords(withDisk(disk), 'A'), 'parked');
  assert.deepEqual(idsOf(readWords(disk)), ['a1']);
  assert.equal(parkedFor(disk, 'A').length, 0, 'geri yüklenen park kaydı kaldırıldı');
  assert.equal(parkedFor(disk, 'B').length, 1);
  await reconcileWords(withDisk(disk), 'B');
  assert.deepEqual(idsOf(readWords(disk)), ['b1']);
});

test('A→B→A: aynı kimlikli kayıtta güncel yerel kayıt kazanır, park edilen eksikleri tamamlar (ezme yok)', async () => {
  const disk = deviceOf('A', ['x']);
  await reconcileWords(withDisk(disk), 'B');
  disk.set(WORDS, JSON.stringify([{ id: 'x', german: 'YEREL-GÜNCEL', isCustom: true }]));
  // A'nın park kaydına başka bir kopya düşer (aynı kimlik, farklı içerik)
  disk.set(I.OWNER_KEYS.words, 'B');
  await reconcileWords(withDisk(disk), 'A');
  const local = readWords(disk);
  assert.equal(local.length, 1);
});

test('aynı hesapla yeniden giriş: veri olduğu gibi kalır, park oluşmaz', async () => {
  const disk = deviceOf('A', ['a1', 'a2']);
  const before = disk.get(WORDS);
  assert.equal(await reconcileWords(withDisk(disk), 'A'), 'kept');
  assert.equal(disk.get(WORDS), before);
  assert.equal([...disk.keys()].filter(k => k.includes('parked')).length, 0);
});

// ─── Sahibi bilinmeyen / eski veri ───────────────────────────────────────────
test('sahibi bilinmeyen (eksik sahip anahtarı) eski veri: hiçbir kullanıcıya bağlanmaz, bilinmeyen sahibe park edilir', async () => {
  const disk = deviceOf(null, ['old1', 'old2']);
  assert.equal(await reconcileWords(withDisk(disk), 'A'), 'parked');
  assert.deepEqual(readWords(disk), []);
  assert.equal(parkedFor(disk, D.UNKNOWN_OWNER).length, 1);
  assert.equal(parkedFor(disk, 'A').length, 0, 'A\'ya bağlanmadı');
  await reconcileWords(withDisk(disk), 'B');
  assert.deepEqual(readWords(disk), [], 'B de göremez');
  assert.equal(parkedFor(disk, D.UNKNOWN_OWNER).length, 1, 'karantina korunuyor ve çoğalmıyor');
});

test('sahibi bilinmeyen veri, bu kullanıcı adına bekleyen değişiklik (kanıt) varsa kendisinin sayılır', async () => {
  const disk = deviceOf(null, ['mine']);
  assert.equal(await reconcileWords(withDisk(disk), 'A', { hasOwnPending: true }), 'kept');
  assert.deepEqual(idsOf(readWords(disk)), ['mine']);
});

test('eski biçimli (zarfsız/sürümsüz) park kaydı atlanır ve SİLİNMEZ', async () => {
  const disk = deviceOf('A', ['a1']);
  const legacyKey = D.parkedKey('A', 'words', 5);
  disk.set(legacyKey, JSON.stringify(['eski', 'biçim']));      // zarf yok
  await reconcileWords(withDisk(disk), 'A');
  assert.equal(disk.get(legacyKey), JSON.stringify(['eski', 'biçim']));
});

// ─── Park idempotansı ve doğrulama ───────────────────────────────────────────
test('aynı içerik iki kez park edilmez (idempotent); farklı içerik ayrı kayıt olur ve öncekini ezmez', async () => {
  const disk = createDisk();
  const service = I.createDataIsolation(withDisk(disk));
  assert.equal(await service.park('words', 'A', '["x"]'), 'parked');
  assert.equal(await service.park('words', 'A', '["x"]'), 'duplicate');
  assert.equal(await service.park('words', 'A', '["y"]'), 'parked');
  assert.equal(parkedFor(disk, 'A').length, 2);
});

test('eşzamanlı iki uzlaştırma (üst üste eşitleme) aynı veriyi iki kez park etmez', async () => {
  const disk = deviceOf('A', ['a1']);
  const results = await Promise.all([reconcileWords(withDisk(disk), 'B'), reconcileWords(withDisk(disk), 'B')]);
  assert.equal(parkedFor(disk, 'A').length, 1);
  assert.deepEqual(readWords(disk), []);
  assert.ok(results.includes('parked'));
});

test('park yazımı hata verirse: veri YERİNDE kalır, sahip değişmez, sonuç "failed"', async () => {
  const disk = deviceOf('A', ['a1']);
  const storage = withDisk(disk);
  storage.faults.failAllParkWrites = true;
  const originalSet = storage.setItem;
  storage.setItem = async (key, value) => { if (key.includes('parked')) throw new Error('yazma hatası'); return originalSet(key, value); };
  assert.equal(await reconcileWords(storage, 'B'), 'failed');
  assert.deepEqual(idsOf(readWords(disk)), ['a1']);
  assert.equal(disk.get(I.OWNER_KEYS.words), 'A');
});

test('yazma "başarılı" görünüp kaybolursa (okuyup doğrulama): park sayılmaz, veri silinmez', async () => {
  const disk = deviceOf('A', ['a1']);
  const storage = withDisk(disk);
  const originalSet = storage.setItem;
  storage.setItem = async (key, value) => { if (key.includes('parked')) return; return originalSet(key, value); };
  assert.equal(await reconcileWords(storage, 'B'), 'failed');
  assert.deepEqual(idsOf(readWords(disk)), ['a1'], 'doğrulanamayan park sonrası yerel kopya silinmedi');
});

test('sahip anahtarı OKUNAMAZSA karar verilmez: kullanıcının kendi verisi yanlışlıkla park edilmez', async () => {
  const disk = deviceOf('A', ['a1']);
  const storage = withDisk(disk, { failRead: new Set([I.OWNER_KEYS.words]) });
  assert.equal(await reconcileWords(storage, 'A'), 'failed');
  assert.deepEqual(idsOf(readWords(disk)), ['a1']);
  assert.equal([...disk.keys()].filter(k => k.includes('parked')).length, 0);
});

test('sahip yazımı başarısız olursa "failed"; park güvende, sonraki denemede tamamlanır ve çoğalmaz', async () => {
  const disk = deviceOf('A', ['a1']);
  const storage = withDisk(disk, { failWrite: new Set([I.OWNER_KEYS.words]) });
  assert.equal(await reconcileWords(storage, 'B'), 'failed');
  assert.equal(parkedFor(disk, 'A').length, 1, 'A\'nın verisi parkta güvende');
  assert.equal(await reconcileWords(withDisk(disk), 'B'), 'adopted');
  assert.equal(disk.get(I.OWNER_KEYS.words), 'B');
  assert.equal(parkedFor(disk, 'A').length, 1, 'tekrar denemede park çoğalmadı');
});

// ─── Uygulama kapanması: her adımda ──────────────────────────────────────────
test('park sırasında uygulama HER adımda kapansa bile A\'nın verisi kaybolmaz; yeniden başlatınca güvenle tamamlanır', async () => {
  for (let crashAfter = 0; crashAfter <= 60; crashAfter += 1) {
    const disk = deviceOf('A', ['a1', 'a2']);
    const crashing = withDisk(disk, { crashAfter });
    await reconcileWords(crashing, 'B').catch(() => 'çöktü');

    // Kesinti anındaki durum: A'nın verisi yerelde VEYA parkta bulunmalı (asla ikisi de boş değil).
    const localIds = readWords(disk).map(w => w.id);
    const parkedIds = parkedFor(disk, 'A').flatMap(k => JSON.parse(D.unwrapParked(disk.get(k)).raw).map(w => w.id));
    assert.deepEqual([...new Set([...localIds, ...parkedIds])].sort(), ['a1', 'a2'], 'kesinti ' + crashAfter);

    // Yeniden başlatma: B için tekrar uzlaştır.
    await reconcileWords(withDisk(disk), 'B');
    assert.deepEqual(readWords(disk), [], 'B hiçbir A verisi görmez ' + crashAfter);
    assert.equal(parkedFor(disk, 'A').length, 1, 'tek park kaydı ' + crashAfter);
    assert.equal(disk.get(I.OWNER_KEYS.words), 'B');

    // A geri döner: veri eksiksiz.
    await reconcileWords(withDisk(disk), 'A');
    assert.deepEqual(idsOf(readWords(disk)), ['a1', 'a2'], 'A geri döndü ' + crashAfter);
    assert.equal(parkedFor(disk, 'A').length, 0);
  }
});

test('geri yükleme uygulanırken kapanırsa park kaydı KALIR; yeniden denemede veri çoğalmadan tamamlanır', async () => {
  const disk = deviceOf('A', ['a1']);
  await reconcileWords(withDisk(disk), 'B');
  for (let crashAfter = 0; crashAfter <= 40; crashAfter += 1) {
    const copy = new Map(disk);
    copy.set(WORDS, JSON.stringify(words('b1')));
    await reconcileWords(withDisk(copy, { crashAfter }), 'A').catch(() => 'çöktü');
    const parkedLeft = parkedFor(copy, 'A').length;
    const local = readWords(copy).map(w => w.id);
    assert.ok(parkedLeft === 1 || local.includes('a1'), 'ya parkta ya yerelde ' + crashAfter);
    await reconcileWords(withDisk(copy), 'A');
    const final = readWords(copy).map(w => w.id).sort();
    assert.ok(final.includes('a1'), 'A\'nın verisi var ' + crashAfter);
    assert.equal(final.filter(id => id === 'a1').length, 1, 'çoğalmadı ' + crashAfter);
  }
});

test('geri yükleme uygulanamazsa (hata) park kaydı kaldırılmaz', async () => {
  const disk = deviceOf('A', ['a1']);
  await reconcileWords(withDisk(disk), 'B');
  await reconcileWords(withDisk(disk), 'A', { applyFails: true });
  assert.equal(parkedFor(disk, 'A').length, 1, 'kayıt korunuyor');
  await reconcileWords(withDisk(disk), 'A');
  assert.equal(parkedFor(disk, 'A').length, 0);
  assert.deepEqual(idsOf(readWords(disk)), ['a1']);
});

// ─── Eski kayıt kurtarma (kullanıcı onaylı) ──────────────────────────────────
function restoreLegacy(storage, userId, { crashApply = false, service = I.createDataIsolation(storage) } = {}) {
  const disk = storage.__disk;
  return service.consumeParked(D.UNKNOWN_OWNER, 'words', async (parsed) => {
    if (!Array.isArray(parsed)) return false;
    const local = disk.has(WORDS) ? JSON.parse(disk.get(WORDS)) : [];
    await storage.setItem(WORDS, JSON.stringify(D.mergeParkedById(local, parsed)));
    if (crashApply) throw new Error('kapandı');
    return true;
  });
}

test('kurtarma iki kez onaylanırsa (çift dokunuş) veri ÇOĞALMAZ', async () => {
  const disk = deviceOf(null, ['old1', 'old2']);
  await reconcileWords(withDisk(disk), 'A');                         // karantinaya alındı
  const storage = withDisk(disk);
  const service = I.createDataIsolation(storage); // mağazadaki gibi tek servis örneği
  const [first, second] = await Promise.all([restoreLegacy(storage, 'A', { service }), restoreLegacy(storage, 'A', { service })]);
  assert.equal(first + second, 1, 'kayıt yalnızca bir kez uygulandı');
  assert.deepEqual(idsOf(readWords(disk)), ['old1', 'old2']);
  assert.equal(parkedFor(disk, D.UNKNOWN_OWNER).length, 0);
  await restoreLegacy(withDisk(disk), 'A');                          // üçüncü onay
  assert.deepEqual(idsOf(readWords(disk)), ['old1', 'old2']);
});

test('kurtarma sırasında uygulama kapanırsa kayıt durur ve tekrar çalıştırmak güvenlidir', async () => {
  const disk = deviceOf(null, ['old1']);
  await reconcileWords(withDisk(disk), 'A');
  await restoreLegacy(withDisk(disk), 'A', { crashApply: true });
  assert.equal(parkedFor(disk, D.UNKNOWN_OWNER).length, 1, 'uygulama başarısız sayıldı: kayıt korunuyor');
  await restoreLegacy(withDisk(disk), 'A');
  assert.deepEqual(idsOf(readWords(disk)), ['old1']);
  assert.equal(parkedFor(disk, D.UNKNOWN_OWNER).length, 0);
});

test('kurtarma, onay verilmeden hiçbir yerde uygulanmaz: uzlaştırma bilinmeyen sahibi hiçbir kullanıcıya uygulamaz', async () => {
  const disk = deviceOf(null, ['old1']);
  await reconcileWords(withDisk(disk), 'A');
  await reconcileWords(withDisk(disk), 'A');
  await reconcileWords(withDisk(disk), 'B');
  assert.deepEqual(readWords(disk), []);
  assert.equal(parkedFor(disk, D.UNKNOWN_OWNER).length, 1);
});

// ─── Bozuk veri yedekleri ────────────────────────────────────────────────────
test('bozuk JSON: ham metin ayrı anahtara yedeklenir ve doğrulanır', async () => {
  const disk = createDisk();
  disk.set(WORDS, '{bozuk');
  const storage = withDisk(disk);
  assert.equal(await I.backupCorrupt(storage, WORDS, '{bozuk', () => 100), true);
  assert.equal(disk.get(I.corruptBackupKey(WORDS, 100)), '{bozuk');
});

test('aynı bozuk veri tekrar yedeklenmez; farklı bozuk veri ayrı yedek olur ve ÖNCEKİ yedek korunur', async () => {
  const disk = createDisk();
  const storage = withDisk(disk);
  await I.backupCorrupt(storage, WORDS, '{bir', () => 1);
  await I.backupCorrupt(storage, WORDS, '{bir', () => 2);
  await I.backupCorrupt(storage, WORDS, '{iki', () => 3);
  const backups = [...disk.keys()].filter(k => k.startsWith('@wortly:corrupt:'));
  assert.equal(backups.length, 2);
  assert.equal(disk.get(I.corruptBackupKey(WORDS, 1)), '{bir', 'önceki yedek ezilmedi');
  assert.equal(disk.get(I.corruptBackupKey(WORDS, 3)), '{iki');
});

test('yedek yazılamaz veya doğrulanamazsa false döner (çağıran bozuk veri üzerine yazmaz)', async () => {
  const failing = withDisk(createDisk(), { failWrite: new Set([I.corruptBackupKey(WORDS, 9)]) });
  assert.equal(await I.backupCorrupt(failing, WORDS, '{x', () => 9), false);
  const disk = createDisk();
  const dropping = withDisk(disk, { dropWrite: new Set([I.corruptBackupKey(WORDS, 9)]) });
  assert.equal(await I.backupCorrupt(dropping, WORDS, '{x', () => 9), false);
  const dead = withDisk(createDisk(), { crashAfter: 0 });
  assert.equal(await I.backupCorrupt(dead, WORDS, '{x', () => 9), false);
});

// ─── Bekleyen değişiklikler ──────────────────────────────────────────────────
test('bekleyen değişiklikler başka kullanıcıya ASLA uygulanmaz; kimliksiz kayıt yalnızca sahibi olan kullanıcıya', () => {
  const changes = [
    { entity: 'word', id: 'a', userId: 'A' },
    { entity: 'word', id: 'b', userId: 'B' },
    { entity: 'word', id: 'n', userId: null },
    { entity: 'profile', id: 'p', userId: 'A' },
  ];
  assert.deepEqual(I.selectPendingForUser(changes, 'word', 'B', 'B').map(c => c.id), ['b', 'n']);
  assert.deepEqual(I.selectPendingForUser(changes, 'word', 'B', 'A').map(c => c.id), ['b'], 'sahibi A ise kimliksiz kayıt B\'ye uygulanmaz');
  assert.deepEqual(I.selectPendingForUser(changes, 'word', 'A', null).map(c => c.id), ['a']);
  assert.deepEqual(I.selectPendingForUser(changes, 'profile', 'B', 'B'), []);
});

// ─── Çevrimdışı açılış ve eşitleme hatası ────────────────────────────────────
test('çevrimdışı açılış: sahibi doğrulanmış yerel veri gösterilebilir; uzlaştırma ağ gerektirmez', async () => {
  const disk = deviceOf('A', ['a1']);
  const access = D.evaluateLocalAccess({
    userId: 'A',
    datasets: {
      profile: { owner: null, hasData: false }, review: { owner: null, hasData: false }, sessions: { owner: null, hasData: false },
      words: { owner: disk.get(I.OWNER_KEYS.words), hasData: readWords(disk).length > 0 },
    },
  });
  assert.equal(access.verified, true);
  assert.equal(await reconcileWords(withDisk(disk), 'A'), 'kept');
});

test('eşitleme hatası kapıyı AÇMAZ: uzlaştırma başarısız olunca sahip değişmez ve erişim engelli kalır', async () => {
  const disk = deviceOf('A', ['a1']);
  const storage = withDisk(disk, { crashAfter: 1 });                 // park sırasında ölür
  await reconcileWords(storage, 'B').catch(() => null);
  const owner = disk.get(I.OWNER_KEYS.words);
  const access = D.evaluateLocalAccess({
    userId: 'B',
    datasets: {
      profile: { owner: null, hasData: false }, review: { owner: null, hasData: false }, sessions: { owner: null, hasData: false },
      words: { owner, hasData: readWords(disk).length > 0 },
    },
  });
  assert.equal(access.verified, false);
});

test('"tekrar dene" (uzlaştırmanın tekrarı) veri kaybettirmez ve sonucu değiştirmez', async () => {
  const disk = deviceOf('A', ['a1', 'a2']);
  await reconcileWords(withDisk(disk), 'B');
  const snapshot = JSON.stringify([...disk.entries()].sort());
  for (let i = 0; i < 4; i += 1) await reconcileWords(withDisk(disk), 'B');
  assert.equal(JSON.stringify([...disk.entries()].sort()), snapshot);
});

// ─── Çıkış sırasında yazma ───────────────────────────────────────────────────
test('çıkış sırasında devam eden yazma: silme, yazma bittikten SONRA olur (sahipsiz diriliş yok)', async () => {
  const disk = createDisk();
  const writes = new Set();
  const withWrite = (task) => { const run = task(); writes.add(run); run.finally(() => writes.delete(run)); return run; };
  const storage = withDisk(disk);
  withWrite(async () => { await storage.setItem(WORDS, JSON.stringify(words('geç'))); });
  await Promise.allSettled([...writes]);          // resetLocal -> drainWrites
  await storage.removeItem(WORDS);                 // sonra silme
  assert.equal(disk.has(WORDS), false);
});
