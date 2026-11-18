// @utils: grammar-quiz, grammar-validation
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('Bu testleri npm test ile çalıştırın.');
const { GRAMMAR_LESSONS, getGrammarLesson, isGrammarLevelLocked } = require(path.join(out, 'constants', 'grammar.js'));
const { validateGrammarCatalog } = require(path.join(out, 'utils', 'grammar-validation.js'));
const { startGrammarQuiz, selectGrammarAnswer, nextGrammarQuestion } = require(path.join(out, 'utils', 'grammar-quiz.js'));

test('on üç ders A1-B1 seviyelerinde sıfat ve edatları kapsar', () => {
  assert.equal(GRAMMAR_LESSONS.length, 13);
  assert.deepEqual(GRAMMAR_LESSONS.map(lesson => lesson.level), ['A1', 'A1', 'A1', 'A2', 'A2', 'A2', 'A2', 'A2', 'B1', 'B1', 'B1', 'B1', 'B1']);
  for (const level of ['A1', 'A2', 'B1']) {
    assert.ok(GRAMMAR_LESSONS.some(lesson => lesson.level === level && lesson.topic === 'adjective'));
    assert.ok(GRAMMAR_LESSONS.some(lesson => lesson.level === level && lesson.topic === 'preposition'));
  }
  assert.deepEqual(validateGrammarCatalog(), []);
});

test('mevcut sekiz ders korunur, üç yeni ders doğru seviye ve konuda eklenir', () => {
  const existing = ['a1-basic-adjectives', 'a1-basic-prepositions', 'a2-comparison', 'a2-adjective-endings',
    'a2-two-way-prepositions', 'b1-adjective-declension', 'b1-verb-prepositions', 'b1-genitive-prepositions'];
  for (const id of existing) assert.ok(getGrammarLesson(id), `mevcut ders silinmemeli: ${id}`);
  const added = [
    ['a1-dative-prepositions', 'A1', 'preposition'],
    ['a2-accusative-prepositions', 'A2', 'preposition'],
    ['a2-possessive-adjective-endings', 'A2', 'adjective'],
  ];
  for (const [id, level, topic] of added) {
    const lesson = getGrammarLesson(id);
    assert.ok(lesson, id);
    assert.equal(lesson.level, level);
    assert.equal(lesson.topic, topic);
    assert.ok(lesson.examples.length >= 3);
    assert.equal(lesson.questions.length, 4);
  }
});

test('A1 Dativ dersi altı edatı ve birleşik biçimleri anlatır; A2 Akkusativ dersi durch/gegen/um kapsar', () => {
  const dative = getGrammarLesson('a1-dative-prepositions');
  for (const word of ['aus', 'bei', 'nach', 'seit', 'von', 'zu', 'beim', 'vom', 'zum', 'zur']) {
    assert.match(dative.rule, new RegExp(`\\b${word}\\b`), `kural ${word} içermeli`);
  }
  const accusative = getGrammarLesson('a2-accusative-prepositions');
  for (const word of ['durch', 'gegen', 'um']) assert.match(accusative.rule, new RegExp(`\\b${word}\\b`));
});

test('kein/iyelik dersi eril, nötr, çoğul ve Akkusativ biçimlerini öğretir', () => {
  const lesson = getGrammarLesson('a2-possessive-adjective-endings');
  for (const form of ['mein alter Freund', 'meinen alten Freund', 'kein altes Haus', 'keine alten Bücher']) {
    assert.ok(lesson.rule.includes(form), `kural "${form}" içermeli`);
  }
  const answers = lesson.questions.map(question => question.options[question.correctIndex]);
  assert.deepEqual(answers, ['alter', 'alten', 'altes', 'alten']);
});

test('doğru cevap konumu her derste çeşitlenir (hep aynı sıradaki seçenek olmaz)', () => {
  for (const lesson of GRAMMAR_LESSONS) {
    const positions = new Set(lesson.questions.map(question => question.correctIndex));
    assert.ok(positions.size >= 2, `${lesson.id}: doğru cevap hep aynı konumda`);
  }
});

test('mevcut on bir ders korunur, iki yeni B1 dersi eklenir', () => {
  const existing = ['a1-basic-adjectives', 'a1-basic-prepositions', 'a1-dative-prepositions', 'a2-comparison',
    'a2-adjective-endings', 'a2-possessive-adjective-endings', 'a2-accusative-prepositions', 'a2-two-way-prepositions',
    'b1-adjective-declension', 'b1-verb-prepositions', 'b1-genitive-prepositions'];
  for (const id of existing) assert.ok(getGrammarLesson(id), `mevcut ders silinmemeli: ${id}`);
  for (const id of ['b1-adjective-prepositions', 'b1-pronominal-adverbs']) {
    const lesson = getGrammarLesson(id);
    assert.ok(lesson, id);
    assert.equal(lesson.level, 'B1');
    assert.equal(lesson.topic, 'preposition');
    assert.ok(lesson.examples.length >= 3);
    assert.equal(lesson.questions.length, 4);
  }
});

