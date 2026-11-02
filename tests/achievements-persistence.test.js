// Ortak gün tanımı, saat dilimleri, yinelenen/bozuk veri ve rozet kalıcılığı testleri (`npm test`).
// @utils: achievements, progress-stats, timestamps
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const A = require(path.join(out, 'utils', 'achievements.js'));
const stats = require(path.join(out, 'utils', 'progress-stats.js'));
const merge = require(path.join(out, 'utils', 'timestamps.js'));

const H = 3600 * 1000;
const D = 24 * H;
const NOON = Date.UTC(2026, 10, 2, 9, 0, 0); // 12:00 Türkiye saati

const session = (id, ms, score, total, type = 'yazma') => ({ id, type, wordIds: [], score, total, date: ms });
const empty = (now = NOON, dayKey = A.TURKEY_DAY_KEY) => ({
  now, sessions: [], scenarioResults: [], reviewStates: {}, words: [], profile: null, dayKey,
});
const snap = (extra = {}, now = NOON) => ({ ...empty(now), ...extra });
const task = (tasks, id) => tasks.find(t => t.id === id);
const badge = (list, id) => list.find(b => b.id === id);

// ─── Ortak gün tanımı ───────────────────────────────────────────────────────

test('Ana Sayfa halkası ve Günlük Görev 1 AYNI sayıyı verir (her saat diliminde ve saatte)', () => {
  const reviewStates = {};
  const words = [];
  for (let i = 0; i < 9; i += 1) reviewStates[`w${i}`] = { masteryLevel: 1, lastReviewed: NOON - i * 5 * H };
  for (let i = 0; i < 4; i += 1) words.push({ id: `c${i}`, isCustom: true, lastReviewed: NOON - i * 7 * H });
  words.push({ id: 'w1', isCustom: true, lastReviewed: NOON - 5 * H }); // reviewStates ile çakışan kimlik
  for (const offset of [-600, -300, 0, 60, 120, 180, 330, 540]) {
    const dayKey = A.dayKeyForOffset(offset);
    for (const shift of [0, 3 * H, 9 * H, 14 * H, 20 * H]) {
      const now = NOON + shift;
      const ring = stats.countReviewedToday(reviewStates, words, new Date(now), dayKey);
      const wordsTask = A.computeDailyTasks({ ...empty(now, dayKey), reviewStates, words }).find(t => t.id === 'words');
      assert.equal(wordsTask.current, Math.min(ring, 5), `fark: offset ${offset}, kayma ${shift / H}s`);
    }
  }
});

test('farklı saat dilimindeki kullanıcının çalışması kendi gününde kalır (Türkiye gününe kaydırılmaz)', () => {
  const early = Date.UTC(2026, 10, 2, 20, 30); // 23:30 TR (2 Kasım), 21:30 Berlin (2 Kasım)
  const later = Date.UTC(2026, 10, 2, 21, 30); // 00:30 TR (3 Kasım), 22:30 Berlin (2 Kasım)
  const sessions = [session('b2', early, 5, 5)];
  const berlin = A.computeDailyTasks({ ...empty(later, A.dayKeyForOffset(60)), sessions });
  const istanbul = A.computeDailyTasks({ ...empty(later, A.TURKEY_DAY_KEY), sessions });
  assert.equal(task(berlin, 'exercises').current, 1, 'Berlin kullanıcısı için hâlâ aynı gün');
  assert.equal(task(istanbul, 'exercises').current, 0, 'Türkiye kullanıcısı için gece yarısı geçti');
});

test('gün tanımı kayıtlı damgaları değiştirmez; yalnızca hesaplamada güne çevirir', () => {
  const sessions = [session('s', NOON, 5, 5)];
  const frozen = JSON.stringify(sessions);
  A.computeDailyTasks({ ...empty(NOON, A.dayKeyForOffset(-600)), sessions });
  A.computeDailyTasks({ ...empty(NOON, A.dayKeyForOffset(540)), sessions });
  assert.equal(JSON.stringify(sessions), frozen);
});

test('gece yarısı hesabı: pozitif ve negatif farklarda doğru; cihaz yerel gece yarısı saat 00:00', () => {
  for (const offset of [-600, -300, 0, 60, 180, 330, 540]) {
    const key = A.dayKeyForOffset(offset);
    const next = A.nextMidnightForOffset(NOON, offset);
    assert.ok(next > NOON && next - NOON <= D, `offset ${offset}`);
    assert.notEqual(key(next - 1), key(next), 'gece yarısında gün değişmeli');
    assert.equal(key(next), key(next + 1000));
  }
  const deviceNext = A.nextDeviceMidnight(NOON);
  assert.ok(deviceNext > NOON && deviceNext - NOON <= 25 * H);
  const d = new Date(deviceNext);
  assert.deepEqual([d.getHours(), d.getMinutes(), d.getSeconds()], [0, 0, 0]);
});

