// @utils: pronunciation-controller, audio-focus
// Telaffuz kaydı akışı (saf mantık, sahte mikrofon/dosya sistemi/depolama ile). Gerçek mikrofon, expo-audio,
// dosya sistemi, AsyncStorage, işletim sistemi izin pencereleri ve ekranlar bu testlerin kapsamında DEĞİLDİR.
// Telaffuz PUANLAMASI yoktur; bu testler yalnızca kayıt/saklama/oynatma akışının güvenliğini sınar.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const C = require(path.join(out, 'utils', 'pronunciation-controller.js'));
const { createAudioFocus } = require(path.join(out, 'utils', 'audio-focus.js'));

const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(options = {}) {
  const fs = new Set(options.files ?? []);          // var olan dosyalar
  const store = { map: { ...(options.map ?? {}) }, failWrites: false };
  const focus = options.focus ?? createAudioFocus();
  const log = [];
  let counter = 0;
  const deps = {
    wordId: options.wordId ?? 'w1',
    focus,
    requestPermission: async () => { log.push('permission'); return options.permission ?? { granted: true, canAskAgain: true }; },
    startRecording: async () => {
      log.push('start');
      if (options.startGate) await options.startGate;
      if (options.startFails) throw new Error('mic');
    },
    stopRecording: async () => {
      log.push('stop');
      if (options.stopFails) throw new Error('stop');
      const uri = options.recorderUri === undefined ? 'file:///tmp/rec.m4a' : options.recorderUri;
      if (uri) fs.add(uri);
      return { uri, seconds: options.seconds ?? 2 };
    },
    restorePlaybackMode: async () => { log.push('mode'); },
    moveToUniqueFile: async (uri) => {
      const target = `file:///docs/pron-${++counter}.m4a`;
      fs.delete(uri); fs.add(target); return target;
    },
    measureDuration: async () => (options.measured === undefined ? 2 : options.measured),
    fileExists: (uri) => fs.has(uri),
    deleteFile: (uri) => { if (uri) { log.push(`delete:${uri}`); fs.delete(uri); } },
    loadMap: async () => (options.loadMapReturns !== undefined ? options.loadMapReturns : { ...store.map }),
    updateMap: async (mutate) => {
      if (store.failWrites) return false;
      const next = { ...store.map };
      mutate(next);
      store.map = next;
      return true;
    },
  };
  const controller = C.createPronunciationController(deps);
  return { controller, fs, store, focus, log, deps };
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────
test('bozuk kayıt haritası çökertmez: null, dizi, sayı ve geçersiz değerler elenir', () => {
  assert.deepEqual(C.sanitizeRecordingMap(null), {});
  assert.deepEqual(C.sanitizeRecordingMap(undefined), {});
  assert.deepEqual(C.sanitizeRecordingMap([1, 2]), {});
  assert.deepEqual(C.sanitizeRecordingMap(42), {});
  assert.deepEqual(C.sanitizeRecordingMap('x'), {});
  assert.deepEqual(C.sanitizeRecordingMap({ a: 'file:///a.m4a', b: 5, c: '', d: null }), { a: 'file:///a.m4a' });
});

test('süre biçimi: dakika:saniye, geçersiz değer 0:00', () => {
  assert.equal(C.formatDuration(0), '0:00');
  assert.equal(C.formatDuration(7.9), '0:07');
  assert.equal(C.formatDuration(65), '1:05');
  assert.equal(C.formatDuration(NaN), '0:00');
  assert.equal(C.formatDuration(-3), '0:00');
});

// ─── İzin ────────────────────────────────────────────────────────────────────
test('mikrofon izni ancak kayıt başlatılırken istenir; yüklemede istenmez', async () => {
  const { controller, log } = setup();
  await controller.load();
  assert.ok(!log.includes('permission'));
  await controller.start();
  assert.ok(log.includes('permission'));
});

test('izin reddedilirse kayıt başlamaz, açıklama çıkar; tekrar sorulabiliyorsa ayarlara yönlendirme yok', async () => {
  const { controller, log } = setup({ permission: { granted: false, canAskAgain: true } });
  assert.equal(await controller.start(), 'failed');
  const state = controller.getState();
  assert.equal(state.status, 'idle');
  assert.deepEqual(state.error, { code: 'permission', needsSettings: false });
  assert.ok(!log.includes('start'));
  assert.match(C.ERROR_MESSAGES.permission, /Mikrofon izni kapalı/);
});

test('izin kalıcı reddedildiyse (tekrar sorulamaz) cihaz ayarlarına yönlendirme istenir', async () => {
  const { controller } = setup({ permission: { granted: false, canAskAgain: false } });
  await controller.start();
  assert.deepEqual(controller.getState().error, { code: 'permission', needsSettings: true });
});

// ─── Kayıt başlatma / durdurma ───────────────────────────────────────────────
test('kayıt başlatıp durdurma: kayıt doğrulanır, haritaya yazılır, durum "idle"', async () => {
  const { controller, store, focus } = setup();
  assert.equal(await controller.start(), 'started');
  assert.equal(controller.getState().status, 'recording');
  assert.equal(focus.isRecording(), true);
  assert.equal(await controller.stop(), 'saved');
  const state = controller.getState();
  assert.equal(state.status, 'idle');
  assert.ok(state.uri);
  assert.equal(store.map.w1, state.uri);
  assert.equal(focus.isRecording(), false);
});

test('hızlı çift dokunuş: ikinci "başlat" yok sayılır, tek kayıt başlar', async () => {
  const { controller, log } = setup();
  const [a, b] = await Promise.all([controller.start(), controller.start()]);
  assert.deepEqual([a, b].sort(), ['ignored', 'started']);
  assert.equal(log.filter(entry => entry === 'start').length, 1);
});

test('hızlı çift dokunuş: ikinci "durdur" yok sayılır, tek kayıt dosyası oluşur', async () => {
  const { controller, store } = setup();
  await controller.start();
  const [a, b] = await Promise.all([controller.stop(), controller.stop()]);
  assert.deepEqual([a, b].sort(), ['ignored', 'saved']);
  assert.equal(Object.keys(store.map).length, 1);
});

test('kayıt sürerken ikinci kayıt başlamaz', async () => {
  const { controller, log } = setup();
  await controller.start();
  assert.equal(await controller.start(), 'ignored');
  assert.equal(log.filter(entry => entry === 'start').length, 1);
});

test('başka bir bileşen kayıt yapıyorsa (ses odağı) yeni kayıt başlamaz', async () => {
  const focus = createAudioFocus();
  focus.setRecording(true);
  const { controller, log } = setup({ focus });
  assert.equal(await controller.start(), 'failed');
  assert.equal(controller.getState().error.code, 'blocked');
  assert.ok(!log.includes('start'));
});

test('mikrofon başlatılamazsa hata gösterilir ve durum temizlenir', async () => {
  const { controller, focus } = setup({ startFails: true });
  assert.equal(await controller.start(), 'failed');
  assert.equal(controller.getState().error.code, 'start-failed');
  assert.equal(controller.getState().status, 'idle');
  assert.equal(focus.isRecording(), false);
});

test('çok kısa kayıt reddedilir, dosya silinir, önceki kayıt korunur', async () => {
  const { controller, store, fs } = setup({ seconds: 0.2, files: ['file:///old.m4a'], map: { w1: 'file:///old.m4a' } });
  await controller.load();
  await controller.start();
  assert.equal(await controller.stop(), 'failed');
  assert.equal(controller.getState().error.code, 'too-short');
  assert.equal(controller.getState().uri, 'file:///old.m4a');
  assert.equal(store.map.w1, 'file:///old.m4a');
  assert.ok(fs.has('file:///old.m4a'));
});

test('dosya ölçülemezse (bozuk/boş kayıt) kayıt kaydedilmez', async () => {
  const { controller, store } = setup({ measured: null });
  await controller.start();
  assert.equal(await controller.stop(), 'failed');
  assert.equal(controller.getState().error.code, 'save-failed');
  assert.deepEqual(store.map, {});
});

test('kaydedici dosya vermezse güvenle hata gösterilir', async () => {
  const { controller } = setup({ recorderUri: null });
  await controller.start();
  assert.equal(await controller.stop(), 'failed');
  assert.equal(controller.getState().error.code, 'save-failed');
});

test('durdurma sırasında istisna: durum "idle"e döner, mikrofon odağı bırakılır', async () => {
  const { controller, focus } = setup({ stopFails: true });
  await controller.start();
  assert.equal(await controller.stop(), 'failed');
  assert.equal(controller.getState().status, 'idle');
  assert.equal(focus.isRecording(), false);
});

// ─── Üzerine yazma güvenliği ─────────────────────────────────────────────────
test('yeniden kayıt başarılı olunca eski dosya silinir, yeni dosya kalır', async () => {
  const { controller, fs, store } = setup({ files: ['file:///old.m4a'], map: { w1: 'file:///old.m4a' } });
  await controller.load();
  await controller.start();
  await controller.stop();
  assert.ok(!fs.has('file:///old.m4a'));
  assert.notEqual(controller.getState().uri, 'file:///old.m4a');
  assert.equal(store.map.w1, controller.getState().uri);
});

test('harita yazılamazsa ESKİ kayıt korunur, yeni dosya atılır', async () => {
  const { controller, fs, store } = setup({ files: ['file:///old.m4a'], map: { w1: 'file:///old.m4a' } });
  await controller.load();
  store.failWrites = true;
  await controller.start();
  assert.equal(await controller.stop(), 'failed');
  assert.equal(controller.getState().error.code, 'save-failed');
  assert.equal(controller.getState().uri, 'file:///old.m4a');
  assert.ok(fs.has('file:///old.m4a'), 'eski kayıt dosyası silinmemeli');
  assert.equal([...fs].length, 1, 'yeni (kaydedilemeyen) dosya temizlenmeli');
});

// ─── Arka plan / ekran kapanması ─────────────────────────────────────────────
test('arka plana geçince kayıt durdurulup kaydedilir ve kullanıcıya bildirilir', async () => {
  const { controller, focus } = setup();
  await controller.start();
  assert.equal(await controller.stop('background'), 'saved');
  assert.equal(controller.getState().notice, 'background');
  assert.equal(focus.isRecording(), false);
  assert.match(C.NOTICE_MESSAGES.background, /arka plana/);
});

test('azami süreye ulaşınca otomatik durdurulur ve bilgi verilir', async () => {
  const { controller } = setup();
  await controller.start();
  await controller.stop('max-length');
  assert.equal(controller.getState().notice, 'max-length');
  assert.equal(C.MAX_RECORDING_SECONDS, 30);
});

test('ekran kapanırken kayıt sürüyorsa durdurulur, yarım geçici dosya atılır, mikrofon bırakılır', async () => {
  const { controller, fs, focus, log } = setup({ files: ['file:///old.m4a'], map: { w1: 'file:///old.m4a' } });
  await controller.load();
  await controller.start();
  await controller.dispose();
  assert.ok(log.includes('stop'));
  assert.ok(!fs.has('file:///tmp/rec.m4a'), 'geçici kayıt silinmeli');
  assert.ok(fs.has('file:///old.m4a'), 'kayıtlı telaffuz korunmalı');
  assert.equal(focus.isRecording(), false);
});

test('izin penceresi açıkken ekran kapanırsa kayıt hiç başlamaz', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { controller, deps, log } = setup();
  deps.requestPermission = async () => { await gate; return { granted: true, canAskAgain: true }; };
  const slow = C.createPronunciationController(deps);
  const pending = slow.start();
  await tick();
  await slow.dispose();
  release();
  assert.equal(await pending, 'failed');
  assert.ok(!log.includes('start'));
  assert.equal(controller.getState().status, 'idle');
});

