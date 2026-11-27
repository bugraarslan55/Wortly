// @utils: learning-report, study-recommendations, scenario-engine, achievements, progress-stats, learning-analysis, unique, latest-guard, spaced-repetition, timestamps, known-words
// Ekranlar arası metrik tutarlılığı ve hesap değişimi güvenliği (saf mantık). Ekranlar, hook'lar ve gerçek depolama
// bu testlerin kapsamında DEĞİLDİR; mağaza içindeki yarış korumasının kendisi (createLatestGuard) test edilir.
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
const G = require(path.join(out, 'utils', 'latest-guard.js'));
const { SCENARIOS } = require(path.join(out, 'constants', 'scenarios.js'));
const { makeIsKnownWordId } = require(path.join(out, 'utils', 'known-words.js'));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 2, 12, 0, 0).getTime();
const at = (daysAgo, hour = 10) => new Date(2026, 10, 2 - daysAgo, hour, 0, 0).getTime();
const word = (id, extra = {}) => ({ id, german: id, article: '', turkish: id, addedAt: 1, masteryLevel: 0, isCustom: true, ...extra });
const session = (id, type, score, total, date, extra = {}) => ({ id, type, wordIds: [], score, total, date, ...extra });
const scen = (id, scenarioId, score, total, date) => ({ id, scenarioId, score, total, date });

function reportInput(extra = {}) {
  const words = extra.words ?? [];
  return {
    now: NOW, level: 'A1', profile: { streak: 0, dailyGoal: 10 }, sessions: [], scenarioResults: [], reviewStates: {},
    words, candidates: words.filter(w => w.isCustom), scenarios: SCENARIOS,
    isKnownWordId: makeIsKnownWordId(words, id => id.startsWith('goethe-')), ...extra,
  };
}
const snapshotOf = (base) => ({
  now: base.now, sessions: base.sessions, scenarioResults: base.scenarioResults, reviewStates: base.reviewStates,
  words: base.words, profile: base.profile, isKnownWordId: base.isKnownWordId,
});

// Bozuk / eksik / tekrarlı / gelecekteki / tarihsiz kayıtlar karışık fixture
const VALID_SESSIONS = [session('v1', 'yazma', 4, 5, at(0)), session('v2', 'dinle-sec', 5, 5, at(1)), session('v3', 'flashcard', 8, 10, at(2))];
const MESSY_SESSIONS = [
  ...VALID_SESSIONS,
  { ...VALID_SESSIONS[0] },                                   // aynı oturum ikinci kez
  session('bad1', 'yazma', 9, 5, at(0)),                       // puan > toplam (tamamlanmamış/bozuk)
  session('bad2', 'yazma', 0, 0, at(0)),                       // toplam 0
  session('bad3', 'yazma', 2.5, 5, at(0)),                     // tamsayı değil
  session('bad4', 'yazma', 3, 5, undefined),                   // tarihsiz
  session('bad5', 'yazma', 3, 5, NOW + 5 * DAY),               // gelecekte
  session('bad6', 'yazma', 3, 5, Date.UTC(1999, 0, 1)),        // çok eski/geçersiz
  null,
  { id: 'only-id' },
];
const MESSY_SCENARIOS = [
  scen('s1', 'yol-tarifi', 4, 5, at(0)), scen('s1', 'yol-tarifi', 4, 5, at(0)), // yinelenen
  scen('s2', 'yol-tarifi', 6, 5, at(0)), scen('s3', 'otelde-giris', 3, 0, at(1)), null, { scenarioId: 'x' },
];

// ─── Tamamlanan alıştırma: tüm ekranlarda aynı tanım ─────────────────────────
test('tamamlanan alıştırma: Profil, Analiz, Başarılarım ve Görevler bozuk/tekrarlı kayıtlarda AYNI sayıyı verir', () => {
  const base = reportInput({ sessions: MESSY_SESSIONS, scenarioResults: MESSY_SCENARIOS });
  const profile = P.summarizeCompletedExercises(null, MESSY_SESSIONS, MESSY_SCENARIOS, null, NOW);
  const analysis = R.buildLearningReport(base).overview.completed;
  const achievements = A.collectCompletedExercises(snapshotOf(base)).length;
  const category = L.analyzeLearning({ sessions: MESSY_SESSIONS, scenarioResults: MESSY_SCENARIOS, now: NOW }).totalSessions;
  assert.equal(profile.count, 4, '3 geçerli oturum + 1 geçerli senaryo sonucu');
  assert.equal(analysis.count, profile.count);
  assert.equal(achievements, profile.count);
  assert.equal(category, profile.count);
  assert.equal(P.countCompletedExercises(MESSY_SESSIONS, MESSY_SCENARIOS, NOW), profile.count);
});

