// @utils: phrasebook
// İfade Defterim: saf mantık (kimlik/kopya, doğrulama, ayrıştırma, arama ve seviye filtresi, erişilebilirlik etiketleri).
// Depolama davranışı tests/phrasebook-storage.test.js dosyasındadır; gerçek ekranlar bu testlerin kapsamında DEĞİLDİR.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const P = require(path.join(out, 'utils', 'phrasebook.js'));

const input = (patch = {}) => ({
  german: 'Möchten Sie Ihren Kaffee mit Milch?', turkish: 'Kahvenizi sütlü ister misiniz?', speaker: 'Garson',
  scenarioId: 'kafede-siparis', scenarioTitle: 'Kafede Sipariş', level: 'A1', ...patch,
});
const phrase = (patch = {}, now = 1000) => P.makePhrase(input(patch), now);

// ─── Kimlik ve oluşturma ─────────────────────────────────────────────────────
test('kimlik: büyük/küçük harf ve boşluk farkı aynı ifadedir; farklı metin farklı kimliktir', () => {
  assert.equal(P.phraseId('Guten Tag!'), P.phraseId('  guten   TAG!  '));
  assert.notEqual(P.phraseId('Guten Tag!'), P.phraseId('Guten Tag'));
  assert.notEqual(P.phraseId('Guten Tag!'), P.phraseId('Guten Abend!'));
});

test('makePhrase: metinleri kırpar ve tüm alanları saklar (metin kopyası, senaryoya bağlı değil)', () => {
  const saved = phrase({ german: '  Ja, bitte.  ', turkish: ' Evet, lütfen. ', speaker: ' Sen ' }, 4242);
  assert.deepEqual(saved, {
    id: P.phraseId('Ja, bitte.'), german: 'Ja, bitte.', turkish: 'Evet, lütfen.', speaker: 'Sen',
    scenarioId: 'kafede-siparis', scenarioTitle: 'Kafede Sipariş', level: 'A1', savedAt: 4242,
  });
});

test('makePhrase: eksik/bozuk girdiyi reddeder (null döner)', () => {
  for (const patch of [
    { german: '' }, { german: '   ' }, { turkish: '' }, { scenarioId: '' }, { scenarioTitle: ' ' }, { level: 'C2' }, { level: undefined },
    { german: 5 }, { turkish: null },
  ]) assert.equal(phrase(patch), null, JSON.stringify(patch));
  assert.equal(P.makePhrase(null, 1), null);
  assert.equal(P.makePhrase(input(), Number.NaN), null);
  assert.equal(P.makePhrase(input(), Infinity), null);
});

test('makePhrase: konuşan boş olabilir (kayıt yine geçerli)', () => {
  assert.equal(phrase({ speaker: '' }).speaker, '');
  assert.equal(phrase({ speaker: undefined }).speaker, '');
});

// ─── Ekleme / silme / kopya ──────────────────────────────────────────────────
test('addPhrase: yeni ifade başa eklenir; aynı ifade (farklı harf/boşluk/senaryo) kopya oluşturmaz ve ilk kayıt korunur', () => {
  const first = phrase({}, 1);
  const added = P.addPhrase([], first);
  assert.deepEqual([added.status, added.items.length], ['added', 1]);

  const second = phrase({ german: 'Guten Tag!', turkish: 'İyi günler!' }, 2);
  const two = P.addPhrase(added.items, second);
  assert.deepEqual(two.items.map(item => item.german), ['Guten Tag!', first.german]);

  const again = P.addPhrase(two.items, phrase({ german: ' möchten sie ihren kaffee mit milch?', scenarioId: 'baska', scenarioTitle: 'Başka', level: 'B1' }, 3));
  assert.equal(again.status, 'duplicate');
  assert.equal(again.items.length, 2);
  assert.equal(again.items.find(item => item.id === first.id).scenarioTitle, 'Kafede Sipariş');
});

test('addPhrase: sınır dolunca yeni ifade eklenmez, mevcutlar korunur', () => {
  const full = Array.from({ length: P.MAX_PHRASES }, (_, index) => phrase({ german: `Satz ${index}` }, index));
  const result = P.addPhrase(full, phrase({ german: 'Neu' }, 9999));
  assert.equal(result.status, 'full');
  assert.equal(result.items.length, P.MAX_PHRASES);
  // Zaten kayıtlı olan ifade dolu defterde de "kopya" sayılır (hata değil).
  assert.equal(P.addPhrase(full, phrase({ german: 'Satz 3' }, 1)).status, 'duplicate');
});

