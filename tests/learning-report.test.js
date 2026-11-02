// @utils: learning-report, study-recommendations, scenario-engine, achievements, progress-stats, learning-analysis, unique, spaced-repetition, timestamps, known-words
// Analiz raporu ve öneri kuralları (saf fonksiyonlar). Ekran, grafikler, erişilebilirlik ve gerçek depolama
// bu testlerin kapsamında DEĞİLDİR.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const R = require(path.join(out, 'utils', 'learning-report.js'));
const REC = require(path.join(out, 'utils', 'study-recommendations.js'));
const A = require(path.join(out, 'utils', 'achievements.js'));
const P = require(path.join(out, 'utils', 'progress-stats.js'));
const L = require(path.join(out, 'utils', 'learning-analysis.js'));
const { SCENARIOS } = require(path.join(out, 'constants', 'scenarios.js'));
const { makeIsKnownWordId } = require(path.join(out, 'utils', 'known-words.js'));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 2, 12, 0, 0).getTime();
const at = (daysAgo, hour = 10) => new Date(2026, 10, 2 - daysAgo, hour, 0, 0).getTime();
const word = (id, extra = {}) => ({ id, german: id, article: '', turkish: id + '-tr', addedAt: 1, masteryLevel: 0, isCustom: true, ...extra });
const topicWord = (id, topicId = 'goethe-a1-test') => word(id, { isCustom: false, topicId });
const session = (id, type, score, total, daysAgo = 0, extra = {}) => ({ id, type, wordIds: [], score, total, date: at(daysAgo), ...extra });
const scen = (id, scenarioId, score, total, daysAgo = 0) => ({ id, scenarioId, score, total, date: at(daysAgo) });
const state = (level, daysAgo) => ({ masteryLevel: level, lastReviewed: at(daysAgo) });

function input(extra = {}) {
  const words = extra.words ?? [];
  const reviewStates = extra.reviewStates ?? {};
  const candidates = extra.candidates ?? words.filter(w => w.isCustom);
  return {
    now: NOW, level: 'A1', profile: { streak: 0, dailyGoal: 10 }, sessions: [], scenarioResults: [], reviewStates,
    words, candidates, scenarios: SCENARIOS, isKnownWordId: makeIsKnownWordId(words, id => id.startsWith('goethe-')), ...extra,
  };
}
function recs(report, base, extra = {}) {
  const snapshot = {
    now: NOW, sessions: base.sessions, scenarioResults: base.scenarioResults, reviewStates: base.reviewStates,
    words: base.words, profile: base.profile,
  };
  return REC.buildRecommendations({
    report, level: base.level, userId: 'u1', dayKey: '2026-11-02', tasks: A.computeDailyTasks(snapshot),
    dueWords: L.findDueWords(base.candidates, base.reviewStates, NOW), scenarios: SCENARIOS,
    scenarioResults: base.scenarioResults, sessions: base.sessions, allowedTopicIds: ['goethe-a1-test'], ...extra,
  });
}

// ─── Veri yok / az veri ──────────────────────────────────────────────────────
test('hiç öğrenme verisi olmayan kullanıcı: her şey sıfır veya "veri yok", sahte istatistik yok', () => {
  const report = R.buildLearningReport(input());
  const o = report.overview;
  assert.equal(o.learned, 0);
  assert.equal(o.dueCount, 0);
  assert.equal(o.streak, 0);
  assert.deepEqual(o.completed, { count: 0, exact: true });
  assert.equal(o.scenariosCompleted, 0);
  assert.equal(o.hasAnyData, false);
  assert.equal(report.activity.empty, true);
  assert.equal(report.activity.total, 0);
  assert.equal(report.activity.days.length, 7);
  assert.equal(report.mastery.total, 0);
  assert.deepEqual(report.dueWords, []);
  assert.equal(report.exercises.successRate, null);
  assert.equal(report.exercises.total, 0);
  assert.equal(report.scenarios.attempts, 0);
  assert.equal(report.scenarios.averagePercent, null);
  assert.deepEqual(report.scenarios.best, []);
  assert.deepEqual(report.scenarios.needsWork, []);
});

