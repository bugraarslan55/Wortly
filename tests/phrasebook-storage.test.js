// @utils: phrasebook-storage
// İfade Defterim depolaması: kullanıcıya özel anahtar, hesaplar arası karışmama, kopya/eşzamanlılık, okuma/yazma hataları,
// bozuk veri yedeği. Depolama enjekte edilir (AsyncStorage'a benzer sahte); gerçek AsyncStorage/ekran kapsam dışıdır.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const S = require(path.join(out, 'utils', 'phrasebook-storage.js'));
const P = require(path.join(out, 'utils', 'phrasebook.js'));

function fakeStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  const calls = { set: [], get: [] };
  const fail = { get: null, set: null };
  return {
    data, calls, fail,
    async getItem(key) { calls.get.push(key); if (fail.get?.(key)) throw new Error('okunamadı'); return data.has(key) ? data.get(key) : null; },
    async setItem(key, value) { calls.set.push(key); if (fail.set?.(key)) throw new Error('yazılamadı'); data.set(key, value); },
    async removeItem(key) { data.delete(key); },
    async getAllKeys() { return [...data.keys()]; },
  };
}
const input = (german, patch = {}) => ({
  german, turkish: `${german} (tr)`, speaker: 'Garson', scenarioId: 'kafede-siparis', scenarioTitle: 'Kafede Sipariş', level: 'A1', ...patch,
});
const makeRepo = (storage, clock = { now: 1000 }) => S.createPhrasebookRepo(storage, () => (clock.now += 1));

test('anahtar kullanıcıya özeldir', () => {
  assert.equal(S.phrasebookKey('u1'), '@wortly:phrasebook:u1');
  assert.notEqual(S.phrasebookKey('u1'), S.phrasebookKey('u2'));
});

test('boş depo: yükleme başarılı ve boş; hiçbir şey yazılmaz', async () => {
  const storage = fakeStorage();
  assert.deepEqual(await makeRepo(storage).load('u1'), { ok: true, items: [] });
  assert.equal(storage.calls.set.length, 0);
});

test('ekleme kalıcıdır: yeni repo (uygulama yeniden açılışı) aynı veriyi okur; metin ve senaryo bilgisi saklanır', async () => {
  const storage = fakeStorage();
  const added = await makeRepo(storage).add('u1', input('Ja, bitte.', { speaker: 'Sen', level: 'A2', scenarioTitle: 'Markette Alışveriş' }));
  assert.equal(added.status, 'added');
  const reopened = await makeRepo(storage).load('u1');
  assert.equal(reopened.ok, true);
  assert.deepEqual(reopened.items.map(({ german, turkish, speaker, level, scenarioTitle }) => ({ german, turkish, speaker, level, scenarioTitle })), [
    { german: 'Ja, bitte.', turkish: 'Ja, bitte. (tr)', speaker: 'Sen', level: 'A2', scenarioTitle: 'Markette Alışveriş' },
  ]);
});

test('hesaplar arası veri karışmaz: A\'nın ifadeleri B\'ye görünmez, B\'nin yazımı A\'ya dokunmaz', async () => {
  const storage = fakeStorage();
  const repo = makeRepo(storage);
  await repo.add('userA', input('Nur für A'));
  assert.deepEqual((await repo.load('userB')).items, []);
  await repo.add('userB', input('Nur für B'));
  assert.deepEqual((await repo.load('userA')).items.map(item => item.german), ['Nur für A']);
  assert.deepEqual((await repo.load('userB')).items.map(item => item.german), ['Nur für B']);
  assert.deepEqual([...storage.data.keys()].sort(), [S.phrasebookKey('userA'), S.phrasebookKey('userB')].sort());
  // A -> B -> A dönüşünde A'nın verisi duruyor.
  assert.equal((await repo.load('userA')).items.length, 1);
});

