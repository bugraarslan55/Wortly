// @utils: signout-plan, spaced-repetition
// Çıkış uyarısı mantığı (saf fonksiyonlar). Ekran/Alert davranışı bu testlerin kapsamında DEĞİLDİR.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const { buildSignOutPlan, countLocalOnlyProgress, countUnverifiedProgress } =
  require(path.join(out, 'utils', 'signout-plan.js'));

const custom = (id) => ({ id, german: 'x', article: '', turkish: 'y', addedAt: 1, masteryLevel: 0, isCustom: true });
const reviewed = (ids) => Object.fromEntries(ids.map(id => [id, { masteryLevel: 1, lastReviewed: 1000 }]));

test('yalnızca konu kelimelerinin ilerlemesi yerel-onlydir; kişisel kelimeler (user_words ile gider) sayılmaz', () => {
  const states = { ...reviewed(['goethe-a1-haus', 'goethe-a1-baum', 'mine']), never: { masteryLevel: 0 } };
  assert.equal(countLocalOnlyProgress(states, [custom('mine')]), 2); // haus + baum; 'mine' kişisel, 'never' hiç tekrar edilmemiş
  assert.equal(countLocalOnlyProgress(null, null), 0);
});

test('bayrak kapalıyken tüm yerel konu ilerlemesi doğrulanmamış sayılır', () => {
  const input = { reviewStates: reviewed(['goethe-a1-haus']), words: [] };
  assert.equal(countUnverifiedProgress({ ...input, syncEnabled: false, syncedForUser: false }), 1);
  assert.equal(countUnverifiedProgress({ ...input, syncEnabled: false, syncedForUser: true }), 1);
  assert.equal(countUnverifiedProgress({ ...input, syncEnabled: true, syncedForUser: false }), 1);
  assert.equal(countUnverifiedProgress({ ...input, syncEnabled: true, syncedForUser: true }), 0);
});

test('veri yoksa düz çıkış; onay gerekmez', () => {
  const plan = buildSignOutPlan(0, 0);
  assert.equal(plan.kind, 'plain');
  assert.equal(plan.needsDeleteConfirmation, false);
  assert.equal(plan.offerSync, false);
});

test('yalnızca konu ilerlemesi varsa: silinecek denir, açık onay gerekir ve senkron SUNULMAZ', () => {
  const plan = buildSignOutPlan(0, 7);
  assert.equal(plan.kind, 'progress');
  assert.equal(plan.needsDeleteConfirmation, true);
  assert.equal(plan.offerSync, false, '"Senkronize et ve çık" konu ilerlemesini koruyormuş izlenimi vermemeli');
  assert.match(plan.message, /7 konu kelimesi/);
  assert.match(plan.message, /silinir/);
});

test('yalnızca bekleyen değişiklik varsa senkron sunulur', () => {
  const plan = buildSignOutPlan(3, 0);
  assert.equal(plan.kind, 'pending');
  assert.equal(plan.offerSync, true);
  assert.equal(plan.needsDeleteConfirmation, true);
  assert.match(plan.message, /3 değişiklik/);
});

test('ikisi birden: senkron sunulur ama mesaj konu ilerlemesinin yine silineceğini söyler', () => {
  const plan = buildSignOutPlan(2, 5);
  assert.equal(plan.kind, 'both');
  assert.equal(plan.offerSync, true);
  assert.match(plan.message, /2 değişiklik/);
  assert.match(plan.message, /5 konu kelimesi/);
  assert.match(plan.message, /silinir/);
});

test('geçersiz sayılar (NaN, negatif, sonsuz) 0 sayılır', () => {
  assert.equal(buildSignOutPlan(NaN, -4).kind, 'plain');
  assert.equal(buildSignOutPlan(Infinity, 0).kind, 'plain');
  assert.equal(buildSignOutPlan(2.9, 0).kind, 'pending');
});
