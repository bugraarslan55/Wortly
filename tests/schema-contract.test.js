// Uygulama kodu ↔ SQL migration SÖZLEŞME testleri (tamamen ÇEVRİMDIŞI statik analiz).
//
// Hiçbir veritabanına bağlanılmaz; migration dosyaları ve istemci kaynakları METİN olarak okunur. Amaç: kodun beklediği
// tablo/kolon/kısıt/yetki ile migration'ların tanımladığı şemanın uyuşmasını ve RLS kurallarının hesap izolasyonuna uymasını
// yerelde doğrulamak. GERÇEK Supabase'in (uygulanmış migration'lar, gerçek RLS/tetikleyici davranışı) yerini TUTMAZ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const migrationFiles = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
const sqlOf = (file) => fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '');
const allSql = migrationFiles.map(sqlOf).join('\n');

// ─── SQL ayrıştırma ───────────────────────────────────────────────────────────────────────────
function splitTopLevel(body) {
  const parts = []; let depth = 0; let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
function parseTables(sql) {
  const tables = {};
  const re = /create table if not exists public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
  let match;
  while ((match = re.exec(sql))) {
    const columns = {};
    const pk = [];
    const checks = {};
    for (const part of splitTopLevel(match[2])) {
      const first = part.split(/\s+/)[0].toLowerCase();
      if (first === 'primary') { pk.push(...part.match(/\(([^)]*)\)/)[1].split(',').map(s => s.trim())); continue; }
      if (first === 'constraint') continue;
      const name = part.split(/\s+/)[0];
      const lower = part.toLowerCase();
      columns[name] = {
        notNull: /\bnot null\b/.test(lower) || /\bprimary key\b/.test(lower),
        hasDefault: /\bdefault\b/.test(lower),
        pk: /\bprimary key\b/.test(lower),
        references: (part.match(/references\s+auth\.users\(id\)\s+on delete cascade/i) || [])[0] || null,
      };
      const inList = part.match(/check\s*\(\s*\w+\s+in\s*\(([^)]*)\)\s*\)/i);
      if (inList) checks[name] = inList[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(v => v !== undefined);
    }
    for (const name of pk) if (columns[name]) { columns[name].pk = true; columns[name].notNull = true; }
    tables[match[1]] = { columns, checks };
  }
  return tables;
}
const TABLES = parseTables(allSql);

