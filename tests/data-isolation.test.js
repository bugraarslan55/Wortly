// @utils: data-ownership, latest-guard, ownership
// Hesaplar arası veri izolasyonu mantığı (saf fonksiyonlar + bu mantığı uygulayan küçük bir sahte "cihaz").
// Gerçek AsyncStorage, Supabase, mağaza ve ekran bu testlerin kapsamında DEĞİLDİR; mağazadaki uygulama
// (reconcile/park/restore) bu aynı yardımcıları kullanır ancak cihazda ayrıca denenmelidir.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const D = require(path.join(out, 'utils', 'data-ownership.js'));
const G = require(path.join(out, 'utils', 'latest-guard.js'));

const access = (userId, datasets) => D.evaluateLocalAccess({
  userId,
  datasets: {
    profile: { owner: null, hasData: false }, words: { owner: null, hasData: false },
    review: { owner: null, hasData: false }, sessions: { owner: null, hasData: false }, ...datasets,
  },
});

// ─── Karar matrisi ───────────────────────────────────────────────────────────
test('sahiplik kararı: kendi / boş / başka kullanıcı / bilinmeyen', () => {
  assert.equal(D.verdictFor({ owner: 'A', userId: 'A', hasData: true }), 'mine');
  assert.equal(D.verdictFor({ owner: 'A', userId: 'A', hasData: false }), 'mine');
  assert.equal(D.verdictFor({ owner: null, userId: 'A', hasData: false }), 'empty');
  assert.equal(D.verdictFor({ owner: 'B', userId: 'A', hasData: false }), 'empty', 'veri yoksa sızacak bir şey yok');
  assert.equal(D.verdictFor({ owner: 'B', userId: 'A', hasData: true }), 'foreign');
  assert.equal(D.verdictFor({ owner: null, userId: 'A', hasData: true }), 'unknown');
  assert.equal(D.verdictFor({ owner: '', userId: 'A', hasData: true }), 'unknown');
});

test('sahibi bilinmeyen veri yalnızca bu kullanıcı adına bekleyen değişiklik (kanıt) varsa kendisinin sayılır; başkasınınki sayılmaz', () => {
  assert.equal(D.verdictFor({ owner: null, userId: 'A', hasData: true, hasOwnPendingChange: true }), 'mine');
  assert.equal(D.verdictFor({ owner: 'B', userId: 'A', hasData: true, hasOwnPendingChange: true }), 'foreign', 'kanıt başka sahibi geçersiz kılmaz');
});

test('eylem: yalnızca kendi veri tutulur; başkasınınki ve bilinmeyen PARK edilir (silinmez/bağlanmaz)', () => {
  assert.equal(D.actionFor('mine'), 'keep');
  assert.equal(D.actionFor('empty'), 'adopt');
  assert.equal(D.actionFor('foreign'), 'park-foreign');
  assert.equal(D.actionFor('unknown'), 'park-unknown');
});

// ─── Yerel erişim (forceOpen güvenliği) ──────────────────────────────────────
test('A→B: A\'nın verisi bellekte iken B oturumu açılırsa veri gösterilmez', () => {
  const result = access('B', { words: { owner: 'A', hasData: true }, sessions: { owner: 'A', hasData: true } });
  assert.equal(result.verified, false);
  assert.deepEqual(result.blocked, ['words', 'sessions']);
});

test('sahibi bilinmeyen eski veri hiçbir kullanıcıya gösterilmez', () => {
  for (const user of ['A', 'B']) {
    const result = access(user, { profile: { owner: null, hasData: true }, review: { owner: undefined, hasData: true } });
    assert.equal(result.verified, false);
    assert.deepEqual(result.blocked, ['profile', 'review']);
  }
});

test('çevrimdışı açılış: sahibi bu kullanıcı olarak doğrulanmış yerel veri gösterilir', () => {
  const result = access('A', {
    profile: { owner: 'A', hasData: true }, words: { owner: 'A', hasData: true },
    review: { owner: 'A', hasData: true }, sessions: { owner: 'A', hasData: true },
  });
  assert.deepEqual(result, { verified: true, blocked: [] });
});

