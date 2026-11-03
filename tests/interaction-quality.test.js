// Dokunma/düğme kalitesi regresyon testleri (73. adım).
// @utils: navigation-guard, perf-monitor, auth-messages
//
// KAPSAM: saf mantık (çift gezinme koruması, takılma izleyici, auth mesajları), GERÇEK mağaza (deferCloud: son adım bulut
// beklemeden döner, yerel+kuyruk korunur, kopya yok) ve kaynak taramaları (dokunma hedefi, yönlendirici, abonelik).
// KAPSAM DIŞI (telefonda denenmeli): gerçek dokunma gecikmesi, PagerView kaydırma maliyeti, klavye düzeni, jest çakışmaları.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorld } = require('./support/store-harness.js');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const NAV = require(path.join(out, 'utils', 'navigation-guard.js'));
const PERF = require(path.join(out, 'utils', 'perf-monitor.js'));
const AUTH = require(path.join(out, 'utils', 'auth-messages.js'));
const ROOT = path.resolve(__dirname, '..');

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function listFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return listFiles(rel);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const uiFiles = ['app', 'components', 'hooks'].flatMap(listFiles);
const tick = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

// ─── Çift gezinme koruması ───────────────────────────────────────────────────
test('gezinme: İLK dokunuş her zaman işlenir', () => {
  let t = 1000;
  const guard = NAV.createDuplicateNavigationGuard(() => t);
  assert.equal(guard.allow(NAV.navigationKey('push', '/kelime/ekle'), NAV.DUPLICATE_NAVIGATION_WINDOW_MS), true);
});

test('gezinme: aynı hedefe hızlı ikinci dokunuş engellenir, pencere sonrası yeniden izinli', () => {
  let t = 1000;
  const guard = NAV.createDuplicateNavigationGuard(() => t);
  const key = NAV.navigationKey('push', '/kelime/ekle');
  assert.equal(guard.allow(key, 700), true);
  t += 100;
  assert.equal(guard.allow(key, 700), false, 'çift dokunuş tek gezinme');
  t += 650;
  assert.equal(guard.allow(key, 700), true, 'pencere dolunca yeniden kullanılabilir (düğme kilitli kalmaz)');
});

test('gezinme: farklı hedefler birbirini engellemez; anahtar nesne/dize için kararlı', () => {
  let t = 0;
  const guard = NAV.createDuplicateNavigationGuard(() => t);
  assert.equal(guard.allow(NAV.navigationKey('push', '/a'), 700), true);
  assert.equal(guard.allow(NAV.navigationKey('push', '/b'), 700), true);
  assert.equal(NAV.navigationKey('push', { pathname: '/x/[id]', params: { id: '1' } }), NAV.navigationKey('push', { pathname: '/x/[id]', params: { id: '1' } }));
  assert.notEqual(NAV.navigationKey('push', { pathname: '/x/[id]', params: { id: '1' } }), NAV.navigationKey('push', { pathname: '/x/[id]', params: { id: '2' } }));
});

test('gezinme: geri tuşu çift dokunuşta tek geri; sonra yeniden çalışır', () => {
  let t = 0;
  const guard = NAV.createDuplicateNavigationGuard(() => t);
  assert.equal(guard.allow('back', NAV.DUPLICATE_BACK_WINDOW_MS), true);
  t += 50;
  assert.equal(guard.allow('back', NAV.DUPLICATE_BACK_WINDOW_MS), false);
  t += NAV.DUPLICATE_BACK_WINDOW_MS;
  assert.equal(guard.allow('back', NAV.DUPLICATE_BACK_WINDOW_MS), true);
});

test('gezinme: pencere kısa tutulur (tek dokunuş algısını bozmaz) ve reset korumayı sıfırlar', () => {
  assert.ok(NAV.DUPLICATE_NAVIGATION_WINDOW_MS <= 1000);
  assert.ok(NAV.DUPLICATE_BACK_WINDOW_MS <= 600);
  let t = 0;
  const guard = NAV.createDuplicateNavigationGuard(() => t);
  guard.allow('k', 700);
  guard.reset();
  assert.equal(guard.allow('k', 700), true);
});

test('yönlendirici: tüm ekranlar/bileşenler korumalı useRouter kullanır (kök düzen hariç)', () => {
  const offenders = uiFiles.filter((rel) => rel !== 'app/_layout.tsx' && rel !== 'hooks/use-guarded-router.ts')
    .filter((rel) => /import\s*\{[^}]*\buseRouter\b[^}]*\}\s*from\s*'expo-router'/.test(stripComments(read(rel))));
  assert.deepEqual(offenders, [], 'expo-router useRouter doğrudan içe aktarılmamalı');
});

