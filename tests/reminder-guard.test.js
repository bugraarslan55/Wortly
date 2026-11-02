// @utils: reminder-guard, notification-routing, reminder-plan, progress-stats, learning-analysis, spaced-repetition, timestamps
// Bildirim planlama YARIŞLARI ve bildirime dokunma kararı (saf mantık, sahte bildirim sağlayıcısıyla).
// Gerçek expo-notifications, işletim sistemi zamanlayıcısı, navigasyon ve ekranlar bu testlerin kapsamında DEĞİLDİR.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const G = require(path.join(out, 'utils', 'reminder-guard.js'));
const N = require(path.join(out, 'utils', 'notification-routing.js'));

// ─── Sahte bildirim sağlayıcısı: kurulu bildirimleri bellekte tutar ──────────────
function fakeDevice({ permission = true, onSchedule } = {}) {
  const device = {
    scheduled: new Map(), // id -> { userId }
    presented: [],        // { id, userId }
    log: [],
    adapterFor(userId) {
      return {
        async cancelOwn() { device.log.push('cancel'); device.scheduled.clear(); },
        async dismissForeign(keep) {
          device.log.push(`dismiss:${keep}`);
          device.presented = device.presented.filter(p => keep !== null && p.userId === keep);
        },
        async hasPermission() { return permission; },
        async prepare() {},
        async schedule(item) {
          await Promise.resolve(); // gerçek API asenkron: arada başka işlemler araya girebilir
          device.log.push(`schedule:${item.id}`);
          device.scheduled.set(item.id, { userId });
          if (onSchedule) onSchedule(item, device);
        },
      };
    },
  };
  return device;
}
const plan = (n = 5) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, kind: 'daily', title: 't', body: 'b', date: i }));

// ─── Sahiplik kapısı ─────────────────────────────────────────────────────────
test('kapı: yalnızca mevcut sahip belirteç alır; sahip değişince eski belirteç geçersiz olur', () => {
  const gate = G.createOwnerGate();
  assert.equal(gate.token('a'), null, 'sahip yokken belirteç verilmez');
  gate.setOwner('a');
  const tokenA = gate.token('a');
  assert.ok(gate.isValid(tokenA));
  assert.equal(gate.token('b'), null, 'başka kullanıcıya belirteç verilmez');
  gate.setOwner('a'); // aynı kullanıcı tekrar bildirildi: süren plan geçerli kalır
  assert.ok(gate.isValid(tokenA));
  gate.setOwner('b'); // hesap A → B
  assert.ok(!gate.isValid(tokenA));
  assert.ok(gate.isValid(gate.token('b')));
});

test('kapı: A → B → A dönüşünde ilk A belirteci yeniden geçerli OLMAZ', () => {
  const gate = G.createOwnerGate();
  gate.setOwner('a');
  const old = gate.token('a');
  gate.setOwner('b');
  gate.setOwner('a');
  assert.ok(!gate.isValid(old));
});

test('kapı: revoke her durumda süren belirteçleri geçersiz kılar (çıkış)', () => {
  const gate = G.createOwnerGate();
  gate.setOwner('a');
  const t = gate.token('a');
  gate.revoke();
  assert.ok(!gate.isValid(t));
  assert.equal(gate.token('a'), null);
  assert.equal(gate.getOwner(), null);
  assert.ok(!gate.isValid(null));
});

// ─── Çıkış sırasında planlama yarışı ─────────────────────────────────────────
test('yarış: planlama sürerken çıkış yapılırsa çıkıştan sonra hiçbir bildirim kurulmaz ve kurulanlar temizlenir', async () => {
  const gate = G.createOwnerGate();
  gate.setOwner('a');
  const token = gate.token('a');
  const device = fakeDevice({
    onSchedule: (item) => { if (item.id === 'd1') gate.revoke(); }, // 2. bildirimden sonra çıkış
  });
  const result = await G.runGuardedApply({
    adapter: device.adapterFor('a'), plan: plan(5), userId: 'a', isValid: () => gate.isValid(token),
  });
  assert.equal(result, 'aborted');
  assert.equal(device.scheduled.size, 0, 'yarım kalan plan temizlenmeli');
  const afterRevoke = device.log.slice(device.log.indexOf('schedule:d1') + 1);
  assert.ok(!afterRevoke.some(entry => entry.startsWith('schedule:')), 'çıkıştan sonra yeni bildirim kurulmamalı');
});

