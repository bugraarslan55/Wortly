// @utils: reminder-plan, progress-stats, learning-analysis, spaced-repetition, timestamps
// Hatırlatma PLANLAMA mantığı (saf fonksiyonlar). expo-notifications, izin istemi, cihaz zamanlayıcısı,
// Alert/ekran ve gerçek bildirim teslimi bu testlerin kapsamında DEĞİLDİR (cihazda denenmelidir).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const R = require(path.join(out, 'utils', 'reminder-plan.js'));

const DAY = 24 * 60 * 60 * 1000;
// Yerel saat dilimine göre kurulur (testler TZ'den bağımsız olmalı).
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();
const NOW = at(2026, 11, 2, 10, 0); // 2 Kasım 2026, 10:00 yerel

const word = (id, extra = {}) => ({ id, german: id, article: '', turkish: id, addedAt: 1, masteryLevel: 0, isCustom: true, ...extra });
const prefs = (extra = {}) => ({ ...R.DEFAULT_REMINDER_PREFS, enabled: true, ...extra });
const base = (extra = {}) => ({ now: NOW, prefs: prefs(), candidates: [], reviewStates: {}, dailyGoal: 10, ...extra });
// Tekrarı gelmiş kelime: seviye 1 (1 gün aralık), 3 gün önce çalışıldı.
const dueStates = (ids, ago = 3 * DAY) => Object.fromEntries(ids.map(id => [id, { masteryLevel: 1, lastReviewed: NOW - ago }]));

test('varsayılan ayar: kapalı, saat 20:00', () => {
  assert.equal(R.DEFAULT_REMINDER_PREFS.enabled, false);
  assert.equal(R.DEFAULT_REMINDER_PREFS.hour, 20);
  assert.equal(R.DEFAULT_REMINDER_PREFS.minute, 0);
});

test('kapalıyken hiçbir bildirim planlanmaz', () => {
  assert.deepEqual(R.buildReminderPlan(base({ prefs: prefs({ enabled: false }) })), []);
});

test('açıkken seçilen saatte 14 gün, günde tek bildirim, benzersiz kimlik', () => {
  const plan = R.buildReminderPlan(base());
  assert.equal(plan.length, R.PLAN_DAYS);
  assert.equal(new Set(plan.map(p => p.id)).size, plan.length, 'aynı gün için iki bildirim olmamalı');
  for (const item of plan) {
    const d = new Date(item.date);
    assert.equal(d.getHours(), 20);
    assert.equal(d.getMinutes(), 0);
  }
  assert.equal(plan[0].date, at(2026, 11, 2, 20, 0));
});

test('aynı girdiyle yeniden planlama aynı kimlik ve zamanları üretir (çift bildirim oluşmaz)', () => {
  const a = R.buildReminderPlan(base());
  const b = R.buildReminderPlan(base());
  assert.deepEqual(a, b);
});

test('saat değişince tüm zamanlar yeni saate taşınır, kimlikler gün bazlı kalır (eski karşılığı değişir)', () => {
  const a = R.buildReminderPlan(base());
  const b = R.buildReminderPlan(base({ prefs: prefs({ hour: 7, minute: 45 }) }));
  // 07:45 bugün için geçmiş (şimdi 10:00): bugün atlanır, yarından başlar.
  assert.equal(b[0].date, at(2026, 11, 3, 7, 45));
  assert.ok(b.every(p => new Date(p.date).getHours() === 7 && new Date(p.date).getMinutes() === 45));
  const sharedIds = a.map(p => p.id).filter(id => b.some(x => x.id === id));
  assert.ok(sharedIds.length > 0, 'aynı günler aynı kimliği paylaşır: eski bildirim üzerine yazılır');
});

test('bugünün saati geçtiyse bugün planlanmaz; gece yarısını geçince yeni gün planlanır', () => {
  const late = R.buildReminderPlan(base({ now: at(2026, 11, 2, 23, 30) }));
  assert.equal(late[0].date, at(2026, 11, 3, 20, 0));
  const afterMidnight = R.buildReminderPlan(base({ now: at(2026, 11, 3, 0, 5) }));
  assert.equal(afterMidnight[0].date, at(2026, 11, 3, 20, 0));
  assert.notEqual(late[0].id, R.reminderId(at(2026, 11, 2, 20, 0)));
});

test('şimdiye bir dakikadan yakın saat planlanmaz', () => {
  const plan = R.buildReminderPlan(base({ now: at(2026, 11, 2, 19, 59) + 30 * 1000 }));
  assert.equal(plan[0].date, at(2026, 11, 3, 20, 0));
});

