// user_word_progress ve scenario_results migration'ları için yerel veritabanı testleri.
//
// Gerçek bir Supabase veritabanına BAĞLANMAZ. PGlite (Node içinde çalışan gerçek PostgreSQL)
// üzerinde, Supabase'in `auth` şemasını ve rollerini taklit eden geçici bir veritabanı kurar,
// migration'ları uygular ve RLS, kısıtlar, çakışma tetikleyicisi ve iki cihaz senaryolarını sınar.
//
// Çalıştırma (PGlite proje bağımlılığı değildir, geçici bir klasöre kurulur):
//   mkdir %TEMP%\wortly-pg && cd %TEMP%\wortly-pg && npm init -y && npm i @electric-sql/pglite
//   set PGLITE_DIR=%TEMP%\wortly-pg & node supabase/tests/progress_tables.test.js
//
// Not: auth.uid() ve PostgREST taklit edilir; bu testler PostgreSQL tetikleyici/RLS/kısıt
// davranışını doğrular, gerçek Supabase üzerindeki testin (STAGING_TEST_PLAN.md) yerine geçmez.

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
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const PROGRESS = '20261102090000_user_word_progress.sql';
const SCENARIO = '20261102091000_scenario_results.sql';
const TOMBSTONE = '20261101090000_user_word_tombstones.sql';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';

async function bootstrap({ withTombstone = false, order = 'new-last' } = {}) {
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
  const apply = async (file) => db.exec(read(file));
  if (withTombstone) {
    await apply('20261021160000_create_user_words.sql');
    if (order === 'new-first') { await apply(PROGRESS); await apply(SCENARIO); await apply(TOMBSTONE); }
    else { await apply(TOMBSTONE); await apply(PROGRESS); await apply(SCENARIO); }
  } else {
    await apply(PROGRESS);
    await apply(SCENARIO);
  }
  return db;
}