test('yarış: çıkış, planın son bildirimi kurulurken olursa bile sonda temizlenir', async () => {
  const gate = G.createOwnerGate();
  gate.setOwner('a');
  const token = gate.token('a');
  const device = fakeDevice({ onSchedule: (item) => { if (item.id === 'd4') gate.revoke(); } });
  const result = await G.runGuardedApply({
    adapter: device.adapterFor('a'), plan: plan(5), userId: 'a', isValid: () => gate.isValid(token),
  });
  assert.equal(result, 'aborted');
  assert.equal(device.scheduled.size, 0);
});

test('yarış: planlama başlamadan önce çıkış yapılmışsa hiçbir şey kurulmaz', async () => {
  const gate = G.createOwnerGate();
  gate.setOwner('a');
  const token = gate.token('a');
  gate.revoke();
  const device = fakeDevice();
  const result = await G.runGuardedApply({
    adapter: device.adapterFor('a'), plan: plan(3), userId: 'a', isValid: () => gate.isValid(token),
  });
  assert.equal(result, 'aborted');
  assert.equal(device.scheduled.size, 0);
  assert.ok(!device.log.some(entry => entry.startsWith('schedule:')));
});

test('yarış: kuyrukta bekleyen eski plan, çıkıştan sonra çalışsa da bildirim kuramaz (seri kuyruk)', async () => {
  const gate = G.createOwnerGate();
  const enqueue = G.createSerialQueue();
  gate.setOwner('a');
  const token = gate.token('a');
  const device = fakeDevice();
  let releaseFirst;
  const blocker = enqueue(() => new Promise(resolve => { releaseFirst = resolve; })); // önceki uzun iş
  const applyPromise = enqueue(() => G.runGuardedApply({
    adapter: device.adapterFor('a'), plan: plan(4), userId: 'a', isValid: () => gate.isValid(token),
  }));
  gate.revoke(); // plan kuyruktayken çıkış
  const cancelPromise = enqueue(async () => { await device.adapterFor('a').cancelOwn(); });
  await new Promise(resolve => setImmediate(resolve)); // engelleyici görev başlasın
  releaseFirst();
  await blocker;
  assert.equal(await applyPromise, 'aborted');
  await cancelPromise;
  assert.equal(device.scheduled.size, 0);
});

// ─── Hesap A'dan B'ye geçiş ──────────────────────────────────────────────────
test('hesap geçişi: A planı sürerken B girerse A hiçbir bildirim bırakmaz; B kendi planını kurar', async () => {
  const gate = G.createOwnerGate();
  const enqueue = G.createSerialQueue();
  gate.setOwner('a');
  const tokenA = gate.token('a');
  const device = fakeDevice({ onSchedule: (item) => { if (item.id === 'd0') gate.setOwner('b'); } });

  const applyA = enqueue(() => G.runGuardedApply({
    adapter: device.adapterFor('a'), plan: plan(4), userId: 'a', isValid: () => gate.isValid(tokenA),
  }));
  const tokenB = (() => { gate.setOwner('b'); return gate.token('b'); })();
  const applyB = enqueue(() => G.runGuardedApply({
    adapter: device.adapterFor('b'), plan: plan(2), userId: 'b', isValid: () => gate.isValid(tokenB),
  }));
  assert.equal(await applyA, 'aborted');
  assert.equal(await applyB, 'applied');
  assert.equal(device.scheduled.size, 2);
  assert.ok([...device.scheduled.values()].every(entry => entry.userId === 'b'), 'yalnızca B bildirimleri kalmalı');
});

test('hesap geçişi: bildirim merkezindeki eski hesabın bildirimleri kaldırılır, yenisininki kalır', async () => {
  const gate = G.createOwnerGate();
  gate.setOwner('b');
  const device = fakeDevice();
  device.presented = [{ id: 'x', userId: 'a' }, { id: 'y', userId: 'b' }];
  await G.runGuardedApply({
    adapter: device.adapterFor('b'), plan: plan(1), userId: 'b', isValid: () => gate.isValid(gate.token('b')),
  });
  assert.deepEqual(device.presented.map(p => p.id), ['y']);
});