test('oturum/kimlik yoksa hiçbir okuma ya da yazma yapılmaz', async () => {
  const storage = fakeStorage();
  const repo = makeRepo(storage);
  for (const id of ['', '   ', null, undefined]) {
    assert.deepEqual(await repo.load(id), { ok: false });
    assert.equal((await repo.add(id, input('x'))).status, 'failed');
    assert.equal((await repo.remove(id, 'p:x')).status, 'failed');
  }
  assert.equal(storage.calls.get.length + storage.calls.set.length, 0);
});

test('aynı ifade tekrar kaydedilirse kopya oluşmaz, ikinci yazım yapılmaz ve ilk kayıt (eski metin) korunur', async () => {
  const storage = fakeStorage();
  const repo = makeRepo(storage);
  await repo.add('u1', input('Guten Tag!', { turkish: 'İyi günler!', scenarioTitle: 'İlk Senaryo' }));
  const writes = storage.calls.set.length;
  const again = await repo.add('u1', input(' guten  tag!', { turkish: 'DEĞİŞMİŞ', scenarioTitle: 'Değişen Başlık', scenarioId: 'baska', level: 'B1' }));
  assert.equal(again.status, 'duplicate');
  assert.equal(storage.calls.set.length, writes);
  assert.equal(again.items.length, 1);
  assert.deepEqual([again.items[0].turkish, again.items[0].scenarioTitle, again.items[0].level], ['İyi günler!', 'İlk Senaryo', 'A1']);
});

test('eşzamanlı eklemeler sıralanır: hiçbiri kaybolmaz, aynı ifade bir kez kaydedilir', async () => {
  const storage = fakeStorage();
  const repo = makeRepo(storage);
  const results = await Promise.all([
    repo.add('u1', input('Eins')), repo.add('u1', input('Zwei')), repo.add('u1', input('Eins')), repo.add('u1', input('Drei')),
    repo.add('u1', input('Zwei')),
  ]);
  assert.deepEqual(results.map(result => result.status), ['added', 'added', 'duplicate', 'added', 'duplicate']);
  assert.deepEqual((await repo.load('u1')).items.map(item => item.german).sort(), ['Drei', 'Eins', 'Zwei']);
});

test('silme: ifade kalkar, olmayan kimlikte değişiklik/yazım olmaz; başka kullanıcının ifadesi silinmez', async () => {
  const storage = fakeStorage();
  const repo = makeRepo(storage);
  const a = await repo.add('u1', input('A'));
  await repo.add('u1', input('B'));
  await repo.add('u2', input('A'));
  const id = a.items.find(item => item.german === 'A').id;
  const removed = await repo.remove('u1', id);
  assert.deepEqual([removed.status, removed.items.map(item => item.german)], ['removed', ['B']]);
  const writes = storage.calls.set.length;
  assert.equal((await repo.remove('u1', id)).status, 'missing');
  assert.equal(storage.calls.set.length, writes);
  assert.deepEqual((await repo.load('u2')).items.map(item => item.german), ['A']);
});

test('geçersiz ifade girdisi yazılmaz', async () => {
  const storage = fakeStorage();
  const result = await makeRepo(storage).add('u1', input('   '));
  assert.equal(result.status, 'failed');
  assert.equal(storage.calls.set.length, 0);
});

test('okuma hatası: yükleme başarısız sayılır, ekleme/silme yazmaz (mevcut veri ezilmez)', async () => {
  const storage = fakeStorage({ [S.phrasebookKey('u1')]: P.serializePhrasebook([P.makePhrase(input('Alt'), 1)]) });
  storage.fail.get = () => true;
  const repo = makeRepo(storage);
  assert.deepEqual(await repo.load('u1'), { ok: false });
  assert.equal((await repo.add('u1', input('Neu'))).status, 'failed');
  assert.equal((await repo.remove('u1', P.phraseId('Alt'))).status, 'failed');
  assert.equal(storage.calls.set.length, 0);
  storage.fail.get = null;
  assert.deepEqual((await repo.load('u1')).items.map(item => item.german), ['Alt']);
});

