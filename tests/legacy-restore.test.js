// @utils: legacy-restore
// Eski kayıt kurtarma PLANI ve kullanıcıya gösterilen açıklamalar (saf fonksiyonlar). Gerçek mağaza ve depolama
// bu dosyada YOK; gerçek mağazayla kurtarma testleri tests/store-integration.test.js içindedir.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri npm test ile çalıştırın.');
const L = require(path.join(out, 'utils', 'legacy-restore.js'));

const sessions = (n, prefix = 's', base = 1000) => Array.from({ length: n }, (_, i) => ({ id: prefix + i, date: base - i }));

test('oturum planı: boş yer kadar eklenir (en yeniler önce), kalanı bekler; mevcut kayıtlar dokunulmaz', () => {
  const current = sessions(60, 'loc');
  const plan = L.planSessionRestore(current, sessions(250, 'leg'), 100);
  assert.equal(plan.toAdd.length, 40);
  assert.equal(plan.waiting.length, 210);
  assert.equal(plan.alreadyPresent, 0);
  assert.deepEqual(plan.toAdd.map(s => s.id), sessions(40, 'leg').map(s => s.id), 'en yeni 40');
  assert.equal(current.length, 60, 'girdi değişmedi');
});

test('oturum planı: liste doluysa hiçbiri eklenmez, hepsi bekler (silinmez)', () => {
  const plan = L.planSessionRestore(sessions(100, 'loc'), sessions(5, 'leg'), 100);
  assert.equal(plan.toAdd.length, 0);
  assert.equal(plan.waiting.length, 5);
});

test('oturum planı: zaten yerelde olan ve yinelenen kayıtlar ikinci kez eklenmez ve sayılmaz', () => {
  const parked = [...sessions(3, 'a'), { id: 'a0', date: 5 }, { id: 'loc0', date: 9 }, null, { date: 1 }];
  const plan = L.planSessionRestore([{ id: 'loc0', date: 9 }], parked, 100);
  assert.deepEqual(plan.toAdd.map(s => s.id).sort(), ['a0', 'a1', 'a2']);
  assert.equal(plan.alreadyPresent, 1);
  assert.equal(plan.waiting.length, 0);
});

test('oturum planı: bozuk girdi çökertmez', () => {
  assert.deepEqual(L.planSessionRestore(null, null, 100), { toAdd: [], waiting: [], alreadyPresent: 0 });
  assert.equal(L.planSessionRestore(undefined, [{ id: 'x', date: 1 }], 0).waiting.length, 1);
});

test('kelime ve tekrar durumu planı: yalnızca gerçekten yeni olanlar sayılır', () => {
  const current = [{ id: 'w1' }];
  const parked = [{ id: 'w1', isCustom: true }, { id: 'w2', isCustom: true }, { id: 'w2', isCustom: true }, { id: 'w3', isCustom: false }];
  assert.deepEqual(L.planWordRestore(current, parked).map(w => w.id), ['w2']);
  assert.deepEqual(L.planReviewRestore({ a: { lastReviewed: 5 } }, { a: { lastReviewed: 9 }, b: { lastReviewed: 1 }, c: null }).sort(), ['a', 'b']);
  assert.deepEqual(L.planReviewRestore({ a: { lastReviewed: 9 } }, { a: { lastReviewed: 5 } }), []);
});

test('açıklama: kısmi kurtarmada ASLA tam başarı mesajı verilmez; veri güvende açıkça söylenir', () => {
  const partial = L.describeRestoreOutcome({ restored: 100, waiting: 150 });
  assert.equal(partial.tone, 'partial');
  assert.match(partial.text, /100 kayıt hesabına eklendi/);
  assert.match(partial.text, /150/);
  assert.match(partial.text, /kayıt sınırı/);
  assert.match(partial.text, /güvende, silinmedi/);
});

test('açıklama: hiçbir şey eklenemediyse "nothing" ve başarı iddiası yok; tamamı eklendiyse başarı', () => {
  const none = L.describeRestoreOutcome({ restored: 0, waiting: 150 });
  assert.equal(none.tone, 'nothing');
  assert.ok(!/hesabına eklendi/.test(none.text));
  assert.match(none.text, /çoğaltmaz/);
  assert.deepEqual(L.describeRestoreOutcome({ restored: 12, waiting: 0 }), { tone: 'success', text: '12 kayıt hesabına eklendi.' });
  assert.equal(L.describeRestoreOutcome({ restored: 0, waiting: 0 }).tone, 'nothing');
});

test('bekleyen kayıt açıklaması: yoksa boş, varsa sayıyı ve nedeni içerir', () => {
  assert.equal(L.describeWaiting(0), '');
  assert.match(L.describeWaiting(150), /150 çalışma kaydı/);
  assert.match(L.describeWaiting(150), /silinmedi/);
});

// ─── Sahibi bilinmeyen kayıtlar: teklif / bekletme ve arşiv sayfalama ────────
test('teklif durumu: yalnızca tek hesap kullanıldıysa ve o hesapla girildiyse "offer"; aksi halde "hold"; kayıt yoksa "none"', () => {
  assert.equal(L.legacyOfferState(['A'], 'A', true), 'offer');
  assert.equal(L.legacyOfferState(['A'], 'A', false), 'none');
  assert.equal(L.legacyOfferState(['A', 'B'], 'A', true), 'hold', 'iki hesap: sahiplik belirsiz');
  assert.equal(L.legacyOfferState(['A', 'B'], 'B', true), 'hold');
  assert.equal(L.legacyOfferState(['A'], 'B', true), 'hold', 'başka hesap tek kullanıcıyı taklit edemez');
  assert.equal(L.legacyOfferState([], 'A', true), 'hold', 'geçmiş yok: doğrulanamaz');
  assert.equal(L.legacyOfferState(null, 'A', true), 'hold', 'geçmiş okunamadı');
  assert.equal(L.legacyOfferState(['A'], null, true), 'hold');
  assert.equal(L.legacyOfferState(['A', 'A'], 'A', true), 'offer', 'tekrarlar tek hesap sayılır');
});

test('cihaz hesap geçmişi: tekrar eklenmez, bozuk girdiler elenir', () => {
  assert.deepEqual(L.addDeviceAccount([], 'A'), ['A']);
  assert.deepEqual(L.addDeviceAccount(['A'], 'A'), ['A']);
  assert.deepEqual(L.addDeviceAccount(['A'], 'B'), ['A', 'B']);
  assert.deepEqual(L.addDeviceAccount([null, '', 'A'], 'B'), ['A', 'B']);
  assert.deepEqual(L.addDeviceAccount(null, 'A'), ['A']);
});

test('sayfalama: sayfa büyüdükçe kayıt eklenir, hiçbir kayıt atlanmaz; geçersiz girdi güvenli', () => {
  const items = Array.from({ length: 45 }, (_, i) => i);
  assert.deepEqual([L.paginate(items, 1, 20).items.length, L.paginate(items, 1, 20).hasMore], [20, true]);
  assert.deepEqual([L.paginate(items, 3, 20).items.length, L.paginate(items, 3, 20).hasMore], [45, false]);
  assert.equal(L.paginate(items, 0, 0).items.length, 1, 'taban değerlere yuvarlanır');
  assert.equal(L.paginate([], 1, 20).total, 0);
  assert.match(L.HOLD_MESSAGE, /doğrulanam/);
  assert.match(L.OFFER_CAVEAT, /doğrulanam/);
});