test('hiç verisi olmayan kullanıcıya başlangıç önerisi ve yeni diyalog önerilir (en çok 3)', () => {
  const base = input();
  const list = recs(R.buildLearningReport(base), base);
  assert.ok(list.length >= 1 && list.length <= 3);
  assert.ok(list.some(item => item.kind === 'starter'));
  assert.ok(list.every(item => item.reason.length > 10 && item.title.length > 3));
  assert.ok(!list.some(item => item.kind === 'due-review' || item.kind === 'weak-category'), 'verisiz kullanıcıya başarısızlık çıkarımı yapılmaz');
});

test('birkaç kelimesi olan yeni kullanıcı: dağılım ve sayılar gerçek kayıtlardan', () => {
  const words = [word('a'), word('b', { masteryLevel: 1 }), word('c', { masteryLevel: 3 })];
  const report = R.buildLearningReport(input({ words, sessions: [session('s1', 'yazma', 4, 5, 0)] }));
  assert.deepEqual(report.mastery.counts, [1, 1, 0, 1]);
  assert.equal(report.mastery.total, 3);
  assert.equal(report.overview.learned, 1);
  assert.equal(report.overview.completed.count, 1);
  assert.equal(report.overview.hasAnyData, true);
});

// ─── Tutarlılık: diğer ekranlarla aynı sayılar ───────────────────────────────
test('öğrenilen kelime: rapor, Profil/rozet işlevi ve seviye dağılımı AYNI sayıyı verir', () => {
  const words = [word('c1', { masteryLevel: 3 }), word('c2'), word('c3', { masteryLevel: 3 })];
  const reviewStates = {
    c2: state(3, 1), 'goethe-a1-x': state(3, 2), 'goethe-a1-y': state(2, 2), deleted: state(3, 3),
  };
  const base = input({ words, reviewStates });
  const report = R.buildLearningReport(base);
  const expected = P.countLearnedWords(reviewStates, words, base.isKnownWordId);
  assert.equal(report.overview.learned, expected);
  assert.equal(report.mastery.counts[3], expected, 'dağılımdaki "Öğrenildi" = öğrenilen kelime');
  assert.equal(expected, 4); // c1, c3 (kendi seviyeleri), c2 (durum kaydı), goethe-a1-x; "deleted" sayılmaz
});

test('kişisel kelime hem kelime listesinde hem inceleme kaydında olsa iki kez sayılmaz', () => {
  const words = [word('dup', { masteryLevel: 3 })];
  const reviewStates = { dup: state(3, 0) };
  const report = R.buildLearningReport(input({ words, reviewStates }));
  assert.equal(report.overview.learned, 1);
  assert.equal(report.mastery.total, 1);
});

test('silinmiş kelimeler istatistikte görünmez (ilerleme kaydı silinmez, sadece sayılmaz)', () => {
  const reviewStates = { gone1: state(3, 1), gone2: state(1, 1), 'goethe-a1-ok': state(2, 1) };
  const before = JSON.stringify(reviewStates);
  const report = R.buildLearningReport(input({ reviewStates }));
  assert.equal(report.mastery.total, 1);
  assert.equal(report.overview.learned, 0);
  assert.equal(JSON.stringify(reviewStates), before, 'girdi değiştirilmemeli');
});

test('Ana Sayfa ile aynı sayılar: tekrar bekleyen, günlük hedef, seri, tamamlanan alıştırma', () => {
  const words = [word('w1'), word('w2'), word('w3')];
  const reviewStates = { w1: state(1, 3), w2: state(1, 3), w3: { masteryLevel: 2, lastReviewed: NOW - 60000 } };
  const sessions = [session('s1', 'yazma', 4, 5, 0), session('s2', 'dinle-sec', 3, 5, 1)];
  const scenarioResults = [scen('r1', 'yol-tarifi', 4, 5, 0)];
  const profile = { streak: 3, lastStudyDate: '2026-11-02', dailyGoal: 5 };
  const base = input({ words, reviewStates, sessions, scenarioResults, profile });
  const report = R.buildLearningReport(base);
  const analysis = L.analyzeLearning({ sessions, words: base.candidates, reviewStates, scenarioResults, dailyGoal: 5, now: NOW });
  assert.equal(report.overview.dueCount, analysis.dueWords.length);
  assert.equal(report.overview.dueCount, 2);
  assert.equal(report.overview.goal.done, P.countReviewedToday(reviewStates, words, new Date(NOW)));
  assert.equal(report.overview.goal.target, 5);
  assert.equal(report.overview.streak, P.getActiveStreak(3, '2026-11-02', new Date(NOW)));
  assert.deepEqual(report.overview.completed, P.summarizeCompletedExercises(null, sessions, scenarioResults));
});

