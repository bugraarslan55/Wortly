// @utils: ../modules/wortly-speech-recognition/src/core, ../modules/wortly-speech-recognition/src/controller
// Cihaz içi Almanca konuşma tanıma modülünün TypeScript tarafı: normalizasyon ve oturum durum makinesi.
// Kapsam DIŞI (gerçek cihazda denenmeli): Swift/Kotlin kodu, gerçek mikrofon, işletim sistemi tanıyıcısı, izin pencereleri.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const dir = path.join(out, 'modules', 'wortly-speech-recognition', 'src');
const C = require(path.join(dir, 'core.js'));
const K = require(path.join(dir, 'controller.js'));
const T = require(path.join(dir, 'types.js'));

// ─── Sahte native modül + sahte zamanlayıcı ───────────────────────────────────
function createFakeNative(overrides = {}) {
  const handlers = { onResult: new Set(), onError: new Set(), onStateChange: new Set() };
  const calls = [];
  const native = {
    calls,
    emit(name, payload) { handlers[name].forEach(handler => handler(payload)); },
    listenerCount: () => Object.values(handlers).reduce((sum, set) => sum + set.size, 0),
    getAvailability: async () => { calls.push('getAvailability'); return { available: true }; },
    getPermissions: async () => { calls.push('getPermissions'); return { microphone: 'granted', speech: 'granted' }; },
    requestPermissions: async () => { calls.push('requestPermissions'); return { microphone: 'granted', speech: 'granted' }; },
    start: async () => { calls.push('start'); return { status: 'started' }; },
    stop: async () => { calls.push('stop'); },
    cancel: async () => { calls.push('cancel'); },
    addListener(name, handler) {
      handlers[name].add(handler);
      return { remove: () => handlers[name].delete(handler) };
    },
    ...overrides,
  };
  return native;
}

function createFakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    setTimer(callback, ms) { const id = nextId++; pending.set(id, { at: now + ms, callback }); return id; },
    clearTimer(id) { pending.delete(id); },
    pendingCount: () => pending.size,
    advance(ms) {
      now += ms;
      for (const [id, entry] of [...pending]) {
        if (entry.at <= now) { pending.delete(id); entry.callback(); }
      }
    },
  };
}

const make = (nativeOverrides, extra = {}) => {
  const native = extra.native === null ? null : createFakeNative(nativeOverrides);
  const timers = createFakeTimers();
  const controller = K.createSpeechController({
    native, platformSupported: extra.platformSupported ?? true, setTimer: timers.setTimer, clearTimer: timers.clearTimer,
  });
  return { native, timers, controller };
};
const tick = () => new Promise(resolve => setImmediate(resolve));

// ─── Normalizasyon ────────────────────────────────────────────────────────────
test('kullanılabilirlik yalnızca açıkça available:true ise kullanılabilir; bozuk veri kullanılamaz sayılır', () => {
  assert.deepEqual(C.normalizeAvailability({ available: true }), { available: true });
  for (const raw of [null, undefined, 'evet', 1, {}, { available: 'true' }, { available: false }]) {
    const result = C.normalizeAvailability(raw);
    assert.equal(result.available, false);
    assert.equal(result.reason, 'unknown');
    assert.ok(result.message.includes('kullanılamıyor'));
  }
  assert.equal(C.normalizeAvailability({ available: false, reason: 'language-not-installed' }).reason, 'language-not-installed');
  assert.equal(C.normalizeAvailability({ available: false, reason: 'uydurma' }).reason, 'unknown');
});

