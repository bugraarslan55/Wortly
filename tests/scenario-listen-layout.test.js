// Dinle / Yavaş düğmeleri için KORUMA testi (statik metin denetimi): kısa cümlede daralan balonda düğmeler üst üste binmemeli.
// Gerçek yerleşim doğrulaması DEĞİLDİR (simülatörde elle bakılır).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const player = fs.readFileSync(path.resolve(__dirname, '..', 'app', 'senaryolar', '[id].tsx'), 'utf8');
const block = (name) => player.match(new RegExp(`${name}: \\{[^}]*\\}`))?.[0] ?? '';

test('dinle düğmeleri içerik genişliğini korur ve sığmazsa sarılır (flex: 1 / taban 0 yok)', () => {
  const row = block('listenRow');
  const button = block('listenBtn');
  assert.match(row, /flexWrap: 'wrap'/);
  assert.match(button, /flexShrink: 0/);
  assert.match(button, /flexGrow: 1/);
  assert.match(button, /minHeight: 44/);
  assert.doesNotMatch(button, /\bflex: 1\b/);
});
