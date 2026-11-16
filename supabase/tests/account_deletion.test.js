// "Hesabımı Sil" için yerel veritabanı testleri (supabase/functions/delete-account sunucu işlevinin dayandığı sözleşme).
//
// Gerçek bir Supabase veritabanına BAĞLANMAZ. PGlite (Node içinde çalışan gerçek PostgreSQL) üzerinde Supabase'in `auth`
// şemasını ve rollerini taklit eden geçici bir veritabanı kurar, TÜM migration'ları sırayla uygular ve Edge Function'ın
// yaptığı işlemi (`auth.users` satırını silmek; GoTrue admin deleteUser) taklit eder: kullanıcının bütün tablolardaki
// satırları aynı işlemde gider, başka kullanıcılara dokunulmaz, tetikleyiciler silmeyi engellemez.
//
// Çalıştırma (PGlite proje bağımlılığı değildir, geçici bir klasöre kurulur):
//   mkdir %TEMP%\wortly-pg && cd %TEMP%\wortly-pg && npm init -y && npm i @electric-sql/pglite
//   set PGLITE_DIR=%TEMP%\wortly-pg & node supabase/tests/account_deletion.test.js
//
// Not: GoTrue ve PostgREST taklit edilir; gerçek Supabase üzerinde işlev dağıtıldıktan sonra staging'de ayrıca denenmelidir.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const pgliteDir = process.env.PGLITE_DIR;
if (!pgliteDir) {
  console.error('PGLITE_DIR ortam değişkeni gerekli (PGlite kurulu klasör).');
  process.exit(2);
}
const { PGlite } = require(path.join(pgliteDir, 'node_modules', '@electric-sql/pglite'));

const root = path.resolve(__dirname, '..', 'migrations');
const migrations = fs.readdirSync(root).filter((f) => f.endsWith('.sql')).sort();

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const USER_TABLES = [
  ['public.profiles', 'id'], ['public.user_words', 'user_id'], ['public.study_sessions', 'user_id'],
  ['public.user_word_tombstones', 'user_id'], ['public.user_word_progress', 'user_id'], ['public.scenario_results', 'user_id'],
];

async function bootstrap() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
      )::uuid
    $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  for (const file of migrations) await db.exec(fs.readFileSync(path.join(root, file), 'utf8'));
  return db;
}

