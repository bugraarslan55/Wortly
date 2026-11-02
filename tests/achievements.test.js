// Günlük görevler ve başarı rozetleri için birim testleri (`npm test`).
// @utils: achievements
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const A = require(path.join(out, 'utils', 'achievements.js'));

const H = 3600 * 1000;
const D = 24 * H;
// 2026-11-02 12:00 Türkiye saati (09:00 UTC)
const NOON = Date.UTC(2026, 10, 2, 9, 0, 0);
// Türkiye günü: UTC+3. 00:00 TR = önceki gün 21:00 UTC.
const TR_MIDNIGHT = Date.UTC(2026, 10, 1, 21, 0, 0);

const session = (id, ms, score, total, type = 'yazma') => ({ id, type, wordIds: [], score, total, date: ms });
// Testler gün tanımını açıkça verir (Türkiye UTC+3); uygulama varsayılanı cihaz yerel günüdür.
const empty = (now = NOON) => ({ now, sessions: [], scenarioResults: [], reviewStates: {}, words: [], profile: null, dayKey: A.TURKEY_DAY_KEY });
const snap = (extra = {}, now = NOON) => ({ ...empty(now), ...extra });
const task = (tasks, id) => tasks.find(t => t.id === id);
const badge = (list, id) => list.find(b => b.id === id);

// ─── Türkiye günü ───────────────────────────────────────────────────────────

test('Türkiye günü UTC+3 ile hesaplanır ve gece yarısında değişir', () => {
  assert.equal(A.TURKEY_DAY_KEY(TR_MIDNIGHT - 1), '2026-11-01'); // 23:59:59.999 TR
  assert.equal(A.TURKEY_DAY_KEY(TR_MIDNIGHT), '2026-11-02'); // 00:00:00 TR
  assert.equal(A.TURKEY_DAY_KEY(Date.UTC(2026, 11, 31, 20, 59, 59)), '2026-12-31');
  assert.equal(A.TURKEY_DAY_KEY(Date.UTC(2026, 11, 31, 21, 0, 0)), '2027-01-01'); // yıl geçişi
});

test('bir sonraki Türkiye gece yarısı doğru hesaplanır', () => {
  assert.equal(A.nextMidnightForOffset(NOON, 180), TR_MIDNIGHT + D);
  assert.equal(A.nextMidnightForOffset(TR_MIDNIGHT, 180), TR_MIDNIGHT + D); // tam gece yarısında bir sonraki gün
  assert.equal(A.nextMidnightForOffset(TR_MIDNIGHT - 1, 180), TR_MIDNIGHT);
});

test('gün değişimi: dünkü ilerleme yeni güne taşınmaz', () => {
  const yesterdayLate = TR_MIDNIGHT - 60 * 1000; // dün 23:59 TR
  const data = {
    sessions: [session('a', yesterdayLate, 5, 5), session('b', yesterdayLate, 5, 5)],
    reviewStates: { w1: { masteryLevel: 1, lastReviewed: yesterdayLate }, w2: { masteryLevel: 1, lastReviewed: yesterdayLate } },
  };
  const before = A.computeDailyTasks(snap(data, TR_MIDNIGHT - 1000));
  assert.deepEqual(before.map(t => t.current), [2, 2, 1]);
  const after = A.computeDailyTasks(snap(data, TR_MIDNIGHT + 1000)); // yeni gün
  assert.deepEqual(after.map(t => t.current), [0, 0, 0]);
  assert.ok(after.every(t => !t.completed));
});

// ─── Görev 1: farklı kelime ─────────────────────────────────────────────────

test('aynı kelime tekrar çalışılınca farklı kelime sayısı artmaz', () => {
  const t = task(A.computeDailyTasks(snap({
    reviewStates: { a: { masteryLevel: 1, lastReviewed: NOON - H } },
    words: [{ id: 'a', isCustom: true, lastReviewed: NOON - 2 * H }, { id: 'b', isCustom: true, lastReviewed: NOON - H }],
  })), 'words');
  assert.equal(t.current, 2); // a (iki kaynaktan tek sayılır) + b
});

test('5 farklı kelimede görev tamamlanır; fazlası hedefi aşmaz', () => {
  const reviewStates = {};
  for (let i = 0; i < 8; i += 1) reviewStates[`w${i}`] = { masteryLevel: 1, lastReviewed: NOON - H };
  const t = task(A.computeDailyTasks(snap({ reviewStates })), 'words');
  assert.equal(t.current, 5);
  assert.equal(t.completed, true);
  assert.equal(task(A.computeDailyTasks(snap({ reviewStates: { w: { masteryLevel: 1, lastReviewed: NOON - H } } })), 'words').completed, false);
});