// ─── Bayat (stale) asenkron sonuç: ekrandan ayrılınca eski sonuç yeni ekranı etkilemez ───
test('hızlı çıkış/giriş: eski kullanıcının bekleyen buluta yazması yeni kullanıcının verisini bozmaz', async () => {
  const world = createWorld();
  const app = world.boot();
  await app.load();
  world.cloud.session = 'A';
  await app.sync('A');
  let release;
  world.cloud.gate = new Promise((resolve) => { release = resolve; });
  const pending = app.W.getState().addWord({ german: 'Alt', article: '', turkish: 'alt', isCustom: true }, { deferCloud: true });
  await pending;                                         // bulut kapıda, UI yine de döndü
  world.cloud.session = null;
  const wiping = app.wipe();
  release();
  await wiping;
  await tick(10);
  assert.deepEqual(app.W.getState().words, [], 'çıkıştan sonra eski kelime geri gelmedi');
  assert.equal(world.disk.has('@wortly:words'), false);
});

// ─── deferCloud: son adım bulut beklemeden ilerler ──────────────────────────
test('deferCloud: bulut gecikse bile addWord HEMEN döner; yerel + kuyruk hazır, sonra buluta gider, kopya yok', async () => {
  const world = createWorld();
  const app = world.boot();
  await app.load();
  world.cloud.session = 'A';
  await app.sync('A');
  let release;
  world.cloud.gate = new Promise((resolve) => { release = resolve; });
  let settled = false;
  const call = app.W.getState().addWord({ german: 'Haus', article: 'das', turkish: 'ev', isCustom: true }, { deferCloud: true }).then((r) => { settled = true; return r; });
  await tick(20);
  assert.equal(settled, true, 'düğme bulut cevabını BEKLEMEDEN ilerledi');
  assert.deepEqual(await call, { ok: true });
  assert.equal(app.W.getState().words.length, 1, 'yerelde hemen görünür');
  assert.equal(await app.store.getPendingChangeCount('A'), 1, 'bulut tamamlanana kadar kuyrukta korunur');
  release();
  await tick(30);
  assert.equal(world.cloud.tables.user_words.size, 1, 'arka planda buluta gitti');
  assert.equal(await app.store.getPendingChangeCount('A'), 0, 'kuyruk temizlendi');
  assert.equal(app.W.getState().words.length, 1, 'kopya yok');
});

test('deferCloud: bulut HATA verse de düğme kullanılabilir kalır, kayıt yerelde ve kuyrukta korunur', async () => {
  const world = createWorld();
  const app = world.boot();
  await app.load();
  world.cloud.session = 'A';
  await app.sync('A');
  world.cloud.session = null;                            // bulut isteği reddedilir (çevrimdışı gibi)
  const result = await app.W.getState().addWord({ german: 'Tisch', article: '', turkish: 'masa', isCustom: true }, { deferCloud: true });
  assert.equal(result.ok, true);
  assert.equal(app.W.getState().words.length, 1);
  const again = await app.W.getState().addWord({ german: 'Stuhl', article: '', turkish: 'sandalye', isCustom: true }, { deferCloud: true });
  assert.equal(again.ok, true, 'hatadan sonra tekrar kullanılabilir');
  assert.equal(app.W.getState().words.length, 2);
});

test('deferCloud: oturum kaydı gecikmeli bulutta da hemen döner ve kopya oluşturmaz', async () => {
  const world = createWorld();
  const app = world.boot();
  await app.load();
  world.cloud.session = 'A';
  await app.sync('A');
  let release;
  world.cloud.gate = new Promise((resolve) => { release = resolve; });
  const entry = { id: 'sess-1', type: 'yazma', wordIds: [], score: 4, total: 5, date: Date.now() - 1000 };
  let settled = false;
  const call = app.S.getState().saveSession(entry, { deferCloud: true }).then(() => { settled = true; });
  await tick(20);
  assert.equal(settled, true);
  await call;
  release();
  await tick(30);
  assert.equal(app.S.getState().sessions.filter((s) => s.id === 'sess-1').length, 1);
});

test('varsayılan (seçenek yok): bulut AWAIT edilir (mevcut davranış korunur)', async () => {
  const world = createWorld();
  const app = world.boot();
  await app.load();
  world.cloud.session = 'A';
  await app.sync('A');
  let release;
  world.cloud.gate = new Promise((resolve) => { release = resolve; });
  let settled = false;
  const call = app.W.getState().addWord({ german: 'Brot', article: '', turkish: 'ekmek', isCustom: true }).then(() => { settled = true; });
  await tick(20);
  assert.equal(settled, false, 'varsayılan çağrı bulutu bekler');
  release();
  await call;
  assert.equal(world.cloud.tables.user_words.size, 1);
});

test('arayüz: beklenen yalnızca son adım ekranları deferCloud kullanır ve saveSession hatası düğmeyi kilitlemez', () => {
  for (const rel of ['app/alistirma/dinle-sec.tsx', 'app/alistirma/dinle-yaz.tsx', 'app/alistirma/yazma.tsx']) {
    const code = stripComments(read(rel));
    assert.match(code, /await saveSession\(\{[\s\S]*?\},\s*\{\s*deferCloud:\s*true\s*\}\)/, `${rel}: saveSession deferCloud`);
    assert.match(code, /\.catch\(\(\)\s*=>\s*undefined\)/, `${rel}: hata yutulur, düğme ölü kalmaz`);
  }
  assert.match(stripComments(read('app/kelime/ekle.tsx')), /deferCloud:\s*true/);
  assert.match(stripComments(read('app/kelime/[id].tsx')), /deferCloud:\s*true/);
  assert.match(stripComments(read('app/onboarding.tsx')), /deferCloud:\s*true/);
});

