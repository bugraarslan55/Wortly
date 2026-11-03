// @utils: pronunciation-cleanup, pronunciation-controller, sign-out-flow, reminder-guard
// Yetim telaffuz kaydı tespiti ve silme/çıkış güvenliği (saf mantık). Gerçek dosya sistemi, AsyncStorage ve
// ekranlar bu testlerin kapsamında DEĞİLDİR: bu modül hiçbir şeyi silmez, yalnızca raporlar.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const K = require(path.join(out, 'utils', 'pronunciation-cleanup.js'));
const C = require(path.join(out, 'utils', 'pronunciation-controller.js'));
const F = require(path.join(out, 'utils', 'sign-out-flow.js'));

const DAY = 24 * 60 * 60 * 1000;
const NOW = 2_000_000_000_000;
const file = (name, ageMs = 3 * DAY, size = 1000) => ({
  uri: `file:///docs/${name}`, size, modifiedAt: ageMs === null ? null : NOW - ageMs,
});
const known = (...ids) => (id) => ids.includes(id);
const find = (extra) => K.findOrphanRecordings({
  currentUserId: 'a', maps: {}, mapsComplete: true, files: [], isKnownWordId: known(), wordsReliable: true,
  sizeOf: () => 500, now: NOW, ...extra,
});

test('adlandırma deseni: yalnızca Wortly telaffuz dosyaları', () => {
  assert.ok(K.RECORDING_FILE_PATTERN.test('file:///docs/pronunciation-1700000000000-abc123.m4a'));
  assert.ok(!K.RECORDING_FILE_PATTERN.test('file:///docs/photo.m4a'));
  assert.ok(!K.RECORDING_FILE_PATTERN.test('file:///docs/pronunciation-1-abc.mp3'));
  assert.ok(!K.RECORDING_FILE_PATTERN.test('file:///docs/other-pronunciation-1-abc.m4a.bak'));
});

test('yetim kayıt tespiti: kelimesi silinmiş kullanıcı girişi bulunur, var olan kelimeninki bulunmaz', () => {
  const report = find({
    maps: { a: { alive: 'file:///docs/pronunciation-1-aaa.m4a', gone: 'file:///docs/pronunciation-2-bbb.m4a' } },
    isKnownWordId: known('alive'),
  });
  assert.deepEqual(report.staleEntries.map(entry => entry.wordId), ['gone']);
  assert.equal(report.count, 1);
  assert.equal(report.bytes, 500);
});

test('başka kullanıcının girişleri ve dosyaları ASLA yetim sayılmaz', () => {
  const report = find({
    maps: {
      a: {},
      b: { stranger: 'file:///docs/pronunciation-3-ccc.m4a' }, // B'nin kelimesi A'da bilinmiyor
    },
    files: [file('pronunciation-3-ccc.m4a', 30 * DAY)],
    isKnownWordId: known(),
  });
  assert.equal(report.staleEntries.length, 0);
  assert.equal(report.unreferencedFiles.length, 0, 'B\'nin haritasında geçen dosya silinemez');
});

test('hiçbir haritada olmayan, eski ve desene uyan dosya yetimdir', () => {
  const report = find({
    maps: { a: { w1: 'file:///docs/pronunciation-1-aaa.m4a' } },
    files: [file('pronunciation-1-aaa.m4a'), file('pronunciation-9-zzz.m4a')],
    isKnownWordId: known('w1'),
  });
  assert.deepEqual(report.unreferencedFiles.map(f => f.uri), ['file:///docs/pronunciation-9-zzz.m4a']);
});

test('geçici/genç dosyalar (devam eden kayıt) ve yaşı bilinmeyenler yetim sayılmaz', () => {
  const report = find({
    files: [
      file('pronunciation-10-new.m4a', 60 * 1000),      // 1 dakikalık: kayıt sürüyor olabilir
      file('pronunciation-11-unk.m4a', null),            // yaşı bilinmiyor
      file('pronunciation-12-old.m4a', 2 * DAY),
    ],
  });
  assert.deepEqual(report.unreferencedFiles.map(f => f.uri), ['file:///docs/pronunciation-12-old.m4a']);
});

