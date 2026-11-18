// @utils: grammar-quiz, grammar-validation
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('Bu testleri npm test ile çalıştırın.');
const { GRAMMAR_LESSONS, getGrammarLesson, isGrammarLevelLocked } = require(path.join(out, 'constants', 'grammar.js'));
const { validateGrammarCatalog } = require(path.join(out, 'utils', 'grammar-validation.js'));
const { startGrammarQuiz, selectGrammarAnswer, nextGrammarQuestion } = require(path.join(out, 'utils', 'grammar-quiz.js'));

test('sekiz ders A1-B1 seviyelerinde sıfat ve edatları kapsar', () => {
  assert.equal(GRAMMAR_LESSONS.length, 8);
  assert.deepEqual(GRAMMAR_LESSONS.map(lesson => lesson.level), ['A1', 'A1', 'A2', 'A2', 'A2', 'B1', 'B1', 'B1']);
  for (const level of ['A1', 'A2', 'B1']) {
    assert.ok(GRAMMAR_LESSONS.some(lesson => lesson.level === level && lesson.topic === 'adjective'));
    assert.ok(GRAMMAR_LESSONS.some(lesson => lesson.level === level && lesson.topic === 'preposition'));
  }
  assert.deepEqual(validateGrammarCatalog(), []);
});

test('liste ve doğrudan ders bağlantısı için seviye kuralı tutarlı', () => {
  assert.equal(isGrammarLevelLocked('A1', undefined), false);
  assert.equal(isGrammarLevelLocked('A2', 'A1'), true);
  assert.equal(isGrammarLevelLocked('B1', 'A2'), true);
  assert.equal(isGrammarLevelLocked('A1', 'B1'), false);
  assert.equal(getGrammarLesson('olmayan'), undefined);
});

test('cevap yalnızca bir kez sayılır, geçersiz seçenek sayılmaz', () => {
  const initial = startGrammarQuiz();
  const answered = selectGrammarAnswer(initial, 1, 1, 3);
  assert.equal(answered.correctCount, 1);
  assert.equal(selectGrammarAnswer(answered, 1, 1, 3), answered);
  assert.equal(selectGrammarAnswer(initial, 9, 1, 3), initial);
});

test('cevapsız ilerlenmez; son sorudan sonra sonuç gösterilir ve tekrar sıfırlanır', () => {
  let state = startGrammarQuiz();
  assert.equal(nextGrammarQuestion(state, 2), state);
  state = selectGrammarAnswer(state, 0, 0, 3);
  state = nextGrammarQuestion(state, 2);
  assert.deepEqual(state, { questionIndex: 1, selectedIndex: null, correctCount: 1, finished: false });
  state = selectGrammarAnswer(state, 0, 2, 3);
  state = nextGrammarQuestion(state, 2);
  assert.equal(state.finished, true);
  assert.equal(state.correctCount, 1);
  assert.deepEqual(startGrammarQuiz(), { questionIndex: 0, selectedIndex: null, correctCount: 0, finished: false });
});