// ─── Dokunma hedefi ──────────────────────────────────────────────────────────
test('dokunma hedefi: minimum 44 yaygın sabit olarak tanımlı ve küçük sabit yükseklikli düğme kalmadı', () => {
  const theme = read('constants/theme.ts');
  assert.match(theme, /touchTargetMin:\s*44/);
  for (const rel of ['components/ui.tsx', 'app/kelime/[id].tsx', 'app/alistirma/dinle-sec.tsx']) {
    const code = stripComments(read(rel));
    assert.doesNotMatch(code, /(chip|articleBtn|hintButton)\s*:\s*\{[^}]*\b(?:min)?[hH]eight:\s*(?:[1-3]\d|4[0-3])\b/, `${rel}: <44 yükseklik`);
  }
});

// ─── Gereksiz yeniden render: bütün mağaza aboneliği kalmadı ───────────────────
test('mağaza abonelikleri: ekran/bileşen/hook içinde parçalanmış (useShallow'+'siz) tüm-mağaza aboneliği yok', () => {
  const offenders = [];
  for (const rel of uiFiles) {
    const code = stripComments(read(rel));
    if (/=\s*use(?:Word|User|Session|Auth)Store\(\s*\)\s*;/.test(code)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], 'tüm mağazaya abonelik (her değişiklikte yeniden render)');
});

// ─── Auth: hata sonrası düğme yeniden kullanılabilir ───────────────────────────
test('auth mağazası: signIn/signUp/resetPassword istisnada bile busy sıfırlanır ve anlaşılır mesaj döner', () => {
  const code = stripComments(read('store/auth.ts'));
  const finals = code.match(/finally\s*\{\s*set\(\{\s*isBusy:\s*false\s*\}\);?\s*\}/g) ?? [];
  assert.equal(finals.length, 3, 'üç işlemde de finally ile busy kapanır');
  assert.equal((code.match(/UNEXPECTED_AUTH_ERROR_MESSAGE/g) ?? []).length >= 4, true);
});

test('auth mesajları: bilinen hatalar Türkçe, ağ hataları yönlendirici, ham ileti sızmaz', () => {
  assert.equal(AUTH.getAuthMessage('Invalid login credentials'), 'E-posta veya şifre hatalı.');
  assert.match(AUTH.getAuthMessage('Network request failed'), /Bağlantı kurulamadı/);
  assert.match(AUTH.getAuthMessage('TypeError: fetch failed'), /Bağlantı kurulamadı/);
  const unknown = AUTH.getAuthMessage('secret-internal-detail xyz');
  assert.doesNotMatch(unknown, /secret|xyz/);
  assert.match(AUTH.getAuthMessage(undefined), /hata/i);
});

// ─── Geliştirme ölçümü ────────────────────────────────────────────────────────
test('takılma izleyici: eşik altı sessiz, eşik üstü rapor; yalnızca sayı/süre', () => {
  const d = PERF.createStallDetector({ intervalMs: 100, thresholdMs: 150 });
  assert.equal(d.tick(100), null);
  assert.equal(d.tick(240), null, 'gecikme 140 < 150');
  const event = d.tick(400);
  assert.deepEqual(Object.keys(event).sort(), ['count', 'lagMs', 'maxMs']);
  assert.equal(event.lagMs, 300);
  assert.equal(d.tick(NaN), null);
});

test('takılma izleyici: başlat/durdur ve rapor', () => {
  let t = 0; let cb; let cleared = false;
  const events = [];
  const stop = PERF.startJsStallMonitor((e) => events.push(e), {
    now: () => t, setTimer: (fn) => { cb = fn; return 1; }, clearTimer: () => { cleared = true; },
  });
  t = 100; cb();
  t = 600; cb();
  assert.equal(events.length, 1);
  stop();
  assert.equal(cleared, true);
});

test('açılış zamanlayıcı: her aşama bir kez, kullanıcı verisi içermeyen etiketle', () => {
  let t = 0;
  const seen = [];
  const timer = PERF.createStartupTimer(() => t, (label, ms) => seen.push([label, ms]));
  t = 120; assert.equal(timer.mark('tema hazır'), 120);
  t = 300; assert.equal(timer.mark('tema hazır'), null);
  assert.deepEqual(seen, [['tema hazır', 120]]);
});

test('ölçüm yalnızca __DEV__ içinde çalışır (üretim derlemesinde konsola yazılmaz)', () => {
  const layout = stripComments(read('app/_layout.tsx'));
  assert.match(layout, /if \(__DEV__\) console\.debug\(`\[Wortly\]\[perf\]/);
  assert.match(layout, /if \(!__DEV__\) return undefined;/);
});