test('kayıt başlarken ekran kapanırsa mikrofon açık bırakılmaz', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { controller, log, focus } = setup({ startGate: gate });
  const pending = controller.start();
  await tick();
  await controller.dispose();
  release();
  await pending;
  assert.ok(log.includes('stop'), 'başlayan kayıt hemen durdurulmalı');
  assert.equal(focus.isRecording(), false);
});

// ─── Ses odağı: seslendirme / oynatma / kayıt çakışması ──────────────────────
test('ses odağı: kayıt başlarken çalan seslendirme ve oynatma durdurulur', async () => {
  const focus = createAudioFocus();
  const stopped = [];
  focus.register('speech', () => stopped.push('speech'));
  focus.register('playback', () => stopped.push('playback'));
  const { controller } = setup({ focus });
  await controller.start();
  assert.deepEqual(stopped.sort(), ['playback', 'speech']);
});

test('ses odağı: kayıt sürerken seslendirme ve oynatma başlayamaz', async () => {
  const focus = createAudioFocus();
  const { controller } = setup({ focus });
  await controller.start();
  assert.equal(focus.request('speech'), false);
  assert.equal(focus.request('playback'), false);
  await controller.stop();
  assert.equal(focus.request('speech'), true);
});

test('ses odağı: oynatma başlayınca seslendirme, seslendirme başlayınca oynatma durur; kendi türü durmaz', () => {
  const focus = createAudioFocus();
  const stopped = [];
  focus.register('speech', () => stopped.push('speech'));
  focus.register('playback', () => stopped.push('playback'));
  assert.equal(focus.request('playback'), true);
  assert.deepEqual(stopped, ['speech']);
  assert.equal(focus.request('speech'), true);
  assert.deepEqual(stopped, ['speech', 'playback']);
});