test('B1 sıfat + edat dersi üç temel kalıbı ve hâllerini öğretir; doğru cevaplar kalıplarla uyumlu', () => {
  const lesson = getGrammarLesson('b1-adjective-prepositions');
  for (const form of ['zufrieden mit + Dativ', 'stolz auf + Akkusativ', 'interessiert an + Dativ']) {
    assert.ok(lesson.rule.includes(form), `kural "${form}" içermeli`);
  }
  const answers = lesson.questions.map(question => question.options[question.correctIndex]);
  assert.deepEqual(answers, ['mit', 'unseren', 'einem', 'über']);
});

test('B1 edatlı zamirler dersi şey için da(r)/wo(r), kişi için edat + zamir ayrımını öğretir', () => {
  const lesson = getGrammarLesson('b1-pronominal-adverbs');
  for (const form of ['darauf', 'worauf', 'darüber', 'worüber', 'auf wen', 'über ihn']) {
    assert.ok(lesson.rule.toLowerCase().includes(form) || lesson.tip.toLowerCase().includes(form), `ders "${form}" içermeli`);
  }
  const answers = lesson.questions.map(question => question.options[question.correctIndex]);
  assert.deepEqual(answers, ['Worauf', 'darüber', 'Über wen', 'ihn']);
});

test('yeni B1 dersleri mevcut fiil + edat dersindeki kalıpları örnek olarak tekrarlamaz', () => {
  const covered = ['warte auf', 'warten auf', 'sich für', 'sprechen mit', 'denke an', 'denkst du an'];
  for (const id of ['b1-adjective-prepositions', 'b1-pronominal-adverbs']) {
    const lesson = getGrammarLesson(id);
    const texts = [...lesson.examples.map(example => example.german), ...lesson.questions.map(question => question.prompt)];
    for (const text of texts) {
      for (const phrase of covered) assert.ok(!text.toLowerCase().includes(phrase), `${id}: "${phrase}" mevcut derste işleniyor`);
    }
  }
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

test('bozuk veya bilinmeyen kullanıcı seviyesi A1 sayılır; A1 dersi asla kilitlenmez, üst seviyeler kilitli kalır', () => {
  for (const bad of ['C1', '', 'a1', 42, {}]) {
    assert.equal(isGrammarLevelLocked('A1', bad), false, `A1 açık kalmalı (${String(bad)})`);
    assert.equal(isGrammarLevelLocked('A2', bad), true);
    assert.equal(isGrammarLevelLocked('B1', bad), true);
  }
  assert.equal(isGrammarLevelLocked('B1', null), true);
  assert.equal(isGrammarLevelLocked('B1', 'B1'), false);
});

test('ders ekranı seviye kilidini doğrudan bağlantıda da uygular; liste kilitli seviyeyi göstermez', () => {
  const root = path.resolve(__dirname, '..');
  const lesson = fs.readFileSync(path.join(root, 'app', 'gramer', '[id].tsx'), 'utf8');
  const list = fs.readFileSync(path.join(root, 'app', 'gramer', 'index.tsx'), 'utf8');
  assert.match(lesson, /isGrammarLevelLocked\(lesson\.level, userLevel\)/, 'ders ekranı kilidi denetlemeli');
  assert.ok(lesson.indexOf('isGrammarLevelLocked(lesson.level, userLevel)') < lesson.indexOf('startGrammarQuiz()'),
    'kilit kontrolü quiz başlatmadan önce gelmeli');
  assert.match(list, /isGrammarLevelLocked\(activeLevel, userLevel\)/, 'liste kilitli seviyeyi seçtirmemeli');
});

test('gramer bölümü hiçbir kalıcı depoya, eşitlemeye, seriye veya kelime ilerlemesine yazmaz', () => {
  const root = path.resolve(__dirname, '..');
  const files = ['app/gramer/index.tsx', 'app/gramer/[id].tsx', 'utils/grammar-quiz.ts', 'utils/grammar-validation.ts', 'constants/grammar.ts'];
  const forbidden = [/async-storage/i, /mmkv/i, /supabase/i, /saveScenarioResult/, /updateStreak/, /useSessionStore/, /useWordStore/,
    /useAchievementStore/, /usePhrasebookStore/, /expo-file-system/, /expo-notifications/];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const pattern of forbidden) assert.ok(!pattern.test(source), `${file}: ${pattern} içermemeli`);
  }
});
