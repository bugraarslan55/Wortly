// @utils: known-words, progress-stats, achievements, spaced-repetition
// Genel kalite kontrolünde bulunan hataların regresyon testleri (saf mantık). `npm test` ile çalışır.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const load = (name) => require(path.join(out, 'utils', `${name}.js`));

const { makeIsKnownWordId, withoutReviewState } = load('known-words');
const stats = load('progress-stats');
const A = load('achievements');
const { getReviewState } = load('spaced-repetition');

const NOON = Date.UTC(2026, 10, 2, 9, 0, 0);
const custom = (id, extra = {}) => ({ id, german: 'x', article: '', turkish: 'y', addedAt: 1, masteryLevel: 0, isCustom: true, ...extra });
const isStatic = (id) => id.startsWith('goethe-');
const mastered = (ids) => Object.fromEntries(ids.map(id => [id, { masteryLevel: 3, lastReviewed: NOON }]));

// ─── Silinmiş kelimelerin kalıntı kayıtları istatistiğe girmesin ─────────────

test('bilinen kimlik: konu kelimeleri ve cihazdaki kişisel kelimeler', () => {
  const known = makeIsKnownWordId([custom('mine'), { ...custom('notCustom'), isCustom: false }], isStatic);
  assert.equal(known('goethe-a1-haus'), true);
  assert.equal(known('mine'), true);
  assert.equal(known('notCustom'), false); // kişisel değil ve statik değil
  assert.equal(known('deleted-1'), false);
  assert.equal(makeIsKnownWordId(null, isStatic)('goethe-x'), true);
});

test('öğrenilen kelime sayısı silinmiş kelimenin kalıntı kaydını saymaz (kayıt silinmez)', () => {
  const reviewStates = mastered(['goethe-a1-haus', 'mine', 'deleted-1', 'deleted-2']);
  const words = [custom('mine')];
  const known = makeIsKnownWordId(words, isStatic);
  assert.equal(stats.countLearnedWords(reviewStates, words), 4); // filtre verilmezse eski davranış
  assert.equal(stats.countLearnedWords(reviewStates, words, known), 2);
  assert.equal(Object.keys(reviewStates).length, 4, 'sayım kayıtları değiştirmemeli');
});

test('Kelime Kaşifi rozeti silinmiş kelimelerle kazanılamaz', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `deleted-${i}`);
  const snapshot = (isKnown) => ({
    now: NOON, sessions: [], scenarioResults: [], reviewStates: mastered(ids), words: [], profile: null,
    dayKey: A.TURKEY_DAY_KEY, isKnownWordId: isKnown,
  });
  const badge = (list) => list.find(b => b.id === 'kelime-kasifi');
  assert.equal(badge(A.evaluateAchievements(snapshot(undefined))).provable, true); // kalıntı sayılırsa (eski hata)
  const guarded = badge(A.evaluateAchievements(snapshot(makeIsKnownWordId([], isStatic))));
  assert.equal(guarded.provable, false);
  assert.equal(guarded.current, 0);
});

test('gerçek (var olan) kelimelerle rozet kazanılır', () => {
  const words = Array.from({ length: 10 }, (_, i) => custom(`w${i}`));
  const list = A.evaluateAchievements({
    now: NOON, sessions: [], scenarioResults: [], reviewStates: mastered(words.map(w => w.id)), words, profile: null,
    dayKey: A.TURKEY_DAY_KEY, isKnownWordId: makeIsKnownWordId(words, isStatic),
  });
  assert.equal(list.find(b => b.id === 'kelime-kasifi').provable, true);
});

test('kelime silinince ilerleme kaydı çıkarılır; kayıt yoksa aynı nesne döner', () => {
  const states = mastered(['a', 'b']);
  const next = withoutReviewState(states, 'a');
  assert.deepEqual(Object.keys(next), ['b']);
  assert.deepEqual(Object.keys(states), ['a', 'b'], 'özgün nesne değişmemeli');
  assert.equal(withoutReviewState(states, 'yok'), states);
  assert.deepEqual(withoutReviewState({}, 'x'), {});
});

// ─── Kelime detayı: konu kelimesinin seviyesi reviewStates'ten okunur ─────────

test('konu kelimesinin gerçek seviyesi reviewStates\'te; kelime nesnesindeki seviye hep 0\'dır', () => {
  const staticWord = { id: 'goethe-a1-haus', german: 'Haus', article: 'das', turkish: 'ev', addedAt: 1, masteryLevel: 0, isCustom: false };
  const states = { 'goethe-a1-haus': { masteryLevel: 2, lastReviewed: NOON } };
  assert.equal(staticWord.masteryLevel, 0);
  assert.equal(getReviewState(staticWord, states).masteryLevel, 2); // ekranda gösterilmesi gereken değer
  assert.equal(getReviewState(staticWord, {}).masteryLevel, 0);
});