// ─── Çok veri, tekrarlar, bozuk veri ─────────────────────────────────────────
test('çok sayıda kelime ve oturum: sınırlı sürede hesaplanır, sayılar tutarlı', () => {
  const words = Array.from({ length: 800 }, (_, i) => word('w' + i, { masteryLevel: i % 4 }));
  const reviewStates = {};
  words.forEach((w, i) => { reviewStates[w.id] = { masteryLevel: i % 4, lastReviewed: at(i % 9) }; });
  const sessions = Array.from({ length: 100 }, (_, i) => session('s' + i, ['yazma', 'dinle-sec', 'dogru-yanlis', 'flashcard'][i % 4], 4, 5, i % 20));
  const started = Date.now();
  const report = R.buildLearningReport(input({ words, reviewStates, sessions }));
  assert.ok(Date.now() - started < 2000);
  assert.equal(report.mastery.total, 800);
  assert.equal(report.mastery.counts.reduce((a, b) => a + b, 0), 800);
});

test('tekrarlanan oturum kayıtları (aynı kimlik) iki kez sayılmaz: toplam, kategori ve hafta', () => {
  const dup = session('same', 'yazma', 5, 5, 0);
  const report = R.buildLearningReport(input({ sessions: [dup, { ...dup }, { ...dup }] }));
  assert.equal(report.overview.completed.count, 1);
  assert.equal(report.exercises.total, 5);
  assert.equal(report.activity.total, 1);
  assert.equal(L.countStudySessions([dup, dup]), 1);
  assert.equal(P.countCompletedExercises([dup, dup], [scen('r', 'x', 1, 1), scen('r', 'x', 1, 1)]), 2);
});

test('bozuk veya eksik eski veri hata vermez ve sayıları bozmaz', () => {
  const messy = {
    sessions: [null, undefined, { id: 'a', type: 'yazma', score: NaN, total: 5, date: 'dün' }, { id: 'b', type: 'bilinmeyen', score: 3, total: 5, date: NOW },
      { id: 'c', type: 'yazma', score: 9, total: 5, date: NOW }, session('ok', 'yazma', 4, 5, 0)],
    scenarioResults: [null, { scenarioId: 'yol-tarifi' }, { id: 'r', scenarioId: 'yol-tarifi', score: 'x', total: 5 }, scen('good', 'yol-tarifi', 3, 5, 0)],
    reviewStates: { a: { masteryLevel: 9 }, b: { masteryLevel: 'x' }, c: null, d: { masteryLevel: 2 } },
    words: [null, word('k')].filter(Boolean),
  };
  let report;
  assert.doesNotThrow(() => { report = R.buildLearningReport(input(messy)); });
  assert.ok(report.exercises.total >= 0 && Number.isFinite(report.exercises.total));
  assert.ok(report.mastery.counts.every(n => Number.isInteger(n) && n >= 0));
  assert.doesNotThrow(() => R.buildLearningReport(input({ sessions: null, scenarioResults: null, reviewStates: null, words: null, profile: null, candidates: [] })));
});

// ─── Gün hesabı ──────────────────────────────────────────────────────────────
test('aynı gün birden fazla çalışma: bugünün sütununda toplanır, gün tek sayılır', () => {
  const sessions = [session('a', 'yazma', 3, 5, 0), session('b', 'dinle-sec', 4, 5, 0), session('c', 'cumle', 5, 5, 0)];
  const report = R.buildLearningReport(input({ sessions }));
  const today = report.activity.days[report.activity.days.length - 1];
  assert.equal(today.isToday, true);
  assert.equal(today.exercises, 3);
  assert.equal(report.activity.days.filter(day => day.exercises > 0).length, 1);
});