test('removePhrase: yalnızca o ifadeyi siler; olmayan kimlik değişiklik yapmaz', () => {
  const a = phrase({ german: 'A' }, 1);
  const b = phrase({ german: 'B' }, 2);
  assert.deepEqual(P.removePhrase([b, a], a.id).map(item => item.german), ['B']);
  assert.equal(P.removePhrase([b, a], 'p:yok').length, 2);
  assert.equal(P.isSaved([a], a.id), true);
  assert.equal(P.isSaved([a], b.id), false);
});

// ─── Ayrıştırma ──────────────────────────────────────────────────────────────
test('parse: boş/yok veri sorunsuz boş liste; round-trip aynı veriyi verir', () => {
  for (const raw of [null, undefined, '']) assert.deepEqual(P.parsePhrasebook(raw), { items: [], lossy: false });
  const items = [phrase({ german: 'B' }, 5), phrase({ german: 'A' }, 3)];
  assert.deepEqual(P.parsePhrasebook(P.serializePhrasebook(items)), { items, lossy: false });
});

test('parse: yeniden eskiye sıralar, kimliği metinden yeniden üretir, kopyaları birleştirir (kayıp sayılmaz)', () => {
  const old = { ...phrase({ german: 'Alt' }, 1), id: 'rastgele' };
  const fresh = phrase({ german: 'Neu' }, 9);
  const dup = { ...phrase({ german: 'neu' }, 3) };
  const parsed = P.parsePhrasebook(JSON.stringify({ version: 1, items: [old, dup, fresh] }));
  assert.equal(parsed.lossy, false);
  assert.deepEqual(parsed.items.map(item => item.german), ['Neu', 'Alt']);
  assert.equal(parsed.items[1].id, P.phraseId('Alt'));
});

test('parse: bozuk JSON, yanlış biçim ve bilinmeyen sürüm kayıplı sayılır (veri yedeklenmeden ezilmemeli)', () => {
  for (const raw of ['{bozuk', '[]', '"x"', '42', 'null', JSON.stringify({ version: 2, items: [] }), JSON.stringify({ version: 1, items: 'x' }), JSON.stringify({ items: [] })]) {
    const parsed = P.parsePhrasebook(raw);
    assert.equal(parsed.lossy, true, raw);
    assert.deepEqual(parsed.items, []);
  }
});

test('parse: geçersiz kayıtlar atılır ama geçerliler korunur; kayıplı işaretlenir', () => {
  const good = phrase({ german: 'Gut' }, 4);
  const bad = [null, 5, 'x', { ...good, german: '' }, { ...good, level: 'Z9' }, { ...good, savedAt: 'dün' }, { ...good, scenarioTitle: 3 }];
  const parsed = P.parsePhrasebook(JSON.stringify({ version: 1, items: [...bad, good] }));
  assert.equal(parsed.lossy, true);
  assert.deepEqual(parsed.items, [good]);
});

// ─── Arama ve filtre ─────────────────────────────────────────────────────────
const SAMPLE = [
  phrase({ german: 'Brauchen Sie eine Tüte?', turkish: 'Poşet ister misiniz?', speaker: 'Kasiyer', scenarioId: 'markette-alisveris', scenarioTitle: 'Markette Alışveriş', level: 'A1' }, 1),
  phrase({ german: 'Ich hätte gern einen Termin.', turkish: 'Bir randevu almak istiyorum.', speaker: 'Sen', scenarioId: 'doktor', scenarioTitle: 'Doktor Randevusu', level: 'A2' }, 2),
  phrase({ german: 'Wie lange dauert die Fahrt?', turkish: 'Yolculuk ne kadar sürüyor?', speaker: 'Görevli', scenarioId: 'tren', scenarioTitle: 'Tren İstasyonu', level: 'B1' }, 3),
];
const germans = (items) => items.map(item => item.german);