test('izinler: iOS ve Android biçimleri birleşir; bozuk veri güvenli yönde reddedilir', () => {
  assert.deepEqual(C.normalizePermissions({ microphone: 'granted', speech: 'granted' }),
    { microphone: 'granted', speech: 'granted', granted: true, canAskAgain: false });
  assert.deepEqual(C.normalizePermissions({ microphone: 'undetermined', speech: 'undetermined' }),
    { microphone: 'undetermined', speech: 'undetermined', granted: false, canAskAgain: true });
  assert.equal(C.normalizePermissions({ microphone: 'granted', speech: 'denied' }).granted, false);
  assert.equal(C.normalizePermissions({ microphone: 'granted', speech: 'restricted' }).canAskAgain, false);
  assert.equal(C.normalizePermissions({ microphone: 'denied', speech: 'granted' }).canAskAgain, false);
  // Android
  assert.deepEqual(C.normalizePermissions({ status: 'granted', canAskAgain: true }),
    { microphone: 'granted', speech: 'not-required', granted: true, canAskAgain: false });
  assert.deepEqual(C.normalizePermissions({ status: 'denied', canAskAgain: true }),
    { microphone: 'denied', speech: 'not-required', granted: false, canAskAgain: true });
  assert.equal(C.normalizePermissions({ status: 'denied', canAskAgain: false }).canAskAgain, false);
  // Bozuk
  for (const raw of [null, undefined, 'granted', 5, [], { microphone: 'garip', speech: 'garip' }]) {
    const result = C.normalizePermissions(raw);
    assert.equal(result.granted, false);
  }
});

test('start sonucu: yalnızca "started" başarıdır; bilinmeyen sonuç başarı sayılmaz', () => {
  assert.deepEqual(C.normalizeStartResult({ status: 'started' }), { ok: true });
  assert.equal(C.normalizeStartResult({ status: 'unavailable', reason: 'on-device-not-supported' }).error.reason, 'on-device-not-supported');
  assert.equal(C.normalizeStartResult({ status: 'permission-denied' }).error.code, 'permission-denied');
  assert.equal(C.normalizeStartResult({ status: 'busy' }).error.code, 'busy');
  assert.equal(C.normalizeStartResult({ status: 'error', code: 'audio-error' }).error.code, 'audio-error');
  assert.equal(C.normalizeStartResult({ status: 'error', code: 'uydurma' }).error.code, 'recognizer-error');
  for (const raw of [null, undefined, {}, { status: 'ok' }, 'started']) assert.equal(C.normalizeStartResult(raw).ok, false);
});

test('hata ve sonuç yükleri: bozuk yük çökmez; mesajlar Türkçe ve transkript içermez', () => {
  assert.equal(C.normalizeNativeError({ code: 'no-speech' }).code, 'no-speech');
  assert.equal(C.normalizeNativeError(null).code, 'recognizer-error');
  assert.equal(C.readResult({ transcript: 'Guten Tag', isFinal: true }).isFinal, true);
  assert.equal(C.readResult({ transcript: 'x' }).isFinal, false);
  assert.equal(C.readResult({ transcript: 5 }), null);
  assert.equal(C.readResult(null), null);
  const codes = ['permission-denied', 'busy', 'no-audio', 'no-speech', 'model-missing', 'audio-error', 'recognizer-error', 'interrupted', 'timeout'];
  for (const code of codes) assert.ok(C.makeError(code).message.length > 10);
});

// ─── Desteklenmeyen ortamlar ──────────────────────────────────────────────────
test('web/desteklenmeyen platform: çökmez, "unsupported-platform" ve start başarısız döner', async () => {
  const { controller } = make({}, { platformSupported: false });
  const availability = await controller.getAvailability();
  assert.deepEqual([availability.available, availability.reason], [false, 'unsupported-platform']);
  const started = await controller.start();
  assert.equal(started.ok, false);
  assert.equal(started.error.code, 'unavailable');
  assert.equal((await controller.getPermissions()).granted, false);
  await controller.stop();
  await controller.cancel();
  assert.equal(controller.getSnapshot().status, 'idle');
});

test('native modül yok (eski derleme): çökmez, "native-module-missing" döner', async () => {
  const { controller } = make({}, { native: null });
  assert.equal((await controller.getAvailability()).reason, 'native-module-missing');
  const started = await controller.start();
  assert.deepEqual([started.ok, started.error.reason], [false, 'native-module-missing']);
  await controller.dispose();
});

test('native kullanılabilirlik sorgusu hata verirse "kullanılamıyor" döner (çökmez)', async () => {
  const { controller } = make({ getAvailability: async () => { throw new Error('boom'); } });
  const availability = await controller.getAvailability();
  assert.deepEqual([availability.available, availability.reason], [false, 'recognizer-unavailable']);
});