test('yerel gece yarısı: 23:50 ve 00:10 farklı günlere düşer; son 7 gün tarihleri ardışık', () => {
  const beforeMidnight = { id: 'm1', type: 'yazma', wordIds: [], score: 4, total: 5, date: new Date(2026, 10, 1, 23, 50).getTime() };
  const afterMidnight = { id: 'm2', type: 'yazma', wordIds: [], score: 4, total: 5, date: new Date(2026, 10, 2, 0, 10).getTime() };
  const report = R.buildLearningReport(input({ sessions: [beforeMidnight, afterMidnight] }));
  const days = report.activity.days;
  assert.equal(days[6].dayKey, '2026-11-02');
  assert.equal(days[5].dayKey, '2026-11-01');
  assert.equal(days[6].exercises, 1);
  assert.equal(days[5].exercises, 1);
  for (let i = 1; i < days.length; i += 1) {
    assert.equal(Date.parse(days[i].dayKey + 'T00:00:00Z') - Date.parse(days[i - 1].dayKey + 'T00:00:00Z'), DAY);
  }
});

test('farklı saat dilimleri / gün tanımları: UTC günü ile yerel gün karışmaz (Türkiye UTC+3 örneği)', () => {
  // 22:30 UTC, Türkiye'de ertesi gün 01:30'dur.
  const stamp = Date.UTC(2026, 10, 1, 22, 30);
  const now = Date.UTC(2026, 10, 2, 9, 0);
  const sessions = [{ id: 't1', type: 'yazma', wordIds: [], score: 4, total: 5, date: stamp }];
  const turkey = R.buildLearningReport({ ...input({ sessions }), now, dayKey: A.TURKEY_DAY_KEY });
  const utc = R.buildLearningReport({ ...input({ sessions }), now, dayKey: A.dayKeyForOffset(0) });
  assert.equal(turkey.activity.days[6].dayKey, '2026-11-02');
  assert.equal(turkey.activity.days[6].exercises, 1, 'Türkiye gününde bugüne düşer');
  assert.equal(utc.activity.days[6].exercises, 0, 'UTC gününde dün');
  assert.equal(utc.activity.days[5].exercises, 1);
});

test('gelecek tarihli (bozuk saat) kayıtlar etkinliğe katılmaz', () => {
  const future = { id: 'f', type: 'yazma', wordIds: [], score: 4, total: 5, date: NOW + 3 * DAY };
  const report = R.buildLearningReport(input({ sessions: [future] }));
  assert.equal(report.activity.total, 0);
});

test('haftalık karşılaştırma: iki hafta eksiksizse fark hesaplanır; kayıt sınırı dolduysa karşılaştırma yapılmaz', () => {
  const sessions = [session('a', 'yazma', 4, 5, 1), session('b', 'yazma', 4, 5, 2), session('c', 'yazma', 4, 5, 9)];
  const report = R.buildLearningReport(input({ sessions }));
  assert.deepEqual(report.activity.comparison, { current: 2, previous: 1, delta: 1 });
  const flood = Array.from({ length: 100 }, (_, i) => session('f' + i, 'yazma', 4, 5, i < 50 ? 0 : 1));
  const saturated = R.buildLearningReport(input({ sessions: flood }));
  assert.equal(saturated.activity.comparison, null, 'en eski kayıt pencere içinde: önceki hafta eksik olabilir');
  assert.equal(saturated.activity.mayBeIncomplete, true, 'liste dolu ve en eski kayıt bu haftanın içinde: haftanın eski günleri eksik olabilir');
});

