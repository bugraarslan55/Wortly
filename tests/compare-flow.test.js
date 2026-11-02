// @utils: compare-flow
// "Karşılaştır" akışı (saf mantık, sahte seslendirme/oynatma/zamanlayıcı ile). Gerçek expo-speech bitiş geri
// çağrıları, ses çıkışı ve ekranlar bu testlerin kapsamında DEĞİLDİR.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const { createCompareFlow, REFERENCE_TIMEOUT_MS, MANUAL_MESSAGE } = require(path.join(out, 'utils', 'compare-flow.js'));

function harness({ speakStarts = true, speakThrows = false, playFails = false } = {}) {
  const timers = [];
  const h = {
    plays: 0, callbacks: null, timers,
    flow: null,
    advance(ms) { // sahte zaman: süresi dolan zamanlayıcıları çalıştır
      for (const timer of [...timers]) { // anlık görüntü: yeniden kurulan zamanlayıcı aynı adımda tetiklenmez
        if (!timer.cleared && !timer.fired) { timer.left -= ms; if (timer.left <= 0) { timer.fired = true; timer.fn(); } }
      }
    },
  };
  h.flow = createCompareFlow({
    speakReference: async (callbacks) => {
      h.callbacks = callbacks;
      if (speakThrows) throw new Error('tts');
      return speakStarts;
    },
    playRecording: async () => { h.plays += 1; if (playFails) throw new Error('play'); },
    setTimer: (fn, ms) => { const t = { fn, left: ms, cleared: false, fired: false }; timers.push(t); return t; },
    clearTimer: (t) => { t.cleared = true; },
  });
  return h;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('normal akış: referans biter, kayıt bir kez çalınır', async () => {
  const h = harness();
  assert.equal(await h.flow.start(), 'started');
  assert.equal(h.flow.getStatus(), 'reference');
  h.callbacks.onFinished();
  await tick();
  assert.equal(h.plays, 1);
  assert.equal(h.flow.getStatus(), 'idle');
});

test('bitiş geri çağrısı İKİ KEZ gelirse ikinci oynatma oluşmaz', async () => {
  const h = harness();
  await h.flow.start();
  h.callbacks.onFinished();
  h.callbacks.onFinished();
  await tick();
  assert.equal(h.plays, 1);
});

test('bitiş geri çağrısı hiç gelmezse zaman aşımı sonrası "manuel" duruma geçilir, takılı kalmaz', async () => {
  const h = harness();
  await h.flow.start();
  assert.equal(h.flow.getStatus(), 'reference');
  h.advance(REFERENCE_TIMEOUT_MS + 1);
  assert.equal(h.flow.getStatus(), 'manual');
  assert.equal(h.plays, 0, 'otomatik oynatma başlamadı; kullanıcı elle dinleyecek');
  assert.match(MANUAL_MESSAGE, /Kaydımı Dinle/);
});

test('zaman aşımından SONRA gelen geç bitiş çağrısı sürpriz oynatma yapmaz', async () => {
  const h = harness();
  await h.flow.start();
  h.advance(REFERENCE_TIMEOUT_MS + 1);
  h.callbacks.onFinished();
  await tick();
  assert.equal(h.plays, 0);
  assert.equal(h.flow.getStatus(), 'manual');
});

test('zaman aşımından ÖNCE biten akışın zamanlayıcısı temizlenir', async () => {
  const h = harness();
  await h.flow.start();
  h.callbacks.onFinished();
  await tick();
  h.advance(REFERENCE_TIMEOUT_MS + 1);
  assert.equal(h.flow.getStatus(), 'idle');
  assert.equal(h.plays, 1);
});

test('seslendirme başlayamazsa (kayıt sürüyor vb.) hemen manuel duruma geçilir', async () => {
  const h = harness({ speakStarts: false });
  assert.equal(await h.flow.start(), 'manual');
  assert.equal(h.flow.getStatus(), 'manual');
  assert.equal(h.plays, 0);
});

test('seslendirme istisna fırlatırsa çökmez, manuel duruma geçer', async () => {
  const h = harness({ speakThrows: true });
  assert.equal(await h.flow.start(), 'manual');
  assert.equal(h.flow.getStatus(), 'manual');
});

test('seslendirme hatası bildirilirse manuel duruma geçilir', async () => {
  const h = harness();
  await h.flow.start();
  h.callbacks.onFailed();
  assert.equal(h.flow.getStatus(), 'manual');
  h.callbacks.onFinished();
  await tick();
  assert.equal(h.plays, 0);
});

test('ekran değişince (iptal) kayıt çalınmaz; sonradan gelen bitiş yok sayılır', async () => {
  const h = harness();
  await h.flow.start();
  h.flow.cancel();
  assert.equal(h.flow.getStatus(), 'idle');
  h.callbacks.onFinished();
  await tick();
  assert.equal(h.plays, 0);
});

test('çift dokunuş: akış sürerken ikinci başlatma yok sayılır', async () => {
  const h = harness();
  await h.flow.start();
  assert.equal(await h.flow.start(), 'ignored');
  h.callbacks.onFinished();
  await tick();
  assert.equal(h.plays, 1);
});

test('manuel durumdan yeniden başlatılabilir ve eski akışın geç çağrıları yeni akışı etkilemez', async () => {
  const h = harness();
  await h.flow.start();
  const oldCallbacks = h.callbacks;
  h.advance(REFERENCE_TIMEOUT_MS + 1);
  assert.equal(h.flow.getStatus(), 'manual');
  await h.flow.start();
  assert.equal(h.flow.getStatus(), 'reference');
  oldCallbacks.onFinished(); // eski akışın geç bitişi
  await tick();
  assert.equal(h.plays, 0, 'yeni akış henüz bitmedi');
  h.callbacks.onFinished();
  await tick();
  assert.equal(h.plays, 1);
});

test('kayıt oynatılamazsa manuel duruma geçilir (çökme yok)', async () => {
  const h = harness({ playFails: true });
  await h.flow.start();
  h.callbacks.onFinished();
  await tick();
  assert.equal(h.flow.getStatus(), 'manual');
});

test('manuel uyarı kapatılabilir', async () => {
  const h = harness({ speakStarts: false });
  await h.flow.start();
  h.flow.dismissManual();
  assert.equal(h.flow.getStatus(), 'idle');
});

test('abonelere durum değişimi bildirilir', async () => {
  const h = harness();
  const seen = [];
  h.flow.subscribe(() => seen.push(h.flow.getStatus()));
  await h.flow.start();
  h.callbacks.onFinished();
  await tick();
  assert.deepEqual(seen, ['reference', 'idle']);
});

// ─── Uzun seslendirme ────────────────────────────────────────────────────────
const { referenceTimeoutMs, MAX_TIMEOUT_EXTENSIONS } = require(path.join(out, 'utils', 'compare-flow.js'));

test('bekleme süresi metin uzunluğuna göre artar: kısa kelime 10 sn, uzun cümle daha uzun, en çok 60 sn', () => {
  assert.equal(referenceTimeoutMs('Haus'), REFERENCE_TIMEOUT_MS);
  const long = 'Ich würde die gedruckten Broschüren reduzieren, denn die meisten werden ohnehin weggeworfen.';
  assert.ok(referenceTimeoutMs(long) > REFERENCE_TIMEOUT_MS);
  assert.equal(referenceTimeoutMs('x'.repeat(5000)), 60000);
  assert.equal(referenceTimeoutMs(undefined), REFERENCE_TIMEOUT_MS);
});

function longHarness({ speaking }) {
  const base = harness();
  const h = { ...base, state: { speaking } };
  h.flow = createCompareFlow({
    speakReference: async (callbacks) => { h.callbacks = callbacks; return true; },
    playRecording: async () => { h.plays += 1; },
    isReferenceSpeaking: () => h.state.speaking,
    setTimer: (fn, ms) => { const t = { fn, left: ms, cleared: false, fired: false }; base.timers.push(t); return t; },
    clearTimer: (t) => { t.cleared = true; },
  });
  return h;
}

test('uzun seslendirme: ses hâlâ çalarken zaman aşımı manuel moda GEÇMEZ, uzatılır; bitince kayıt çalınır', async () => {
  const h = longHarness({ speaking: true });
  await h.flow.start();
  h.advance(REFERENCE_TIMEOUT_MS + 1);
  assert.equal(h.flow.getStatus(), 'reference', 'ses sürerken erken kesilmemeli');
  h.advance(REFERENCE_TIMEOUT_MS + 1);
  assert.equal(h.flow.getStatus(), 'reference');
  h.callbacks.onFinished();
  await tick();
  assert.equal(h.plays, 1);
});

test('uzun seslendirme: ses artık çalmıyorsa (bitiş çağrısı gelmedi) zaman aşımı sonrası manuel moda geçilir', async () => {
  const h = longHarness({ speaking: true });
  await h.flow.start();
  h.advance(REFERENCE_TIMEOUT_MS + 1); // uzatıldı
  h.state.speaking = false;            // ses bitti ama geri çağrı gelmedi
  h.advance(REFERENCE_TIMEOUT_MS + 1);
  assert.equal(h.flow.getStatus(), 'manual');
  assert.equal(h.plays, 0);
});

test('uzatmalar sınırlıdır: ses sonsuza dek "çalıyor" görünse bile akış takılı kalmaz', async () => {
  const h = longHarness({ speaking: true });
  await h.flow.start();
  for (let i = 0; i < MAX_TIMEOUT_EXTENSIONS + 2; i += 1) h.advance(REFERENCE_TIMEOUT_MS + 1);
  assert.equal(h.flow.getStatus(), 'manual');
});
