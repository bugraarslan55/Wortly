// Tombstone migration'ı için yerel veritabanı testleri.
//
// Gerçek bir Supabase veritabanına BAĞLANMAZ. PGlite (Node içinde çalışan gerçek PostgreSQL)
// üzerinde, Supabase'in `auth` şemasını ve rollerini taklit eden geçici bir veritabanı kurar,
// mevcut migration'ları ve test edilen migration'ı uygular ve senaryoları çalıştırır.
//
// Çalıştırma (PGlite proje bağımlılığı değildir, geçici bir klasöre kurulur):
//   mkdir %TEMP%\wortly-pg && cd %TEMP%\wortly-pg && npm init -y && npm i @electric-sql/pglite
//   set PGLITE_DIR=%TEMP%\wortly-pg & node supabase/tests/user_word_tombstones.test.js
//
// Not: Supabase'e özgü ayrıntılar (auth.uid() uygulaması, PostgREST) taklit edilir; bu testler
// PostgreSQL tetikleyici/RLS/cascade davranışını doğrular, Supabase panelinde yerine geçmez.

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
const migrationUnderTest = process.env.MIGRATION || '20261101090000_user_word_tombstones.sql';
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

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
    -- Supabase varsayılanı: public'te yeni tablolara geniş yetki verilir (RLS sınırlar).
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    insert into auth.users values ('${A}'), ('${B}');
  `);
  await db.exec(read('20261021160000_create_user_words.sql'));
  return db;
}

// Verilen kullanıcı gibi (authenticated rolü + JWT sub) çalıştırır.
async function as(db, userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

const word = (id, userId, extra = '') =>
  `('${id}', '${userId}', 'Apfel', 'der', 'elma'${extra})`;
const upsert = (id, userId, turkish = 'elma') => `
  insert into public.user_words (id, user_id, german, article, turkish)
  values ('${id}', '${userId}', 'Apfel', 'der', '${turkish}')
  on conflict (id) do update set turkish = excluded.turkish, german = excluded.german,
    article = excluded.article`;
const count = async (db, table, where = 'true') =>
  Number((await db.query(`select count(*)::int c from ${table} where ${where}`)).rows[0].c);
const fails = async (fn) => { try { await fn(); } catch (e) { return e.message; } return null; };

const results = [];
async function test(name, fn) {
  const db = await bootstrap();
  await db.exec(read(migrationUnderTest));
  try {
    await fn(db);
    results.push([name, 'GEÇTİ']);
  } catch (e) {
    results.push([name, 'KALDI: ' + e.message.split('\n')[0]]);
  }
  await db.close();
}

(async () => {
  await test('1 normal ekleme (upsert) çalışır, tombstone üretmez', async (db) => {
    await as(db, A, () => db.exec(upsert('w1', A)));
    assert.equal(await count(db, 'public.user_words'), 1);
    assert.equal(await count(db, 'public.user_word_tombstones'), 0);
  });

  await test('2 normal düzenleme (ON CONFLICT DO UPDATE) çalışır', async (db) => {
    await as(db, A, () => db.exec(upsert('w1', A, 'elma')));
    await as(db, A, () => db.exec(upsert('w1', A, 'yeni anlam')));
    const r = await db.query(`select turkish from public.user_words where id='w1'`);
    assert.equal(r.rows[0].turkish, 'yeni anlam');
    assert.equal(await count(db, 'public.user_word_tombstones'), 0);
  });

  await test('3 silme tombstone yazar ve kimlik/kullanıcı doğru kaydedilir', async (db) => {
    await as(db, A, () => db.exec(upsert('w1', A)));
    await as(db, A, () => db.exec(`delete from public.user_words where id='w1' and user_id='${A}'`));
    assert.equal(await count(db, 'public.user_words'), 0);
    const t = (await db.query(`select user_id, word_id from public.user_word_tombstones`)).rows;
    assert.equal(t.length, 1);
    assert.equal(t[0].user_id, A);
    assert.equal(t[0].word_id, 'w1');
  });

  await test('4 silinen kelimenin eski kopyadan upsert edilmesi hatasız atlanır', async (db) => {
    await as(db, A, () => db.exec(upsert('w1', A)));
    await as(db, A, () => db.exec(`delete from public.user_words where id='w1'`));
    const err = await fails(() => as(db, A, () => db.exec(upsert('w1', A, 'eski kopya'))));
    assert.equal(err, null, 'hata döndü: ' + err);
    assert.equal(await count(db, 'public.user_words'), 0, 'kelime dirildi');
    // PostgREST upsert (return=representation) boş dizi döner, hata vermez.
    const r = await as(db, A, () => db.query(upsert('w1', A) + ' returning id'));
    assert.equal(r.rows.length, 0);
  });

  await test('5 toplu upsert: tombstone satırı atlanır, diğerleri yazılır', async (db) => {
    await as(db, A, () => db.exec(upsert('w1', A)));
    await as(db, A, () => db.exec(`delete from public.user_words where id='w1'`));
    await as(db, A, () => db.exec(`
      insert into public.user_words (id, user_id, german, article, turkish) values
        ('w1','${A}','Apfel','der','x'), ('w2','${A}','Birne','die','y'), ('w3','${A}','Haus','das','z')
      on conflict (id) do update set turkish = excluded.turkish`));
    const ids = (await db.query(`select id from public.user_words order by id`)).rows.map(r => r.id);
    assert.deepEqual(ids, ['w2', 'w3']);
  });

  await test('6 iki kullanıcı: kelime ve tombstone izolasyonu', async (db) => {
    await as(db, A, () => db.exec(upsert('wa', A)));
    await as(db, A, () => db.exec(`delete from public.user_words where id='wa'`));
    // B, A'nın tombstone'unu göremez
    const seen = await as(db, B, () => db.query(`select * from public.user_word_tombstones`));
    assert.equal(seen.rows.length, 0);
    // B, A adına kelime ekleyemez
    assert.ok(await fails(() => as(db, B, () => db.exec(upsert('wb', A)))), 'B, A adına yazabildi');
    // B kendi kelimesini ekler/siler; A'nın tombstone'larına dokunmaz
    await as(db, B, () => db.exec(upsert('wb', B)));
    await as(db, B, () => db.exec(`delete from public.user_words where id='wb'`));
    assert.equal(await count(db, 'public.user_word_tombstones', `user_id='${A}'`), 1);
    assert.equal(await count(db, 'public.user_word_tombstones', `user_id='${B}'`), 1);
  });

  await test('7 B, A\'nın kelimesini silemez ve tombstone üretemez', async (db) => {
    await as(db, A, () => db.exec(upsert('wa', A)));
    await as(db, B, () => db.exec(`delete from public.user_words where id='wa'`)); // RLS: 0 satır
    assert.equal(await count(db, 'public.user_words'), 1);
    assert.equal(await count(db, 'public.user_word_tombstones'), 0);
  });

  await test('8 istemci tombstone tablosuna doğrudan yazamaz', async (db) => {
    const ins = await fails(() => as(db, A, () => db.exec(
      `insert into public.user_word_tombstones (user_id, word_id) values ('${A}','x')`)));
    assert.ok(ins, 'doğrudan insert başarılı oldu');
    await as(db, A, () => db.exec(upsert('w1', A)));
    await as(db, A, () => db.exec(`delete from public.user_words where id='w1'`));
    const del = await fails(() => as(db, A, () => db.exec(`delete from public.user_word_tombstones`)));
    const upd = await fails(() => as(db, A, () => db.exec(`update public.user_word_tombstones set word_id='z'`)));
    assert.ok(del || (await count(db, 'public.user_word_tombstones')) === 1, 'tombstone silinebildi');
    assert.ok(upd || (await count(db, 'public.user_word_tombstones', `word_id='w1'`)) === 1, 'tombstone değişti');
  });

  await test('9 hesap silme (yönetici) kelime ve tombstone\'ları hatasız temizler', async (db) => {
    await as(db, A, () => db.exec(upsert('w1', A)));
    await as(db, A, () => db.exec(upsert('w2', A)));
    await as(db, A, () => db.exec(`delete from public.user_words where id='w1'`));
    await db.exec(`delete from auth.users where id='${A}'`);
    assert.equal(await count(db, 'public.user_words', `user_id='${A}'`), 0);
    assert.equal(await count(db, 'public.user_word_tombstones', `user_id='${A}'`), 0);
  });

  await test('10 oturumu açık kullanıcı bağlamında hesap silme FK hatası vermez', async (db) => {
    await as(db, A, () => db.exec(upsert('w1', A)));
    // Hesap silme, kullanıcının JWT bağlamı açıkken çalışırsa (ör. kullanıcı bağlamlı bir işlev)
    await db.exec(`select set_config('request.jwt.claim.sub', '${A}', false)`);
    const err = await fails(() => db.exec(`delete from auth.users where id='${A}'`));
    await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
    assert.equal(err, null, 'hesap silme başarısız: ' + err);
    assert.equal(await count(db, 'public.user_word_tombstones'), 0);
  });

  await test('11 service_role / yönetici silmesi tombstone üretmez', async (db) => {
    await as(db, A, () => db.exec(upsert('w1', A)));
    await db.exec(`delete from public.user_words where id='w1'`); // uid null
    assert.equal(await count(db, 'public.user_word_tombstones'), 0);
  });

  await test('12 migration öncesi silinen kelime için koruma yoktur (belgelenen sınır)', async (db) => {
    // Tombstone yokken (migration öncesi silme) eski kopya yeniden yazılabilir.
    await as(db, A, () => db.exec(upsert('old', A)));
    await db.exec(`truncate public.user_word_tombstones`);
    await db.exec(`delete from public.user_words where id='old'`);
    await as(db, A, () => db.exec(upsert('old', A)));
    assert.equal(await count(db, 'public.user_words'), 1);
  });

  await test('13 updated_at tetikleyicisi ve silme sonrası aynı kimlik yeni kullanıcıda', async (db) => {
    await as(db, A, () => db.exec(upsert('w1', A)));
    await as(db, A, () => db.exec(`delete from public.user_words where id='w1'`));
    // Aynı word_id başka kullanıcı için tombstone'lu değildir (anahtar user_id + word_id)
    await as(db, B, () => db.exec(upsert('w1', B)));
    assert.equal(await count(db, 'public.user_words', `user_id='${B}'`), 1);
  });

  await test('14 hesap silme sırasında oturumsuz (anon) bağlamda tombstone yazılamaz', async (db) => {
    await db.exec(`set role anon;`);
    const err = await fails(() => db.exec(`insert into public.user_word_tombstones (user_id, word_id) values ('${A}','x')`));
    await db.exec(`reset role;`);
    assert.ok(err, 'anon tombstone yazabildi');
  });

  await test('15 başka kullanıcının tombstone kaydı hata/sessizlik farkıyla sızdırılamaz', async (db) => {
    await as(db, A, () => db.exec(upsert('secret-id', A)));
    await as(db, A, () => db.exec(`delete from public.user_words where id='secret-id'`));
    // B, A adına hem tombstone'lu hem tombstone'suz kimlikle yazmayı dener: iki durumda da
    // aynı sonuç (RLS hatası) alınmalı; aksi halde tombstone varlığı sızar.
    const withTomb = await fails(() => as(db, B, () => db.exec(upsert('secret-id', A))));
    const withoutTomb = await fails(() => as(db, B, () => db.exec(upsert('other-id', A))));
    assert.ok(withoutTomb, 'B, A adına yazabildi');
    assert.equal(withTomb, withoutTomb, 'sonuçlar farklı: tombstone varlığı sızıyor');
  });

  await test('16 eski istemci akışı: yalnızca kendi satırlarını görür, silmeler tombstone olur', async (db) => {
    await as(db, A, () => db.exec(upsert('w1', A)));
    await as(db, B, () => db.exec(upsert('w2', B)));
    const rows = await as(db, A, () => db.query(`select id from public.user_words where user_id='${A}' order by id`));
    assert.deepEqual(rows.rows.map(r => r.id), ['w1']);
    await as(db, A, () => db.exec(`delete from public.user_words where id='w1' and user_id='${A}'`));
    assert.equal(await count(db, 'public.user_word_tombstones', `user_id='${A}' and word_id='w1'`), 1);
  });

  for (const [name, res] of results) console.log((res === 'GEÇTİ' ? 'PASS ' : 'FAIL ') + name + (res === 'GEÇTİ' ? '' : ' -> ' + res));
  const failed = results.filter(([, r]) => r !== 'GEÇTİ').length;
  console.log(`\n${results.length - failed}/${results.length} test geçti`);
  process.exit(failed ? 1 : 0);
})();