test('çıkış: geçersiz belirteçle çalışan uygulama bildirim merkezini de temizler', async () => {
  const device = fakeDevice();
  device.presented = [{ id: 'x', userId: 'a' }];
  await G.runGuardedApply({ adapter: device.adapterFor('a'), plan: plan(1), userId: 'a', isValid: () => false });
  assert.deepEqual(device.presented, []);
});

// ─── İzin ve plan boşluğu ────────────────────────────────────────────────────
test('izin reddedilmişse bildirim kurulmaz ama eski hatırlatmalar temizlenir', async () => {
  const device = fakeDevice({ permission: false });
  device.scheduled.set('old', { userId: 'a' });
  const result = await G.runGuardedApply({ adapter: device.adapterFor('a'), plan: plan(3), userId: 'a', isValid: () => true });
  assert.equal(result, 'skipped');
  assert.equal(device.scheduled.size, 0);
});

test('bildirim kapatılınca (boş plan) eski planlanan bildirimler iptal edilir', async () => {
  const device = fakeDevice();
  device.scheduled.set('old1', { userId: 'a' });
  device.scheduled.set('old2', { userId: 'a' });
  const result = await G.runGuardedApply({ adapter: device.adapterFor('a'), plan: [], userId: 'a', isValid: () => true });
  assert.equal(result, 'skipped');
  assert.equal(device.scheduled.size, 0);
});

test('saat değişimi: ardışık iki plan uygulanınca yalnızca sonuncusu kalır (çift bildirim yok)', async () => {
  const enqueue = G.createSerialQueue();
  const device = fakeDevice();
  const first = plan(3).map(item => ({ ...item, id: `old-${item.id}` }));
  const second = plan(3).map(item => ({ ...item, id: `new-${item.id}` }));
  await Promise.all([
    enqueue(() => G.runGuardedApply({ adapter: device.adapterFor('a'), plan: first, userId: 'a', isValid: () => true })),
    enqueue(() => G.runGuardedApply({ adapter: device.adapterFor('a'), plan: second, userId: 'a', isValid: () => true })),
  ]);
  assert.deepEqual([...device.scheduled.keys()].sort(), ['new-d0', 'new-d1', 'new-d2']);
});

test('seri kuyruk: bir görev hata verse bile sonrakiler çalışır', async () => {
  const enqueue = G.createSerialQueue();
  const results = [];
  await Promise.allSettled([
    enqueue(async () => { throw new Error('boom'); }),
    enqueue(async () => { results.push('ikinci'); }),
  ]);
  assert.deepEqual(results, ['ikinci']);
});

// ─── Arka plandan dönünce yeniden planlama ───────────────────────────────────
test('arka plandan/pasiften öne gelince yeniden planlanır; active→active ve arka plana giderken planlanmaz', () => {
  assert.equal(G.shouldReplanOnAppState('background', 'active'), true);
  assert.equal(G.shouldReplanOnAppState('inactive', 'active'), true);
  assert.equal(G.shouldReplanOnAppState('active', 'active'), false);
  assert.equal(G.shouldReplanOnAppState('active', 'background'), false);
  assert.equal(G.shouldReplanOnAppState('active', 'inactive'), false);
});

// ─── Bildirime dokunma kararı ────────────────────────────────────────────────
const NOW = 1_000_000_000_000;
const tap = (extra = {}) => ({ key: 'n1:100', data: { type: 'study-reminder', kind: 'review', userId: 'a' }, ...extra });
const ctx = (extra = {}) => ({
  tap: tap(), currentUserId: 'a', appReady: true, handled: new Set(), firstSeenAt: NOW, now: NOW, ...extra,
});

test('dokunma: tekrar bildirimi tekrar ekranına, diğer türler Ana Sayfa\'ya gider', () => {
  assert.deepEqual(N.decideTap(ctx()), { action: 'navigate', target: 'review', markHandled: true });
  for (const kind of ['goal', 'streak', 'daily']) {
    const decision = N.decideTap(ctx({ tap: tap({ data: { type: 'study-reminder', kind, userId: 'a' } }) }));
    assert.equal(decision.target, 'home', kind);
  }
});

