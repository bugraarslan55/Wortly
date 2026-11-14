// @utils: scenario-engine
// "Yanlışlarımı Tekrar Et" için saf mantık: yanlış adımların tespiti, tekrar turunun gezinmesi ve ana sonucun korunması.
// Ekran, ses ve gerçek kayıt bu testlerin kapsamında DEĞİLDİR (ekran davranışı cihazda denenmelidir).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const E = require(path.join(out, 'utils', 'scenario-engine.js'));

const say = (n) => ({ type: 'say', speaker: 'Kasiyer', german: `Satz ${n}.`, turkish: `Cümle ${n}.` });
const reply = (n) => ({
  type: 'reply', prompt: `Görev ${n}`, german: `Antwort ${n}.`, turkish: `Cevap ${n}.`,
  wrongOptions: [`Falsch ${n}a.`, `Falsch ${n}b.`],
});
// 0 say, 1 reply, 2 say, 3 reply, 4 say, 5 reply, 6 say, 7 reply
const STEPS = [say(1), reply(1), say(2), reply(2), say(3), reply(3), say(4), reply(4)];
const wrongOption = { id: 'wrong-0', correct: false };
const otherWrong = { id: 'wrong-1', correct: false };
const rightOption = { id: 'correct', correct: true };

/** Ana tur: 1. adım ilk denemede doğru; 3. adım bir yanlış sonra doğru; 5. adım iki yanlış sonra doğru; 7. adım ilk denemede doğru. */
function mainProgress() {
  let progress = {};
  progress = E.answerOption(progress, 1, rightOption);
  progress = E.answerOption(progress, 3, wrongOption);
  progress = E.answerOption(progress, 3, rightOption);
  progress = E.answerOption(progress, 5, wrongOption);
  progress = E.answerOption(progress, 5, otherWrong);
  progress = E.answerOption(progress, 5, rightOption);
  progress = E.answerOption(progress, 7, rightOption);
  return progress;
}

test('yanlış adımlar: yalnızca ilk denemede yanlış bilinen cevap adımları, senaryodaki sırasıyla', () => {
  assert.deepEqual(E.missedStepIndexes(STEPS, mainProgress()), [3, 5]);
});

test('yanlış adım sayısı sonuç ekranındaki "yanlış denenen" ile tutarlıdır', () => {
  const progress = mainProgress();
  assert.equal(E.missedStepIndexes(STEPS, progress).length, E.scoreScenario(STEPS, progress).wrong);
});

test('yanlış cevap yoksa liste boştur ve tekrar turu başlamaz (buton gösterilmez)', () => {
  let progress = {};
  for (const index of [1, 3, 5, 7]) progress = E.answerOption(progress, index, rightOption);
  assert.deepEqual(E.missedStepIndexes(STEPS, progress), []);
  assert.equal(E.startReview(STEPS, progress), null);
});

test('boş/eksik ilerleme ve boş adım listesi çökertmez', () => {
  assert.deepEqual(E.missedStepIndexes(STEPS, {}), []);
  assert.deepEqual(E.missedStepIndexes([], mainProgress()), []);
  assert.equal(E.startReview([], {}), null);
});

test('konuşma (say) adımları yanlış sayılmaz', () => {
  const progress = { 0: { solved: true, firstTry: false, wrongIds: ['wrong-0'] } };
  assert.deepEqual(E.missedStepIndexes(STEPS, progress), []);
});

test('tekrar turu: yanlış adımlarla, sırayla başlar; başlangıç konumu 0', () => {
  const run = E.startReview(STEPS, mainProgress());
  assert.deepEqual(run, { indexes: [3, 5], position: 0 });
  assert.equal(E.reviewStepIndex(run), 3);
  assert.equal(E.isLastReviewStep(run), false);
});

test('tekrar turu gezinmesi: ileri sırayla gider, sonda bitiş (null) döner; geri 0\'da durur; girdi değişmez', () => {
  const start = E.startReview(STEPS, mainProgress());
  const second = E.reviewNext(start);
  assert.deepEqual(second, { indexes: [3, 5], position: 1 });
  assert.equal(E.reviewStepIndex(second), 5);
  assert.equal(E.isLastReviewStep(second), true);
  assert.equal(E.reviewNext(second), null);
  assert.deepEqual(start, { indexes: [3, 5], position: 0 });
  assert.deepEqual(E.reviewPrevious(second), start);
  assert.deepEqual(E.reviewPrevious(start), start);
});

test('tek yanlış adım: ilk adım aynı zamanda sondur', () => {
  let progress = E.answerOption({}, 1, rightOption);
  progress = E.answerOption(progress, 3, otherWrong);
  progress = E.answerOption(progress, 3, rightOption);
  const run = E.startReview(STEPS, progress);
  assert.deepEqual(run, { indexes: [3], position: 0 });
  assert.equal(E.isLastReviewStep(run), true);
  assert.equal(E.reviewNext(run), null);
});

test('tekrar sırasındaki cevaplar ana ilerlemeyi ve ilk sonuç puanını DEĞİŞTİRMEZ', () => {
  const main = mainProgress();
  const snapshot = JSON.parse(JSON.stringify(main));
  const scoreBefore = E.scoreScenario(STEPS, main);

  // Tekrar turu ayrı bir ilerleme haritasında oynanır: önce yanlış, sonra doğru, ayrıca ilk denemede doğru.
  let review = {};
  review = E.answerOption(review, 3, wrongOption);
  review = E.answerOption(review, 3, rightOption);
  review = E.answerOption(review, 5, rightOption);

  assert.deepEqual(main, snapshot);
  assert.deepEqual(E.scoreScenario(STEPS, main), scoreBefore);
  assert.deepEqual(scoreBefore, { total: 4, correct: 2, wrong: 2, percent: 50 });
  // Tekrar tur sonucu kendi haritasındadır; ana puan "ilk deneme"yi korur.
  assert.equal(review[5].firstTry, true);
  assert.equal(main[5].firstTry, false);
});

test('tekrar turunda da cevap adımı doğru seçilmeden ilerlenemez; çözülünce serbest kalır', () => {
  const run = E.startReview(STEPS, mainProgress());
  const step = STEPS[E.reviewStepIndex(run)];
  let review = {};
  assert.equal(E.canContinue(step, review[3]), false);
  review = E.answerOption(review, 3, wrongOption);
  assert.equal(E.canContinue(step, review[3]), false);
  review = E.answerOption(review, 3, rightOption);
  assert.equal(E.canContinue(step, review[3]), true);
});

test('tekrar turu bittikten sonra aynı yanlışlar tekrar oynanabilir (ana ilerleme aynı kaldığı için)', () => {
  const main = mainProgress();
  const first = E.startReview(STEPS, main);
  const second = E.startReview(STEPS, main);
  assert.deepEqual(first, second);
});

test('tekrar turu için seçenekler ana turdan bağımsız yeniden karıştırılabilir (doğru cevap hep tek)', () => {
  const rng = (() => { let seed = 7; return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; })();
  const options = E.buildOptions(STEPS[3], rng);
  assert.equal(options.filter(option => option.correct).length, 1);
  assert.equal(options.length, 3);
});