test('tamamlanmamış/bozuk oturum tamamlanmış sayılmaz; kayıtlar silinmez veya dönüştürülmez', () => {
  const copy = JSON.stringify(MESSY_SESSIONS);
  for (const record of [MESSY_SESSIONS[4], MESSY_SESSIONS[5], MESSY_SESSIONS[6], MESSY_SESSIONS[7], MESSY_SESSIONS[8], MESSY_SESSIONS[9], null, { id: 'x' }, 5, 'x']) {
    assert.equal(P.isCompletedRecord(record, NOW), false);
  }
  assert.equal(P.isCompletedRecord(VALID_SESSIONS[0], NOW), true);
  assert.equal(JSON.stringify(MESSY_SESSIONS), copy);
});

test('aynı oturum iki kez kaydedilmişse tüm hesaplarda bir kez sayılır (kategori, toplam, görev, hafta)', () => {
  const dup = session('same', 'yazma', 5, 5, at(0));
  const base = reportInput({ sessions: [dup, { ...dup }, { ...dup }] });
  const report = R.buildLearningReport(base);
  assert.equal(report.overview.completed.count, 1);
  assert.equal(report.exercises.total, 5);
  assert.equal(report.activity.total, 1);
  assert.equal(A.collectCompletedExercises(snapshotOf(base)).length, 1);
  assert.equal(A.computeDailyTasks(snapshotOf(base)).find(t => t.id === 'exercises').current, 1);
});

test('sınırdaki yerel liste: geçersiz kayıtlar sayıyı şişirmez ama "en az" işareti ham listeye göre kalır', () => {
  const valid = Array.from({ length: 98 }, (_, i) => session('s' + i, 'yazma', 1, 1, at(1)));
  const raw = [...valid, session('b1', 'yazma', 9, 1, at(1)), session('b2', 'yazma', 0, 0, at(1))];
  const summary = P.summarizeCompletedExercises(null, raw, [], null, NOW);
  assert.equal(summary.count, 98);
  assert.equal(summary.exact, false, 'ham liste 100: gerçek toplam daha fazla olabilir');
});

// ─── Öğrenilen kelime: tüm ekranlarda aynı ───────────────────────────────────
test('öğrenilen kelime: silinmiş kelimeler hiçbir ekranda sayılmaz; Profil = Analiz = Başarılarım', () => {
  const words = [word('keep', { masteryLevel: 3 })];
  const reviewStates = { keep: { masteryLevel: 3, lastReviewed: at(1) }, ghost1: { masteryLevel: 3, lastReviewed: at(1) }, ghost2: { masteryLevel: 3, lastReviewed: at(2) }, 'goethe-a1-x': { masteryLevel: 3, lastReviewed: at(2) } };
  const base = reportInput({ words, reviewStates });
  const profile = P.countLearnedWords(reviewStates, words, base.isKnownWordId);
  const analysis = R.buildLearningReport(base);
  const badge = A.evaluateAchievements(snapshotOf(base)).find(b => b.id === 'kelime-kasifi');
  assert.equal(profile, 2);
  assert.equal(analysis.overview.learned, profile);
  assert.equal(analysis.mastery.counts[3], profile);
  assert.equal(badge.current, profile);
});

// ─── Bozuk eski veri ─────────────────────────────────────────────────────────
test('bozuk eski veri hiçbir hesapta hata vermez ve sayılar sonlu kalır', () => {
  const base = reportInput({ sessions: MESSY_SESSIONS, scenarioResults: MESSY_SCENARIOS, reviewStates: { a: null, b: { masteryLevel: 'x' }, c: { masteryLevel: 2 } } });
  let report;
  assert.doesNotThrow(() => { report = R.buildLearningReport(base); });
  assert.doesNotThrow(() => A.computeDailyTasks(snapshotOf(base)));
  assert.doesNotThrow(() => A.evaluateAchievements(snapshotOf(base)));
  const numbers = [report.overview.learned, report.overview.completed.count, report.exercises.total, report.activity.total, report.mastery.total];
  assert.ok(numbers.every(n => Number.isFinite(n) && n >= 0));
});