test('desene uymayan dosyalar (kullanıcıya/uygulamaya ait başka dosyalar) hiç raporlanmaz', () => {
  const report = find({ files: [file('notes.m4a', 90 * DAY), file('recording.m4a', 90 * DAY)] });
  assert.equal(report.count, 0);
});

test('haritalar eksiksiz okunamadıysa dosya tabanlı yetim aranmaz (veri kaybı riski)', () => {
  const report = find({ mapsComplete: false, files: [file('pronunciation-5-aaa.m4a', 30 * DAY)] });
  assert.equal(report.unreferencedFiles.length, 0);
});

test('kelime listesi güvenilir değilse (henüz yüklenmedi) kelime tabanlı yetim aranmaz', () => {
  const report = find({ wordsReliable: false, maps: { a: { w1: 'file:///docs/pronunciation-1-a.m4a' } } });
  assert.equal(report.staleEntries.length, 0);
});

test('bozuk kayıt haritası (boş/eksik) yetim üretmez ve çökertmez', () => {
  assert.doesNotThrow(() => find({ maps: {}, files: [] }));
  assert.doesNotThrow(() => find({ maps: { a: C.sanitizeRecordingMap(null) } }));
  assert.equal(find({ maps: { a: C.sanitizeRecordingMap([1, 2]) } }).count, 0);
});

test('kelime silme: yalnızca o kelimenin girişi çıkar, özgün harita değişmez', () => {
  const map = { w1: 'file:///a.m4a', w2: 'file:///b.m4a' };
  const { map: next, removed } = K.withoutWordEntries(map, ['w1']);
  assert.deepEqual(next, { w2: 'file:///b.m4a' });
  assert.deepEqual(removed, ['file:///a.m4a']);
  assert.deepEqual(map, { w1: 'file:///a.m4a', w2: 'file:///b.m4a' });
  assert.deepEqual(K.withoutWordEntries(map, ['yok']).removed, []);
});

test('boyut biçimi', () => {
  assert.equal(K.formatBytes(0), '0 KB');
  assert.equal(K.formatBytes(10), '1 KB');
  assert.equal(K.formatBytes(2048), '2 KB');
  assert.equal(K.formatBytes(3 * 1024 * 1024), '3.0 MB');
  assert.equal(K.formatBytes(NaN), '0 KB');
});

// ─── Kelime silindiğinde kayıt: kelime silinse bile ses KENDİLİĞİNDEN silinmez ──────────────────────────────
test('kelime silinince bağlı kayıt kendiliğinden silinmez; yalnızca yetim olarak raporlanır (silme onay ister)', () => {
  const report = find({
    maps: { a: { removedWord: 'file:///docs/pronunciation-1-aaa.m4a' } },
    files: [file('pronunciation-1-aaa.m4a')],
    isKnownWordId: known(),
  });
  // Rapor yalnızca bilgi verir; silme işlevi yok ve dosya hâlâ haritada olduğu için "dosya yetim" sayılmaz.
  assert.equal(report.staleEntries.length, 1);
  assert.equal(report.unreferencedFiles.length, 0);
});

// ─── Çıkış başarısızlığında kayıtlar ─────────────────────────────────────────────────────────────────────────
test('çıkış başarısızsa telaffuz kayıtlarının silinmesi (wipeLocal) çağrılmaz', async () => {
  let recordingsCleared = false;
  const gateLog = [];
  const result = await F.runSignOut('a', {
    revokeOwner: () => gateLog.push('revoke'),
    restoreOwner: () => gateLog.push('restore'),
    remoteSignOut: async () => ({ error: new Error('Network request failed') }),
    wipeLocal: async () => { recordingsCleared = true; },
    clearSession: () => gateLog.push('clear'),
  });
  assert.equal(result.ok, false);
  assert.equal(recordingsCleared, false, 'başarısız çıkışta kayıtlar silinmemeli');
  assert.ok(!gateLog.includes('clear'));
});