// ─── Başlatma ─────────────────────────────────────────────────────────────────
test('cihaz içi Almanca desteği yoksa: "kullanılamıyor" döner, durum boşta kalır, dinleme/mikrofon durumu oluşmaz', async () => {
  let startCalls = 0;
  const { controller, timers } = make({
    start: async () => { startCalls += 1; return { status: 'unavailable', reason: 'on-device-not-supported' }; },
  });
  const seen = [];
  controller.subscribe(snapshot => seen.push(snapshot.status));
  const started = await controller.start();
  assert.equal(started.ok, false);
  assert.deepEqual([started.error.code, started.error.reason], ['unavailable', 'on-device-not-supported']);
  assert.equal(controller.getSnapshot().status, 'idle');
  assert.ok(!seen.includes('listening'));
  assert.equal(timers.pendingCount(), 0);
  assert.equal(startCalls, 1);
});

test('izin yoksa ve sorulamıyorsa: native start hiç çağrılmaz', async () => {
  const { controller, native } = make({
    getPermissions: async () => ({ microphone: 'denied', speech: 'denied' }),
  });
  const started = await controller.start();
  assert.equal(started.error.code, 'permission-denied');
  assert.ok(!native.calls.includes('start'));
  assert.ok(!native.calls.includes('requestPermissions'));
  assert.equal(controller.getSnapshot().status, 'idle');
});

test('izin belirsizse sorulur; verilirse başlar, reddedilirse start çağrılmaz', async () => {
  const granted = make({
    getPermissions: async () => ({ microphone: 'undetermined', speech: 'undetermined' }),
  });
  assert.equal((await granted.controller.start()).ok, true);
  assert.deepEqual(granted.native.calls.filter(call => call !== 'cancel'), ['requestPermissions', 'start']);

  const denied = make({
    getPermissions: async () => ({ microphone: 'undetermined', speech: 'undetermined' }),
    requestPermissions: async () => ({ microphone: 'denied', speech: 'denied' }),
  });
  const result = await denied.controller.start();
  assert.equal(result.error.code, 'permission-denied');
  assert.ok(!denied.native.calls.includes('start'));
});

test('requestPermissions:false ise sistem izin penceresi açılmaz', async () => {
  const { controller, native } = make({
    getPermissions: async () => ({ microphone: 'undetermined', speech: 'undetermined' }),
  });
  const result = await controller.start({ requestPermissions: false });
  assert.equal(result.error.code, 'permission-denied');
  assert.ok(!native.calls.includes('requestPermissions'));
});

test('başarılı akış: dinliyor → kısmi metin → nihai metin → boşta; zamanlayıcı temizlenir', async () => {
  const { controller, native, timers } = make();
  assert.equal((await controller.start()).ok, true);
  assert.equal(controller.getSnapshot().status, 'listening');
  assert.equal(timers.pendingCount(), 1);

  native.emit('onResult', { transcript: 'Guten', isFinal: false });
  assert.deepEqual(controller.getSnapshot(), { status: 'listening', transcript: 'Guten', isFinal: false, error: null });
  native.emit('onResult', { transcript: 'Guten Tag', isFinal: true });
  assert.deepEqual(controller.getSnapshot(), { status: 'idle', transcript: 'Guten Tag', isFinal: true, error: null });
  assert.equal(timers.pendingCount(), 0);
});

test('ikinci start, dinleme sürerken "meşgul" döner ve native start tekrar çağrılmaz', async () => {
  const { controller, native } = make();
  await controller.start();
  const second = await controller.start();
  assert.equal(second.error.code, 'busy');
  assert.equal(native.calls.filter(call => call === 'start').length, 1);
  assert.equal(controller.getSnapshot().status, 'listening');
});

test('yeniden başlatınca önceki transkript ve hata temizlenir', async () => {
  const { controller, native } = make();
  await controller.start();
  native.emit('onResult', { transcript: 'eski', isFinal: true });
  assert.equal(controller.getSnapshot().transcript, 'eski');
  await controller.start();
  assert.deepEqual(controller.getSnapshot(), { status: 'listening', transcript: '', isFinal: false, error: null });
});

