// Öğrenme mantığı birim testleri (saf fonksiyonlar). `npm test` ile çalıştırılır;
// @utils: answer-check, mastery, progress-stats, learning-analysis, spaced-repetition, word-validation
// scripts/run-unit-tests.js utils/*.ts dosyalarını geçici klasöre derler ve UTILS_OUT ile bildirir.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const load = (name) => require(path.join(out, 'utils', `${name}.js`));

const { checkGermanAnswer, normalizeGermanAnswer, describeAnswerNote } = load('answer-check');
const { nextMasteryLevel, SELF_REPORTED_MAX_MASTERY } = load('mastery');
const stats = load('progress-stats');
const { findDueWords, analyzeLearning, recommendDailyPlan } = load('learning-analysis');
const { selectWordsForReview, getNextReviewAt } = load('spaced-repetition');
const { MAX_EXAMPLE_LENGTH, getSentenceInputLimit } = load('word-validation');

const word = (overrides = {}) => ({
  id: 'w1', german: 'Apfel', article: 'der', turkish: 'elma', addedAt: 1, masteryLevel: 0, isCustom: false, ...overrides,
});

// ─── Cevap değerlendirme ────────────────────────────────────────────────────

test('tam doğru yazım notsuz kabul edilir', () => {
  const v = checkGermanAnswer(word(), 'Apfel');
  assert.deepEqual([v.correct, v.note], [true, undefined]);
});

test('artikel isteğe bağlıdır: "der Apfel" de doğru', () => {
  assert.equal(checkGermanAnswer(word(), 'der Apfel').correct, true);
  assert.equal(checkGermanAnswer(word(), 'die Apfel').correct, false); // yanlış artikel
});

test('küçük harfle yazılan isim kabul edilir ama doğru yazım bildirilir', () => {
  const v = checkGermanAnswer(word(), 'apfel');
  assert.equal(v.correct, true);
  assert.equal(v.note, 'capitalization');
  assert.match(describeAnswerNote(v), /Apfel/);
});

test('ae/oe/ue/ss alternatif yazımı kabul edilir ve standart yazım gösterilir', () => {
  const m = word({ id: 'm', german: 'Mädchen', article: 'das', turkish: 'kız' });
  const v = checkGermanAnswer(m, 'Maedchen');
  assert.equal(v.correct, true);
  assert.equal(v.note, 'transliteration');
  assert.match(describeAnswerNote(v), /Mädchen/);
  assert.equal(checkGermanAnswer(word({ german: 'Straße' }), 'Strasse').correct, true);
});

test('harf eksik bırakmak veya yazım hatası kabul edilmez', () => {
  const m = word({ german: 'Mädchen', article: 'das' });
  assert.equal(checkGermanAnswer(m, 'Madchen').correct, false); // ä yerine a
  assert.equal(checkGermanAnswer(m, 'Mädchn').correct, false);
  assert.equal(checkGermanAnswer(word(), 'Apfell').correct, false);
  assert.equal(checkGermanAnswer(word(), 'Apfel.').correct, false); // fazladan noktalama
});

test('boşluklar kırpılır ve birleştirilir, boş cevap yanlıştır', () => {
  const w = word({ german: 'guten Tag', article: '' });
  assert.equal(checkGermanAnswer(w, '  guten    Tag ').correct, true);
  assert.equal(checkGermanAnswer(w, '   ').correct, false);
  assert.equal(checkGermanAnswer(w, 'gutenTag').correct, false);
});

test('"/" ile birleşik kayıtlarda her biçim ve isteğe bağlı parça kabul edilir', () => {
  const w = word({ german: 'der Bus / die Busse', article: '' });
  assert.equal(checkGermanAnswer(w, 'die Busse').correct, true);
  const optional = word({ german: '(sich) anmelden', article: '' });
  assert.equal(checkGermanAnswer(optional, 'anmelden').correct, true);
  assert.equal(checkGermanAnswer(optional, 'sich anmelden').correct, true);
});

test('tanımlı alternatif cevap kabul edilir', () => {
  const w = word({ id: 'goethe-a1-wollen', german: 'wollen', article: '' });
  assert.equal(checkGermanAnswer(w, 'möchten').correct, true);
});

test('normalizeGermanAnswer karşılaştırma biçimi', () => {
  assert.equal(normalizeGermanAnswer(' Über  Größe '), 'ueber groesse');
});

