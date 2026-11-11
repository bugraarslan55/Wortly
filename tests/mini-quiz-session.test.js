// @utils: mini-quiz-session, mini-quiz-answer
// Mini Quiz oturum sınırı (saf mantık): en fazla 5 soru, tekrar yok, tamamlanma özeti, erken bitiş.
// Kapsam DIŞI (cihazda denenmeli): ekran, bildirimden açılış, gerçek mağaza yazımı.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const S = require(path.join(out, 'utils', 'mini-quiz-session.js'));
const M = require(path.join(out, 'utils', 'mini-quiz-answer.js'));

const word = (id) => ({ word: { id } });
const poolPicker = (ids) => (excludeIds) => {
  const id = ids.find((candidate) => !excludeIds.includes(candidate));
  return id ? word(id) : null;
};

/** Ekranın yaptığı döngünün saf karşılığı: ilk soru bildirimden, sonrakiler seçiciden; cevaplar sırayla verilir. */
function runQuiz({ firstId, poolIds, answers }) {
  let progress = S.createMiniQuizProgress();
  const shownIds = [firstId];
  const asked = [firstId];
  for (const correct of answers) {
    progress = S.recordMiniQuizAnswer(progress, correct);
    const step = S.nextMiniQuizStep(progress, shownIds, poolPicker(poolIds));
    if (step.kind === 'complete') return { progress, asked, completed: true };
    shownIds.push(step.question.word.id);
    asked.push(step.question.word.id);
  }
  return { progress, asked, completed: S.isMiniQuizFinished(progress) };
}

test('soru sınırı 5', () => {
  assert.equal(S.MINI_QUIZ_MAX_QUESTIONS, 5);
});

test('ilerleme her cevapta bir artar; doğru sayısı yalnızca doğrularda artar; girdi değişmez', () => {
  const start = S.createMiniQuizProgress();
  const afterRight = S.recordMiniQuizAnswer(start, true);
  const afterWrong = S.recordMiniQuizAnswer(afterRight, false);
  assert.deepEqual(start, { answered: 0, correct: 0 });
  assert.deepEqual(afterRight, { answered: 1, correct: 1 });
  assert.deepEqual(afterWrong, { answered: 2, correct: 1 });
});

test('yeni oturum her seferinde sıfırdan başlar (paylaşılan nesne yok)', () => {
  const first = S.createMiniQuizProgress();
  S.recordMiniQuizAnswer(first, true);
  const second = S.createMiniQuizProgress();
  assert.deepEqual(second, { answered: 0, correct: 0 });
  assert.notEqual(first, second);
});

test('beşinci cevaptan sonra quiz biter, öncesinde bitmez', () => {
  let progress = S.createMiniQuizProgress();
  for (let i = 1; i <= 5; i++) {
    progress = S.recordMiniQuizAnswer(progress, true);
    assert.equal(S.isMiniQuizFinished(progress), i >= 5, `cevap ${i}`);
  }
});

test('beşinci cevaptan sonra yeni soru seçilmez: seçici hiç çağrılmaz ve tamamlanma döner', () => {
  const progress = { answered: 5, correct: 3 };
  let called = 0;
  const step = S.nextMiniQuizStep(progress, ['a', 'b', 'c', 'd', 'e'], () => { called += 1; return word('f'); });
  assert.deepEqual(step, { kind: 'complete' });
  assert.equal(called, 0);
});

test('5 uygun soru varsa tam 5 farklı soru sorulur; bildirimdeki kelime ilk soru olarak 5\'e dahildir', () => {
  const result = runQuiz({
    firstId: 'notif',
    poolIds: ['notif', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7'],
    answers: [true, false, true, true, false, true, true],
  });
  assert.equal(result.asked.length, 5);
  assert.equal(result.asked[0], 'notif');
  assert.equal(new Set(result.asked).size, 5);
  assert.equal(result.completed, true);
  assert.deepEqual(result.progress, { answered: 5, correct: 3 });
});

test('seçiciye o ana kadar sorulan tüm kelimeler hariç tutulacak kimlikler olarak verilir', () => {
  const seen = [];
  const picker = (excludeIds) => { seen.push([...excludeIds]); return word('x' + seen.length); };
  const shownIds = ['notif'];
  const step = S.nextMiniQuizStep({ answered: 1, correct: 1 }, shownIds, picker);
  assert.equal(step.kind, 'question');
  assert.deepEqual(seen[0], ['notif']);
});

test('beş uygun soru yoksa mevcut sorular bitince tamamlanma gelir (quiz kapanmaz, çökmez)', () => {
  const result = runQuiz({ firstId: 'a', poolIds: ['a', 'b', 'c'], answers: [true, true, false, true, true] });
  assert.deepEqual(result.asked, ['a', 'b', 'c']);
  assert.equal(result.completed, true);
  assert.deepEqual(result.progress, { answered: 3, correct: 2 });
});

test('tek uygun soru varsa, o cevaplanınca tamamlanma gelir', () => {
  const result = runQuiz({ firstId: 'only', poolIds: ['only'], answers: [false] });
  assert.deepEqual(result.asked, ['only']);
  assert.equal(result.completed, true);
  assert.deepEqual(result.progress, { answered: 1, correct: 0 });
});

test('seçici yanlışlıkla görülmüş bir kelime verirse tekrar sorulmaz, tamamlanma döner', () => {
  const step = S.nextMiniQuizStep({ answered: 2, correct: 1 }, ['a', 'b'], () => word('a'));
  assert.deepEqual(step, { kind: 'complete' });
});

test('seçici hata verirse quiz çökmez, tamamlanma döner', () => {
  const step = S.nextMiniQuizStep({ answered: 2, correct: 1 }, ['a', 'b'], () => { throw new Error('boom'); });
  assert.deepEqual(step, { kind: 'complete' });
});

test('özet: doğru/toplam ve tam/erken bitiş bilgisi', () => {
  assert.deepEqual(S.buildMiniQuizSummary({ answered: 5, correct: 4 }), { scoreText: '4/5', cutShort: false });
  assert.deepEqual(S.buildMiniQuizSummary({ answered: 3, correct: 0 }), { scoreText: '0/3', cutShort: true });
});

test('her cevap kelime ilerlemesini ve seriyi yalnızca BİR kez günceller (çift dokunuşa rağmen); oturum kaydı yok', async () => {
  const calls = { mastery: [], streak: 0, session: 0 };
  const deps = {
    updateMastery: (id, correct) => { calls.mastery.push([id, correct]); },
    updateStreak: () => { calls.streak += 1; },
    addSession: () => { calls.session += 1; },
  };
  const guard = M.createMiniQuizAnswerGuard();
  const ids = ['a', 'b', 'c', 'd', 'e'];
  for (let serial = 0; serial < ids.length; serial++) {
    const key = `${serial}:${ids[serial]}`;
    await M.recordMiniQuizAnswer(guard, key, ids[serial], serial % 2 === 0, deps);
    await M.recordMiniQuizAnswer(guard, key, ids[serial], serial % 2 === 0, deps); // hızlı ikinci dokunuş
  }
  assert.deepEqual(calls.mastery, [['a', true], ['b', false], ['c', true], ['d', false], ['e', true]]);
  assert.equal(calls.streak, 5);
  assert.equal(calls.session, 0);
});