test('yeni kullanıcı (veri yok) ve oturumsuz durum engellenmez', () => {
  assert.equal(access('NEW', {}).verified, true);
  assert.equal(access(null, { words: { owner: 'A', hasData: true } }).verified, true, 'oturum yoksa kapı auth ekranına yönlendirir');
});

test('zaman aşımı güvenlik kontrolünü atlayamaz: erişim kararı yalnızca sahipliğe bağlıdır (süre girdisi yok)', () => {
  const blocked = { words: { owner: 'A', hasData: true } };
  // Aynı girdi, "ne kadar beklenirse beklensin" aynı sonucu verir.
  assert.equal(access('B', blocked).verified, false);
  assert.equal(access('B', blocked).verified, false);
  assert.equal(D.evaluateLocalAccess.length, 1, 'tek parametre: kullanıcı ve veri kümeleri');
});

test('eşitleme hatasında bile başka hesabın verisi engelli kalır; kendi verisi açık kalır', () => {
  assert.equal(access('B', { sessions: { owner: 'A', hasData: true } }).verified, false);
  assert.equal(access('B', { sessions: { owner: 'B', hasData: true } }).verified, true);
});

// ─── Park anahtarları ve zarf ────────────────────────────────────────────────
test('park anahtarları sahibe özeldir, zaman damgalıdır ve birbirini ezmez', () => {
  const a1 = D.parkedKey('A', 'words', 100);
  const a2 = D.parkedKey('A', 'words', 200);
  const b1 = D.parkedKey('B', 'words', 100);
  const unknown = D.parkedKey(null, 'sessions', 300);
  assert.equal(new Set([a1, a2, b1, unknown]).size, 4);
  assert.deepEqual(D.parkedKeysFor([a2, b1, unknown, a1, '@wortly:words'], 'A', 'words'), [a1, a2], 'eskiden yeniye, yalnızca A');
  assert.deepEqual(D.parkedKeysFor([a1, b1, unknown], 'B'), [b1]);
  assert.deepEqual(D.parkedKeysFor([a1, b1, unknown], D.UNKNOWN_OWNER), [unknown]);
});

test('park anahtarı ayrıştırma: bozuk/yabancı anahtarlar yok sayılır', () => {
  assert.deepEqual(D.parseParkedKey(D.parkedKey('user-1', 'review', 5)), { ownerId: 'user-1', dataset: 'review', at: 5 });
  assert.equal(D.parseParkedKey('@wortly:words'), null);
  assert.equal(D.parseParkedKey('@wortly:parked:A:bilinmeyen:5'), null);
  assert.equal(D.parseParkedKey('@wortly:parked:A:words:abc'), null);
});

test('park zarfı: bozuk AsyncStorage değeri çökertmez (null), geçerli olan eksiksiz açılır', () => {
  const text = D.wrapParked('["x"]', 123);
  assert.deepEqual(D.unwrapParked(text), { version: 1, parkedAt: 123, raw: '["x"]' });
  for (const bad of [null, undefined, '', 'bozuk{', '{"version":2}', '{"version":1,"raw":5,"parkedAt":1}', '[]']) {
    assert.equal(D.unwrapParked(bad), null);
  }
});

// ─── Birleştirme (geri yükleme) ──────────────────────────────────────────────
test('geri yükleme: mevcut kayıt kazanır, park edilenler yalnızca eksikleri tamamlar; girdi değişmez', () => {
  const current = [{ id: 'a', v: 'yeni' }];
  const parked = [{ id: 'a', v: 'eski' }, { id: 'b', v: 'b' }, null, { v: 'idsiz' }];
  const copy = JSON.stringify([current, parked]);
  assert.deepEqual(D.mergeParkedById(current, parked), [{ id: 'a', v: 'yeni' }, { id: 'b', v: 'b' }]);
  assert.equal(JSON.stringify([current, parked]), copy);
});

test('tekrar durumları birleştirme: daha yeni çalışma kazanır, bozuk kayıtlar atlanır', () => {
  const merged = D.mergeReviewStates(
    { w1: { masteryLevel: 2, lastReviewed: 500 }, w2: { masteryLevel: 1, lastReviewed: 100 } },
    { w1: { masteryLevel: 3, lastReviewed: 100 }, w2: { masteryLevel: 3, lastReviewed: 900 }, w3: { masteryLevel: 1 }, bad: null },
  );
  assert.equal(merged.w1.masteryLevel, 2);
  assert.equal(merged.w2.masteryLevel, 3);
  assert.ok(merged.w3);
  assert.ok(!('bad' in merged));
});

