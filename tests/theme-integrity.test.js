// Tema bütünlüğü: açık/koyu paletler, kontrast, statik Colors kullanımının kalmaması, sabit renk denetimi.
// Ekranların gerçek görünümü (ekran görüntüsü) bu testlerin kapsamında DEĞİLDİR; cihazda açık/koyu/sistem temasıyla denenmelidir.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const ts = require(path.join(ROOT, 'node_modules', 'typescript'));
if (!Module._extensions['.ts']) {
  Module._extensions['.ts'] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, filename);
  };
}
const theme = require(path.join(ROOT, 'constants', 'theme.ts'));
const { LightColors, DarkColors, getCards } = theme;

// WCAG göreli parlaklık / kontrast
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
};
const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('açık ve koyu palet aynı anahtarlara sahip ve değerler geçerli renkler', () => {
  assert.deepEqual(Object.keys(DarkColors).sort(), Object.keys(LightColors).sort());
  for (const palette of [LightColors, DarkColors]) {
    for (const [key, value] of Object.entries(palette)) {
      assert.match(value, /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))$/, `${key} geçerli renk değil`);
    }
  }
});

test('eklenen tokenlar (onNavy, onGolden, divider, tint*) iki temada da tanımlı', () => {
  for (const key of ['onNavy', 'onGolden', 'navy', 'divider', 'tintBlue', 'tintPurple', 'tintAmber', 'tintOrange', 'successSurface', 'errorContainer']) {
    assert.ok(LightColors[key] && DarkColors[key], key);
  }
});

test('kritik metin/zemin çiftleri iki temada da en az 4.5:1 kontrast verir', () => {
  const pairs = [
    ['altın düğme metni', 'onGolden', 'golden'],
    ['koyu (navy) kart metni', 'onNavy', 'navy'],
    ['ana metin / sayfa zemini', 'primary', 'warmWhite'],
    ['ana metin / kart yüzeyi', 'primary', 'surfaceContainerLowest'],
    ['ikincil metin / kart yüzeyi', 'onSurfaceVariant', 'surfaceContainerLowest'],
    ['başarı rengi / başarı zemini', 'success', 'successContainer'],
  ];
  for (const [label, fg, bg] of pairs) {
    for (const [name, palette] of [['açık', LightColors], ['koyu', DarkColors]]) {
      const ratio = contrast(palette[fg], palette[bg]);
      assert.ok(ratio >= 4.5, `${label} (${name} tema): ${ratio.toFixed(2)}:1`);
    }
  }
});

test('getCards: kart yüzeyi temaya uyar (koyu temada beyaz zemin yok)', () => {
  const light = getCards(LightColors);
  const dark = getCards(DarkColors);
  assert.equal(light.surface.backgroundColor, LightColors.surfaceContainerLowest);
  assert.equal(dark.surface.backgroundColor, DarkColors.surfaceContainerLowest);
  assert.notEqual(dark.surface.backgroundColor.toLowerCase(), '#ffffff');
  assert.notEqual(light.borderColor, dark.borderColor);
});

// ─── Kaynak taraması ──────────────────────────────────────────────────────────────────────────
function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}
const UI_FILES = ['app', 'components'].flatMap(d => sourceFiles(path.join(ROOT, d)));
const rel = (file) => path.relative(ROOT, file).split(path.sep).join('/');

test('hiçbir ekran/bileşen statik Colors veya Cards içe aktarmaz (hepsi tema kancalarını kullanır)', () => {
  const offenders = UI_FILES.filter(file => /import\s*\{[^}]*\b(Colors|Cards)\b[^}]*\}\s*from\s*['"][^'"]*constants\/theme['"]/.test(fs.readFileSync(file, 'utf8'))).map(rel);
  assert.deepEqual(offenders, []);
});

test('sabit hex renk yalnızca izinli koyu-yüzey ikincil metin rengi olabilir (#B8BCC8); diğerleri temadan gelir', () => {
  const allowed = new Set(['#B8BCC8']);
  const offenders = [];
  for (const file of UI_FILES) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/^\s*\/\//.test(line)) return;
      for (const match of line.matchAll(/['"](#[0-9a-fA-F]{3,8})['"]/g)) {
        if (!allowed.has(match[1].toUpperCase())) offenders.push(`${rel(file)}:${index + 1} ${match[1]}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});

test('tema kancası kullanan dosyalarda "styles" kullanılıyorsa useStyles() çağrılıyor (render dışında kanca yok)', () => {
  const problems = [];
  for (const file of UI_FILES) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/makeStyles\(/.test(text)) continue;
    if (!/useStyles\(\)/.test(text) && /\bstyles\./.test(text.replace(/const useStyles[\s\S]*$/, ''))) problems.push(rel(file));
  }
  assert.deepEqual(problems, []);
});