test('günlük hedef tamamlandıysa bugünün bildirimi planlanmaz, yarınki planlanır', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `w${i}`);
  const reviewStates = Object.fromEntries(ids.map(id => [id, { masteryLevel: 1, lastReviewed: NOW - 60 * 1000 }]));
  const plan = R.buildReminderPlan(base({ reviewStates, candidates: ids.map(id => word(id)) }));
  assert.equal(plan[0].date, at(2026, 11, 3, 20, 0));
  assert.equal(plan.length, R.PLAN_DAYS - 1);
});

test('hedef tamamlanmadıysa bugünkü mesaj gerçek kalan sayıyı söyler', () => {
  const ids = ['a', 'b', 'c'];
  const reviewStates = Object.fromEntries(ids.map(id => [id, { masteryLevel: 1, lastReviewed: NOW - 60 * 1000 }]));
  const plan = R.buildReminderPlan(base({ reviewStates, prefs: prefs({ review: false }) }));
  assert.equal(plan[0].kind, 'goal');
  assert.match(plan[0].body, /10 kelime hedefine 7 kelime kaldı/);
});

test('tekrar bekleyen kelime yoksa tekrar mesajı ve yanlış sayı gösterilmez', () => {
  // Hiç çalışılmamış kelimeler "tekrar" sayılmaz; yakın zamanda çalışılanlar henüz gelmemiştir.
  const candidates = [word('new'), word('fresh')];
  const reviewStates = { fresh: { masteryLevel: 3, lastReviewed: NOW - 60 * 1000 } };
  const plan = R.buildReminderPlan(base({ candidates, reviewStates, prefs: prefs({ goal: false }) }));
  assert.ok(plan.every(p => p.kind !== 'review'));
  assert.ok(plan.every(p => !/\d+ kelime tekrar/.test(p.body)));
  assert.equal(plan[0].kind, 'daily');
  assert.equal(plan[0].title, 'Wortly ile Almanca zamanı');
  assert.equal(plan[0].body, 'Bugün birkaç kelime tekrar ederek öğrenmene devam et.');
});

test('tekrar bekleyen kelime varsa gerçek sayı yazılır; yalnızca yakın günler için iddia edilir', () => {
  const ids = ['a', 'b', 'c'];
  const plan = R.buildReminderPlan(base({
    candidates: ids.map(id => word(id)), reviewStates: dueStates(ids), prefs: prefs({ goal: false }),
  }));
  const reviews = plan.filter(p => p.kind === 'review');
  assert.equal(reviews.length, R.REVIEW_CLAIM_DAYS);
  assert.match(reviews[0].body, /^3 kelime tekrarını bekliyor/);
  assert.equal(plan[R.REVIEW_CLAIM_DAYS].kind, 'daily', 'uzak günlerde sayı iddiası yok');
});

test('tekrar mesajı kapatılabilir; hedef/genel mesaja düşer', () => {
  const ids = ['a'];
  const plan = R.buildReminderPlan(base({
    candidates: [word('a')], reviewStates: dueStates(ids), prefs: prefs({ review: false, goal: false }),
  }));
  assert.ok(plan.every(p => p.kind === 'daily'));
});

test('kişisel olmayan (konu) kelimeler de tekrar sayısına girer; kimlik tekrar etse bile bir kez sayılır', () => {
  const topicWord = word('goethe-a1-haus', { isCustom: false });
  const plan = R.buildReminderPlan(base({
    candidates: [topicWord, topicWord], reviewStates: dueStates(['goethe-a1-haus']), prefs: prefs({ goal: false }),
  }));
  assert.match(plan[0].body, /^1 kelime tekrarını/);
});

test('seri hatırlatması varsayılan kapalı; açıkken yalnızca bilinen durumlarda', () => {
  const profile = { streak: 4, lastStudyDate: '2026-11-01' }; // dün çalışıldı, bugün henüz değil
  const off = R.buildReminderPlan(base({ ...profile }));
  assert.ok(off.every(p => p.kind !== 'streak'));
  const on = R.buildReminderPlan(base({ ...profile, prefs: prefs({ streak: true }) }));
  assert.equal(on[0].kind, 'streak');
  assert.match(on[0].body, /4 günlük serin/);
  assert.ok(on.slice(1).every(p => p.kind !== 'streak'), 'ileri günler için seri iddiası yapılmaz');
});

test('seri: eski/bozulmuş seri için seri mesajı yok', () => {
  const plan = R.buildReminderPlan(base({ streak: 9, lastStudyDate: '2026-10-20', prefs: prefs({ streak: true }) }));
  assert.ok(plan.every(p => p.kind !== 'streak'));
});