// ─── Sahte cihaz: store'daki uzlaştırma akışının aynısı ──────────────────────
function device() {
  return { storage: {}, memory: { sessions: [], owner: null } };
}
// store/index.ts -> parkIfNotMine + temizleme + sahip atama + geri yükleme akışının özeti
function reconcile(dev, userId, { parkFails = false, hasPending = false } = {}) {
  const owner = dev.storage['owner'] ?? null;
  const sessions = dev.memory.sessions;
  const action = D.actionFor(D.verdictFor({ owner, userId, hasData: sessions.length > 0, hasOwnPendingChange: hasPending }));
  if (action === 'park-foreign' || action === 'park-unknown') {
    if (parkFails) return false;                       // park edilemedi: veri yerinde, gizli
    dev.storage[D.parkedKey(owner, 'sessions', Object.keys(dev.storage).length + 1)] = D.wrapParked(JSON.stringify(sessions), 1);
    dev.memory.sessions = [];
  }
  dev.storage['owner'] = userId;
  dev.memory.owner = userId;
  for (const key of D.parkedKeysFor(Object.keys(dev.storage), userId, 'sessions')) {
    const envelope = D.unwrapParked(dev.storage[key]);
    if (envelope) dev.memory.sessions = D.mergeParkedById(dev.memory.sessions, JSON.parse(envelope.raw));
    delete dev.storage[key];
  }
  return true;
}
const sessionsOf = (ids) => ids.map(id => ({ id }));

test('A→B: A\'nın oturumları B\'ye gösterilmez ama SİLİNMEZ (park edilir)', () => {
  const dev = device();
  dev.storage.owner = 'A'; dev.memory.owner = 'A'; dev.memory.sessions = sessionsOf(['a1', 'a2']);
  assert.equal(reconcile(dev, 'B'), true);
  assert.deepEqual(dev.memory.sessions, [], 'B hiçbir A oturumu görmez');
  const parked = D.parkedKeysFor(Object.keys(dev.storage), 'A', 'sessions');
  assert.equal(parked.length, 1);
  assert.deepEqual(JSON.parse(D.unwrapParked(dev.storage[parked[0]]).raw), sessionsOf(['a1', 'a2']), 'A\'nın verisi korundu');
});

test('A→B→A: A geri dönünce park edilen verisi kendiliğinden geri gelir; B\'nin verisi karışmaz', () => {
  const dev = device();
  dev.storage.owner = 'A'; dev.memory.sessions = sessionsOf(['a1']);
  reconcile(dev, 'B');
  dev.memory.sessions = sessionsOf(['b1']);              // B çalıştı
  reconcile(dev, 'A');                                    // A tekrar girdi
  assert.deepEqual(dev.memory.sessions, sessionsOf(['a1']));
  assert.deepEqual(D.parkedKeysFor(Object.keys(dev.storage), 'B', 'sessions').length, 1, 'B\'nin verisi park edildi');
  reconcile(dev, 'B');
  assert.deepEqual(dev.memory.sessions, sessionsOf(['b1']));
});

test('sahibi bilinmeyen eski kayıtlar: hiçbir kullanıcıya bağlanmaz, karantinada kalır, hiçbir şey silinmez', () => {
  const dev = device();
  dev.memory.sessions = sessionsOf(['old1', 'old2']);   // sahip anahtarı yok
  reconcile(dev, 'A');
  assert.deepEqual(dev.memory.sessions, []);
  const unknownKeys = D.parkedKeysFor(Object.keys(dev.storage), D.UNKNOWN_OWNER, 'sessions');
  assert.equal(unknownKeys.length, 1);
  reconcile(dev, 'B');                                    // başka kullanıcı da göremez
  assert.deepEqual(dev.memory.sessions, []);
  assert.equal(D.parkedKeysFor(Object.keys(dev.storage), D.UNKNOWN_OWNER, 'sessions').length, 1, 'karantina korunuyor');
});