// ─── Görev 2: tamamlanan alıştırma ──────────────────────────────────────────

test('yalnızca bugün tamamlanmış alıştırmalar sayılır; flashcard ve senaryo dahil', () => {
  const t = task(A.computeDailyTasks(snap({
    sessions: [session('1', NOON - H, 3, 5), session('2', NOON - 30 * H, 5, 5), session('f', NOON - H, 8, 10, 'flashcard')],
    scenarioResults: [{ id: 'sc-00001', scenarioId: 'cafe', score: 2, total: 3, date: NOON - H }],
  })), 'exercises');
  assert.equal(t.current, 2); // hedef 2'de sınırlanır (bugün 3 kayıt var)
  assert.equal(t.completed, true);
});

test('aynı oturum kimliği iki kez sayılmaz (yerel + bulut birleşimi)', () => {
  const t = task(A.computeDailyTasks(snap({ sessions: [session('dup', NOON - H, 5, 5), session('dup', NOON - H, 5, 5)] })), 'exercises');
  assert.equal(t.current, 1);
});

// ─── Görev 3: %80 sınırı ────────────────────────────────────────────────────

test('%80 sınırı: 4/5 geçer, 3/5 geçmez; 79.9% geçmez', () => {
  const pass = A.computeDailyTasks(snap({ sessions: [session('1', NOON - H, 4, 5)] }));
  assert.equal(task(pass, 'accuracy').completed, true);
  const fail = A.computeDailyTasks(snap({ sessions: [session('1', NOON - H, 3, 5)] }));
  assert.equal(task(fail, 'accuracy').completed, false);
  const border = A.computeDailyTasks(snap({ sessions: [session('1', NOON - H, 799, 1000)] }));
  assert.equal(task(border, 'accuracy').completed, false);
  assert.equal(task(A.computeDailyTasks(snap({ sessions: [session('1', NOON - H, 800, 1000)] })), 'accuracy').completed, true);
});

test('%80 görevi: çok kısa (5 sorudan az) alıştırmalar ve flashcard sayılmaz', () => {
  const tasks = A.computeDailyTasks(snap({ sessions: [session('1', NOON - H, 2, 2), session('2', NOON - H, 10, 10, 'flashcard')] }));
  assert.equal(task(tasks, 'accuracy').completed, false);
  assert.equal(task(tasks, 'exercises').current, 2); // yine de tamamlanmış alıştırma sayılır
});

test('%80 görevi dünkü başarıyı bugüne taşımaz; bugünkü en iyi sonuç gösterilir', () => {
  const tasks = A.computeDailyTasks(snap({ sessions: [session('y', NOON - 26 * H, 5, 5), session('t', NOON - H, 3, 5)] }));
  assert.equal(task(tasks, 'accuracy').completed, false);
  assert.equal(task(tasks, 'accuracy').detail, 'Bugünkü en iyi sonuç: %60');
});

// ─── Boş hesap, bozuk kayıtlar ──────────────────────────────────────────────

test('boş hesap: tüm görevler 0, tüm rozetler kilitli, NaN yok', () => {
  const tasks = A.computeDailyTasks(empty());
  assert.deepEqual(tasks.map(t => [t.current, t.completed]), [[0, false], [0, false], [0, false]]);
  const badges = A.evaluateAchievements(empty());
  assert.equal(badges.length, 6);
  assert.ok(badges.every(b => !b.provable));
  assert.ok(badges.every(b => b.current === null || Number.isFinite(b.current)));
  assert.equal(badge(badges, 'basarili-ogrenci').detail, '');
  assert.deepEqual(A.pickNewlyEarned(badges, A.EMPTY_EARNED_RECORD), []);
});

test('null/undefined girdiler çökertmez', () => {
  const s = { now: NOON, sessions: null, scenarioResults: undefined, reviewStates: null, words: undefined, profile: undefined };
  assert.doesNotThrow(() => A.computeDailyTasks(s));
  assert.doesNotThrow(() => A.evaluateAchievements(s));
});