// ─── Hata, durdurma, iptal, zaman aşımı ───────────────────────────────────────
test('native hata olayı: boşta + anlaşılır hata; sonraki geç olaylar yok sayılır', async () => {
  const { controller, native, timers } = make();
  await controller.start();
  native.emit('onError', { code: 'no-speech' });
  const snapshot = controller.getSnapshot();
  assert.deepEqual([snapshot.status, snapshot.error.code], ['idle', 'no-speech']);
  assert.match(snapshot.error.message, /tekrar dene/i);
  assert.equal(timers.pendingCount(), 0);
  native.emit('onResult', { transcript: 'geç gelen', isFinal: true });
  assert.equal(controller.getSnapshot().transcript, '');
});

test('native "boşta" durum olayı (ör. arka plan): oturum sonlanır ve zamanlayıcı temizlenir', async () => {
  const { controller, native, timers } = make();
  await controller.start();
  native.emit('onStateChange', { state: 'idle' });
  assert.equal(controller.getSnapshot().status, 'idle');
  assert.equal(timers.pendingCount(), 0);
});

test('start sırasında native hata fırlatırsa çökmez; recognizer-error ve boşta', async () => {
  const { controller } = make({ start: async () => { throw new Error('boom'); } });
  const result = await controller.start();
  assert.equal(result.error.code, 'recognizer-error');
  assert.equal(controller.getSnapshot().status, 'idle');
});

test('durdur: native stop çağrılır, nihai sonuç gelince boşta ve metin korunur', async () => {
  const { controller, native } = make();
  await controller.start();
  native.emit('onResult', { transcript: 'Ich heiße Anna', isFinal: false });
  await controller.stop();
  assert.equal(controller.getSnapshot().status, 'stopping');
  assert.ok(native.calls.includes('stop'));
  native.emit('onResult', { transcript: 'Ich heiße Anna', isFinal: true });
  assert.deepEqual(controller.getSnapshot(), { status: 'idle', transcript: 'Ich heiße Anna', isFinal: true, error: null });
});

test('durdurduktan sonra nihai sonuç gelmezse takılmaz: eldeki metin nihai sayılır, native iptal edilir', async () => {
  const { controller, native, timers } = make();
  await controller.start();
  native.emit('onResult', { transcript: 'Guten Tag', isFinal: false });
  await controller.stop();
  timers.advance(T.STOP_GRACE_MS + 1);
  assert.deepEqual(controller.getSnapshot(), { status: 'idle', transcript: 'Guten Tag', isFinal: true, error: null });
  assert.ok(native.calls.includes('cancel'));
});

test('durdurduktan sonra hiç metin yoksa: "duyamadım" hatası, ceza/yanlış cevap yok', async () => {
  const { controller, timers } = make();
  await controller.start();
  await controller.stop();
  timers.advance(T.STOP_GRACE_MS + 1);
  const snapshot = controller.getSnapshot();
  assert.deepEqual([snapshot.status, snapshot.error.code, snapshot.transcript], ['idle', 'no-speech', '']);
});

test('zaman aşımı, hiç metin yoksa: native iptal edilir, "timeout" hatası ve boşta', async () => {
  const { controller, native, timers } = make();
  await controller.start({ timeoutMs: 5000 });
  timers.advance(5001);
  await tick();
  const snapshot = controller.getSnapshot();
  assert.deepEqual([snapshot.status, snapshot.error.code], ['idle', 'timeout']);
  assert.ok(native.calls.includes('cancel'));
});

test('zaman aşımı, metin varsa: nazikçe durdurulur (nihai sonuç beklenir)', async () => {
  const { controller, native, timers } = make();
  await controller.start({ timeoutMs: 5000 });
  native.emit('onResult', { transcript: 'Danke', isFinal: false });
  timers.advance(5001);
  await tick();
  assert.equal(controller.getSnapshot().status, 'stopping');
  assert.ok(native.calls.includes('stop'));
  native.emit('onResult', { transcript: 'Danke schön', isFinal: true });
  assert.deepEqual(controller.getSnapshot(), { status: 'idle', transcript: 'Danke schön', isFinal: true, error: null });
});

test('iptal: native iptal edilir, durum sıfırlanır, geç olaylar yok sayılır, zamanlayıcı kalmaz', async () => {
  const { controller, native, timers } = make();
  await controller.start();
  native.emit('onResult', { transcript: 'yarım', isFinal: false });
  await controller.cancel();
  assert.deepEqual(controller.getSnapshot(), { status: 'idle', transcript: '', isFinal: false, error: null });
  assert.ok(native.calls.includes('cancel'));
  assert.equal(timers.pendingCount(), 0);
  native.emit('onResult', { transcript: 'geç', isFinal: true });
  assert.equal(controller.getSnapshot().transcript, '');
});