test('ses odağı: bir durdurma işlevi hata verse diğerleri yine durdurulur; kayıt kaldırılabilir', () => {
  const focus = createAudioFocus();
  const stopped = [];
  focus.register('speech', () => { throw new Error('x'); });
  const unregister = focus.register('playback', () => stopped.push('playback'));
  assert.equal(focus.request('recording'), true);
  assert.deepEqual(stopped, ['playback']);
  unregister();
  focus.request('recording');
  assert.deepEqual(stopped, ['playback']);
});

test('ses odağı: kayıt durumu değişince aboneler bilgilendirilir', () => {
  const focus = createAudioFocus();
  let calls = 0;
  const off = focus.subscribe(() => { calls += 1; });
  focus.setRecording(true);
  focus.setRecording(true); // değişmedi
  focus.setRecording(false);
  off();
  focus.setRecording(true);
  assert.equal(calls, 2);
});

// ─── Eksik/bozuk dosya ───────────────────────────────────────────────────────
test('eksik ses dosyası: eşleme temizlenir, bildirim gösterilir, uygulama çökmez', async () => {
  const { controller, store } = setup({ map: { w1: 'file:///missing.m4a' }, files: [] });
  await controller.load();
  const state = controller.getState();
  assert.equal(state.uri, null);
  assert.equal(state.notice, 'missing-file');
  assert.deepEqual(store.map, {});
});