async function as(db, userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
  try { return await fn(); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}

const count = async (db, table, column, user) =>
  Number((await db.query(`select count(*)::int c from ${table} where ${column} = '${user}'`)).rows[0].c);

/** Kullanıcının, uygulamanın yazabildiği biçimde, her tabloda verisi olur. */
async function seed(db, user, tag) {
  await db.exec(`insert into public.profiles (id, name) values ('${user}', 'u-${tag}') on conflict (id) do update set name = excluded.name`);
  await as(db, user, async () => {
    await db.exec(`insert into public.user_words (id, user_id, german, turkish) values ('w-${tag}-1', '${user}', 'Haus', 'ev'), ('w-${tag}-2', '${user}', 'Auto', 'araba')`);
    await db.exec(`insert into public.study_sessions (id, user_id, type, score, total, session_date) values ('s-${tag}', '${user}', 'yazma', 3, 5, now())`);
    await db.exec(`insert into public.user_word_progress (user_id, word_id, mastery_level, last_reviewed) values ('${user}', 'w-${tag}-1', 2, now() - interval '1 hour')`);
    await db.exec(`insert into public.scenario_results (user_id, id, scenario_id, score, total, completed_at) values ('${user}', 'result-${tag}-0001', 'kafede-siparis', 4, 5, now() - interval '1 hour')`);
    // Kullanıcının kendi silmesi tombstone üretir (hesap silinirken de temizlenmelidir).
    await db.exec(`delete from public.user_words where id = 'w-${tag}-2' and user_id = '${user}'`);
  });
}

const results = [];
async function test(name, fn) {
  const db = await bootstrap();
  try {
    await fn(db);
    results.push([name, 'GEÇTİ']);
  } catch (e) {
    results.push([name, 'KALDI: ' + e.message.split('\n')[0]]);
  }
  await db.close();
}

(async () => {
  await test('1 tüm migration\'lar sırayla uygulanır; her kullanıcı tablosu auth.users\'a ON DELETE CASCADE ile bağlıdır', async (db) => {
    const rows = (await db.query(`
      select c.conrelid::regclass::text as tbl, c.confdeltype as del
      from pg_constraint c where c.contype = 'f' and c.confrelid = 'auth.users'::regclass order by 1`)).rows;
    assert.deepEqual(rows.map((r) => r.tbl).sort(), USER_TABLES.map(([t]) => t.replace('public.', '')).sort());
    for (const r of rows) assert.equal(r.del, 'c', `${r.tbl} cascade değil`);
  });

  await test('2 hesap silme (yönetici bağlamı): A\'nın TÜM tablolardaki satırları gider, B\'ninkiler aynen kalır', async (db) => {
    await seed(db, A, 'a');
    await seed(db, B, 'b');
    for (const [table, column] of USER_TABLES) assert.ok(await count(db, table, column, A) > 0, `${table} A için dolu olmalı`);
    const before = {};
    for (const [table, column] of USER_TABLES) before[table] = await count(db, table, column, B);

    await db.exec(`delete from auth.users where id = '${A}'`);

    for (const [table, column] of USER_TABLES) {
      assert.equal(await count(db, table, column, A), 0, `${table}: A'nın satırı kaldı`);
      assert.equal(await count(db, table, column, B), before[table], `${table}: B'nin verisi değişti`);
    }
    assert.equal(await count(db, 'auth.users', 'id', A), 0);
    assert.equal(await count(db, 'auth.users', 'id', B), 1);
  });

  await test('3 silme, oturum bağlamı A iken de (auth.uid() = A) FK/tetikleyici hatası vermez ve tombstone bırakmaz', async (db) => {
    await seed(db, A, 'a');
    await db.exec(`select set_config('request.jwt.claim.sub', '${A}', false)`);
    await db.exec(`delete from auth.users where id = '${A}'`);
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
    for (const [table, column] of USER_TABLES) assert.equal(await count(db, table, column, A), 0, table);
  });

  await test('4 B\'nin tombstone\'ları A silinirken korunur (silinen kelime B\'de dirilmez)', async (db) => {
    await seed(db, A, 'a');
    await seed(db, B, 'b');
    assert.equal(await count(db, 'public.user_word_tombstones', 'user_id', B), 1);
    await db.exec(`delete from auth.users where id = '${A}'`);
    assert.equal(await count(db, 'public.user_word_tombstones', 'user_id', B), 1);
  });

  await test('5 hesap silinince aynı kimlikle eski cihazdan gelen yazma yetim satır bırakamaz (FK reddeder)', async (db) => {
    await seed(db, A, 'a');
    await db.exec(`delete from auth.users where id = '${A}'`);
    let message = null;
    try {
      await db.exec(`insert into public.user_words (id, user_id, german, turkish) values ('w-late', '${A}', 'x', 'y')`);
    } catch (e) { message = e.message; }
    assert.ok(message && /foreign key|violates/i.test(message), 'silinmiş kullanıcıya satır eklenebildi');
    for (const [table, column] of USER_TABLES) assert.equal(await count(db, table, column, A), 0, table);
  });

  await test('6 silme yarım kalmaz: bir tabloda hata olursa hiçbir tablodan veri gitmez (tek işlem)', async (db) => {
    await seed(db, A, 'a');
    await db.exec(`
      create function public.block_delete() returns trigger language plpgsql as $$ begin raise exception 'blocked'; end $$;
      create trigger block_progress_delete before delete on public.user_word_progress for each row execute function public.block_delete();
    `);
    let failed = false;
    try { await db.exec(`delete from auth.users where id = '${A}'`); } catch { failed = true; }
    assert.ok(failed, 'silme engellenmeliydi');
    for (const [table, column] of USER_TABLES) assert.ok(await count(db, table, column, A) > 0 || table === 'public.user_word_tombstones', `${table}: kısmi silme oldu`);
    assert.equal(await count(db, 'auth.users', 'id', A), 1);
  });

  for (const [name, res] of results) console.log((res === 'GEÇTİ' ? 'PASS ' : 'FAIL ') + name + (res === 'GEÇTİ' ? '' : ' -> ' + res));
  const failed = results.filter(([, r]) => r !== 'GEÇTİ').length;
  console.log(`\n${results.length - failed}/${results.length} test geçti`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Test hatası:', e); process.exit(1); });
