// utils/*.ts saf mantık dosyalarını geçici bir klasöre derler ve node:test ile tests/*.test.js çalıştırır.
// Ek bağımlılık gerekmez (TypeScript projede zaten var).
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wortly-unit-'));
const sources = [
  'answer-check', 'mastery', 'progress-stats', 'learning-analysis', 'spaced-repetition', 'word-validation',
].map((name) => path.join('utils', `${name}.ts`));

const tsc = require.resolve('typescript/bin/tsc', { paths: [root] });
const compiled = spawnSync(
  process.execPath,
  [tsc, ...sources, '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--rootDir', root],
  { cwd: root, stdio: 'inherit' },
);
if (compiled.status !== 0) {
  console.error('Derleme başarısız.');
  process.exit(compiled.status ?? 1);
}

const tests = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('tests', f));
const run = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, UTILS_OUT: out },
});
fs.rmSync(out, { recursive: true, force: true });
process.exit(run.status ?? 1);