test('çıkış başarılıysa kayıtlar silinir ve oturum kapanır', async () => {
  let recordingsCleared = false;
  const result = await F.runSignOut('a', {
    revokeOwner: () => {}, restoreOwner: () => {},
    remoteSignOut: async () => ({ error: null }),
    wipeLocal: async () => { recordingsCleared = true; },
    clearSession: () => {},
  });
  assert.equal(result.ok, true);
  assert.equal(recordingsCleared, true);
});

// ─── Saklanan kayıtlar ve kullanıcı ayrımı ───────────────────────────────────
test('saklamayı seçtiğin kayıtlar temizlik listesinden ayrı raporlanır (otomatik temizliğe girmez)', () => {
  const report = find({
    maps: { a: { gone1: 'file:///docs/pronunciation-1-aaa.m4a', gone2: 'file:///docs/pronunciation-2-bbb.m4a' } },
    keptWordIds: new Set(['gone1']),
    isKnownWordId: known(),
  });
  assert.deepEqual(report.keptEntries.map(entry => entry.wordId), ['gone1']);
  assert.deepEqual(report.staleEntries.map(entry => entry.wordId), ['gone2']);
  assert.equal(report.count, 1, 'toplu temizlik yalnızca saklanmayanları kapsar');
  assert.equal(report.keptCount, 1);
  assert.equal(report.keptBytes, 500);
});

test('saklanan kayıt var olan bir kelimeye aitse hiç listelenmez', () => {
  const report = find({
    maps: { a: { alive: 'file:///docs/pronunciation-1-aaa.m4a' } },
    keptWordIds: new Set(['alive']),
    isKnownWordId: known('alive'),
  });
  assert.equal(report.keptCount, 0);
  assert.equal(report.count, 0);
});

test('saklanan kayıtların dosyası "hiçbir haritada yok" diye yetim sayılmaz (haritada geçer)', () => {
  const report = find({
    maps: { a: { gone: 'file:///docs/pronunciation-1-aaa.m4a' } },
    files: [file('pronunciation-1-aaa.m4a', 30 * DAY)],
    keptWordIds: new Set(['gone']),
  });
  assert.equal(report.unreferencedFiles.length, 0);
});

test('depolama anahtarları kullanıcıya özeldir: farklı kullanıcıların haritası karışmaz', () => {
  assert.notEqual(K.recordingMapKey('a'), K.recordingMapKey('b'));
  assert.notEqual(K.keptRecordingsKey('a'), K.keptRecordingsKey('b'));
  assert.equal(K.keptRecordingsKey('a'), K.recordingMapKey('a') + ':kept');
});

test('harita anahtarı ayrıştırma: yalnızca gerçek harita anahtarları kullanıcı döndürür', () => {
  assert.equal(K.parseMapKeyUserId(K.recordingMapKey('user-1')), 'user-1');
  assert.equal(K.parseMapKeyUserId(K.keptRecordingsKey('user-1')), null);
  assert.equal(K.parseMapKeyUserId(K.corruptBackupKey('user-1')), null);
  assert.equal(K.parseMapKeyUserId('@wortly:words'), null);
  assert.equal(K.parseMapKeyUserId(K.MAP_KEY_PREFIX), null);
});

test('kullanıcı değiştirme: B\'nin haritasındaki kelimeler A için yetim sayılmaz ve tersi', () => {
  const maps = { a: { w1: 'file:///docs/pronunciation-1-aaa.m4a' }, b: { w2: 'file:///docs/pronunciation-2-bbb.m4a' } };
  assert.equal(find({ currentUserId: 'a', maps, isKnownWordId: known('w1') }).count, 0);
  assert.equal(find({ currentUserId: 'b', maps, isKnownWordId: known('w2') }).count, 0);
  // A'nın kelime listesi w2'yi bilmese de B'nin girişi A'nın raporuna girmez.
  assert.equal(find({ currentUserId: 'a', maps, isKnownWordId: known('w1') }).staleEntries.length, 0);
});