// ─── Gece yarısı ve gün tutarlılığı ──────────────────────────────────────────
test('gece yarısı: Analiz, Görevler ve rozetler aynı günü kullanır; 23:55 kaydı dünün sütununa düşer', () => {
  const now = new Date(2026, 10, 2, 0, 5).getTime();
  const late = session('late', 'yazma', 4, 5, new Date(2026, 10, 1, 23, 55).getTime());
  const early = session('early', 'yazma', 4, 5, new Date(2026, 10, 2, 0, 1).getTime());
  const base = reportInput({ now, sessions: [late, early] });
  const report = R.buildLearningReport(base);
  const [yesterday, today] = report.activity.days.slice(-2);
  assert.equal(yesterday.exercises, 1);
  assert.equal(today.exercises, 1);
  assert.equal(A.computeDailyTasks(snapshotOf(base)).find(t => t.id === 'exercises').current, 1, 'bugünkü görev sayacı yalnızca 00:01 kaydını sayar');
});

// ─── Hesap değişimi ──────────────────────────────────────────────────────────
test('rapor erişilebilirliği: oturum yok / yükleniyor / başka hesabın kalıntısı / hazır', () => {
  const ready = { userId: 'B', localLoaded: true, profileSyncedUserId: 'B', wordsSyncedUserId: 'B', sessionsSyncedUserId: 'B' };
  assert.equal(R.reportAvailability(ready), 'ready');
  assert.equal(R.reportAvailability({ ...ready, userId: null }), 'signed-out', 'çıkışta kişisel veri gösterilmez');
  assert.equal(R.reportAvailability({ ...ready, userId: undefined }), 'signed-out');
  assert.equal(R.reportAvailability({ ...ready, localLoaded: false }), 'loading');
  assert.equal(R.reportAvailability({ ...ready, profileSyncedUserId: 'A' }), 'loading', 'A\'nın eşitlemesi B için hazır sayılmaz');
  assert.equal(R.reportAvailability({ ...ready, wordsSyncedUserId: null }), 'loading');
  assert.equal(R.reportAvailability({ ...ready, sessionsSyncedUserId: 'A' }), 'loading');
});

test('A→B geçişinde yüklenirken eski hesabın raporu gösterilmez; B eşitlenince B\'nin verisiyle hesaplanır', () => {
  const dataA = reportInput({ words: [word('a1', { masteryLevel: 3 })], sessions: [session('sa', 'yazma', 5, 5, at(0))] });
  const dataB = reportInput();
  const states = [
    { userId: 'A', localLoaded: true, profileSyncedUserId: 'A', wordsSyncedUserId: 'A', sessionsSyncedUserId: 'A' },
    { userId: 'B', localLoaded: true, profileSyncedUserId: null, wordsSyncedUserId: null, sessionsSyncedUserId: null },
    { userId: 'B', localLoaded: true, profileSyncedUserId: 'B', wordsSyncedUserId: 'B', sessionsSyncedUserId: 'B' },
  ];
  const shown = states.map((state, i) => R.reportAvailability(state) === 'ready' ? R.buildLearningReport(i === 0 ? dataA : dataB).overview.learned : null);
  assert.deepEqual(shown, [1, null, 0]);
});

test('eski asenkron okuma geç gelirse yeni hesabın verisini EZMEZ (son istek kazanır)', async () => {
  const guard = G.createLatestGuard();
  const state = { owner: null, results: [] };
  const load = (userId, delay, data) => (async () => {
    const token = guard.begin();
    await new Promise(resolve => setTimeout(resolve, delay));
    if (!guard.isLatest(token)) return 'atıldı';
    state.owner = userId;
    state.results = data;
    return 'yazıldı';
  })();
  const slowA = load('A', 40, ['a-sonucu']);
  const fastB = load('B', 5, ['b-sonucu']);
  assert.equal(await fastB, 'yazıldı');
  assert.equal(await slowA, 'atıldı');
  assert.deepEqual(state, { owner: 'B', results: ['b-sonucu'] });
});

test('çıkıştan sonra süren okuma veri yazamaz (invalidate)', async () => {
  const guard = G.createLatestGuard();
  const state = { results: ['eski'] };
  const pending = (async () => {
    const token = guard.begin();
    await new Promise(resolve => setTimeout(resolve, 20));
    if (!guard.isLatest(token)) return 'atıldı';
    state.results = ['A-verisi'];
    return 'yazıldı';
  })();
  guard.invalidate();            // resetLocal / çıkış
  state.results = [];
  assert.equal(await pending, 'atıldı');
  assert.deepEqual(state.results, []);
});