async function as(db, userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false);`);
  try { return await fn(); }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
const fails = async (fn) => { try { await fn(); } catch (e) { return e.message; } return null; };
const count = async (db, table, where = 'true') =>
  Number((await db.query(`select count(*)::int c from ${table} where ${where}`)).rows[0].c);

// Cihazın gönderdiği upsert (istemci toCloud biçimi): çakışmada seviye ve damga gönderilir.
const T = (iso) => `timestamptz '${iso}'`;
const progressUpsert = (user, word, mastery, iso) => `
  insert into public.user_word_progress (user_id, word_id, mastery_level, last_reviewed)
  values ('${user}', '${word}', ${mastery}, ${T(iso)})
  on conflict (user_id, word_id) do update
    set mastery_level = excluded.mastery_level, last_reviewed = excluded.last_reviewed`;
const getProgress = async (db, user, word) =>
  (await db.query(`select mastery_level m, last_reviewed lr, updated_at ua from public.user_word_progress
                   where user_id='${user}' and word_id='${word}'`)).rows[0];
const scenarioInsert = (user, id, score = 3, total = 4, iso = '2026-11-01T10:00:00Z', scenario = 'cafe') => `
  insert into public.scenario_results (user_id, id, scenario_id, score, total, completed_at)
  values ('${user}', '${id}', '${scenario}', ${score}, ${total}, ${T(iso)})
  on conflict (user_id, id) do nothing`;

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([name, true]); }
  catch (e) { results.push([name, false, e.message.split('\n')[0]]); }
}

(async () => {
  let db = await bootstrap();

  // ───────── user_word_progress ─────────
  await test('P1 kullanıcı kendi ilerlemesini yazar ve okur; başkası göremez', async () => {
    await as(db, A, () => db.exec(progressUpsert(A, 'w1', 1, '2026-11-01T10:00:00Z')));
    assert.equal(await as(db, A, () => count(db, 'public.user_word_progress')), 1);
    assert.equal(await as(db, B, () => count(db, 'public.user_word_progress')), 0);
  });

  await test('P2 başka kullanıcı adına yazmak RLS ile reddedilir', async () => {
    const err = await as(db, B, () => fails(() => db.exec(progressUpsert(A, 'w2', 1, '2026-11-01T10:00:00Z'))));
    assert.ok(err && /row-level security/i.test(err), err);
  });

  await test('P3 daha yeni tekrar uygulanır ve updated_at sunucu saatiyle ilerler', async () => {
    const before = await getProgress(db, A, 'w1');
    await new Promise(r => setTimeout(r, 20));
    await as(db, A, () => db.exec(progressUpsert(A, 'w1', 2, '2026-11-01T11:00:00Z')));
    const after = await getProgress(db, A, 'w1');
    assert.equal(after.m, 2);
    assert.ok(new Date(after.ua) > new Date(before.ua));
  });

  await test('P4 bayat (daha eski) yazma HATASIZ yok sayılır, kayıt değişmez', async () => {
    const before = await getProgress(db, A, 'w1');
    const err = await as(db, A, () => fails(() => db.exec(progressUpsert(A, 'w1', 0, '2026-11-01T09:00:00Z'))));
    assert.equal(err, null);
    const after = await getProgress(db, A, 'w1');
    assert.equal(after.m, 2);
    assert.equal(new Date(after.lr).toISOString(), '2026-11-01T11:00:00.000Z');
    assert.equal(new Date(after.ua).getTime(), new Date(before.ua).getTime());
  });

  await test('P5 daha yeni ama düşük seviye (yanlış cevap) kabul edilir', async () => {
    await as(db, A, () => db.exec(progressUpsert(A, 'w1', 1, '2026-11-01T12:00:00Z')));
    assert.equal((await getProgress(db, A, 'w1')).m, 1);
  });

  await test('P6 aynı anda iki cihaz: sıra fark etmeksizin yüksek seviye kazanır', async () => {
    const t = '2026-11-01T13:00:00Z';
    await as(db, A, () => db.exec(progressUpsert(A, 'tie-a', 1, t)));
    await as(db, A, () => db.exec(progressUpsert(A, 'tie-a', 3, t)));
    await as(db, A, () => db.exec(progressUpsert(A, 'tie-b', 3, t)));
    await as(db, A, () => db.exec(progressUpsert(A, 'tie-b', 1, t)));
    assert.equal((await getProgress(db, A, 'tie-a')).m, 3);
    assert.equal((await getProgress(db, A, 'tie-b')).m, 3);
  });

  await test('P7 iki cihaz senaryosu: gecikmiş çevrimdışı yükleme yeni ilerlemeyi geri almaz', async () => {
    // Telefon (çevrimdışı) 10:00 mastery 1; tablet 12:00 mastery 3 yükler; telefon sonra bağlanır.
    await as(db, A, () => db.exec(progressUpsert(A, 'dev', 3, '2026-11-01T12:00:00Z')));
    await as(db, A, () => db.exec(progressUpsert(A, 'dev', 1, '2026-11-01T10:00:00Z')));
    assert.equal((await getProgress(db, A, 'dev')).m, 3);
    // Telefon 14:00'te yanlış cevap verir (daha yeni): uygulanır.
    await as(db, A, () => db.exec(progressUpsert(A, 'dev', 2, '2026-11-01T14:00:00Z')));
    assert.equal((await getProgress(db, A, 'dev')).m, 2);
  });

  await test('P8 aynı kaydın tekrar gönderimi ikinci satır oluşturmaz (idempotent)', async () => {
    for (let i = 0; i < 3; i++) await as(db, A, () => db.exec(progressUpsert(A, 'again', 2, '2026-11-01T10:00:00Z')));
    assert.equal(await count(db, 'public.user_word_progress', `word_id='again'`), 1);
  });

  await test('P9 toplu yükleme: bayat ve yeni satırlar karışık olsa da hata yok, doğru sonuç', async () => {
    await as(db, A, () => db.exec(progressUpsert(A, 'batch1', 3, '2026-11-01T12:00:00Z')));
    await as(db, A, () => db.exec(`
      insert into public.user_word_progress (user_id, word_id, mastery_level, last_reviewed) values
        ('${A}','batch1',0,${T('2026-11-01T08:00:00Z')}),
        ('${A}','batch2',2,${T('2026-11-01T08:00:00Z')}),
        ('${A}','batch3',1,${T('2026-11-01T09:00:00Z')})
      on conflict (user_id, word_id) do update
        set mastery_level = excluded.mastery_level, last_reviewed = excluded.last_reviewed`));
    assert.equal((await getProgress(db, A, 'batch1')).m, 3);
    assert.equal((await getProgress(db, A, 'batch2')).m, 2);
    assert.equal((await getProgress(db, A, 'batch3')).m, 1);
  });

  await test('P10 gelecekteki damga sunucuda şimdiye çekilir', async () => {
    await as(db, A, () => db.exec(progressUpsert(A, 'future', 2, '2099-01-01T00:00:00Z')));
    const row = await getProgress(db, A, 'future');
    assert.ok(new Date(row.lr).getTime() <= Date.now() + 10 * 60 * 1000, 'gelecekteki damga kabul edildi');
  });

  await test('P11 istemci updated_at/created_at değerlerini belirleyemez', async () => {
    await as(db, A, () => db.exec(`
      insert into public.user_word_progress (user_id, word_id, mastery_level, last_reviewed, updated_at, created_at)
      values ('${A}','clock',1,${T('2026-11-01T10:00:00Z')}, timestamptz '2001-01-01', timestamptz '2001-01-01')`));
    const row = (await db.query(`select updated_at, created_at from public.user_word_progress where word_id='clock'`)).rows[0];
    assert.ok(new Date(row.updated_at).getFullYear() >= 2025 && new Date(row.created_at).getFullYear() >= 2025);
  });

  await test('P12 geçersiz değerler kısıtlarla reddedilir', async () => {
    for (const sql of [
      progressUpsert(A, 'bad1', 4, '2026-11-01T10:00:00Z'),
      progressUpsert(A, 'bad2', -1, '2026-11-01T10:00:00Z'),
      progressUpsert(A, '', 1, '2026-11-01T10:00:00Z'),
      progressUpsert(A, 'bad3', 1, '2019-12-31T00:00:00Z'),
      `insert into public.user_word_progress (user_id, word_id, mastery_level, last_reviewed) values ('${A}','bad4',1,null)`,
    ]) {
      const err = await as(db, A, () => fails(() => db.exec(sql)));
      assert.ok(err, 'kısıt ihlali kabul edildi: ' + sql.slice(0, 80));
    }
  });

  await test('P13 istemci silemez; anon hiçbir şey okuyamaz', async () => {
    const del = await as(db, A, () => fails(() => db.exec(`delete from public.user_word_progress`)));
    assert.ok(del && /permission denied/i.test(del), del);
    await db.exec('set role anon');
    const anonErr = await fails(() => db.exec('select * from public.user_word_progress'));
    await db.exec('reset role');
    assert.ok(anonErr && /permission denied/i.test(anonErr), anonErr);
  });

  await test('P14 satır sahibi güncellemeyle değiştirilemez', async () => {
    // Tetikleyici sahibi sessizce korur (hata dönmesi de kabul edilir); sonuçta satır A'da kalmalı.
    await as(db, A, () => fails(() => db.exec(
      `update public.user_word_progress set user_id='${B}' where word_id='w1'`)));
    assert.equal(await count(db, 'public.user_word_progress', `user_id='${B}'`), 0);
    assert.equal(await count(db, 'public.user_word_progress', `user_id='${A}' and word_id='w1'`), 1);
  });

  await test('P15 hesap silinince ilerleme temizlenir (cascade)', async () => {
    await db.exec(`delete from auth.users where id='${A}'`);
    assert.equal(await count(db, 'public.user_word_progress', `user_id='${A}'`), 0);
    assert.equal(await count(db, 'public.scenario_results', `user_id='${A}'`), 0);
  });

  // ───────── scenario_results ─────────
  db = await bootstrap();

  await test('S1 sonuç eklenir; yeniden gönderim ikinci satır oluşturmaz', async () => {
    for (let i = 0; i < 3; i++) await as(db, A, () => db.exec(scenarioInsert(A, 'sc-0001-aaaa')));
    assert.equal(await count(db, 'public.scenario_results', `user_id='${A}'`), 1);
  });

  await test('S2 başka kullanıcı adına yazılamaz; aynı kimlik farklı kullanıcıda engel olmaz', async () => {
    const err = await as(db, B, () => fails(() => db.exec(scenarioInsert(A, 'sc-0002-bbbb'))));
    assert.ok(err && /row-level security/i.test(err), err);
    await as(db, B, () => db.exec(scenarioInsert(B, 'sc-0001-aaaa')));
    assert.equal(await count(db, 'public.scenario_results', `id='sc-0001-aaaa'`), 2);
  });

  await test('S3 izolasyon: kullanıcı yalnızca kendi sonuçlarını görür', async () => {
    assert.equal(await as(db, A, () => count(db, 'public.scenario_results')), 1);
    assert.equal(await as(db, B, () => count(db, 'public.scenario_results')), 1);
  });

  await test('S4 geçersiz değerler reddedilir (puan > toplam, toplam 0, kısa kimlik, eski tarih)', async () => {
    for (const sql of [
      scenarioInsert(A, 'sc-0003-cccc', 5, 4),
      scenarioInsert(A, 'sc-0004-dddd', 0, 0),
      scenarioInsert(A, 'short', 1, 2),
      scenarioInsert(A, 'sc-0005-eeee', 1, 2, '2019-01-01T00:00:00Z'),
      scenarioInsert(A, 'sc-0006-ffff', -1, 2),
    ]) {
      const err = await as(db, A, () => fails(() => db.exec(sql)));
      assert.ok(err, 'kabul edildi: ' + sql.slice(0, 90));
    }
  });

  await test('S5 sonuçlar değiştirilemez ve silinemez (append-only)', async () => {
    const upd = await as(db, A, () => fails(() => db.exec(`update public.scenario_results set score = 0`)));
    const del = await as(db, A, () => fails(() => db.exec(`delete from public.scenario_results`)));
    assert.ok(upd && /permission denied/i.test(upd), upd);
    assert.ok(del && /permission denied/i.test(del), del);
  });

  await test('S6 gelecekteki damga çekilir; created_at sunucu saatidir', async () => {
    await as(db, A, () => db.exec(`
      insert into public.scenario_results (user_id, id, scenario_id, score, total, completed_at, created_at)
      values ('${A}','sc-0007-gggg','cafe',1,2,timestamptz '2099-01-01', timestamptz '2001-01-01')`));
    const row = (await db.query(`select completed_at, created_at from public.scenario_results where id='sc-0007-gggg'`)).rows[0];
    assert.ok(new Date(row.completed_at).getTime() <= Date.now() + 10 * 60 * 1000);
    assert.ok(new Date(row.created_at).getFullYear() >= 2025);
  });

  await test('S7 anon erişemez', async () => {
    await db.exec('set role anon');
    const err = await fails(() => db.exec('select * from public.scenario_results'));
    await db.exec('reset role');
    assert.ok(err && /permission denied/i.test(err), err);
  });

  // ───────── Tombstone migration ile birlikte ─────────
  for (const order of ['new-last', 'new-first']) {
    await test(`T1 tombstone ile birlikte uygulanır (${order}) ve her iki özellik çalışır`, async () => {
      const d = await bootstrap({ withTombstone: true, order });
      // Tombstone davranışı değişmedi: silinen kelime tekrar yazılamaz.
      const word = (id) => `insert into public.user_words (id, user_id, german, article, turkish)
        values ('${id}', '${A}', 'Apfel', 'der', 'elma') on conflict (id) do update set turkish = excluded.turkish`;
      await as(d, A, () => d.exec(word('tw1')));
      await as(d, A, () => d.exec(`delete from public.user_words where id='tw1'`));
      await as(d, A, () => d.exec(word('tw1')));
      assert.equal(await count(d, 'public.user_words', `id='tw1'`), 0);
      // Yeni tablolar etkilenmedi.
      await as(d, A, () => d.exec(progressUpsert(A, 'tw1', 1, '2026-11-01T10:00:00Z')));
      await as(d, A, () => d.exec(scenarioInsert(A, 'sc-0001-aaaa')));
      assert.equal(await count(d, 'public.user_word_progress'), 1);
      assert.equal(await count(d, 'public.scenario_results'), 1);
      // Hesap silme hepsini hatasız temizler.
      await d.exec(`delete from auth.users where id='${A}'`);
      assert.equal(await count(d, 'public.user_word_progress'), 0);
      assert.equal(await count(d, 'public.user_word_tombstones'), 0);
    });
  }

  await test('M1 migration dosyaları iki kez uygulanabilir (idempotent)', async () => {
    const d = await bootstrap();
    await d.exec(read(PROGRESS));
    await d.exec(read(SCENARIO));
    await as(d, A, () => d.exec(progressUpsert(A, 'idem', 2, '2026-11-01T10:00:00Z')));
    assert.equal((await getProgress(d, A, 'idem')).m, 2);
  });

  for (const [name, ok, msg] of results) console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' -> ' + msg));
  const failed = results.filter(r => !r[1]).length;
  console.log(`\n${results.length - failed}/${results.length} test geçti`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Test hatası:', e); process.exit(1); });