test('eksik ve bozuk kayıtlar yok sayılır', () => {
  const bad = [
    session('nan', NaN, 5, 5),
    session('neg', NOON - H, -1, 5),
    session('over', NOON - H, 9, 5), // puan > toplam
    session('zero', NOON - H, 0, 0),
    session('float', NOON - H, 2.5, 5),
    session('old', Date.UTC(1999, 0, 1), 5, 5),
    null,
    { id: 'x' },
  ];
  const tasks = A.computeDailyTasks(snap({ sessions: bad, reviewStates: { w: { masteryLevel: 1, lastReviewed: 'çöp' }, v: null } }));
  assert.deepEqual(tasks.map(t => t.current), [0, 0, 0]);
  assert.ok(A.evaluateAchievements(snap({ sessions: bad })).every(b => !b.provable));
});

// ─── Rozetler ───────────────────────────────────────────────────────────────

test('İlk Adım: ilk tamamlanan alıştırmayla (veya bulut toplamıyla) kazanılır', () => {
  assert.equal(badge(A.evaluateAchievements(empty()), 'ilk-adim').provable, false);
  assert.equal(badge(A.evaluateAchievements(snap({ sessions: [session('1', NOON - 40 * D, 1, 2)] })), 'ilk-adim').provable, true);
  assert.equal(badge(A.evaluateAchievements(snap({ knownSessionTotal: 12 })), 'ilk-adim').provable, true);
});

test('Kelime Kaşifi / Ustası: yalnızca "Öğrenildi" (3) düzeyindeki farklı kelimeler sayılır', () => {
  const states = {};
  for (let i = 0; i < 9; i += 1) states[`w${i}`] = { masteryLevel: 3, lastReviewed: NOON };
  states.almost = { masteryLevel: 2, lastReviewed: NOON };
  let list = A.evaluateAchievements(snap({ reviewStates: states }));
  assert.equal(badge(list, 'kelime-kasifi').provable, false);
  assert.equal(badge(list, 'kelime-kasifi').current, 9);
  states.w9 = { masteryLevel: 3, lastReviewed: NOON };
  list = A.evaluateAchievements(snap({ reviewStates: states }));
  assert.equal(badge(list, 'kelime-kasifi').provable, true);
  assert.equal(badge(list, 'kelime-ustasi').provable, false);
  for (let i = 10; i < 50; i += 1) states[`w${i}`] = { masteryLevel: 3, lastReviewed: NOON };
  assert.equal(badge(A.evaluateAchievements(snap({ reviewStates: states })), 'kelime-ustasi').provable, true);
});

test('Başarılı Öğrenci: 5+ soruluk %100; 4/4, 4/5 ve flashcard kazandırmaz', () => {
  const earned = (sessions) => badge(A.evaluateAchievements(snap({ sessions })), 'basarili-ogrenci');
  assert.equal(earned([session('1', NOON - 9 * D, 5, 5)]).provable, true);
  assert.equal(earned([session('1', NOON, 4, 4)]).provable, false);
  assert.equal(earned([session('1', NOON, 4, 5)]).provable, false);
  assert.equal(earned([session('1', NOON, 10, 10, 'flashcard')]).provable, false);
  assert.equal(earned([session('1', NOON, 9, 10)]).detail, 'Şimdiye kadarki en iyi sonucun: %90');
});

test('senaryo sonucu da %100 rozeti kazandırabilir', () => {
  const list = A.evaluateAchievements(snap({ scenarioResults: [{ id: 'sc-00001', scenarioId: 'cafe', score: 6, total: 6, date: NOON }] }));
  assert.equal(badge(list, 'basarili-ogrenci').provable, true);
});

// ─── Seri ───────────────────────────────────────────────────────────────────

const dayAt = (daysAgo, hour = 10) => NOON - daysAgo * D + (hour - 12) * H;

test('geçmişten seri: ardışık günler sayılır, boşluk seriyi böler', () => {
  const sessions = [0, 1, 2].map(d => session(`d${d}`, dayAt(d), 3, 5));
  assert.equal(A.computeHistoryStreak(snap({ sessions })), 3);
  const gap = [0, 1, 3, 4].map(d => session(`g${d}`, dayAt(d), 3, 5));
  assert.equal(A.computeHistoryStreak(snap({ sessions: gap })), 2);
});

test('bugün çalışılmadıysa dünkü seri hâlâ geçerlidir; iki gün ara seriyi bitirir', () => {
  const yesterdayOn = [1, 2, 3].map(d => session(`d${d}`, dayAt(d), 3, 5));
  assert.equal(A.computeHistoryStreak(snap({ sessions: yesterdayOn })), 3);
  const twoDaysAgo = [2, 3, 4].map(d => session(`d${d}`, dayAt(d), 3, 5));
  assert.equal(A.computeHistoryStreak(snap({ sessions: twoDaysAgo })), 0);
});