test('izin beklenirken iptal edilirse: native start çağrılmaz, mikrofon açılmaz', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { controller, native } = make({
    getPermissions: async () => { await gate; return { microphone: 'granted', speech: 'granted' }; },
  });
  const pending = controller.start();
  await controller.cancel();
  release();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'interrupted');
  assert.ok(!native.calls.includes('start'));
});

test('native start beklenirken iptal edilirse: başlamış olan native oturum kapatılır', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { controller, native } = make({
    start: async () => { await gate; return { status: 'started' }; },
  });
  const pending = controller.start();
  await tick();
  await controller.cancel();
  release();
  const result = await pending;
  assert.equal(result.error.code, 'interrupted');
  assert.ok(native.calls.filter(call => call === 'cancel').length >= 1);
  assert.equal(controller.getSnapshot().status, 'idle');
});

// ─── Ekran kapanışı (dispose) ─────────────────────────────────────────────────
test('dispose: dinleme sürüyorsa native iptal edilir, dinleyiciler kaldırılır, zamanlayıcı kalmaz; sonrası güvenli', async () => {
  const { controller, native, timers } = make();
  await controller.start();
  assert.ok(native.listenerCount() > 0);
  await controller.dispose();
  assert.equal(native.listenerCount(), 0);
  assert.ok(native.calls.includes('cancel'));
  assert.equal(timers.pendingCount(), 0);
  assert.equal(controller.getSnapshot().status, 'idle');
  const after = await controller.start();
  assert.equal(after.ok, false);
  await controller.dispose(); // ikinci çağrı zararsız
});

test('dispose: boştayken gereksiz native iptal çağrılmaz', async () => {
  const { controller, native } = make();
  await controller.dispose();
  assert.ok(!native.calls.includes('cancel'));
});

test('abonelik: durum değişimleri bildirilir; abonelikten çıkınca bildirim durur', async () => {
  const { controller, native } = make();
  const seen = [];
  const unsubscribe = controller.subscribe(snapshot => seen.push(snapshot.status));
  await controller.start();
  native.emit('onResult', { transcript: 'a', isFinal: true });
  const count = seen.length;
  assert.deepEqual(seen.slice(0, 2), ['starting', 'listening']);
  unsubscribe();
  await controller.start();
  assert.equal(seen.length, count);
});

test('sabitler: Almanca (de-DE), makul zaman aşımı ve bekleme süreleri', () => {
  assert.equal(T.SPEECH_LOCALE, 'de-DE');
  assert.ok(T.DEFAULT_TIMEOUT_MS >= 5000 && T.DEFAULT_TIMEOUT_MS <= 60000);
  assert.ok(T.STOP_GRACE_MS >= 1000);
});

// ─── Cihazda "Seni duyamadım" teşhisi: ayrı nedenler, ayrı mesajlar ───────────
test('kullanıcıya dönük mesajlar: ses yok / kelime çıkmadı / model yok / izin / tanıma hatası birbirinden farklıdır', () => {
  const messages = ['no-audio', 'no-speech', 'model-missing', 'permission-denied', 'recognizer-error', 'audio-error']
    .map(code => C.makeError(code).message);
  assert.equal(new Set(messages).size, messages.length);
  assert.match(C.makeError('no-audio').message, /Ses algılanmadı/);
  assert.match(C.makeError('model-missing').message, /Dikte/);
  assert.match(C.unavailableMessage('on-device-not-supported'), /Dikte/);
  assert.doesNotMatch(C.unavailableMessage('on-device-not-supported'), /^Bu cihazda Almanca sesli cevap kullanılamıyor/);
});

test('izin reddi: eksik izne göre mikrofon / konuşma tanıma / ikisi mesajı verilir', () => {
  const error = (microphone, speech) => C.permissionDeniedError({ microphone, speech, granted: false, canAskAgain: false });
  assert.match(error('denied', 'granted').message, /^Mikrofon izni/);
  assert.match(error('granted', 'denied').message, /^Konuşma tanıma izni/);
  assert.match(error('denied', 'denied').message, /Mikrofon veya konuşma tanıma izni/);
  assert.match(error('denied', 'not-required').message, /^Mikrofon izni/);
});

