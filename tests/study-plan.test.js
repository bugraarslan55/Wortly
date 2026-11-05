// @utils: study-plan, learning-analysis, spaced-repetition, progress-stats, timestamps, unique
// Günlük plan kelime seçimi ve adım eşleştirmesi (saf fonksiyonlar). Ekranlar ve depolama kapsam dışıdır.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const P = require(path.join(out, 'utils', 'study-plan.js'));
const { recommendDailyPlan, findDueWords } = require(path.join(out, 'utils', 'learning-analysis.js'));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime();
const word = (id, extra = {}) => ({ id, german: id, article: '', turkish: id + '-tr', addedAt: 1, masteryLevel: 0, isCustom: false, ...extra });
const range = (n, prefix = 'w', extra = {}) => Array.from({ length: n }, (_, i) => word(`${prefix}${i}`, extra));
const input = (candidates, reviewStates, goal = 10, focus = null) => {
  const dueWords = findDueWords(candidates, reviewStates, NOW);
  return { candidates, reviewStates, dueWords, dailyPlan: recommendDailyPlan(dueWords.length, focus, goal), dayKey: '2026-11-04' };
};

test('tekrarı gelen kelimeler önce alınır, kalan yer zayıf ve yeni kelimelerle dolar', () => {
  const words = range(30);
  const states = {
    w0: { masteryLevel: 1, lastReviewed: NOW - 5 * DAY },   // tekrar zamanı gelmiş
    w1: { masteryLevel: 1, lastReviewed: NOW - 3 * DAY },   // tekrar zamanı gelmiş
    w2: { masteryLevel: 1, lastReviewed: NOW - 1000 },       // zayıf, henüz zamanı gelmemiş
    w3: { masteryLevel: 3, lastReviewed: NOW - 1000 },       // öğrenilmiş: plana girmez
  };
  const plan = P.buildStudyPlan(input(words, states, 10));
  const ids = plan.words.map(w => w.id);
  assert.deepEqual(ids.slice(0, 2), ['w0', 'w1']);
  assert.equal(ids[2], 'w2');
  assert.ok(!ids.includes('w3'));
  // Tekrar varken öneri günlük hedefin yarısıdır (10 → 5): 2 tekrar + 1 zayıf + 2 yeni.
  assert.equal(plan.words.length, 5);
  assert.deepEqual([plan.dueCount, plan.weakCount, plan.newCount], [2, 1, 2]);
});

test('plan kelime ve alıştırma sayısı karttaki öneriyle aynıdır', () => {
  const words = range(60);
  const dailyPlan = recommendDailyPlan(0, null, 20);
  const plan = P.buildStudyPlan({ ...input(words, {}, 20) });
  assert.equal(plan.words.length, dailyPlan.wordCount);
  assert.equal(plan.steps.length, dailyPlan.exerciseCount);
  assert.equal(plan.steps.reduce((sum, s) => sum + s.wordIds.length, 0), plan.words.length);
  assert.ok(plan.steps.every(s => s.wordIds.length <= P.MAX_WORDS_PER_STEP));
});

test('kelime yetmezse plan küçülür; hiç kelime yoksa adım yoktur', () => {
  const few = P.buildStudyPlan(input(range(3), {}, 10));
  assert.equal(few.words.length, 3);
  assert.equal(few.steps.length, 1);
  const none = P.buildStudyPlan(input([], {}, 10));
  assert.deepEqual([none.words.length, none.steps.length], [0, 0]);
});

test('tekrarlanan kelimeler (aynı id veya aynı içerik) plana bir kez girer', () => {
  const dup = [word('a', { german: 'Haus', article: 'das', turkish: 'ev' }), word('b', { german: 'haus ', article: 'das', turkish: 'Ev' }), word('a')];
  const plan = P.buildStudyPlan(input([...dup, ...range(5)], {}, 10));
  assert.equal(plan.words.filter(w => w.german.trim().toLowerCase() === 'haus').length, 1);
  assert.equal(new Set(plan.words.map(w => w.id)).size, plan.words.length);
});

test('adaylar dışındaki (ör. kilitli seviye) kelimeler tekrar listesinden bile plana girmez', () => {
  const locked = word('locked-b1');
  const candidates = range(12);
  const states = { 'locked-b1': { masteryLevel: 1, lastReviewed: NOW - 9 * DAY } };
  const plan = P.buildStudyPlan({
    candidates, reviewStates: states, dueWords: [locked], dailyPlan: recommendDailyPlan(1, null, 10), dayKey: '2026-11-04',
  });
  assert.ok(!plan.words.some(w => w.id === 'locked-b1'));
});

test('getPlanCandidates yalnızca kişisel kelimeleri ekler ve tekilleştirir', () => {
  const topic = range(3, 't');
  const personal = [word('p1', { isCustom: true }), word('t1', { isCustom: false }), word('p1', { isCustom: true })];
  const result = P.getPlanCandidates(topic, personal);
  assert.deepEqual(result.map(w => w.id), ['t0', 't1', 't2', 'p1']);
});

test('yeni kelimelerde kişisel kelimeler önce gelir; seçim gün içinde sabittir', () => {
  const words = [...range(20, 'topic'), word('mine', { isCustom: true })];
  const a = P.buildStudyPlan(input(words, {}, 5));
  const b = P.buildStudyPlan(input(words, {}, 5));
  assert.equal(a.words[0].id, 'mine');
  assert.deepEqual(a.words.map(w => w.id), b.words.map(w => w.id));
});

test('adımlar alıştırma türlerini sırayla kullanır; yazma zayıfsa yazma ile başlar', () => {
  const words = range(40);
  assert.deepEqual(P.buildStudyPlan(input(words, {}, 40)).steps.map(s => s.type), ['dogru-yanlis', 'yazma', 'dogru-yanlis', 'yazma']);
  assert.equal(P.buildStudyPlan(input(words, {}, 20, 'yazma')).steps[0].type, 'yazma');
  assert.equal(P.buildStudyPlan(input(words, {}, 20, 'dinleme')).steps[0].type, 'dogru-yanlis');
});

test('adım oturumu: başlatıldıktan sonra kaydedilen, aynı türde ve yalnızca adım kelimelerinden oluşan oturum eşleşir', () => {
  const step = { type: 'yazma', wordIds: ['a', 'b'] };
  const s = (id, type, date, wordIds, score = 1, total = 2) => ({ id, type, date, wordIds, score, total });
  const sessions = [
    s('1', 'dogru-yanlis', 2000, ['a', 'b']),
    s('2', 'yazma', 2000, ['a', 'x']),
    s('3', 'yazma', 500, ['a', 'b']),
    s('4', 'yazma', 2000, ['b', 'a']),
  ];
  assert.equal(P.findStepSession(step, 1000, sessions).id, '4');
  assert.equal(P.findStepSession(step, null, sessions), undefined);
  assert.equal(P.findStepSession(step, 3000, sessions), undefined);
  assert.equal(P.findStepSession(step, 1000, null), undefined);
});

test('summarizeStepSessions toplam ve yüzdeyi hesaplar; boşta 0 verir', () => {
  const r = P.summarizeStepSessions([{ score: 7, total: 10 }, undefined, { score: 3, total: 10 }]);
  assert.deepEqual(r, { correct: 10, total: 20, percent: 50 });
  assert.deepEqual(P.summarizeStepSessions([]), { correct: 0, total: 0, percent: 0 });
});
