// utils/legacy-restore.ts'yi (gerçek kaynak) yükler; mağaza testlerinde mesaj üretimini doğrulamak için kullanılır.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..', '..');
if (!Module._extensions['.ts']) {
  const ts = require(path.join(ROOT, 'node_modules', 'typescript'));
  Module._extensions['.ts'] = (module, filename) => {
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    module._compile(output, filename);
  };
}
module.exports = require(path.join(ROOT, 'utils', 'legacy-restore.ts'));