test('bozuk harita (null) çökertmez', async () => {
  const { controller } = setup({ loadMapReturns: null });
  await assert.doesNotReject(controller.load());
  assert.equal(controller.getState().uri, null);
});

test('başka kelimenin kaydı bu kelimeye karışmaz', async () => {
  const { controller } = setup({ wordId: 'w2', map: { w1: 'file:///a.m4a' }, files: ['file:///a.m4a'] });
  await controller.load();
  assert.equal(controller.getState().uri, null);
});

// ─── Silme ───────────────────────────────────────────────────────────────────
test('açık silme: önce harita güncellenir, sonra dosya silinir; başka kelimelerin kayıtları korunur', async () => {
  const { controller, store, fs } = setup({
    map: { w1: 'file:///a.m4a', w2: 'file:///b.m4a' }, files: ['file:///a.m4a', 'file:///b.m4a'],
  });
  await controller.load();
  assert.equal(await controller.remove(), true);
  assert.equal(controller.getState().uri, null);
  assert.deepEqual(store.map, { w2: 'file:///b.m4a' });
  assert.ok(!fs.has('file:///a.m4a'));
  assert.ok(fs.has('file:///b.m4a'));
});

test('harita yazılamazsa dosya SİLİNMEZ (veri kaybı yok)', async () => {
  const { controller, store, fs } = setup({ map: { w1: 'file:///a.m4a' }, files: ['file:///a.m4a'] });
  await controller.load();
  store.failWrites = true;
  assert.equal(await controller.remove(), false);
  assert.ok(fs.has('file:///a.m4a'));
  assert.equal(controller.getState().uri, 'file:///a.m4a');
  assert.equal(controller.getState().error.code, 'delete-failed');
});

