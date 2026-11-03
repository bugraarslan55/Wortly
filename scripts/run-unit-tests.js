// utils/*.ts saf mantık dosyalarını geçici bir klasöre derler ve node:test ile tests/*.test.js çalıştırır.
// Ek bağımlılık gerekmez (TypeScript projede zaten var).
//
// Her test dosyası, ihtiyaç duyduğu utils modüllerini ilk satırlarda bildirir:
//   // @utils: answer-check, mastery
// Böylece yeni bir test eklemek bu betiği değiştirmeyi gerektirmez (ve farklı özellik dalları
// betikte çakışmaz). Bildirilen modüllerin içe aktardığı dosyalar da otomatik derlenir.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const testsDir = path.join(root, 'tests');
const testFiles = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.js'));

const modules = new Set();
for (const file of testFiles) {
  const content = fs.readFileSync(path.join(testsDir, file), 'utf8');
  for (const match of content.matchAll(/^\/\/ @utils:\s*(.+)$/gm)) {
    match[1].split(',').map((name) => name.trim()).filter(Boolean).forEach((name) => modules.add(name));
  }
}
if (modules.size === 0) {
  console.error('Hiçbir test dosyası "// @utils: ..." bildirmemiş.');
  process.exit(1);
}

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wortly-unit-'));
const sources = [...modules].sort().map((name) => path.join('utils', `${name}.ts`));

const tsc = require.resolve('typescript/bin/tsc', { paths: [root] });
const compiled = spawnSync(
  process.execPath,
  [tsc, ...sources, '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--types', 'node', '--rootDir', root],
  { cwd: root, stdio: 'inherit' },
);
if (compiled.status !== 0) {
  console.error('Derleme başarısız.');
  process.exit(compiled.status ?? 1);
}

const tests = testFiles.map((f) => path.join('tests', f));
const run = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, UTILS_OUT: out },
});
fs.rmSync(out, { recursive: true, force: true });
process.exit(run.status ?? 1);
