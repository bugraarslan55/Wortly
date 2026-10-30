// Gerçek Supabase TEST ortamında (PostgREST + GoTrue + RLS) tombstone davranışını doğrular.
//
// ÜRETİMDE ÇALIŞTIRMA. Script şu koşullarda hiçbir istek atmadan çıkar:
//   * STAGING_URL, proje kökündeki .env dosyasındaki (üretim) EXPO_PUBLIC_SUPABASE_URL ile aynıysa,
//   * STAGING_CONFIRM=EVET-BU-URETIM-DEGIL ayarlanmadıysa.
// Yalnızca sentetik kullanıcı ve sentetik kelime kullanır; test sonunda kullanıcıları siler.
//
// Gerekli ortam değişkenleri (hiçbiri dosyaya yazılmaz, mobil uygulamaya konmaz):
//   STAGING_URL, STAGING_ANON_KEY (publishable), STAGING_SERVICE_ROLE_KEY (yalnızca bu testte)
//   STAGING_CONFIRM=EVET-BU-URETIM-DEGIL
//   PHASE=before|after   before: migration uygulanmadan önceki taban çizgisi (dirilme BEKLENİR)
//                        after : migration sonrası (dirilme ENGELLENMELİ)
//
// Çalıştırma:  node supabase/tests/staging.integration.test.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

