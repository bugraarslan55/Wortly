// @utils: speech-answer
// Sesle verilen cevabın iki seçenekle eşleştirilmesi ve sesli cevap panelinin durumları (saf mantık).
// Bu, telaffuz/aksan puanlaması DEĞİLDİR: yalnızca tanınan metni normalize edip seçeneklerle karşılaştırır; güven yüzdesi üretmez.
// Gerçek mikrofon, işletim sistemi tanıyıcısı ve ekran bu testlerin kapsamında DEĞİLDİR (cihazda denenmelidir).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const V = require(path.join(out, 'utils', 'speech-answer.js'));

const MILK = [
  { german: 'Ja, mit Milch, bitte.', accepted: ['Mit Milch, bitte.', 'Ja, bitte.', 'Mit Milch.'] },
  { german: 'Nein, ohne Milch, bitte.', accepted: ['Ohne Milch, bitte.', 'Nein, danke.', 'Ohne Milch.'] },
];
const BAG = [
  { german: 'Ja, bitte. Eine Tüte.', accepted: ['Ja, bitte.', 'Eine Tüte, bitte.'] },
  { german: 'Nein, danke. Ich habe eine Tasche.', accepted: ['Nein, danke.', 'Ich habe eine Tasche.', 'Ich brauche keine Tüte.'] },
];
const matchIndex = (transcript, options = MILK) => {
  const result = V.matchSpokenChoice(transcript, options);
  return result.kind === 'match' ? result.index : result.kind;
};

// ─── Normalizasyon ───────────────────────────────────────────────────────────
test('normalizasyon: büyük/küçük harf, noktalama ve boşluk farkları yok sayılır', () => {
  assert.equal(V.normalizeSpeechText('  Ja,   mit MILCH, bitte!  '), 'ja mit milch bitte');
  assert.equal(V.normalizeSpeechText('Ja, mit Milch, bitte.'), V.normalizeSpeechText('ja mit milch bitte'));
  assert.equal(V.normalizeSpeechText('Hin und zurück?'), V.normalizeSpeechText('hin und zurück'));
  assert.equal(V.normalizeSpeechText('Ja…  bitte;\tdanke'), 'ja bitte danke');
});

test('normalizasyon: umlaut ve ß varyantları aynıya iner (tanıyıcı farklı yazabilir)', () => {
  assert.equal(V.normalizeSpeechText('Tüte'), V.normalizeSpeechText('Tute'));
  assert.equal(V.normalizeSpeechText('Straße'), V.normalizeSpeechText('Strasse'));
  assert.equal(V.normalizeSpeechText('zurück'), V.normalizeSpeechText('zuruck'));
});

test('normalizasyon: boş/bozuk girdi çökertmez', () => {
  for (const bad of ['', '   ', '...', null, undefined, 5]) assert.equal(V.normalizeSpeechText(bad), '');
});

// ─── Eşleştirme ──────────────────────────────────────────────────────────────
test('tam cevap eşleşir: büyük/küçük harf, noktalama ve boşluk farkına rağmen', () => {
  assert.equal(matchIndex('Ja, mit Milch, bitte.'), 0);
  assert.equal(matchIndex('ja mit milch bitte'), 0);
  assert.equal(matchIndex('  JA,   MIT  MILCH   BITTE!  '), 0);
  assert.equal(matchIndex('Nein, ohne Milch, bitte.'), 1);
  assert.equal(matchIndex('nein ohne milch bitte'), 1);
});

test('kabul edilebilir alternatif cevaplar eşleşir', () => {
  assert.equal(matchIndex('Mit Milch, bitte.'), 0);
  assert.equal(matchIndex('mit milch'), 0);
  assert.equal(matchIndex('Ja, bitte.'), 0);
  assert.equal(matchIndex('Ohne Milch.'), 1);
  assert.equal(matchIndex('Nein, danke.'), 1);
  assert.equal(matchIndex('Eine Tüte, bitte.', BAG), 0);
  assert.equal(matchIndex('Ich brauche keine Tüte.', BAG), 1);
  assert.equal(matchIndex('Ich habe eine Tasche', BAG), 1);
});

test('birkaç dolgu kelime (ör. "äh", "also") eşleşmeyi bozmaz', () => {
  assert.equal(matchIndex('Äh, mit Milch, bitte.'), 0);
  assert.equal(matchIndex('Also ohne Milch bitte'), 1);
});

test('olumsuzlama tersine eşleşmez: "nicht mit Milch" seçenek A sayılmaz', () => {
  assert.equal(matchIndex('Nicht mit Milch, bitte.'), 'none');
  assert.equal(matchIndex('Ich möchte keine Milch, bitte.'), 'none');
});

test('uzun ilgisiz cümle, alakasız cevap ve kısmi kelime eşleşmez', () => {
  assert.equal(matchIndex('Ich möchte heute Abend ins Kino gehen und danach mit Freunden essen, bitte.'), 'none');
  assert.equal(matchIndex('Wo ist der Bahnhof?'), 'none');
  assert.equal(matchIndex('Milch'), 'none');
  assert.equal(matchIndex('Mitmilch'), 'none');
});

test('her iki seçeneğe de uyan cevap belirsiz sayılır (dal seçilmez)', () => {
  assert.equal(matchIndex('Ja bitte nein danke', BAG), 'ambiguous');
  assert.equal(matchIndex('Mit Milch und ohne Milch'), 'ambiguous');
});

test('boş transkript "empty" döner; seçenek listesi bozuksa çökmez', () => {
  assert.equal(matchIndex(''), 'empty');
  assert.equal(matchIndex('...'), 'empty');
  assert.equal(V.matchSpokenChoice('Ja', []).kind, 'none');
  assert.equal(V.matchSpokenChoice('Ja', null).kind, 'none');
  assert.equal(V.matchSpokenChoice('Ja', [{ german: '' }, { german: undefined }]).kind, 'none');
});