test('sahibi bilinmeyen veri, bu kullanıcı adına bekleyen değişiklik (kanıt) varsa kendisinin sayılır', () => {
  const dev = device();
  dev.memory.sessions = sessionsOf(['mine1']);
  reconcile(dev, 'A', { hasPending: true });
  assert.deepEqual(dev.memory.sessions, sessionsOf(['mine1']));
});

test('park edilemezse veri yerinde kalır ve gizli sayılır (silme yok, sahiplik atanmaz)', () => {
  const dev = device();
  dev.storage.owner = 'A'; dev.memory.sessions = sessionsOf(['a1']);
  assert.equal(reconcile(dev, 'B', { parkFails: true }), false);
  assert.deepEqual(dev.memory.sessions, sessionsOf(['a1']), 'veri silinmedi');
  assert.equal(dev.storage.owner, 'A', 'sahip B\'ye atanmadı');
  const blocked = access('B', { sessions: { owner: dev.storage.owner, hasData: dev.memory.sessions.length > 0 } });
  assert.equal(blocked.verified, false, 'kapı açılmaz: güvenli hata ekranı');
});

test('aynı hesapla yeniden giriş: kendi verisi olduğu gibi kalır, park oluşmaz', () => {
  const dev = device();
  dev.storage.owner = 'A'; dev.memory.sessions = sessionsOf(['a1', 'a2']);
  reconcile(dev, 'A');
  assert.deepEqual(dev.memory.sessions, sessionsOf(['a1', 'a2']));
  assert.equal(Object.keys(dev.storage).filter(key => key.includes('parked')).length, 0);
});

test('uzlaştırma yinelenirse (tekrar dene) veri çoğalmaz ve kaybolmaz', () => {
  const dev = device();
  dev.storage.owner = 'A'; dev.memory.sessions = sessionsOf(['a1']);
  reconcile(dev, 'B'); reconcile(dev, 'B'); reconcile(dev, 'B');
  assert.deepEqual(dev.memory.sessions, []);
  assert.equal(D.parkedKeysFor(Object.keys(dev.storage), 'A', 'sessions').length, 1);
});

// ─── Çıkış ve yarışlar ───────────────────────────────────────────────────────
test('çıkış sırasında devam eden okuma yeni hesabın verisini ezemez (son istek kazanır)', async () => {
  const guard = G.createLatestGuard();
  const memory = { owner: null, data: [] };
  const read = (owner, delay, data) => (async () => {
    const token = guard.begin();
    await new Promise(resolve => setTimeout(resolve, delay));
    if (!guard.isLatest(token)) return false;
    memory.owner = owner; memory.data = data;
    return true;
  })();
  const slowA = read('A', 30, ['a']);
  guard.invalidate();                                      // çıkış
  const fastB = read('B', 2, ['b']);                       // B girdi
  assert.equal(await fastB, true);
  assert.equal(await slowA, false);
  assert.deepEqual(memory, { owner: 'B', data: ['b'] });
});

test('çıkış sırasında devam eden yazma: çıkış önce yazmaların bitmesini bekler (yazma sonrası silme sırası)', async () => {
  const events = [];
  const writes = new Set();
  const withWrite = (task) => { const run = task(); writes.add(run); run.finally(() => writes.delete(run)); return run; };
  const drain = async () => { await Promise.allSettled([...writes]); };
  withWrite(async () => { await new Promise(resolve => setTimeout(resolve, 20)); events.push('yazma-bitti'); });
  await drain();
  events.push('silme');
  assert.deepEqual(events, ['yazma-bitti', 'silme'], 'geç biten yazma silinen veriyi geri getirmez');
});

test('bozuk AsyncStorage: zarf, anahtar ve birleştirme bozuk girdide çökmez', () => {
  assert.doesNotThrow(() => D.mergeParkedById([], null));
  assert.doesNotThrow(() => D.mergeReviewStates({}, null));
  assert.deepEqual(D.parkedKeysFor([], 'A'), []);
  assert.equal(D.unwrapParked('\u0000\u0001'), null);
});

test('farklı hesabın yerel kayıtlarını görme girişimi: sahiplik kontrolü bellekteki veriyi gizler', () => {
  const O = require(path.join(out, 'utils', 'ownership.js'));
  assert.equal(O.isOwnedByUser('A', 'B', true), false);
  assert.equal(O.isOwnedByUser('A', 'B'), false);
});
