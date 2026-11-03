// SDK 58 yükseltmesi: bağımlılık tutarlılığı ve kaldırılan/değişen API'lerin kullanılmadığının statik denetimi.
// Gerçek cihaz/Expo Go davranışı (bildirim, mikrofon, navigasyon, tema) bu testlerle DOĞRULANMAZ; telefonda denenmelidir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const installed = (name) => JSON.parse(read('node_modules', ...name.split('/'), 'package.json')).version;

test('Expo SDK 58: expo ve tüm expo-* paketleri 58 sürümünde; React Native 0.88, React 19.3', () => {
  assert.match(pkg.dependencies.expo, /^[~^]58\./);
  for (const [name, range] of Object.entries(pkg.dependencies)) {
    if (name.startsWith('expo-') || name === '@expo/metro-runtime') assert.match(range, /^[~^]58\./, `${name}: ${range}`);
  }
  assert.match(pkg.dependencies['react-native'], /^0\.88\./);
  assert.match(pkg.dependencies.react, /^19\.3\./);
  assert.equal(pkg.dependencies.react, pkg.dependencies['react-dom'], 'react ve react-dom aynı sürüm');
  assert.match(installed('expo'), /^58\./);
  assert.match(installed('react-native'), /^0\.88\./);
  assert.match(installed('expo-router'), /^58\./);
});

test('package-lock.json, package.json ile tutarlı: kök bağımlılıkların kilitli sürümü yüklü sürümle aynı', () => {
  const rootDeps = lock.packages[''].dependencies;
  assert.deepEqual(rootDeps, pkg.dependencies, 'kilit dosyasındaki kök bağımlılıklar package.json ile aynı');
  for (const name of Object.keys(pkg.dependencies)) {
    const entry = lock.packages[`node_modules/${name}`];
    assert.ok(entry, `${name} kilit dosyasında yok`);
    assert.equal(entry.version, installed(name), `${name}: kilit ${entry.version} ≠ yüklü ${installed(name)}`);
  }
});

test('SDK 57 kalıntısı yok: kilitli expo-* paketleri ve bağımlılıkları 57 sürümünde değil', () => {
  const stale = Object.entries(lock.packages)
    .filter(([key, value]) => /^node_modules\/(expo(-[a-z-]+)?|@expo\/(metro-runtime|log-box|ui))$/.test(key) && /^57\./.test(value.version))
    .map(([key, value]) => `${key}@${value.version}`);
  assert.deepEqual(stale, []);
});

test('senaryo çıkış onayı SDK 58 yöntemiyle: usePreventRemove kullanılır, kaldırılan beforeRemove/useNavigation kullanılmaz', () => {
  const source = read('app', 'senaryolar', '[id].tsx');
  assert.match(source, /usePreventRemove\(needsConfirm && !exitConfirmed, \(\{ repeat \}\)/);
  assert.match(source, /setExitConfirmed\(true\);\s*repeat\(\);/);
  assert.doesNotMatch(source.replace(/\/\/.*$/gm, ''), /beforeRemove|useNavigation|navigation\.dispatch|event\.data\.action/);
});

test('SDK 58 sürümünde kaldırılan veya değişen API kullanılmıyor (RN 0.87/0.88, expo-router 58)', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  const files = ['app', 'components', 'store', 'utils', 'hooks', 'constants'].flatMap(d => walk(path.join(ROOT, d))).filter(f => /\.tsx?$/.test(f));
  const banned = [
    [/InteractionManager/, 'InteractionManager kaldırıldı (requestIdleCallback)'],
    [/react-native\/Libraries\//, 'derin içe aktarma tür hatası'],
    [/expo-router\/react-navigation/, 'expo-router/react-navigation içe aktarmaları kaldırıldı'],
    [/withLayoutContext/, 'withLayoutContext kullanımdan kaldırıldı'],
    [/\bImageBackground\b/, 'ImageBackground kullanımdan kaldırıldı'],
    [/networkActivityIndicatorVisible|translucent/, 'RN StatusBar özellikleri kaldırıldı'],
    [/useLastNotificationResponse/, 'bildirim yanıtı aboneliği kullanılıyor'],
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
    for (const [pattern, why] of banned) assert.doesNotMatch(text, pattern, `${path.relative(ROOT, file)}: ${why}`);
  }
});

test('yapılandırma: web çıktısı SDK 57 davranışında (tek sayfa, "single") ve gereksiz iOS sahne ayarı kaldırıldı', () => {
  const app = JSON.parse(read('app.json')).expo;
  assert.equal(app.web.output, 'single', 'SDK 58 varsayılanı server; SDK 57 davranışı single idi');
  const text = read('app.json');
  assert.doesNotMatch(text, /enableSceneSupport/, 'SDK 58 sahne yaşam döngüsünü varsayılan getirir');
  assert.ok(app.plugins.includes('expo-build-properties'), 'eklenti listede kalır');
  assert.equal(app.userInterfaceStyle, 'automatic');
});

test('bildirim işleyicisi açıkça tanımlı (SDK 58 ön plan bildirimlerini varsayılan gösterir)', () => {
  const source = read('utils', 'review-reminder.ts');
  assert.match(source, /setNotificationHandler\(\{[\s\S]*shouldShowBanner: true[\s\S]*shouldPlaySound: false/);
});

test('kaldırılan/değişen expo-file-system yazma API\'leri kullanılmıyor (File.write artık asenkron)', () => {
  const source = read('utils', 'pronunciation-storage.ts');
  assert.doesNotMatch(source, /\.write\(|\.md5\b|readBytes|writeBytes/);
});