// ─── Mastery ────────────────────────────────────────────────────────────────

test('doğru cevap seviyeyi 1 artırır, 3 üstüne çıkmaz', () => {
  assert.equal(nextMasteryLevel(0, true), 1);
  assert.equal(nextMasteryLevel(2, true), 3);
  assert.equal(nextMasteryLevel(3, true), 3);
});

test('yanlış cevap seviyeyi 1 düşürür, 0 altına inmez', () => {
  assert.equal(nextMasteryLevel(3, false), 2);
  assert.equal(nextMasteryLevel(0, false), 0);
});

test('kendi işaretin (flashcard) en fazla "Bilinçli"ye çıkarır ve mevcut seviyeyi düşürmez', () => {
  assert.equal(nextMasteryLevel(1, true, SELF_REPORTED_MAX_MASTERY), 2);
  assert.equal(nextMasteryLevel(2, true, SELF_REPORTED_MAX_MASTERY), 2);
  assert.equal(nextMasteryLevel(3, true, SELF_REPORTED_MAX_MASTERY), 3); // doğrulanmış seviye korunur
  assert.equal(nextMasteryLevel(3, false, SELF_REPORTED_MAX_MASTERY), 2);
});

// ─── Günlük hedef, seri, sayaçlar ───────────────────────────────────────────

const day = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

test('yerel gün anahtarı ve dün', () => {
  assert.equal(stats.toLocalDateKey(day(2026, 11, 2, 0)), '2026-11-02');
  assert.equal(stats.previousLocalDateKey(day(2026, 3, 1)), '2026-02-28');
});

test('bayat seri 0 görünür, bugün/dün seri korunur', () => {
  const now = day(2026, 11, 2);
  assert.equal(stats.getActiveStreak(5, '2026-11-02', now), 5);
  assert.equal(stats.getActiveStreak(5, '2026-11-01', now), 5);
  assert.equal(stats.getActiveStreak(5, '2026-10-30', now), 0);
  assert.equal(stats.getActiveStreak(0, undefined, now), 0);
});

test('bugün tekrar edilen kelime kümesi tekilleştirilir ve konu+kişisel kelimeleri sayar', () => {
  const now = day(2026, 11, 2);
  const t = now.getTime();
  const reviewStates = {
    topic1: { masteryLevel: 1, lastReviewed: t },
    custom1: { masteryLevel: 1, lastReviewed: t }, // hem reviewStates hem kelimede: bir kez sayılmalı
    old: { masteryLevel: 2, lastReviewed: t - 3 * 86400000 },
  };
  const words = [
    word({ id: 'custom1', isCustom: true, lastReviewed: t }),
    word({ id: 'custom2', isCustom: true, lastReviewed: t }), // yalnızca bulutta
    word({ id: 'topic1', isCustom: false, lastReviewed: t }), // özel değil, ikinci kez sayılmaz
  ];
  assert.equal(stats.countReviewedToday(reviewStates, words, now), 3);
  assert.equal(stats.countReviewedToday(null, null, now), 0);
});

test('öğrenilen kelime sayısı mastery 3 olanları bir kez sayar', () => {
  const reviewStates = { a: { masteryLevel: 3 }, b: { masteryLevel: 1 } };
  const words = [
    word({ id: 'a', isCustom: true, masteryLevel: 3 }),
    word({ id: 'c', isCustom: true, masteryLevel: 3 }),
    word({ id: 'b', isCustom: true, masteryLevel: 3 }), // reviewStates (1) kelimedeki değerin önüne geçer
  ];
  assert.equal(stats.countLearnedWords(reviewStates, words), 2); // a, c
});

test('tamamlanan alıştırma = oturumlar + senaryo sonuçları; günlük hedef sınırları', () => {
  assert.equal(stats.countCompletedExercises([1, 2], [3]), 3);
  assert.equal(stats.countCompletedExercises(null, undefined), 0);
  assert.equal(stats.normalizeDailyGoal(undefined), 10);
  assert.equal(stats.normalizeDailyGoal(15), 15);
  assert.equal(stats.normalizeDailyGoal(999), 50);
});

// ─── Tekrar zamanlaması ve analiz ───────────────────────────────────────────

test('hiç çalışılmamış kelimeler "tekrar bekleyen" sayılmaz', () => {
  const fresh = word({ id: 'x' });
  assert.equal(findDueWords([fresh], {}, Date.now()).length, 0);
});