function grantsOf(table) {
  const ops = new Set();
  const re = new RegExp(`grant\\s+([a-z, ]+?)\\s+on table public\\.${table}\\s+to\\s+authenticated`, 'gi');
  let m; while ((m = re.exec(allSql))) m[1].split(',').map(s => s.trim().toLowerCase()).forEach(op => ops.add(op));
  return ops;
}
function balanced(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    if (text[i] === ')') { depth -= 1; if (depth === 0) return text.slice(openIndex + 1, i).trim(); }
  }
  return '';
}
function policiesOf(table) {
  const result = [];
  const re = new RegExp(`create policy (\\w+) on public\\.${table}\\s+for (select|insert|update|delete)`, 'gi');
  let m;
  while ((m = re.exec(allSql))) {
    const rest = allSql.slice(m.index + m[0].length, allSql.indexOf(';', m.index));
    const usingAt = rest.search(/using\s*\(/i);
    const checkAt = rest.search(/with check\s*\(/i);
    result.push({
      name: m[1], op: m[2].toLowerCase(),
      using: usingAt >= 0 ? balanced(rest, rest.indexOf('(', usingAt)) : '',
      check: checkAt >= 0 ? balanced(rest, rest.indexOf('(', checkAt)) : '',
    });
  }
  return result;
}

// ─── İstemci tarafı ayrıştırma ───────────────────────────────────────────────────────────────────
const store = read('store', 'index.ts');
const objectKeys = (source, startMarker) => {
  const i = source.indexOf(startMarker);
  assert.ok(i >= 0, startMarker);
  const body = source.slice(source.indexOf('({', i) + 2, source.indexOf('\n});', i));
  return Array.from(body.matchAll(/^\s{2}(\w+):/gm)).map(m => m[1]);
};
const csv = (text) => text.split(',').map(s => s.trim()).filter(Boolean);
const stringConst = (name) => store.match(new RegExp(`const ${name} = '([^']*)'`))[1];
const unionValues = (typeName) => Array.from(read('types', 'index.ts').match(new RegExp(`export type ${typeName} = ([^;]*);`))[1].matchAll(/'([^']*)'/g)).map(m => m[1]);

test('migration dosyaları zaman damgasına göre sıralı ve benzersiz; beklenen 7 dosya var', () => {
  assert.equal(migrationFiles.length, 7);
  const stamps = migrationFiles.map(f => f.split('_')[0]);
  assert.deepEqual([...stamps].sort(), stamps);
  assert.equal(new Set(stamps).size, stamps.length);
  assert.ok(stamps.every(s => /^\d{14}$/.test(s)));
});

test('uygulamanın kullandığı her tablo migration\'larda tanımlı; kod dışı tek tablo tombstone (tetikleyiciyle dolar)', () => {
  const used = new Set();
  for (const file of ['store/index.ts', 'utils/learning-transports.ts']) {
    for (const m of read(file).matchAll(/\.from\('(\w+)'\)/g)) used.add(m[1]);
  }
  assert.deepEqual([...used].sort(), ['profiles', 'scenario_results', 'study_sessions', 'user_word_progress', 'user_words']);
  for (const table of used) assert.ok(TABLES[table], `${table} migration'da yok`);
  const unused = Object.keys(TABLES).filter(t => !used.has(t));
  assert.deepEqual(unused, ['user_word_tombstones'], 'kod tombstone tablosuna doğrudan erişmez (yalnızca sunucu tetikleyicisi yazar)');
});

test('profiles: kod kolonları şemada var ve upsert tüm zorunlu kolonları sağlar', () => {
  const columns = TABLES.profiles.columns;
  const upsertKeys = objectKeys(store, 'const toCloudProfile');
  const selectKeys = csv(store.match(/\.from\('profiles'\)\s*\.select\('([^']*)'\)/)[1]);
  for (const key of [...upsertKeys, ...selectKeys]) assert.ok(columns[key], `profiles.${key} şemada yok`);
  for (const [name, col] of Object.entries(columns)) {
    if (col.notNull && !col.hasDefault) assert.ok(upsertKeys.includes(name), `zorunlu kolon ${name} gönderilmiyor`);
  }
});

test('user_words: kod kolonları şemada var ve upsert tüm zorunlu kolonları sağlar', () => {
  const columns = TABLES.user_words.columns;
  const upsertKeys = objectKeys(store, 'const toCloudWord');
  const selectKeys = csv(stringConst('cloudWordColumns'));
  for (const key of [...upsertKeys, ...selectKeys]) assert.ok(columns[key], `user_words.${key} şemada yok`);
  for (const [name, col] of Object.entries(columns)) {
    if (col.notNull && !col.hasDefault) assert.ok(upsertKeys.includes(name), `zorunlu kolon ${name} gönderilmiyor`);
  }
});

test('study_sessions: kod kolonları şemada var ve upsert tüm zorunlu kolonları sağlar', () => {
  const columns = TABLES.study_sessions.columns;
  const upsertKeys = objectKeys(store, 'const toCloudSession');
  const selectKeys = csv(stringConst('cloudSessionColumns'));
  for (const key of [...upsertKeys, ...selectKeys]) assert.ok(columns[key], `study_sessions.${key} şemada yok`);
  for (const [name, col] of Object.entries(columns)) {
    if (col.notNull && !col.hasDefault) assert.ok(upsertKeys.includes(name), `zorunlu kolon ${name} gönderilmiyor`);
  }
});

test('öğrenme senkronu tabloları: taşıyıcı kolonları şemada var ve zorunlu kolonlar sağlanır', () => {
  const transports = read('utils', 'learning-transports.ts');
  const progressSelect = csv(transports.match(/\.from\('user_word_progress'\)\s*\.select\('([^']*)'\)/)[1]);
  const scenarioSelect = csv(transports.match(/\.from\('scenario_results'\)\s*\.select\('([^']*)',?\s*\)?/)[1]);
  const sync = read('utils', 'learning-sync.ts');
  const rowKeys = (iface) => Array.from(sync.match(new RegExp(`export interface ${iface} \\{([\\s\\S]*?)\\n\\}`))[1].matchAll(/^\s+(\w+):/gm)).map(m => m[1]);
  const progressRow = [...rowKeys('ProgressRow'), 'user_id'];
  const scenarioRow = [...rowKeys('ScenarioRow'), 'user_id'];
  for (const key of [...progressSelect, ...progressRow]) assert.ok(TABLES.user_word_progress.columns[key], `user_word_progress.${key}`);
  for (const key of [...scenarioSelect, ...scenarioRow]) assert.ok(TABLES.scenario_results.columns[key], `scenario_results.${key}`);
  for (const [name, col] of Object.entries(TABLES.user_word_progress.columns)) if (col.notNull && !col.hasDefault) assert.ok(progressRow.includes(name), name);
  for (const [name, col] of Object.entries(TABLES.scenario_results.columns)) if (col.notNull && !col.hasDefault) assert.ok(scenarioRow.includes(name), name);
});

test('CHECK kısıtlarındaki izinli değerler TypeScript birleşim türleriyle birebir aynı (oturum türü, seviye, artikel)', () => {
  assert.deepEqual([...TABLES.study_sessions.checks.type].sort(), [...unionValues('ExerciseType')].sort());
  assert.deepEqual([...TABLES.profiles.checks.level].sort(), [...unionValues('Level')].sort());
  assert.deepEqual([...TABLES.user_words.checks.article].sort(), [...unionValues('Article')].sort());
});

test('mini quiz oturum türü eklemez: istemcinin kaydedebileceği her oturum türü şemada izinli', () => {
  const allowed = new Set(TABLES.study_sessions.checks.type);
  for (const file of fs.readdirSync(path.join(ROOT, 'app', 'alistirma')).filter(f => f.endsWith('.tsx'))) {
    for (const m of read('app', 'alistirma', file).matchAll(/type: '([a-z-]+)'/g)) {
      if (['flashcard', 'yazma', 'dogru-yanlis', 'dinle-sec', 'dinle-yaz', 'bosluk', 'cumle'].includes(m[1])) assert.ok(allowed.has(m[1]), `${file}: ${m[1]}`);
    }
  }
  assert.ok(!/saveSession/.test(read('app', 'mini-quiz.tsx')), 'mini quiz oturum kaydetmez');
});

test('her tabloda RLS açık; her kullanıcı tablosu auth.users\'a ON DELETE CASCADE bağlı', () => {
  for (const [name, table] of Object.entries(TABLES)) {
    assert.match(allSql, new RegExp(`alter table public\\.${name} enable row level security`, 'i'), `${name}: RLS açık değil`);
    const ownerColumn = table.columns.user_id ?? table.columns.id;
    assert.ok(/references auth\.users\(id\) on delete cascade/i.test(ownerColumn.references || ''), `${name}: sahip kolonu auth.users'a bağlı değil`);
  }
});

test('RLS politikaları yalnızca kendi satırına izin verir (auth.uid() = sahip) ve uygulamanın kullandığı işlemleri kapsar', () => {
  const needed = {
    profiles: ['select', 'insert', 'update'],
    user_words: ['select', 'insert', 'update', 'delete'],
    study_sessions: ['select', 'insert', 'update'],   // upsert için güncelleme gerekir (repair migration)
    user_word_progress: ['select', 'insert', 'update'],
    scenario_results: ['select', 'insert'],            // değiştirilemez (append-only)
    user_word_tombstones: ['select'],
  };
  for (const [table, ops] of Object.entries(needed)) {
    const owner = TABLES[table].columns.user_id ? 'user_id' : 'id';
    const policies = policiesOf(table);
    const grants = grantsOf(table);
    for (const op of ops) {
      const policy = policies.find(p => p.op === op);
      assert.ok(policy, `${table}: ${op} politikası yok`);
      assert.ok(grants.has(op), `${table}: ${op} yetkisi yok`);
      const rule = (op === 'insert' ? policy.check : policy.using);
      assert.equal(rule.replace(/\s+/g, ' '), `auth.uid() = ${owner}`, `${table}.${op} politikası yalnızca sahibine izin vermeli`);
    }
    for (const policy of policies) assert.ok(ops.includes(policy.op), `${table}: beklenmeyen ${policy.op} politikası`);
  }
});

test('istemciye verilmemesi gereken yetkiler verilmemiş: senaryo/ilerleme/tombstone silinemez; oturumlar silinemez', () => {
  assert.ok(!grantsOf('scenario_results').has('update') && !grantsOf('scenario_results').has('delete'));
  assert.ok(!grantsOf('user_word_progress').has('delete'));
  assert.ok(!grantsOf('study_sessions').has('delete'));
  const tombstoneGrants = grantsOf('user_word_tombstones');
  assert.deepEqual([...tombstoneGrants], ['select'], 'tombstone tablosuna istemci yazamaz');
  // İstemci kodu bu tablolarda silme çağrısı yapmaz.
  assert.ok(!/from\('(study_sessions|scenario_results|user_word_progress|user_word_tombstones)'\)[\s\S]{0,80}\.delete\(/.test(store + read('utils', 'learning-transports.ts')));
});

test('SECURITY DEFINER işlevleri sabit search_path kullanır ve istemciden çağrılamaz/tetikleyiciye özeldir', () => {
  const definers = Array.from(allSql.matchAll(/create or replace function public\.(\w+)\(\)[\s\S]*?security definer[\s\S]*?\$\$;/gi)).map(m => m[0]);
  assert.ok(definers.length >= 2);
  for (const fn of definers) {
    assert.match(fn, /set search_path\s*=\s*(public|'')/i, 'search_path sabitlenmeli');
    assert.match(fn, /returns trigger/i, 'yalnızca tetikleyici işlevi (doğrudan çağrılamaz)');
  }
  assert.match(allSql, /revoke all on function public\.record_user_word_tombstone\(\) from public, anon, authenticated/i);
});

test('eski üç tabloda (profiles/user_words/study_sessions) anon için açık REVOKE yok: RLS tek koruma — belgelenen risk', () => {
  // Bu test bir KISIT değil, mevcut durumun kaydıdır: yeni tablolar anon'u açıkça kapatırken eski tablolarda yalnızca RLS vardır.
  for (const table of ['profiles', 'user_words', 'study_sessions']) {
    assert.ok(!new RegExp(`revoke all on table public\\.${table} from anon`, 'i').test(allSql), `${table}`);
  }
  for (const table of ['user_word_tombstones', 'user_word_progress', 'scenario_results']) {
    assert.match(allSql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'), `${table}`);
  }
});

test('hesap silme: uygulamada hesap silme akışı yok (App Store 5.1.1(v) için gerekli olabilir) — mevcut durumun kaydı', () => {
  const files = ['app', 'components', 'store', 'utils'].flatMap(dir => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    return walk(path.join(ROOT, dir));
  });
  const hasDeletion = files.some(f => /deleteUser|hesabı sil|delete.?account/i.test(fs.readFileSync(f, 'utf8')));
  assert.equal(hasDeletion, false, 'Hesap silme eklenirse bu test ve docs/supabase-schema-and-safety.md güncellenmeli');
});