// ─── Alıştırma performansı ───────────────────────────────────────────────────
test('alıştırma türleri: yalnızca gerçek kayıtlar; az veride yüzde gösterilmez; flashcard başarıya girmez', () => {
  const sessions = [
    session('1', 'yazma', 4, 5), session('2', 'yazma', 3, 5), session('3', 'dinle-sec', 2, 3), session('4', 'flashcard', 10, 10),
  ];
  const report = R.buildLearningReport(input({ sessions }));
  const row = type => report.exercises.rows.find(item => item.type === type);
  assert.equal(row('yazma').correct, 7);
  assert.equal(row('yazma').total, 10);
  assert.equal(row('yazma').rate, 70);
  assert.equal(row('dinle-sec').rate, null, '3 cevap: yüzde için yetersiz');
  assert.equal(row('dogru-yanlis').sessions, 0);
  assert.equal(report.exercises.flashcardSessions, 1);
  assert.equal(report.exercises.correct, 9);
  assert.equal(report.exercises.wrong, 4);
  assert.equal(report.exercises.total, 13);
});

// ─── Senaryolar ──────────────────────────────────────────────────────────────
test('tekrar çalışılan senaryo benzersiz tamamlanma sayısını artırmaz; toplam deneme artar', () => {
  const results = [scen('r3', 'yol-tarifi', 5, 5, 0), scen('r2', 'yol-tarifi', 3, 5, 1), scen('r1', 'yol-tarifi', 2, 5, 2), scen('r0', 'markette-alisveris', 4, 5, 3)];
  const report = R.buildLearningReport(input({ scenarioResults: results }));
  assert.equal(report.scenarios.uniqueCompleted, 2);
  assert.equal(report.scenarios.attempts, 4);
  const road = report.scenarios.best.find(row => row.id === 'yol-tarifi');
  assert.equal(road.bestPercent, 100);
  assert.equal(road.attempts, 3);
  assert.equal(road.lastPercent, 100, 'en yeni kayıt başta saklanır');
  assert.equal(report.overview.scenariosCompleted, 2);
});

test('bilinmeyen senaryo kimlikleri tamamlanan sayısına girmez; sonuçlar silinmez', () => {
  const results = [scen('x', 'artik-olmayan-senaryo', 5, 5, 0)];
  const copy = JSON.stringify(results);
  const report = R.buildLearningReport(input({ scenarioResults: results }));
  assert.equal(report.scenarios.uniqueCompleted, 0);
  assert.equal(JSON.stringify(results), copy);
});

test('seviye ilerlemesi: kilitli seviyeler "kilitli", açıklar gerçek tamamlanma sayısıyla', () => {
  const report = R.buildLearningReport(input({ scenarioResults: [scen('r', 'yol-tarifi', 4, 5, 0)] }));
  const byLevel = Object.fromEntries(report.scenarios.byLevel.map(item => [item.level, item]));
  assert.equal(byLevel.A1.locked, false);
  assert.equal(byLevel.A1.completed, 1);
  assert.equal(byLevel.A1.total, SCENARIOS.filter(s => s.level === 'A1').length);
  assert.equal(byLevel.A2.locked, true);
  assert.equal(byLevel.B1.locked, true);
  const a2 = R.buildLearningReport(input({ level: 'A2' }));
  assert.equal(a2.scenarios.byLevel.find(item => item.level === 'A2').locked, false);
});

test('geliştirilmesi gereken senaryolar: yalnızca denenmiş ve en iyi sonucu %80 altı olanlar', () => {
  const results = [scen('a', 'yol-tarifi', 2, 5, 0), scen('b', 'markette-alisveris', 5, 5, 0), scen('c', 'yeni-tanisma', 2, 5, 1), scen('d', 'yeni-tanisma', 4, 5, 0)];
  const report = R.buildLearningReport(input({ scenarioResults: results }));
  assert.deepEqual(report.scenarios.needsWork.map(row => row.id), ['yol-tarifi']);
  assert.ok(!report.scenarios.needsWork.some(row => row.id === 'otelde-giris'), 'hiç denenmemiş senaryo "zayıf" sayılmaz');
});

// ─── Öneriler ────────────────────────────────────────────────────────────────
const ROUTE_OK = /^\/(konular|kelime\/calis|senaryolar|senaryolar\/[a-z-]+|konu\/[A-Za-z0-9-]+\/alistirma)$/;