test('bugün çalışıldıysa (hedef dolmadı) yarın için seri mesajı, bugün için seri mesajı yok', () => {
  const reviewStates = { a: { masteryLevel: 1, lastReviewed: NOW - 60 * 1000 } };
  const plan = R.buildReminderPlan(base({
    reviewStates, candidates: [word('a')], streak: 3, lastStudyDate: '2026-11-02', prefs: prefs({ streak: true }),
  }));
  assert.notEqual(plan[0].kind, 'streak');
  assert.equal(plan[1].kind, 'streak');
  assert.match(plan[1].body, /Yarın da çalışarak koru/);
});

test('her günde en fazla bir bildirim (üst üste bildirim yok), tüm türler açıkken bile', () => {
  const ids = ['a', 'b'];
  const plan = R.buildReminderPlan(base({
    candidates: ids.map(id => word(id)), reviewStates: dueStates(ids), streak: 2, lastStudyDate: '2026-11-01',
    prefs: prefs({ streak: true }),
  }));
  const days = plan.map(p => R.reminderId(p.date));
  assert.equal(new Set(days).size, plan.length);
});

test('bildirim metni kelime içeriği taşımaz (başka hesabın/özel kelimeler görünmez)', () => {
  const secret = word('gizli-kelime', { german: 'Geheimwort', turkish: 'gizli' });
  const plan = R.buildReminderPlan(base({ candidates: [secret], reviewStates: dueStates(['gizli-kelime']) }));
  for (const item of plan) {
    assert.ok(!/Geheimwort|gizli/.test(`${item.title} ${item.body}`));
  }
});

test('çevrimdışı: plan yalnızca yerel girdiden üretilir (ağ gerektirmez), bozuk girdi çökertmez', () => {
  assert.doesNotThrow(() => R.buildReminderPlan({ now: NOW, prefs: prefs(), candidates: [], reviewStates: null }));
  assert.doesNotThrow(() => R.buildReminderPlan(base({ dailyGoal: NaN, streak: undefined, reviewStates: undefined })));
});

test('saat dilimi/yaz saati: her gün seçilen YEREL saatte kurulur (zamanlar yerel takvimden hesaplanır)', () => {
  // Kış saati → yaz saati geçişini kapsayan bir pencere; yerel saat/dakika hep korunmalı.
  const plan = R.buildReminderPlan(base({ now: at(2026, 3, 20, 10, 0), prefs: prefs({ hour: 9, minute: 15 }) }));
  assert.ok(plan.length > 0);
  for (const item of plan) {
    const d = new Date(item.date);
    assert.equal(d.getHours(), 9);
    assert.equal(d.getMinutes(), 15);
  }
  // Saat dilimi değişince plan yeni yerel saate göre yeniden üretilir: farklı `now` yerel günü farklı kimlik verir.
  assert.notEqual(R.reminderId(at(2026, 11, 2, 20, 0)), R.reminderId(at(2026, 11, 3, 20, 0)));
});

test('ayar normalleştirme: bozuk değerler güvenli varsayılana döner', () => {
  assert.deepEqual(R.normalizePrefs(null), R.DEFAULT_REMINDER_PREFS);
  const n = R.normalizePrefs({ enabled: 'yes', hour: 99, minute: -4, review: 'x', goal: false, streak: true });
  assert.equal(n.enabled, false);
  assert.equal(n.hour, 23);
  assert.equal(n.minute, 0);
  assert.equal(n.review, true);
  assert.equal(n.goal, false);
  assert.equal(n.streak, true);
  assert.equal(R.normalizePrefs({ hour: 7.5 }).hour, 20);
  // Önceki sürümün kaydı ({enabled,hour,minute}) eksik alanları varsayılanla tamamlanır.
  assert.deepEqual(R.normalizePrefs({ enabled: true, hour: 8, minute: 30 }), { ...R.DEFAULT_REMINDER_PREFS, enabled: true, hour: 8, minute: 30 });
});

test('iptal yalnızca Wortly bildirim türlerini kapsar (başka bildirimlere dokunulmaz)', () => {
  assert.equal(R.isManagedReminderData({ type: 'study-reminder', userId: 'u' }), true);
  assert.equal(R.isManagedReminderData({ type: 'daily-review' }), true); // eski sürüm yinelenen bildirimi
  assert.equal(R.isManagedReminderData({ type: 'other-feature' }), false);
  assert.equal(R.isManagedReminderData({}), false);
  assert.equal(R.isManagedReminderData(null), false);
  assert.equal(R.isManagedReminderData(undefined), false);
});
