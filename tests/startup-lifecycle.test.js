// Açılış ekranı (splash) yaşam döngüsü, tema başlatma ve geliştirme ortamı uyarısı (saf mantık).
// @utils: splash-lifecycle, theme-preference, env-safety
//
// Kapsam DIŞI (emülatör/cihazda denenmeli): gerçek native splash görünümü, Android/iOS pencere zemini, ekranların ilk karesi.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const S = require(path.join(out, 'utils', 'splash-lifecycle.js'));
const T = require(path.join(out, 'utils', 'theme-preference.js'));
const E = require(path.join(out, 'utils', 'env-safety.js'));

// ─── Splash yaşam döngüsü ────────────────────────────────────────────────────────────────────
function harness(overrides = {}) {
  const calls = { prevent: 0, hide: 0 };
  const timers = [];
  const deps = {
    prevent: () => { calls.prevent += 1; },
    hide: () => { calls.hide += 1; },
    setTimer: (cb, ms) => { const handle = { cb, ms, cleared: false }; timers.push(handle); return handle; },
    clearTimer: (handle) => { handle.cleared = true; },
    ...overrides,
  };
  return { calls, timers, splash: S.createSplashLifecycle(deps) };
}
const ready = { themeLoaded: true, localDataLoaded: true, authLoaded: true };

test('başlangıçta otomatik gizleme engellenir ve güvenlik süresi başlar; splash henüz kapanmaz', () => {
  const { calls, timers, splash } = harness();
  splash.start();
  assert.equal(calls.prevent, 1);
  assert.equal(calls.hide, 0);
  assert.equal(splash.getState(), 'visible');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, S.SPLASH_MAX_WAIT_MS);
});

test('tema, yerel veri VE oturum hazır olmadan splash kapanmaz; hepsi hazır olunca bir kez kapanır', () => {
  const { calls, splash } = harness();
  splash.start();
  splash.update({ themeLoaded: false, localDataLoaded: true, authLoaded: true });
  splash.update({ themeLoaded: true, localDataLoaded: false, authLoaded: true });
  splash.update({ themeLoaded: true, localDataLoaded: true, authLoaded: false });
  assert.equal(calls.hide, 0, 'eksik hazırlıkta açık kalır (boş/açık ekran görünmez)');
  splash.update(ready);
  assert.equal(calls.hide, 1);
  assert.equal(splash.getReason(), 'ready');
  splash.update(ready);
  splash.update(ready);
  assert.equal(calls.hide, 1, 'en fazla bir kez gizlenir');
});

test('hazırlık hiç tamamlanmazsa güvenlik süresi dolunca splash YİNE kapanır (sonsuz splash yok)', () => {
  const { calls, timers, splash } = harness();
  splash.start();
  splash.update({ themeLoaded: false, localDataLoaded: false, authLoaded: false });
  timers[0].cb();
  assert.equal(calls.hide, 1);
  assert.equal(splash.getReason(), 'timeout');
  splash.update(ready);
  assert.equal(calls.hide, 1, 'süre dolduktan sonra tekrar gizlenmez');
});

test('hazır olunca güvenlik zamanlayıcısı temizlenir; sonradan tetiklense bile ikinci gizleme olmaz', () => {
  const { calls, timers, splash } = harness();
  splash.start();
  splash.update(ready);
  assert.equal(timers[0].cleared, true);
  timers[0].cb();
  assert.equal(calls.hide, 1);
  assert.equal(splash.getReason(), 'ready');
});

test('splash API hataları (senkron ya da asenkron) uygulamayı çökertmez ve durum tutarlı kalır', async () => {
  const throwing = harness({ prevent: () => { throw new Error('prevent'); }, hide: () => { throw new Error('hide'); } });
  assert.doesNotThrow(() => throwing.splash.start());
  assert.doesNotThrow(() => throwing.splash.update(ready));
  assert.equal(throwing.splash.getState(), 'hidden');

  const rejecting = harness({ prevent: () => Promise.reject(new Error('x')), hide: () => Promise.reject(new Error('y')) });
  rejecting.splash.start();
  rejecting.splash.update(ready);
  await new Promise(resolve => setImmediate(resolve)); // yakalanmamış reddetme olmamalı
  assert.equal(rejecting.splash.getState(), 'hidden');
});

test('start çağrılmadan update/forceHide splash\'i bozmaz; start ikinci kez çağrılsa tek engelleme yapılır', () => {
  const idle = harness();
  idle.splash.update(ready);
  assert.equal(idle.calls.hide, 0, 'başlatılmamışsa gizleme çağrısı yok');
  const twice = harness();
  twice.splash.start();
  twice.splash.start();
  assert.equal(twice.calls.prevent, 1);
  assert.equal(twice.timers.length, 1);
  twice.splash.forceHide();
  assert.equal(twice.calls.hide, 1);
  assert.equal(twice.splash.getReason(), 'forced');
});

test('hazırlık tanımı: üç koşulun hepsi gerekir', () => {
  assert.equal(S.isSplashReady(ready), true);
  for (const key of Object.keys(ready)) assert.equal(S.isSplashReady({ ...ready, [key]: false }), false);
});

// ─── Tema başlatma ──────────────────────────────────────────────────────────────────────────
const storageOf = (value) => ({ calls: [], getItem(key) { this.calls.push(['get', key]); return Promise.resolve(value); } });

test('kayıtlı tercih sonraki açılışta aynen okunur (açık/koyu/sistem)', async () => {
  for (const value of ['light', 'dark', 'system']) {
    assert.deepEqual(await T.loadThemePreference(storageOf(value)), { preference: value, source: 'stored' });
  }
});