test('cihaz yerel gün tanımı yerel takvimle aynıdır', () => {
  const d = new Date(NOON);
  const pad = (n) => String(n).padStart(2, '0');
  assert.equal(A.deviceDayKey(NOON), `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
});

// ─── Yinelenen, tamamlanmamış, bozuk ve ileri tarihli veri ───────────────────

test('yinelenen oturum/senaryo kaydı (çift dokunuş) ilerlemeyi iki kez artırmaz', () => {
  const sessions = [session('same', NOON - H, 5, 5), session('same', NOON - H, 5, 5)];
  const dupResult = { id: 'sc-0000001', scenarioId: 'a', score: 4, total: 5, date: NOON - H };
  const tasks = A.computeDailyTasks(snap({ sessions, scenarioResults: [dupResult, { ...dupResult }] }));
  assert.equal(task(tasks, 'exercises').current, 2); // 1 oturum + 1 senaryo
  assert.equal(task(tasks, 'accuracy').current, 1);
});

test('kaydedilmiş sonuç yoksa (alıştırma tamamlanmadıysa) alıştırma görevleri ilerlemez', () => {
  const tasks = A.computeDailyTasks(snap({ sessions: [] }));
  assert.deepEqual([task(tasks, 'exercises').current, task(tasks, 'accuracy').current], [0, 0]);
});

test('ileri tarihli (bozuk/saat hatalı) kayıtlar bugünün ilerlemesi sayılmaz; küçük saat sapması kabul edilir', () => {
  const future = NOON + 400 * D;
  const tasks = A.computeDailyTasks(snap({
    sessions: [session('f', future, 5, 5)],
    reviewStates: { w: { masteryLevel: 3, lastReviewed: future } },
    words: [{ id: 'c', isCustom: true, lastReviewed: future }],
  }));
  assert.deepEqual(tasks.map(t => t.current), [0, 0, 0]);
  const slightlyAhead = A.computeDailyTasks(snap({ sessions: [session('s', NOON + 2 * 60 * 1000, 5, 5)] }));
  assert.equal(task(slightlyAhead, 'exercises').current, 1);
  assert.equal(merge.strictTimestamp(NOON + 10 * 60 * 1000, NOON), undefined);
  assert.equal(merge.strictTimestamp('çöp', NOON), undefined);
  assert.equal(merge.strictTimestamp(NOON - H, NOON), NOON - H);
});

// ─── Rozet kalıcılığı ───────────────────────────────────────────────────────

const learnedStates = (n) => Object.fromEntries(
  Array.from({ length: n }, (_, i) => [`w${i}`, { masteryLevel: 3, lastReviewed: NOON }]),
);

test('rozet kazanıldıktan sonra mastery düşse bile kazanılmış kalır', () => {
  const at10 = A.evaluateAchievements(snap({ reviewStates: learnedStates(10) }));
  assert.equal(badge(at10, 'kelime-kasifi').provable, true);
  const { record, fresh } = A.recordEarned(A.EMPTY_EARNED_RECORD, A.pickNewlyEarned(at10, A.EMPTY_EARNED_RECORD), NOON);
  assert.deepEqual(fresh.sort(), ['kelime-kasifi']);

  const at9 = A.evaluateAchievements(snap({ reviewStates: learnedStates(9) })); // yanlış cevaplar sonrası
  assert.equal(badge(at9, 'kelime-kasifi').provable, false);
  const views = A.toAchievementViews(at9, record);
  assert.equal(badge(views, 'kelime-kasifi').earned, true);
  assert.equal(badge(views, 'kelime-kasifi').verifiedAt, NOON);
  assert.equal(A.pickNewlyEarned(at9, record).length, 0);
});

test('seri bozulsa da kazanılmış seri rozeti kalır; kaydı olmayan bayat seri rozet vermez', () => {
  const week = [0, 1, 2, 3, 4, 5, 6].map(d => session(`w${d}`, NOON - d * D, 3, 5));
  const live = A.evaluateAchievements(snap({ sessions: week }));
  const { record } = A.recordEarned(A.EMPTY_EARNED_RECORD, A.pickNewlyEarned(live, A.EMPTY_EARNED_RECORD), NOON);
  const later = A.evaluateAchievements(snap({ sessions: week }, NOON + 20 * D));
  assert.equal(badge(later, 'azimli-ogrenci').provable, false);
  assert.equal(badge(A.toAchievementViews(later, record), 'azimli-ogrenci').earned, true);
  assert.equal(badge(A.toAchievementViews(later, A.EMPTY_EARNED_RECORD), 'azimli-ogrenci').earned, false);
});

test('aynı rozet ikinci kez kaydedilmez; ilk doğrulama zamanı değişmez', () => {
  const first = A.recordEarned(A.EMPTY_EARNED_RECORD, ['ilk-adim', 'ilk-adim'], NOON);
  assert.deepEqual(first.fresh, ['ilk-adim']);
  const second = A.recordEarned(first.record, ['ilk-adim', 'kelime-kasifi'], NOON + D);
  assert.deepEqual(second.fresh, ['kelime-kasifi']);
  assert.equal(second.record.badges['ilk-adim'].verifiedAt, NOON);
  const third = A.recordEarned(second.record, ['ilk-adim'], NOON + 2 * D);
  assert.equal(third.record, second.record);
  assert.deepEqual(third.fresh, []);
});

test('kullanıcı değişince başka kullanıcının kaydı görünmez veya kullanılmaz', () => {
  const recordA = A.recordEarned(A.EMPTY_EARNED_RECORD, ['ilk-adim'], NOON).record;
  assert.equal(A.recordForUser('user-a', 'user-a', recordA), recordA);
  assert.deepEqual(A.recordForUser('user-a', 'user-b', recordA), A.EMPTY_EARNED_RECORD);
  assert.deepEqual(A.recordForUser(null, 'user-a', recordA), A.EMPTY_EARNED_RECORD);
  assert.deepEqual(A.recordForUser('user-a', undefined, recordA), A.EMPTY_EARNED_RECORD);
});

test('yeniden açılışta kayıt aynen okunur; bozuk veya eski biçimli kayıt güvenle işlenir', () => {
  const { record } = A.recordEarned(A.EMPTY_EARNED_RECORD, ['ilk-adim', 'kelime-ustasi'], NOON);
  assert.deepEqual(A.parseEarnedRecord(JSON.stringify(record)), record);
  assert.deepEqual(A.parseEarnedRecord(JSON.stringify({ 'ilk-adim': NOON })).badges, { 'ilk-adim': { verifiedAt: NOON } });
  for (const bad of [null, undefined, '', '{', 'null', '[]', '"x"', '{"version":1,"badges":[]}']) {
    assert.deepEqual(A.parseEarnedRecord(bad), A.EMPTY_EARNED_RECORD, String(bad));
  }
  const noisy = A.parseEarnedRecord(JSON.stringify({
    version: 1,
    badges: { a: { verifiedAt: -5 }, b: { verifiedAt: 'x' }, c: { verifiedAt: null }, d: { verifiedAt: NOON }, e: null },
  }));
  assert.deepEqual(Object.keys(noisy.badges), ['d']);
});

test('doğrulama zamanı yalnızca kayıttan gelir: kayıtsız (anlık kanıtlanan) rozette tarih uydurulmaz', () => {
  const statuses = A.evaluateAchievements(snap({ sessions: [session('1', NOON, 5, 5)] }));
  const views = A.toAchievementViews(statuses, A.EMPTY_EARNED_RECORD);
  assert.equal(badge(views, 'ilk-adim').earned, true);
  assert.equal(badge(views, 'ilk-adim').verifiedAt, undefined);
});

test('ileride cihazlar arası senkron için kayıt birleşimi: birleşim, en erken zaman, değişmeli, idempotent', () => {
  const a = { version: 1, badges: { x: { verifiedAt: NOON + 5 * D }, y: { verifiedAt: NOON } } };
  const b = { version: 1, badges: { x: { verifiedAt: NOON + D }, z: { verifiedAt: NOON + 2 * D } } };
  const ab = A.mergeEarnedRecords(a, b);
  assert.deepEqual(Object.keys(ab.badges).sort(), ['x', 'y', 'z']);
  assert.equal(ab.badges.x.verifiedAt, NOON + D);
  assert.deepEqual(A.mergeEarnedRecords(b, a), ab);
  assert.deepEqual(A.mergeEarnedRecords(ab, ab), ab);
  assert.deepEqual(A.mergeEarnedRecords(ab, A.EMPTY_EARNED_RECORD), ab);
});

test('hiçbir koşulda boş hesapta rozet kazanılmış görünmez', () => {
  const views = A.toAchievementViews(A.evaluateAchievements(empty()), A.EMPTY_EARNED_RECORD);
  assert.ok(views.every(v => !v.earned && v.verifiedAt === undefined));
});