test('arama: Almanca, Türkçe, senaryo adı ve konuşan üzerinde, büyük/küçük harf duyarsız', () => {
  assert.equal(P.filterPhrases(SAMPLE, { query: '', level: 'all' }).length, 3);
  assert.deepEqual(germans(P.filterPhrases(SAMPLE, { query: 'TERMIN', level: 'all' })), ['Ich hätte gern einen Termin.']);
  assert.deepEqual(germans(P.filterPhrases(SAMPLE, { query: 'randevu', level: 'all' })).length, 1);
  assert.deepEqual(germans(P.filterPhrases(SAMPLE, { query: 'markette', level: 'all' })), ['Brauchen Sie eine Tüte?']);
  assert.deepEqual(germans(P.filterPhrases(SAMPLE, { query: 'kasiyer', level: 'all' })), ['Brauchen Sie eine Tüte?']);
});

test('arama: umlaut, ß ve Türkçe harf farkı yok sayılır ("tute"→Tüte, "poset"→Poşet, "istasyonu"→İstasyonu)', () => {
  assert.equal(P.filterPhrases(SAMPLE, { query: 'tute', level: 'all' }).length, 1);
  assert.equal(P.filterPhrases(SAMPLE, { query: 'poset', level: 'all' }).length, 1);
  assert.equal(P.filterPhrases(SAMPLE, { query: 'tren istasyonu', level: 'all' }).length, 1);
  assert.equal(P.filterPhrases(SAMPLE, { query: 'hatte', level: 'all' }).length, 1);
  assert.equal(P.foldSearch('Straße'), P.foldSearch('STRASSE'));
});

test('arama: birden çok kelime hepsini içermeli; eşleşme yoksa boş liste; kenar boşlukları yok sayılır', () => {
  assert.equal(P.filterPhrases(SAMPLE, { query: '  sie   tüte ', level: 'all' }).length, 1);
  assert.equal(P.filterPhrases(SAMPLE, { query: 'tüte termin', level: 'all' }).length, 0);
  assert.equal(P.filterPhrases(SAMPLE, { query: 'xyz', level: 'all' }).length, 0);
});

test('seviye filtresi tek başına ve aramayla birlikte çalışır', () => {
  assert.deepEqual(germans(P.filterPhrases(SAMPLE, { query: '', level: 'A2' })), ['Ich hätte gern einen Termin.']);
  assert.equal(P.filterPhrases(SAMPLE, { query: 'sie', level: 'B1' }).length, 0);
  assert.equal(P.filterPhrases(SAMPLE, { query: 'sie', level: 'A1' }).length, 1);
  assert.deepEqual(P.levelCounts(SAMPLE), { all: 3, A1: 1, A2: 1, B1: 1 });
  assert.deepEqual(P.levelCounts([]), { all: 0, A1: 0, A2: 0, B1: 0 });
});

test('filtre girdiyi değiştirmez ve bozuk girdiyle çökmez', () => {
  const copy = JSON.stringify(SAMPLE);
  P.filterPhrases(SAMPLE, { query: 'a', level: 'A1' });
  assert.equal(JSON.stringify(SAMPLE), copy);
  assert.deepEqual(P.filterPhrases(null, { query: 'a', level: 'all' }), []);
  assert.equal(P.filterPhrases(SAMPLE, { query: undefined, level: 'all' }).length, 3);
});

// ─── Erişilebilirlik metinleri ───────────────────────────────────────────────
test('kaydet/kaldır etiketleri duruma göre Türkçe ve ifadeyi içerir', () => {
  assert.equal(P.saveLabel(false, 'Guten Tag!'), 'İfade Defterim\'e kaydet: Guten Tag!');
  assert.equal(P.saveLabel(true, 'Guten Tag!'), 'İfade Defterim\'den kaldır: Guten Tag!');
  assert.ok(P.deleteLabel('Guten Tag!').includes('Guten Tag!'));
  for (const text of [P.PHRASEBOOK_FULL_MESSAGE, P.PHRASEBOOK_FAILED_MESSAGE, P.PHRASEBOOK_LOCKED_MESSAGE]) assert.ok(text.length > 20);
  assert.ok(P.PHRASEBOOK_FULL_MESSAGE.includes(String(P.MAX_PHRASES)));
  assert.ok(P.PHRASEBOOK_LOCKED_MESSAGE.includes('silinmedi'));
});