test('kayıt yok/bozuk/geçersiz: "sistem" varsayılan olur ve depolamaya YAZILMAZ/SİLİNMEZ (mevcut tercih korunur)', async () => {
  for (const value of [null, '', 'DARK', '{"x":1}', 'mor', undefined]) {
    const storage = storageOf(value);
    const result = await T.loadThemePreference(storage);
    assert.deepEqual(result, { preference: 'system', source: 'default' });
    assert.deepEqual(storage.calls, [['get', T.THEME_PREFERENCE_KEY]], 'yalnızca okuma yapıldı');
  }
});

test('okuma hatası: varsayılan "sistem", fırlatmaz', async () => {
  const failing = { getItem: () => Promise.reject(new Error('disk')) };
  assert.deepEqual(await T.loadThemePreference(failing), { preference: 'system', source: 'error' });
  const throwing = { getItem: () => { throw new Error('senkron'); } };
  assert.deepEqual(await T.loadThemePreference(throwing), { preference: 'system', source: 'error' });
});

test('okuma takılırsa zaman aşımında varsayılan döner (tema yüklemesi splash\'i sonsuza dek bekletmez)', async () => {
  const hanging = { getItem: () => new Promise(() => undefined) };
  const started = Date.now();
  const result = await T.loadThemePreference(hanging, 25);
  assert.deepEqual(result, { preference: 'system', source: 'timeout' });
  assert.ok(Date.now() - started < 1500);
});

test('geçerli şema: sistem açık + koyu seçili → koyu (ilk render koyu); sistem koyu + açık seçili → açık; "sistem" sistemi izler', () => {
  assert.equal(T.resolveScheme('dark', 'light'), 'dark');
  assert.equal(T.resolveScheme('light', 'dark'), 'light');
  assert.equal(T.resolveScheme('system', 'dark'), 'dark');
  assert.equal(T.resolveScheme('system', 'light'), 'light');
  assert.equal(T.resolveScheme('system', null), 'light');
  assert.equal(T.resolveScheme('system', undefined), 'light');
  assert.equal(T.resolveScheme('system', 'unspecified'), 'light');
});

test('tercih ayrıştırma: yalnızca üç geçerli değer kabul edilir', () => {
  assert.equal(T.parseThemePreference('dark'), 'dark');
  assert.equal(T.parseThemePreference('x'), 'system');
  assert.equal(T.parseThemePreference(5), 'system');
});

// ─── Geliştirme ortamı işareti ────────────────────────────────────────────────────────────────
test('geliştirmede ortam işaretsiz ya da production ise uyarı verir; staging/local ise vermez; yayın sürümünde hiç vermez', () => {
  for (const appEnv of [undefined, '', 'production', 'prod', 'PRODUCTION']) {
    const report = E.evaluateDevEnvironment({ appEnv, isDev: true });
    assert.equal(report.level, 'warn', String(appEnv));
    assert.match(report.message, /UYARI/);
  }
  for (const appEnv of ['staging', 'STAGING', 'local']) {
    assert.deepEqual(E.evaluateDevEnvironment({ appEnv, isDev: true }), { level: 'ok', message: null });
  }
  for (const appEnv of [undefined, 'production', 'staging']) {
    assert.deepEqual(E.evaluateDevEnvironment({ appEnv, isDev: false }), { level: 'ok', message: null });
  }
});

test('uyarı metni adres, anahtar veya proje referansı içermez', () => {
  const message = E.evaluateDevEnvironment({ appEnv: 'production', isDev: true }).message;
  assert.doesNotMatch(message, /https?:|supabase\.co|sb_|eyJ/);
  assert.equal(E.parseAppEnvironment('Staging'), 'staging');
  assert.equal(E.parseAppEnvironment('x'), 'unknown');
  assert.equal(E.parseAppEnvironment(undefined), 'unset');
});

// ─── Kök yerleşimin bağlantısı (kaynak taraması; çalışma zamanı davranışı cihazda denenmeli) ──────────────
test('kök yerleşim: splash global kapsamda başlatılır, hazırlık durumu güncellenir ve tema yüklenmeden boş (null) ekran döndürülmez', () => {
  const fs = require('node:fs');
  const layout = fs.readFileSync(path.join(__dirname, '..', 'app', '_layout.tsx'), 'utf8');
  const component = layout.indexOf('export default function RootLayout');
  const start = layout.indexOf('splash.start()');
  assert.ok(start > 0 && start < component, 'splash.start() bileşenden önce (global kapsamda) çağrılmalı');
  assert.match(layout, /SplashScreen\.preventAutoHideAsync\(\)/);
  assert.match(layout, /splash\.update\(\{ themeLoaded: isThemeLoaded, localDataLoaded: isLoaded, authLoaded: isAuthLoaded \}\)/);
  assert.doesNotMatch(layout, /if \(!isThemeLoaded\) return null/);
  assert.doesNotMatch(layout, /if \(!isLoaded \|\| !isAuthLoaded \|\| !isUserDataSynced \|\| !isThemeLoaded\) return null/);
});

test('tema mağazası yükleyiciyi kullanır ve tercihi silmez/sıfırlamaz', () => {
  const fs = require('node:fs');
  const store = fs.readFileSync(path.join(__dirname, '..', 'store', 'theme.ts'), 'utf8');
  assert.match(store, /loadThemePreference\(AsyncStorage\)/);
  assert.doesNotMatch(store, /removeItem|multiRemove|clear\(/);
});