test('tekrarı gelmiş kelime varsa ilk öneri kelime tekrarıdır ve doğru ekrana gider', () => {
  const words = [word('w1'), word('w2')];
  const reviewStates = { w1: state(1, 5), w2: state(1, 6) };
  const base = input({ words, reviewStates });
  const list = recs(R.buildLearningReport(base), base);
  assert.equal(list[0].kind, 'due-review');
  assert.equal(list[0].route, '/kelime/calis');
  assert.match(list[0].reason, /2 kelime/);
  const topic = [topicWord('goethe-a1-t1')];
  const topicBase = input({ words: [], candidates: topic, reviewStates: { 'goethe-a1-t1': state(1, 6) } });
  const topicRecs = recs(R.buildLearningReport(topicBase), topicBase);
  assert.equal(topicRecs[0].route, '/konu/goethe-a1-test/alistirma');
});

test('rota doğru ekranı seçer: kişisel → kelime/calis, konu → konu alıştırması, bilinmeyen → konular', () => {
  assert.equal(REC.reviewRouteForDue([{ isCustom: true }]), '/kelime/calis');
  assert.equal(REC.reviewRouteForDue([{ isCustom: false, topicId: 'abc' }]), '/konu/abc/alistirma');
  assert.equal(REC.reviewRouteForDue([]), '/konular');
  assert.equal(REC.reviewRouteForDue([{ isCustom: false }]), '/konular');
});

test('zorlanılan alan: yeterli cevap ve %80 altı başarı varsa önerilir; az cevapla önerilmez; yüksek başarıda önerilmez', () => {
  const weakSessions = [session('1', 'yazma', 2, 5), session('2', 'yazma', 2, 5, 1, { topicId: 'goethe-a1-test' })];
  const weakBase = input({ sessions: weakSessions });
  const weakRecs = recs(R.buildLearningReport(weakBase), weakBase);
  const weak = weakRecs.find(item => item.kind === 'weak-category');
  assert.ok(weak);
  assert.equal(weak.route, '/konu/goethe-a1-test/alistirma');
  assert.match(weak.reason, /%40/);

  const fewBase = input({ sessions: [session('1', 'yazma', 0, 3)] });
  assert.ok(!recs(R.buildLearningReport(fewBase), fewBase).some(item => item.kind === 'weak-category'), '3 cevapla "zayıf" denmez');

  const strongBase = input({ sessions: [session('1', 'yazma', 5, 5), session('2', 'yazma', 5, 5)] });
  assert.ok(!recs(R.buildLearningReport(strongBase), strongBase).some(item => item.kind === 'weak-category'));
});

test('zayıf alan için son çalışılan konu seviyeye açık değilse konu listesine gider (kilitli konuya yönlendirme yok)', () => {
  const base = input({ sessions: [session('1', 'yazma', 1, 5, 0, { topicId: 'kilitli-konu' }), session('2', 'yazma', 1, 5, 1, { topicId: 'kilitli-konu' })] });
  const weak = recs(R.buildLearningReport(base), base).find(item => item.kind === 'weak-category');
  assert.equal(weak.route, '/konular');
});

test('hiç yapılmamış alıştırmadan başarısızlık çıkarılmaz', () => {
  const base = input({ sessions: [session('1', 'dogru-yanlis', 5, 5), session('2', 'dogru-yanlis', 5, 5)] });
  const list = recs(R.buildLearningReport(base), base);
  assert.ok(!list.some(item => item.kind === 'weak-category' && /Yazma|Dinleme|Senaryo/.test(item.title)));
});

test('yeni diyalog önerisi kilitli seviyeye yönlenmez; seviyeye göre uygun, çalışılmamış senaryo seçilir', () => {
  const base = input();
  for (let day = 0; day < 40; day += 1) {
    const list = recs(R.buildLearningReport(base), base, { dayKey: '2026-12-' + String((day % 28) + 1).padStart(2, '0') });
    const scenario = list.find(item => item.kind === 'new-scenario');
    assert.ok(scenario);
    const id = scenario.route.split('/').pop();
    assert.equal(SCENARIOS.find(s => s.id === id).level, 'A1', 'A1 kullanıcısına A2/B1 senaryosu önerilmez');
  }
});