test('izin yoksa start sonucu hangi iznin eksik olduğunu söyler', async () => {
  const { controller } = make({ getPermissions: async () => ({ microphone: 'granted', speech: 'denied' }) });
  const result = await controller.start();
  assert.equal(result.error.code, 'permission-denied');
  assert.match(result.error.message, /^Konuşma tanıma izni/);
});

test('native hata olayı teknik ayrıntıyı taşır; ayrıntı kısaltılır, sayı/nesne ayrıntısı atılır', () => {
  assert.equal(C.normalizeNativeError({ code: 'no-audio', detail: 'seviye:0.000 · parça:0' }).detail, 'seviye:0.000 · parça:0');
  assert.equal(C.normalizeNativeError({ code: 'no-audio', detail: 'x'.repeat(500) }).detail.length, 200);
  assert.equal(C.normalizeNativeError({ code: 'no-audio', detail: 5 }).detail, undefined);
  assert.equal(C.normalizeNativeError({ code: 'no-audio', detail: '   ' }).detail, undefined);
  assert.equal(C.normalizeNativeError({ code: 'no-audio' }).detail, undefined);
  assert.equal(C.normalizeStartResult({ status: 'error', code: 'audio-error', detail: 'ses:x/1' }).error.detail, 'ses:x/1');
});

test('no-audio ve model-missing native kodları tanınır', () => {
  assert.equal(C.normalizeNativeError({ code: 'no-audio' }).code, 'no-audio');
  assert.equal(C.normalizeNativeError({ code: 'model-missing' }).code, 'model-missing');
});

test('boş nihai sonuç, önceden duyulan kısmi metni ezmez', async () => {
  const { controller, native } = make();
  await controller.start();
  native.emit('onResult', { transcript: 'Ich möchte einen Kaffee', isFinal: false });
  native.emit('onResult', { transcript: '', isFinal: true });
  assert.deepEqual(controller.getSnapshot(), { status: 'idle', transcript: 'Ich möchte einen Kaffee', isFinal: true, error: null });
});

test('hiç metin yokken boş nihai sonuç sessiz "boş cevap" değil, açık "no-speech" hatasıdır', async () => {
  const { controller, native } = make();
  await controller.start();
  native.emit('onResult', { transcript: '   ', isFinal: true });
  const snapshot = controller.getSnapshot();
  assert.deepEqual([snapshot.status, snapshot.isFinal, snapshot.transcript, snapshot.error.code], ['idle', false, '', 'no-speech']);
});

test('boş kısmi sonuç mevcut metni silmez', async () => {
  const { controller, native } = make();
  await controller.start();
  native.emit('onResult', { transcript: 'Guten Tag', isFinal: false });
  native.emit('onResult', { transcript: '', isFinal: false });
  assert.equal(controller.getSnapshot().transcript, 'Guten Tag');
});

test('native hata (no-audio) ayrıntısıyla anlık duruma yansır', async () => {
  const { controller, native } = make();
  await controller.start();
  native.emit('onError', { code: 'no-audio', detail: 'seviye:0.000 · parça:0 · kısmi:0' });
  const snapshot = controller.getSnapshot();
  assert.deepEqual([snapshot.status, snapshot.error.code, snapshot.error.detail], ['idle', 'no-audio', 'seviye:0.000 · parça:0 · kısmi:0']);
});

test('SONUÇ ŞİMDİ GELİR, SONRA "idle": native olay sırası (önce sonuç/hata, sonra durum) hatayı yutmaz', async () => {
  const { controller, native } = make();
  await controller.start();
  native.emit('onError', { code: 'recognizer-error', detail: 'hata:kAFAssistantErrorDomain/1101' });
  native.emit('onStateChange', { state: 'idle' });
  assert.equal(controller.getSnapshot().error.code, 'recognizer-error');

  const second = make();
  await second.controller.start();
  second.native.emit('onResult', { transcript: 'Guten Tag', isFinal: true });
  second.native.emit('onStateChange', { state: 'idle' });
  assert.equal(second.controller.getSnapshot().transcript, 'Guten Tag');
});