test('zamanı gelen kelime tekrar listesine girer, zamanı gelmeyen girmez', () => {
  const now = Date.now();
  const reviewStates = {
    due: { masteryLevel: 1, lastReviewed: now - 2 * 86400000 }, // aralık 1 gün
    notDue: { masteryLevel: 3, lastReviewed: now - 86400000 }, // aralık 7 gün
  };
  const due = findDueWords([word({ id: 'due' }), word({ id: 'notDue' })], reviewStates, now);
  assert.deepEqual(due.map(w => w.id), ['due']);
  assert.ok(getNextReviewAt(reviewStates.due) <= now);
});

test('oturum seçimi tekrarsız ve sınırlıdır; zamanı gelenler önce gelir', () => {
  const now = Date.now();
  const words = ['a', 'b', 'c'].map((id, i) => word({ id, addedAt: i }));
  const reviewStates = { b: { masteryLevel: 1, lastReviewed: now - 5 * 86400000 } };
  const selected = selectWordsForReview([...words, words[0]], 2, reviewStates, now);
  assert.equal(selected.length, 2);
  assert.equal(new Set(selected.map(w => w.id)).size, 2);
});

test('analiz: veri yokken uydurma istatistik üretmez', () => {
  const analysis = analyzeLearning({});
  assert.equal(analysis.totalSessions, 0);
  assert.equal(analysis.overallSuccessRate, null);
  assert.equal(analysis.weakestCategory, null);
  assert.equal(analysis.dueWords.length, 0);
  assert.equal(recommendDailyPlan(0, null, 10).wordCount, 10);
});

test('analiz: flashcard başarıya girmez, yetersiz cevapta en zayıf alan yok', () => {
  const sessions = [
    { id: '1', type: 'flashcard', wordIds: [], score: 0, total: 10, date: 1 },
    { id: '2', type: 'yazma', wordIds: [], score: 1, total: 3, date: 2 },
  ];
  const analysis = analyzeLearning({ sessions });
  assert.equal(analysis.weakestCategory, null); // yazma yalnızca 3 cevap (< 5)
  const writing = analysis.categoryStats.find(c => c.category === 'yazma');
  assert.equal(writing.total, 3);
  assert.equal(analysis.overallSuccessRate, 33); // flashcard sayılmaz
});

// ─── Oturum sayacı (100 sınırı) ─────────────────────────────────────────────

const fakeSessions = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

test('bulut toplamı biliniyorsa yerel 100 sınırı sayacı kısıtlamaz', () => {
  const summary = stats.summarizeCompletedExercises(250, fakeSessions(100), fakeSessions(5));
  assert.deepEqual(summary, { count: 255, exact: true });
});

test('toplam bilinmiyorsa ve yerel liste sınırdaysa "en az" olarak işaretlenir (sayı uydurulmaz)', () => {
  const summary = stats.summarizeCompletedExercises(null, fakeSessions(stats.LOCAL_SESSION_LIMIT), []);
  assert.deepEqual(summary, { count: 100, exact: false });
});

test('toplam bilinmiyor ama yerel liste sınırın altındaysa sayı kesindir', () => {
  assert.deepEqual(stats.summarizeCompletedExercises(undefined, fakeSessions(40), fakeSessions(2)), { count: 42, exact: true });
});

test('yalnızca cihazda tutulan senaryo sonuçları sınıra ulaştıysa sayı kesin değildir', () => {
  const summary = stats.summarizeCompletedExercises(30, fakeSessions(30), fakeSessions(stats.LOCAL_SCENARIO_LIMIT));
  assert.equal(summary.exact, false);
  assert.equal(summary.count, 130);
});

test('bulut toplamı yerelden küçükse (gecikmiş sayım) yerel kayıt sayısı geçerli kalır', () => {
  assert.equal(stats.summarizeCompletedExercises(3, fakeSessions(5), []).count, 5);
});

// ─── Cümle uzunluğu sınırı ──────────────────────────────────────────────────

test('cümle giriş sınırı kayıtlı cümleyi her zaman tam yazmaya izin verir', () => {
  assert.equal(MAX_EXAMPLE_LENGTH, 200);
  assert.equal(getSentenceInputLimit('Ich esse einen Apfel.'), 220);
  const legacy = 'x'.repeat(260); // eski, sınırdan uzun kayıt
  assert.ok(getSentenceInputLimit(legacy) >= legacy.length + 20);
});
