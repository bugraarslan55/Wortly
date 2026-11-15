// İfade Defterim için KORUMA testi (statik metin denetimi): yerel/çevrimdışı kalma, hesap sınırı ve ekran bağlantıları.
// Gerçek ekran davranışı ya da AsyncStorage doğrulaması DEĞİLDİR (depolama mantığı phrasebook-storage testindedir).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
/** Yorum satırları sayılmaz: yasak bağımlılıklar yalnızca açıklamada geçebilir. */
const code = (source) => source.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');

const FILES = [
  'utils/phrasebook.ts', 'utils/phrasebook-storage.ts', 'store/phrasebook.ts', 'components/use-phrasebook.ts',
  'components/phrase-save-button.tsx', 'app/ifade-defterim.tsx',
];

test('ifade defteri tamamen yerel: Supabase, eşitleme, ağ ve native modül içe aktarmaz', () => {
  for (const file of FILES) {
    const source = code(read(file));
    assert.doesNotMatch(source, /supabase|learning-sync|learning-transports|sync-serializer|fetch\(|wortly-speech-recognition/i, file);
    for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
      assert.doesNotMatch(match[1], /^(expo-(?!router$|speech$)|react-native-(?!safe-area-context$))/, `${file}: ${match[1]}`);
    }
  }
});

test('kayıt kullanıcıya özel anahtarla AsyncStorage\'da tutulur', () => {
  assert.match(read('utils/phrasebook-storage.ts'), /@wortly:phrasebook:\$\{userId\}/);
  assert.match(read('store/phrasebook.ts'), /createPhrasebookRepo\(AsyncStorage\)/);
});

test('mağaza oturum kullanıcısıyla yüklenir; çıkışta yalnızca bellek sıfırlanır; hesap değişiminde eski okuma geçersiz sayılır', () => {
  const layout = read('app/_layout.tsx');
  assert.match(layout, /usePhrasebookStore\(state => state\.load\)/);
  assert.match(layout, /loadPhrasebook\(session\.user\.id\)/);
  assert.match(layout, /name="ifade-defterim"/);
  assert.match(read('store/auth.ts'), /usePhrasebookStore\.getState\(\)\.reset\(\)/);
  const store = read('store/phrasebook.ts');
  assert.match(store, /createLatestGuard/);
  assert.match(store, /state\.userId !== userId/);
  assert.doesNotMatch(code(store), /removeItem|clear\(/);
});

test('hook ifadeleri yalnızca oturumdaki kullanıcıya aitse gösterir (isOwnedByUser)', () => {
  const hook = read('components/use-phrasebook.ts');
  assert.match(hook, /isOwnedByUser\(storeUserId, sessionUserId\)/);
  assert.match(hook, /owned && !isLocked \? stored : \[\]/);
});

test('senaryo oynatıcıda konuşma satırı, cevap ve karar seçeneklerinde kaydet düğmesi var; seçenek erişilebilirlik etiketi korunur', () => {
  const player = read('app/senaryolar/[id].tsx');
  assert.match(player, /save=\{phraseOf\(item, item\.speaker\)\}/);
  assert.match(player, /save=\{phraseOf\(reply, 'Sen'\)\}/);
  assert.match(player, /save=\{phraseOf\(outcome\.chosen, 'Sen'\)\}/);
  assert.match(player, /<PhraseSaveButton phrase=\{phraseOf\(option, 'Sen'\)\} \/>/);
  assert.match(player, /accessibilityLabel=\{`Cevap \$\{OPTION_LETTERS\[optionIndex\]\}: \$\{option\.german\}\. \$\{option\.turkish\}`\}/);
  // Yanlış seçenekler (reply adımının seçenek listesi) kaydedilemez: yalnızca çözülmüş doğru cevap kaydedilir.
  assert.doesNotMatch(player, /phraseOf\(option\.german/);
});

test('ekran: arama, seviye filtresi, Türkçe göster/gizle, dinleme ve silme (onaylı) var', () => {
  const screen = read('app/ifade-defterim.tsx');
  for (const pattern of [
    /filterPhrases\(items, \{ query, level \}\)/, /LEVEL_FILTERS/, /Türkçeyi gizle/, /Türkçeyi göster/, /useGermanSpeech\(\)/,
    /Alert\.alert\('İfadeyi Sil'/, /deleteLabel\(item\.german\)/, /İfadeyi dinle: /,
  ]) assert.match(screen, pattern);
});

test('senaryo listesinde İfade Defterim giriş düğmesi var', () => {
  const list = read('app/senaryolar/index.tsx');
  assert.match(list, /router\.push\('\/ifade-defterim' as any\)/);
  assert.match(list, /accessibilityLabel="İfade Defterim"/);
});

test('ifade defteri senaryo puanını, sonuç kaydını ve Supabase katmanını değiştirmez (mağaza/oturum dosyalarına dokunmaz)', () => {
  const player = read('app/senaryolar/[id].tsx');
  // Kayıt efekti hâlâ yalnızca ana puana bağlıdır.
  assert.match(player, /saveScenarioResult\(session\.user\.id, \{\s*scenarioId: scenario\.id,\s*score: score\.correct,\s*total: score\.total,\s*\}\)/);
  assert.doesNotMatch(code(read('store/index.ts')), /phrasebook/i);
});

test('ekran: boş durum klavyenin arkasında kalmaz (üste hizalı) ve liste klavye boşluğunu ayarlar', () => {
  const screen = read('app/ifade-defterim.tsx');
  assert.match(screen, /emptyListContent: \{[^}]*justifyContent: 'flex-start'/);
  assert.doesNotMatch(screen, /emptyListContent: \{[^}]*justifyContent: 'center'/);
  assert.match(screen, /automaticallyAdjustKeyboardInsets/);
});