test('kayıt yokken veya kayıt sürerken silme yapılmaz; hızlı çift silme tek işlem', async () => {
  const none = setup();
  assert.equal(await none.controller.remove(), false);

  const { controller, fs } = setup({ map: { w1: 'file:///a.m4a' }, files: ['file:///a.m4a'] });
  await controller.load();
  const [a, b] = await Promise.all([controller.remove(), controller.remove()]);
  assert.deepEqual([a, b].sort(), [false, true]);
  assert.ok(!fs.has('file:///a.m4a'));
});

// ─── Kullanıcı değiştirme ve çıkış ───────────────────────────────────────────
test('kullanıcı değiştirme: farklı kullanıcının haritası bu kullanıcıya sızmaz (kullanıcıya özel harita)', async () => {
  const userA = setup({ map: { w1: 'file:///a.m4a' }, files: ['file:///a.m4a'] });
  const userB = setup({ map: {}, files: ['file:///a.m4a'] }); // B'nin haritası boş
  await userA.controller.load();
  await userB.controller.load();
  assert.equal(userA.controller.getState().uri, 'file:///a.m4a');
  assert.equal(userB.controller.getState().uri, null);
});

test('ses dosyası bulutla eşitlenmez: denetleyici yalnızca yerel bağımlılıklar kullanır', () => {
  // Bağımlılık arayüzünde ağ/yükleme işlevi yoktur.
  const { deps } = setup();
  const names = Object.keys(deps).join(' ');
  assert.ok(!/upload|supabase|fetch|sync/i.test(names));
});

// ─── İşletim sistemi kaydı kesti ─────────────────────────────────────────────
test('kayıt kesildi (arama vb.): o ana kadarki kısım kaydedilir ve kullanıcıya bildirilir', async () => {
  const { controller, focus } = setup();
  await controller.start();
  assert.equal(await controller.stop('interrupted'), 'saved');
  assert.equal(controller.getState().notice, 'interrupted');
  assert.equal(controller.getState().status, 'idle');
  assert.equal(focus.isRecording(), false);
  assert.match(C.NOTICE_MESSAGES.interrupted, /kesildi/);
});

test('kesilen kayıt kaydedici dosyası vermezse çökmeden hata gösterilir', async () => {
  const { controller } = setup({ recorderUri: null });
  await controller.start();
  assert.equal(await controller.stop('interrupted'), 'failed');
  assert.equal(controller.getState().status, 'idle');
});

test('eksik dosya temizliği harita yazılamasa da çökmez', async () => {
  const { controller, store } = setup({ map: { w1: 'file:///missing.m4a' } });
  store.failWrites = true;
  await assert.doesNotReject(controller.load());
  assert.equal(controller.getState().uri, null);
});