test('yazma hatası: "failed" döner, depo değişmez, sonraki deneme çalışır', async () => {
  const storage = fakeStorage();
  const repo = makeRepo(storage);
  storage.fail.set = () => true;
  const failed = await repo.add('u1', input('Eins'));
  assert.deepEqual([failed.status, failed.items], ['failed', null]);
  assert.equal(storage.data.size, 0);
  storage.fail.set = null;
  assert.equal((await repo.add('u1', input('Eins'))).status, 'added');
});

test('bozuk veri: yüklemede boş görünür ama silinmez; ekleme önce ham veriyi yedekler, sonra yazar', async () => {
  const key = S.phrasebookKey('u1');
  const storage = fakeStorage({ [key]: '{bozuk json' });
  const repo = makeRepo(storage);
  assert.deepEqual(await repo.load('u1'), { ok: true, items: [] });
  assert.equal(storage.data.get(key), '{bozuk json');

  const added = await repo.add('u1', input('Neu'));
  assert.equal(added.status, 'added');
  const backups = [...storage.data.entries()].filter(([name]) => name.startsWith(`@wortly:corrupt:${key}:`));
  assert.deepEqual(backups.map(([, value]) => value), ['{bozuk json']);
  assert.deepEqual((await repo.load('u1')).items.map(item => item.german), ['Neu']);
});

test('yedek doğrulanamazsa bozuk veri ezilmez ve ekleme başarısız sayılır', async () => {
  const key = S.phrasebookKey('u1');
  const storage = fakeStorage({ [key]: '{bozuk json' });
  storage.fail.set = (name) => name.startsWith('@wortly:corrupt:');
  const result = await makeRepo(storage).add('u1', input('Neu'));
  assert.equal(result.status, 'failed');
  assert.equal(storage.data.get(key), '{bozuk json');
});

test('kısmen geçersiz veri: geçerli ifadeler yazımda korunur, ham veri yedeklenir', async () => {
  const key = S.phrasebookKey('u1');
  const good = P.makePhrase(input('Gut'), 5);
  const raw = JSON.stringify({ version: 1, items: [good, { german: '' }] });
  const storage = fakeStorage({ [key]: raw });
  const added = await makeRepo(storage).add('u1', input('Neu'));
  assert.equal(added.status, 'added');
  assert.deepEqual(added.items.map(item => item.german).sort(), ['Gut', 'Neu']);
  assert.ok([...storage.data.entries()].some(([name, value]) => name.startsWith('@wortly:corrupt:') && value === raw));
});

test('sağlam veri yazılırken gereksiz yedek oluşturulmaz', async () => {
  const storage = fakeStorage();
  const repo = makeRepo(storage);
  await repo.add('u1', input('Eins'));
  await repo.add('u1', input('Zwei'));
  assert.deepEqual([...storage.data.keys()], [S.phrasebookKey('u1')]);
});

test('sınır dolunca "full" döner ve yazım yapılmaz', async () => {
  const items = Array.from({ length: P.MAX_PHRASES }, (_, index) => P.makePhrase(input(`Satz ${index}`), index));
  const storage = fakeStorage({ [S.phrasebookKey('u1')]: P.serializePhrasebook(items) });
  const result = await makeRepo(storage).add('u1', input('Neu'));
  assert.equal(result.status, 'full');
  assert.equal(result.items.length, P.MAX_PHRASES);
  assert.equal(storage.calls.set.length, 0);
});

test('depo senaryo verisinden bağımsızdır: yalnızca saklanan metinler okunur', async () => {
  // Kayıt, senaryo dosyasına hiç başvurmadan (olmayan bir senaryo kimliğiyle bile) aynen açılır.
  const storage = fakeStorage();
  const repo = makeRepo(storage);
  await repo.add('u1', input('Eski metin', { scenarioId: 'silinmis-senaryo', scenarioTitle: 'Artık Yok' }));
  const [item] = (await makeRepo(storage).load('u1')).items;
  assert.deepEqual([item.german, item.scenarioId, item.scenarioTitle], ['Eski metin', 'silinmis-senaryo', 'Artık Yok']);
});