test('aynı günde çok oturum seriyi artırmaz', () => {
  const sessions = [1, 2, 3, 4].map(i => session(`s${i}`, dayAt(0, 8 + i), 3, 5));
  assert.equal(A.computeHistoryStreak(snap({ sessions })), 1);
});

test('Düzenli (3) ve Azimli (7) Öğrenci: profil sayacı güncelse kazanılır', () => {
  // Profil sayacı cihaz yerel gününü kullanır; test makinesinin saat diliminden bağımsız olsun.
  const local = new Date(NOON);
  const pad = (n) => String(n).padStart(2, '0');
  const today = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
  const profile = (streak, lastStudyDate) => ({ streak, lastStudyDate });
  const list3 = A.evaluateAchievements(snap({ profile: profile(3, today) }));
  assert.equal(badge(list3, 'duzenli-ogrenci').provable, true);
  assert.equal(badge(list3, 'azimli-ogrenci').provable, false);
  assert.equal(badge(list3, 'azimli-ogrenci').current, 3);
  assert.equal(badge(A.evaluateAchievements(snap({ profile: profile(7, today) })), 'azimli-ogrenci').provable, true);
});

test('bayat seri sayacı (son çalışma eski) rozet vermez', () => {
  const list = A.evaluateAchievements(snap({ profile: { streak: 9, lastStudyDate: '2026-10-01' } }));
  assert.ok(!badge(list, 'duzenli-ogrenci').provable);
  assert.ok(!badge(list, 'azimli-ogrenci').provable);
});

test('seri sayacı yoksa geçmişten kanıtlanan 7 günlük seri rozet verir; kanıtlanamıyorsa vermez', () => {
  const week = [0, 1, 2, 3, 4, 5, 6].map(d => session(`w${d}`, dayAt(d), 3, 5));
  assert.equal(badge(A.evaluateAchievements(snap({ sessions: week })), 'azimli-ogrenci').provable, true);
  assert.equal(badge(A.evaluateAchievements(snap({ sessions: week.slice(0, 6) })), 'azimli-ogrenci').provable, false);
});

// ─── Kalıcı kazanım, kullanıcı değişimi, çevrimdışı ─────────────────────────

test('yeni kazanılanlar yalnızca kalıcı kayıtta olmayanlardır (aynı rozet tekrar bildirilmez)', () => {
  const statuses = A.evaluateAchievements(snap({ sessions: [session('1', NOON, 5, 5)] }));
  const first = A.pickNewlyEarned(statuses, A.EMPTY_EARNED_RECORD);
  assert.deepEqual(first.sort(), ['basarili-ogrenci', 'ilk-adim']);
  const stored = { version: 1, badges: { 'ilk-adim': { verifiedAt: NOON }, 'basarili-ogrenci': { verifiedAt: NOON } } };
  assert.deepEqual(A.pickNewlyEarned(statuses, stored), []);
});

test('kullanıcı değişimi: rozetler yalnızca verilen kullanıcının verisinden hesaplanır', () => {
  const userA = snap({ sessions: [session('1', NOON, 5, 5)] });
  const userB = empty(); // B'nin yerel verisi boş
  assert.ok(A.evaluateAchievements(userA).some(b => b.provable));
  assert.ok(A.evaluateAchievements(userB).every(b => !b.provable));
});

test('çevrimdışı: tüm hesaplar yerel veriyle ağ olmadan çalışır (saf fonksiyonlar)', () => {
  const data = snap({ sessions: [session('1', NOON, 4, 5)], reviewStates: { a: { masteryLevel: 1, lastReviewed: NOON } } });
  const tasks = A.computeDailyTasks(data);
  assert.equal(tasks.length, 3);
  assert.equal(task(tasks, 'words').current, 1);
});

test('Türkçe tarih biçimi verilen gün tanımına göredir (Türkiye örneği)', () => {
  assert.equal(A.formatTurkishDate(NOON, A.TURKEY_DAY_KEY), '2 Kasım 2026');
  assert.equal(A.formatTurkishDate(TR_MIDNIGHT - 1, A.TURKEY_DAY_KEY), '1 Kasım 2026');
  assert.equal(A.formatTurkishDate(Date.UTC(2026, 11, 31, 21, 0, 0), A.TURKEY_DAY_KEY), '1 Ocak 2027');
});
