// @utils: achievements, progress-stats, timestamps
// Günlük sayaçların bayat "şimdi" ile bozulmaması (saf fonksiyonlar). Ekran ve kancalar kapsam dışıdır;
// kancalar `freshNow` ile aynı kuralı kullanır.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const A = require(path.join(out, 'utils', 'achievements.js'));
const P = require(path.join(out, 'utils', 'progress-stats.js'));
const T = require(path.join(out, 'utils', 'timestamps.js'));

const MIN = 60 * 1000;
// 2026-11-04 12:00 Türkiye saati (09:00 UTC); gün tanımı testlerde açıkça Türkiye günüdür.
const STALE = Date.UTC(2026, 10, 4, 9, 0, 0);       // ekranın açılışta aldığı "şimdi"
const CLOCK = STALE + 20 * MIN;                       // gerçek saat: 20 dakika sonra
const dayKeyOf = A.TURKEY_DAY_KEY;
const reviewed = (n, at) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`w${i}`, { masteryLevel: 2, lastReviewed: at + i * 1000 }]));

test('freshNow: gerçek saat bayat değerden ileriyse onu, değilse bayat olmayanı verir', () => {
  assert.equal(T.freshNow(STALE, CLOCK), CLOCK);
  assert.equal(T.freshNow(CLOCK, STALE), CLOCK);          // saat geri gitse bile geriye gitmez
  assert.equal(T.freshNow(Number.NaN, CLOCK), CLOCK);
  assert.equal(T.freshNow(undefined, CLOCK), CLOCK);
});

test('hata tanımı: bayat now ile 5 dakikadan sonra yazılan geçerli damgalar sayılmaz', () => {
  const states = { old: { masteryLevel: 1, lastReviewed: STALE - MIN }, ...reviewed(5, CLOCK - 5000) };
  assert.equal(P.countReviewedToday(states, [], new Date(STALE), dayKeyOf), 1);   // yalnızca "old" sayılır
});

test('düzeltme: freshNow ile aynı damgaların hepsi sayılır', () => {
  const states = { old: { masteryLevel: 1, lastReviewed: STALE - MIN }, ...reviewed(5, CLOCK - 5000) };
  assert.equal(P.countReviewedToday(states, [], new Date(T.freshNow(STALE, CLOCK)), dayKeyOf), 6);
});

test('gerçekten fazla gelecekteki damga freshNow ile de sayılmaz; 5 dakika payı korunur', () => {
  const now = T.freshNow(STALE, CLOCK);
  const states = {
    ok: { masteryLevel: 1, lastReviewed: CLOCK - MIN },
    withinSkew: { masteryLevel: 1, lastReviewed: CLOCK + 4 * MIN },
    tooFar: { masteryLevel: 1, lastReviewed: CLOCK + 10 * MIN },
    invalid: { masteryLevel: 1, lastReviewed: 'bozuk' },
  };
  assert.equal(P.countReviewedToday(states, [], new Date(now), dayKeyOf), 2);
});

test('gün sınırı: dünün damgası bugüne sayılmaz (gece yarısı yenilemesi gerçek saatle de çalışır)', () => {
  const yesterday = STALE - 24 * 60 * MIN;
  const states = { y: { masteryLevel: 1, lastReviewed: yesterday }, t: { masteryLevel: 1, lastReviewed: CLOCK - MIN } };
  assert.equal(P.countReviewedToday(states, [], new Date(T.freshNow(STALE, CLOCK)), dayKeyOf), 1);
  const nextDay = Date.UTC(2026, 10, 4, 21, 30, 0);   // 00:30 TR, sonraki gün
  assert.equal(P.countReviewedToday(states, [], new Date(T.freshNow(nextDay, nextDay + MIN)), dayKeyOf), 0);
});

test('Günlük Görevler: freshNow ile "5 farklı kelime" ve "alıştırma" bayat now yüzünden düşmez', () => {
  const session = { id: 's1', type: 'dogru-yanlis', wordIds: [], score: 5, total: 5, date: CLOCK - 2000 };
  const base = { sessions: [session], scenarioResults: [], reviewStates: reviewed(5, CLOCK - 9000), words: [], profile: null, dayKey: dayKeyOf };
  const task = (tasks, id) => tasks.find(t => t.id === id);

  const stale = A.computeDailyTasks({ ...base, now: STALE });
  assert.equal(task(stale, 'words').current, 0);
  assert.equal(task(stale, 'exercises').current, 0);

  const fresh = A.computeDailyTasks({ ...base, now: T.freshNow(STALE, CLOCK) });
  assert.equal(task(fresh, 'words').current, 5);
  assert.equal(task(fresh, 'words').completed, true);
  assert.equal(task(fresh, 'exercises').current, 1);
});