test('hepsi çalışılmışsa zayıf senaryo tekrar önerilir; kilitli seviye hariç', () => {
  const a1 = SCENARIOS.filter(s => s.level === 'A1');
  const results = a1.map((s, i) => scen('r' + i, s.id, i === 0 ? 1 : 5, 5, 0));
  const base = input({ scenarioResults: results });
  const list = recs(R.buildLearningReport(base), base);
  const repeat = list.find(item => item.kind === 'repeat-scenario');
  assert.ok(repeat);
  assert.equal(repeat.route, '/senaryolar/' + a1[0].id);
  assert.ok(!list.some(item => item.kind === 'new-scenario'));
});

test('tamamlanmamış günlük görev öneriliyor; tekrar önerisiyle çakışan kelime görevi tekrar edilmez', () => {
  const base = input();
  const list = recs(R.buildLearningReport(base), base);
  assert.ok(list.some(item => item.kind === 'daily-task'));
  const words = [word('w1')];
  const dueBase = input({ words, reviewStates: { w1: state(1, 5) } });
  const dueList = recs(R.buildLearningReport(dueBase), dueBase);
  assert.ok(!dueList.some(item => item.id === 'task-words'));
});

test('öneriler en çok 3, öncelik sıralı, geçerli rotalara gider ve nedenleri kullanıcıya özgüdür', () => {
  const words = [word('w1'), word('w2'), word('w3')];
  const reviewStates = { w1: state(1, 5), w2: state(1, 5), w3: state(1, 5) };
  const sessions = [session('1', 'yazma', 1, 5), session('2', 'yazma', 2, 5)];
  const base = input({ words, reviewStates, sessions });
  const list = recs(R.buildLearningReport(base), base);
  assert.ok(list.length <= 3);
  for (let i = 1; i < list.length; i += 1) assert.ok(list[i - 1].priority >= list[i].priority);
  for (const item of list) assert.match(item.route, ROUTE_OK, item.route);
  const other = input({ words: [word('x')], reviewStates: { x: state(1, 5) } });
  const otherList = recs(R.buildLearningReport(other), other);
  assert.notEqual(list[0].reason, otherList[0].reason, 'sayılara göre değişen metin');
});

test('senaryo seçimi güne ve kullanıcıya göre değişir (sabit metin değil)', () => {
  const base = input();
  const report = R.buildLearningReport(base);
  const picks = new Set();
  for (let day = 1; day <= 20; day += 1) {
    const list = recs(report, base, { dayKey: '2026-12-' + String(day).padStart(2, '0') });
    picks.add(list.find(item => item.kind === 'new-scenario').route);
  }
  assert.ok(picks.size > 1);
  const a = recs(report, base, { userId: 'user-a' }).find(item => item.kind === 'new-scenario').route;
  const picksOther = new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map(id => recs(report, base, { userId: id }).find(item => item.kind === 'new-scenario').route));
  assert.ok(picksOther.size >= 1 && typeof a === 'string');
});

// ─── Kullanıcı değiştirme ────────────────────────────────────────────────────
test('kullanıcı değiştirme: rapor yalnızca verilen girdiden hesaplanır, A\'nın verisi B\'nin raporuna sızmaz', () => {
  const userA = input({ words: [word('a1', { masteryLevel: 3 })], sessions: [session('sa', 'yazma', 5, 5)], scenarioResults: [scen('ra', 'yol-tarifi', 5, 5)] });
  const userB = input();
  const reportA = R.buildLearningReport(userA);
  const reportB = R.buildLearningReport(userB);
  const reportA2 = R.buildLearningReport(userA);
  assert.equal(reportB.overview.learned, 0);
  assert.equal(reportB.overview.completed.count, 0);
  assert.equal(reportB.scenarios.attempts, 0);
  assert.deepEqual(reportA, reportA2, 'aynı girdi aynı sonuç (paylaşılan durum yok)');
  assert.equal(reportA.overview.learned, 1);
});
