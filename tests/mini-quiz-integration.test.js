// Günlük mini quiz bildirimi ↔ hesap sahipliği / dokunma kararı / bildirim planı / günlük görevler (saf mantık).
// @utils: reminder-quiz, notification-routing, reminder-plan, achievements, progress-stats, learning-analysis, spaced-repetition, timestamps
//
// Kapsam DIŞI (cihazda denenmeli): gerçek expo-notifications teslimi, bildirime dokunma anındaki navigasyon, ekran.
// Gerçek mağaza ile hesap izolasyonu: tests/store-integration.test.js ("mini quiz" bölümü).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const Q = require(path.join(out, 'utils', 'reminder-quiz.js'));
const N = require(path.join(out, 'utils', 'notification-routing.js'));
const A = require(path.join(out, 'utils', 'achievements.js'));

const reminder = (id, kind, extra = {}) => ({ id, kind, title: 'Wortly', body: 'genel metin ' + id, date: 1000 + Number(id.replace(/\D/g, '') || 0), ...extra });
const PLAN = [reminder('r1', 'daily'), reminder('r2', 'goal'), reminder('r3', 'review'), reminder('r4', 'streak'), reminder('r5', 'daily')];

// ─── Plan süsleme ────────────────────────────────────────────────────────────
test('mini quiz yalnızca "daily" ve "review" bildirimlerine eklenir; goal/streak aynen kalır', () => {
  let n = 0;
  const plan = Q.decoratePlanWithQuiz(PLAN, () => ({ body: `soru ${++n}`, wordId: `w${n}` }));
  assert.deepEqual(plan.map(item => item.wordId), ['w1', undefined, 'w2', undefined, 'w3']);
  assert.equal(plan[1].body, 'genel metin r2');
  assert.equal(plan[3].body, 'genel metin r4');
  assert.equal(plan[0].body, 'soru 1');
});

test('her bildirim için FARKLI kelime seçilir (önceki seçimler hariç tutulur)', () => {
  const seen = [];
  Q.decoratePlanWithQuiz(PLAN, (excluded) => {
    seen.push([...excluded]);
    return { body: 'b', wordId: 'w' + (seen.length) };
  });
  assert.deepEqual(seen, [[], ['w1'], ['w1', 'w2']]);
});

test('içerik bulunamazsa/hata verirse/eksikse planlanan genel metin korunur ve plan değişmez', () => {
  for (const pick of [() => null, () => { throw new Error('x'); }, () => ({ body: '', wordId: 'w' }), () => ({ body: 'b' })]) {
    const plan = Q.decoratePlanWithQuiz(PLAN, pick);
    assert.deepEqual(plan, PLAN);
  }
});

test('süsleme girdiyi değiştirmez ve tekrar uygulamak sonucu bozmaz', () => {
  const frozen = JSON.parse(JSON.stringify(PLAN));
  const once = Q.decoratePlanWithQuiz(PLAN, () => ({ body: 'b', wordId: 'w1' }));
  assert.deepEqual(PLAN, frozen);
  assert.equal(once.length, PLAN.length);
});

// ─── Dokunma kararı: mini quiz + hesap sahipliği + tekrar dokunma ──────────────
const NOW = 1_000_000_000_000;
const tap = (data, key = 'n1:100') => ({ key, data: { type: 'study-reminder', userId: 'a', ...data } });
const ctx = (extra = {}) => ({
  tap: tap({ kind: 'daily', wordId: 'w1' }), currentUserId: 'a', appReady: true, handled: new Set(), firstSeenAt: NOW, now: NOW, ...extra,
});

test('kelime kimlikli günlük/tekrar bildirimi mini quiz\'e, kimliksiz bildirim eski hedefe gider', () => {
  assert.deepEqual(N.decideTap(ctx()), { action: 'navigate', target: 'quiz', wordId: 'w1', markHandled: true });
  assert.equal(N.decideTap(ctx({ tap: tap({ kind: 'review', wordId: 'w1' }) })).target, 'quiz');
  assert.equal(N.decideTap(ctx({ tap: tap({ kind: 'daily' }) })).target, 'home');
  assert.equal(N.decideTap(ctx({ tap: tap({ kind: 'review' }) })).target, 'review');
  // Hedef/seri bildirimi kelime kimliği taşısa bile mini quiz açmaz.
  assert.equal(N.decideTap(ctx({ tap: tap({ kind: 'goal', wordId: 'w1' }) })).target, 'home');
});