test('eşleştirme güven yüzdesi uydurmaz: yalnızca tür ve indeks döner', () => {
  const result = V.matchSpokenChoice('Ja, mit Milch, bitte.', MILK);
  assert.deepEqual(result, { kind: 'match', index: 0 });
  assert.deepEqual(Object.keys(result).sort(), ['index', 'kind']);
});

test('adayların çakışması: seçeneklerin adayları birbiriyle örtüşmemeli', () => {
  assert.deepEqual(V.overlappingCandidates(MILK), []);
  assert.deepEqual(V.overlappingCandidates(BAG), []);
  const overlapping = [{ german: 'Ja, bitte.' }, { german: 'Nein, danke.', accepted: ['Ja bitte'] }];
  assert.deepEqual(V.overlappingCandidates(overlapping), ['ja bitte']);
});

// ─── Panel durumları ─────────────────────────────────────────────────────────
const AVAILABLE = { available: true };
const IDLE = { status: 'idle', transcript: '', isFinal: false, error: null };
const view = (patch = {}) => V.describeVoice({
  availability: AVAILABLE, snapshot: IDLE, startError: null, options: MILK, dismissed: false, ...patch,
});

test('panel: kullanılabilirlik henüz bilinmiyorsa gizli (yanıp sönme yok)', () => {
  assert.equal(view({ availability: null }).kind, 'checking');
});

test('panel: cihaz içi Almanca yoksa "kullanılamıyor" Türkçe açıklamayla; seçenekler kullanılabilir kalır', () => {
  const result = view({ availability: { available: false, reason: 'on-device-not-supported', message: 'Bu cihazda Almanca sesli cevap kullanılamıyor. Seçeneklerle devam edebilirsin.' } });
  assert.equal(result.kind, 'unavailable');
  assert.ok(result.message.includes('Seçeneklerle devam edebilirsin'));
});

test('panel: boşta iken mikrofon düğmesi; dinlerken ve işlenirken ilgili durum', () => {
  assert.equal(view().kind, 'idle');
  const listening = view({ snapshot: { ...IDLE, status: 'listening', transcript: 'Ja, mit' } });
  assert.deepEqual([listening.kind, listening.interim], ['listening', 'Ja, mit']);
  assert.equal(view({ snapshot: { ...IDLE, status: 'starting' } }).kind, 'listening');
  assert.equal(view({ snapshot: { ...IDLE, status: 'stopping', transcript: 'Ja' } }).kind, 'processing');
});

test('panel: nihai cevap eşleşirse "matched" ve seçilecek indeks; eşleşmezse Türkçe açıklama ve yeniden deneme', () => {
  const matched = view({ snapshot: { ...IDLE, transcript: 'Ja, mit Milch, bitte.', isFinal: true } });
  assert.deepEqual([matched.kind, matched.index, matched.heard], ['matched', 0, 'Ja, mit Milch, bitte.']);

  const none = view({ snapshot: { ...IDLE, transcript: 'Wo ist der Bahnhof?', isFinal: true } });
  assert.equal(none.kind, 'no-match');
  assert.equal(none.reason, 'none');
  assert.ok(none.message.includes('Tekrar dene') && none.message.includes('seçeneklerden'));
  assert.equal(none.heard, 'Wo ist der Bahnhof?');

  const ambiguous = view({ snapshot: { ...IDLE, transcript: 'Mit Milch und ohne Milch', isFinal: true } });
  assert.deepEqual([ambiguous.kind, ambiguous.reason], ['no-match', 'ambiguous']);
});

test('panel: kullanıcı elle seçince eşleşme bildirimi kalkar (dismissed)', () => {
  const snapshot = { ...IDLE, transcript: 'Ja, mit Milch, bitte.', isFinal: true };
  assert.equal(view({ snapshot, dismissed: true }).kind, 'idle');
});

test('panel: hata ve izin reddi Türkçe mesajla gösterilir; yeniden denenebilir', () => {
  const error = { code: 'permission-denied', message: 'Mikrofon veya konuşma tanıma izni verilmedi. İzni cihaz ayarlarından açabilir ya da seçeneklerle devam edebilirsin.' };
  const result = view({ snapshot: { ...IDLE, error } });
  assert.deepEqual([result.kind, result.message], ['error', error.message]);
  assert.equal(view({ startError: { code: 'busy', message: 'Dinleme zaten sürüyor.' } }).kind, 'error');
  // start sırasında "unavailable" dönerse panel kullanılamıyor durumuna geçer.
  assert.equal(view({ startError: { code: 'unavailable', message: 'x' } }).kind, 'unavailable');
});

test('panel: boş nihai metin "seni duyamadım" olarak ele alınır (yanlış cevap sayılmaz)', () => {
  const result = view({ snapshot: { ...IDLE, transcript: '  ', isFinal: true } });
  assert.deepEqual([result.kind, result.reason], ['no-match', 'empty']);
  assert.ok(result.message.includes('Tekrar dene'));
});

test('panel: tüm kullanıcıya dönük metinler Türkçe ve ses/transkript saklama vaadi doğru', () => {
  assert.ok(V.VOICE_PRIVACY_NOTE.includes('cihazında') && V.VOICE_PRIVACY_NOTE.includes('kaydedilmez'));
  for (const text of [V.VOICE_IDLE_HINT, V.VOICE_LISTENING_MESSAGE, V.VOICE_PROCESSING_MESSAGE, V.VOICE_BUSY_MESSAGE]) {
    assert.ok(text.length > 10);
  }
});