test('kullanıcı değiştirince rapor yeniden doğru verilerle hesaplanır (paylaşılan durum yok)', () => {
  const a = reportInput({ words: [word('a1', { masteryLevel: 3 })], scenarioResults: [scen('ra', 'yol-tarifi', 5, 5, at(0))] });
  const b = reportInput({ words: [word('b1'), word('b2')], sessions: [session('sb', 'yazma', 2, 5, at(0))] });
  const ra = R.buildLearningReport(a);
  const rb = R.buildLearningReport(b);
  assert.equal(ra.scenarios.attempts, 1);
  assert.equal(rb.scenarios.attempts, 0);
  assert.equal(rb.overview.learned, 0);
  assert.equal(rb.overview.completed.count, 1);
  assert.deepEqual(R.buildLearningReport(a), ra);
});

// ─── Öneriler ────────────────────────────────────────────────────────────────
function recsFor(base, extra = {}) {
  const report = R.buildLearningReport(base);
  return REC.buildRecommendations({
    report, level: base.level, userId: 'u', dayKey: '2026-11-02', tasks: A.computeDailyTasks(snapshotOf(base)),
    scenarios: SCENARIOS, scenarioResults: base.scenarioResults, sessions: base.sessions, allowedTopicIds: ['goethe-a1-t'], ...extra,
  });
}

test('tekrar önerisi rapordaki en çok geciken kelimenin türüne göre doğru ekrana gider', () => {
  const customDue = reportInput({ words: [word('w1')], reviewStates: { w1: { masteryLevel: 1, lastReviewed: at(6) } } });
  assert.equal(recsFor(customDue)[0].route, '/kelime/calis');
  const topic = word('goethe-a1-t1', { isCustom: false, topicId: 'goethe-a1-t' });
  const topicDue = reportInput({ words: [], candidates: [topic], reviewStates: { 'goethe-a1-t1': { masteryLevel: 1, lastReviewed: at(6) } } });
  assert.equal(recsFor(topicDue)[0].route, '/konu/goethe-a1-t/alistirma');
});

test('A1 kullanıcısına kilitli A2/B1 senaryosu önerilmez (tüm günler)', () => {
  const base = reportInput();
  for (let d = 1; d <= 28; d += 1) {
    const list = recsFor(base, { dayKey: '2026-11-' + String(d).padStart(2, '0') });
    for (const item of list.filter(i => i.route.startsWith('/senaryolar/'))) {
      assert.equal(SCENARIOS.find(s => s.id === item.route.split('/').pop()).level, 'A1');
    }
  }
});

test('öneriler duruma göre değişir: tekrar yapılınca tekrar önerisi kalkar, tamamlanan senaryo bir daha "yeni" önerilmez', () => {
  const before = reportInput({ words: [word('w1')], reviewStates: { w1: { masteryLevel: 1, lastReviewed: at(6) } } });
  assert.ok(recsFor(before).some(i => i.kind === 'due-review'));
  const after = reportInput({ words: [word('w1')], reviewStates: { w1: { masteryLevel: 2, lastReviewed: NOW - 1000 } } });
  assert.ok(!recsFor(after).some(i => i.kind === 'due-review'));

  const first = recsFor(reportInput()).find(i => i.kind === 'new-scenario');
  const doneId = first.route.split('/').pop();
  const withDone = reportInput({ scenarioResults: [scen('r1', doneId, 5, 5, at(0))] });
  const next = recsFor(withDone).find(i => i.kind === 'new-scenario');
  assert.ok(next);
  assert.notEqual(next.route, first.route);
});

test('yeterli veri yokken sahte başarısızlık önerisi çıkmaz', () => {
  const list = recsFor(reportInput({ sessions: [session('1', 'yazma', 0, 3, at(0))] }));
  assert.ok(!list.some(i => i.kind === 'weak-category'));
});

test('boş veri: rapor boş durumları ve başlangıç önerisi', () => {
  const base = reportInput();
  const report = R.buildLearningReport(base);
  assert.equal(report.overview.hasAnyData, false);
  const list = recsFor(base);
  assert.ok(list.some(i => i.kind === 'starter'));
  assert.ok(list.length <= 3);
});
