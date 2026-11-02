// @utils: ownership, safe-back, learning-report, study-recommendations, scenario-engine, achievements, progress-stats, learning-analysis, unique, spaced-repetition, timestamps, known-words
// Tüm uygulama denetiminde bulunan sorunların hedefli testleri (saf mantık). Ekranlar, gezinme yığını ve gerçek
// cihaz davranışı bu testlerin kapsamında DEĞİLDİR.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const O = require(path.join(out, 'utils', 'ownership.js'));
const B = require(path.join(out, 'utils', 'safe-back.js'));
const R = require(path.join(out, 'utils', 'learning-report.js'));

// ─── Bellekteki kişisel verinin sahipliği ────────────────────────────────────
test('sahiplik: sahibi başka kullanıcı olan veri gösterilmez, kendi verisi gösterilir', () => {
  assert.equal(O.isOwnedByUser('A', 'A'), true);
  assert.equal(O.isOwnedByUser('A', 'B'), false);
  assert.equal(O.isOwnedByUser('A', 'B', true), false, 'bilinmeyen izni, BAŞKA sahibi kapsamaz');
});

test('sahiplik: oturum yoksa hiçbir kişisel veri gösterilmez', () => {
  assert.equal(O.isOwnedByUser('A', null), false);
  assert.equal(O.isOwnedByUser('A', undefined), false);
  assert.equal(O.isOwnedByUser(null, null, true), false);
});

test('sahiplik: sahibi bilinmeyen eski yerel veri yalnızca izin verilirse gösterilir (çevrimdışı kullanıcı verisini görür)', () => {
  assert.equal(O.isOwnedByUser(null, 'A'), false, 'senaryo sonuçları: katı');
  assert.equal(O.isOwnedByUser(undefined, 'A', true), true, 'oturumlar: bilinmeyen kabul edilir');
  assert.equal(O.isOwnedByUser('', 'A', true), true);
});

test('hesap değişimi: A\'nın sahibi işaretli oturumları B için gizlenir, sonra B\'ye atanınca görünür', () => {
  const stateAfterSwitch = { owner: 'A', userId: 'B' };
  assert.equal(O.isOwnedByUser(stateAfterSwitch.owner, stateAfterSwitch.userId, true), false);
  assert.equal(O.isOwnedByUser('B', 'B', true), true); // B eşitlenince
});

// ─── Güvenli geri dönüş ──────────────────────────────────────────────────────
function fakeRouter(canGoBack) {
  const calls = [];
  return {
    calls,
    canGoBack: () => canGoBack,
    back: () => calls.push('back'),
    replace: (href) => calls.push('replace:' + href),
  };
}

test('geri dönüş: önceki ekran varsa geri gider', () => {
  const router = fakeRouter(true);
  B.goBack(router);
  assert.deepEqual(router.calls, ['back']);
});

test('geri dönüş: derin bağlantı / bildirimle soğuk açılışta (yığında ekran yok) güvenli ekrana gider, düğme ölü kalmaz', () => {
  const router = fakeRouter(false);
  B.goBack(router);
  B.goBack(router, '/(tabs)/konular');
  assert.deepEqual(router.calls, ['replace:/(tabs)', 'replace:/(tabs)/konular']);
});

// ─── Eşitleme tamamlanmazsa sonsuz yükleme yok ───────────────────────────────
const synced = { userId: 'B', localLoaded: true, profileSyncedUserId: 'B', wordsSyncedUserId: 'B', sessionsSyncedUserId: 'B' };

test('eşitleme uzun sürerse "yükleniyor" yerine güvenli "takıldı" durumu (yeniden deneme yolu) döner', () => {
  const waiting = { ...synced, sessionsSyncedUserId: null };
  assert.equal(R.reportAvailability(waiting), 'loading');
  assert.equal(R.reportAvailability({ ...waiting, stalled: true }), 'stalled');
  assert.ok(R.REPORT_STALL_MS > 0 && R.REPORT_STALL_MS <= 60000);
});

test('takıldı durumu yalnızca bekleme sırasında geçerlidir: hazırsa hazır, oturum yoksa oturum yok', () => {
  assert.equal(R.reportAvailability({ ...synced, stalled: true }), 'ready');
  assert.equal(R.reportAvailability({ ...synced, userId: null, stalled: true }), 'signed-out');
});

test('takıldı durumunda bile başka hesabın eşitlemesi "hazır" sayılmaz', () => {
  assert.equal(R.reportAvailability({ ...synced, profileSyncedUserId: 'A', stalled: true }), 'stalled');
});