test('geçersiz kelime kimliği (sayı, boş, nesne) mini quiz açmaz', () => {
  for (const wordId of [5, '', null, { id: 1 }, ['w']]) {
    assert.equal(N.decideTap(ctx({ tap: tap({ kind: 'daily', wordId }) })).target, 'home');
  }
});

test('başka hesabın bildirimi (mini quiz dahil) hiçbir şey göstermez ve yönlendirmez', () => {
  assert.deepEqual(N.decideTap(ctx({ currentUserId: 'b' })), { action: 'ignore', markHandled: true, reason: 'other-account' });
  assert.deepEqual(N.decideTap(ctx({ tap: { key: 'k', data: { type: 'study-reminder', kind: 'daily', wordId: 'w1' } } })),
    { action: 'ignore', markHandled: true, reason: 'no-owner' });
});

test('oturum yokken ya da uygulama hazır değilken bekletilir; sahibi girince işlenir', () => {
  assert.equal(N.decideTap(ctx({ currentUserId: null })).action, 'wait');
  assert.equal(N.decideTap(ctx({ appReady: false })).action, 'wait');
  assert.equal(N.decideTap(ctx({ currentUserId: 'a', appReady: true })).action, 'navigate');
});

test('aynı dokunma iki kez (başlangıç yanıtı + dinleyici) yönlendirmez; bayat dokunma yok sayılır', () => {
  const handled = new Set();
  const first = N.decideTap(ctx({ handled }));
  assert.equal(first.action, 'navigate');
  handled.add('n1:100');
  const second = N.decideTap(ctx({ handled }));
  assert.deepEqual(second, { action: 'ignore', markHandled: false, reason: 'already-handled' });
  assert.equal(N.decideTap(ctx({ now: NOW + N.TAP_MAX_AGE_MS + 1 })).reason, 'expired');
});

test('Wortly dışı bildirim mini quiz açmaz', () => {
  assert.equal(N.decideTap(ctx({ tap: { key: 'k', data: { type: 'baska', userId: 'a', wordId: 'w1', kind: 'daily' } } })).reason, 'not-wortly');
});

// ─── Günlük görevler / rozet / analiz tutarlılığı ───────────────────────────────
const NOON = Date.UTC(2026, 10, 2, 9, 0, 0);
const snap = (extra = {}) => ({
  now: NOON, sessions: [], scenarioResults: [], reviewStates: {}, words: [], profile: null, dayKey: A.TURKEY_DAY_KEY, ...extra,
});
const quizSession = (id, extra = {}) => ({ id, type: 'dogru-yanlis', wordIds: ['w1'], score: 1, total: 1, date: NOON - 1000, ...extra });
const task = (tasks, id) => tasks.find(t => t.id === id);

test('mini quiz yanıtı: bir kelime + bir alıştırma sayılır; aynı kayıt (aynı kimlik) tekrar yazılsa bile ikinci kez sayılmaz', () => {
  const word = { id: 'w1', german: 'Haus', turkish: 'ev', article: 'das', isCustom: true, masteryLevel: 1, addedAt: 1 };
  const base = {
    words: [word],
    reviewStates: { w1: { masteryLevel: 1, lastReviewed: NOON - 1000 } },
  };
  const once = A.computeDailyTasks(snap({ ...base, sessions: [quizSession('q1')] }));
  assert.equal(task(once, 'words').current, 1);
  assert.equal(task(once, 'exercises').current, 1);
  const twiceSameId = A.computeDailyTasks(snap({ ...base, sessions: [quizSession('q1'), quizSession('q1')] }));
  assert.equal(task(twiceSameId, 'exercises').current, 1, 'aynı kimlik iki kez sayılmaz');
  const sameWordAgain = A.computeDailyTasks(snap({ ...base, sessions: [quizSession('q1'), quizSession('q2')] }));
  assert.equal(task(sameWordAgain, 'words').current, 1, 'aynı kelime tekrar cevaplanınca farklı kelime sayısı artmaz');
  assert.equal(task(sameWordAgain, 'exercises').current, 2, 'iki ayrı yanıt iki ayrı kayıttır');
});

test('1 soruluk mini quiz başarı görevini (en az 5 soru, %80) ve rozetleri şişirmez', () => {
  const tasks = A.computeDailyTasks(snap({ sessions: [quizSession('q1'), quizSession('q2'), quizSession('q3')] }));
  assert.equal(task(tasks, 'accuracy').completed, false);
  assert.equal(task(tasks, 'accuracy').current, 0);
});