function productionUrl() {
  try {
    const env = fs.readFileSync(path.resolve(__dirname, '..', '..', '.env'), 'utf8');
    const m = env.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m);
    return m ? m[1].trim().replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

const { STAGING_URL, STAGING_ANON_KEY, STAGING_SERVICE_ROLE_KEY, STAGING_CONFIRM } = process.env;
const PHASE = process.env.PHASE || 'after';

function refuse(msg) {
  console.error('DURDURULDU: ' + msg);
  process.exit(2);
}
if (!STAGING_URL || !STAGING_ANON_KEY || !STAGING_SERVICE_ROLE_KEY) refuse('STAGING_* ortam değişkenleri eksik.');
if (STAGING_CONFIRM !== 'EVET-BU-URETIM-DEGIL') refuse('STAGING_CONFIRM=EVET-BU-URETIM-DEGIL ayarlanmalı.');
if (!['before', 'after'].includes(PHASE)) refuse('PHASE before veya after olmalı.');
const prod = productionUrl();
if (prod && prod.toLowerCase() === STAGING_URL.trim().replace(/\/+$/, '').toLowerCase()) {
  refuse('STAGING_URL üretim projesiyle aynı. Hiçbir istek gönderilmedi.');
}

const { createClient } = require('@supabase/supabase-js');
const admin = createClient(STAGING_URL, STAGING_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = crypto.randomBytes(4).toString('hex');
const created = [];

async function makeUser(label) {
  const email = `wortly-test-${run}-${label}@wortly-test.invalid`;
  const password = crypto.randomBytes(16).toString('hex');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error('kullanıcı oluşturulamadı: ' + error.message);
  created.push(data.user.id);
  const client = createClient(STAGING_URL, STAGING_ANON_KEY, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error('giriş başarısız: ' + signInError.message);
  return { id: data.user.id, client };
}

// Uygulamadaki toCloudWord ile aynı biçimde (eski ve yeni istemci aynı yazma sorgusunu kullanır).
const payload = (userId, id, turkish = 'elma') => ({
  id, user_id: userId, german: 'Testwort', article: 'das', turkish,
  plural: null, example: null, example_turkish: null, mastery_level: 0,
  last_reviewed: null, is_custom: true, topic_id: null,
});
const upsert = (u, id, turkish) =>
  u.client.from('user_words').upsert(payload(u.id, id, turkish), { onConflict: 'id' }).select();
const del = (u, id) => u.client.from('user_words').delete().eq('id', id).eq('user_id', u.id);
const list = async (u, id) => (await u.client.from('user_words').select('id, turkish').eq('id', id)).data ?? [];
const tombs = async (u) => (await u.client.from('user_word_tombstones').select('word_id, user_id')).data ?? [];
const wid = (n) => `t${run}-${n}`;

const results = [];
async function test(name, fn) {
  try { await fn(); results.push([name, 'GEÇTİ']); }
  catch (e) { results.push([name, 'KALDI: ' + e.message.split('\n')[0]]); }
}

(async () => {
  let A, B;
  try {
    A = await makeUser('a');
    B = await makeUser('b');
    const after = PHASE === 'after';

    await test('1 normal ekleme (yeni ve eski istemci aynı upsert)', async () => {
      const r = await upsert(A, wid(1));
      assert.ifError(r.error);
      assert.equal((await list(A, wid(1))).length, 1);
    });
    await test('2 düzenleme', async () => {
      assert.ifError((await upsert(A, wid(1), 'yeni anlam')).error);
      assert.equal((await list(A, wid(1)))[0].turkish, 'yeni anlam');
    });
    await test('3 silme + tombstone', async () => {
      assert.ifError((await del(A, wid(1))).error);
      assert.equal((await list(A, wid(1))).length, 0);
      const t = (await tombs(A)).filter((x) => x.word_id === wid(1));
      assert.equal(t.length, after ? 1 : 0, after ? 'tombstone yok' : 'migration öncesi tombstone olmamalı');
    });
    await test('4 silinen kelimenin eski kopyayla tekrar upsert edilmesi', async () => {
      const r = await upsert(A, wid(1), 'eski kopya');
      assert.ifError(r.error); // hata ASLA dönmemeli (eski istemci kuyruğu takılmasın)
      const back = (await list(A, wid(1))).length;
      assert.equal(back, after ? 0 : 1, after ? 'kelime dirildi' : 'taban çizgisinde dirilme bekleniyordu');
    });
    await test('5 iki kullanıcı izolasyonu', async () => {
      assert.ifError((await upsert(A, wid(5))).error);
      assert.equal((await list(B, wid(5))).length, 0, 'B, A kelimesini okudu');
      assert.ok((await upsert({ ...B, id: A.id }, wid(5))).error, 'B, A adına yazabildi');
      await del(B, wid(5));
      assert.equal((await list(A, wid(5))).length, 1, 'B, A kelimesini sildi');
      if (after) {
        await del(A, wid(5));
        assert.equal((await tombs(B)).length, 0, 'B, A tombstone görüyor');
      }
    });
    await test('6 istemci tombstone tablosuna yazamaz', async () => {
      if (!after) return;
      const r = await A.client.from('user_word_tombstones').insert({ user_id: A.id, word_id: wid(6) });
      assert.ok(r.error, 'doğrudan tombstone yazılabildi');
    });
    await test('7 toplu upsert: tombstone satırı atlanır, diğerleri yazılır', async () => {
      if (!after) return;
      assert.ifError((await upsert(A, wid(7))).error);
      await del(A, wid(7));
      const rows = [wid(7), wid(8), wid(9)].map((id) => payload(A.id, id));
      const r = await A.client.from('user_words').upsert(rows, { onConflict: 'id' });
      assert.ifError(r.error);
      assert.equal((await list(A, wid(7))).length, 0);
      assert.equal((await list(A, wid(8))).length, 1);
      assert.equal((await list(A, wid(9))).length, 1);
    });
    await test('8 çevrimdışı ekleme sonradan senkronizasyon (gecikmeli upsert)', async () => {
      // Cihazda kuyrukta bekleyen yeni kelime internet gelince yazılır; yeni kelime etkilenmemeli.
      await new Promise((r) => setTimeout(r, 1500));
      assert.ifError((await upsert(A, wid(10))).error);
      assert.equal((await list(A, wid(10))).length, 1);
    });
    await test('9 eşzamanlı silme/upsert yarışı (ÖLÇÜM: dirilme sayısı raporlanır)', async () => {
      if (!after) return;
      let resurrected = 0;
      const N = 20;
      for (let i = 0; i < N; i++) {
        const id = wid(`race${i}`);
        assert.ifError((await upsert(A, id)).error);
        await Promise.all([del(A, id), upsert(A, id, 'eski kopya')]);
        resurrected += (await list(A, id)).length;
      }
      console.log(`   yarış: ${resurrected}/${N} kelime dirildi (0 beklenir; >0 ise tasarım gözden geçirilmeli)`);
      assert.equal(resurrected, 0, `${resurrected} kelime dirildi`);
    });
    await test('10 hesap silme ilişkili verileri temizler', async () => {
      const victim = await makeUser('victim');
      assert.ifError((await upsert(victim, wid('v1'))).error);
      assert.ifError((await upsert(victim, wid('v2'))).error);
      await del(victim, wid('v1'));
      const { error } = await admin.auth.admin.deleteUser(victim.id);
      assert.ifError(error);
      created.splice(created.indexOf(victim.id), 1);
      const w = await admin.from('user_words').select('id').eq('user_id', victim.id);
      assert.equal(w.data.length, 0, 'kelimeler kaldı');
      if (after) {
        const t = await admin.from('user_word_tombstones').select('word_id').eq('user_id', victim.id);
        assert.equal(t.data.length, 0, 'tombstone kaldı');
      }
    });
  } finally {
    for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
  }

  for (const [n, r] of results) console.log((r === 'GEÇTİ' ? 'PASS ' : 'FAIL ') + n + (r === 'GEÇTİ' ? '' : ' -> ' + r));
  const failed = results.filter(([, r]) => r !== 'GEÇTİ').length;
  console.log(`\nPHASE=${PHASE}: ${results.length - failed}/${results.length} test geçti`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
  console.error('Test hatası:', e.message);
  process.exit(1);
});