test('dokunma: aynı bildirim yanıtı iki kez işlenmez (ve kalıcı kayıtla yeniden açılışta da)', () => {
  const handled = new Set();
  const first = N.decideTap(ctx({ handled }));
  assert.equal(first.action, 'navigate');
  handled.add('n1:100');
  const second = N.decideTap(ctx({ handled }));
  assert.equal(second.action, 'ignore');
  assert.equal(second.reason, 'already-handled');
  // Uygulama yeniden açıldı: kalıcı kayıttan yüklenen küme eski yanıtı yine engeller.
  const reloaded = new Set(N.rememberHandled([], 'n1:100'));
  assert.equal(N.decideTap(ctx({ handled: reloaded })).action, 'ignore');
});

test('dokunma: soğuk açılışta oturum yoksa korumalı ekrana gidilmez, bekler', () => {
  const decision = N.decideTap(ctx({ currentUserId: null, appReady: false }));
  assert.deepEqual(decision, { action: 'wait', markHandled: false });
});

test('dokunma: giriş yapıldıktan sonra bildirim sahibi ise bekleyen yönlendirme işlenir', () => {
  const waiting = N.decideTap(ctx({ currentUserId: null, appReady: false }));
  assert.equal(waiting.action, 'wait');
  const later = N.decideTap(ctx({ currentUserId: 'a', appReady: true, now: NOW + 60 * 1000 }));
  assert.equal(later.action, 'navigate');
});

test('dokunma: kullanıcı eşleşiyor ama uygulama hazır değilse (onboarding/eşitleme) bekler', () => {
  assert.equal(N.decideTap(ctx({ appReady: false })).action, 'wait');
});

test('dokunma: başka hesabın bildirimi yönlendirmez, hiçbir şey göstermez ve işlenmiş sayılır', () => {
  const decision = N.decideTap(ctx({ currentUserId: 'b' }));
  assert.deepEqual(decision, { action: 'ignore', markHandled: true, reason: 'other-account' });
  // Sonradan A giriş yapsa bile B oturumunda tüketilen dokunma tekrar tetiklenmez.
  assert.equal(N.decideTap(ctx({ currentUserId: 'a', handled: new Set(['n1:100']) })).action, 'ignore');
});

test('dokunma: giriş beklerken B girerse A\'nın bekleyen bildirimi B\'ye hiçbir şey göstermez', () => {
  assert.equal(N.decideTap(ctx({ currentUserId: null, appReady: false })).action, 'wait');
  const forB = N.decideTap(ctx({ currentUserId: 'b', appReady: true }));
  assert.equal(forB.action, 'ignore');
  assert.equal(forB.reason, 'other-account');
});

test('dokunma: bayat bekleyen dokunma (15 dk) yok sayılır; yeni gelenler etkilenmez', () => {
  const stale = N.decideTap(ctx({ currentUserId: null, appReady: false, firstSeenAt: NOW - N.TAP_MAX_AGE_MS - 1 }));
  assert.deepEqual(stale, { action: 'ignore', markHandled: true, reason: 'expired' });
  const fresh = N.decideTap(ctx({ firstSeenAt: NOW - 1000 }));
  assert.equal(fresh.action, 'navigate');
});

test('dokunma: Wortly\'ye ait olmayan veya sahibi bilinmeyen bildirim yönlendirmez', () => {
  assert.equal(N.decideTap(ctx({ tap: tap({ data: { type: 'baska', userId: 'a' } }) })).reason, 'not-wortly');
  assert.equal(N.decideTap(ctx({ tap: tap({ data: undefined }) })).reason, 'not-wortly');
  assert.equal(N.decideTap(ctx({ tap: tap({ data: { type: 'study-reminder', kind: 'review' } }) })).reason, 'no-owner');
  // Önceki sürümün yinelenen bildirimi (userId taşır) eski türle de güvenle ele alınır.
  assert.equal(N.decideTap(ctx({ tap: tap({ data: { type: 'daily-review', userId: 'a' } }) })).target, 'home');
});

test('işlenmiş anahtar listesi sınırlıdır ve tekrarsızdır', () => {
  let keys = [];
  for (let i = 0; i < 30; i += 1) keys = N.rememberHandled(keys, `k${i}`);
  assert.equal(keys.length, 20);
  assert.equal(keys.at(-1), 'k29');
  assert.deepEqual(N.rememberHandled(['a', 'b'], 'a'), ['b', 'a']);
});
