// @utils: scenario-engine, achievements, progress-stats, learning-analysis
// Gerçek hayat konuları için eklenen yeni senaryolar: eksik durumlar eklendi, mevcut senaryoların kimliği, seviyesi ve sırası korundu.
// Yapısal tutarlılık denetlenir; Almanca dil bilgisi ve Türkçe çeviri doğruluğu otomatik doğrulanmaz.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const S = require(path.join(out, 'constants', 'scenarios.js'));
const E = require(path.join(out, 'utils', 'scenario-engine.js'));

const EXISTING_IN_ORDER = [
  'kafede-siparis', 'tren-istasyonu', 'markette-alisveris', 'yeni-tanisma', 'otelde-giris', 'yol-tarifi', 'restoranda-siparis',
  'doktor-randevu', 'ev-gorme', 'eczane-ilac', 'banka-hesap', 'kayip-esya', 'tren-gecikme', 'restoran-sikayet', 'kurs-kayit',
  'tasinma-gunu', 'is-randevusu', 'arkadasla-sohbet',
  'is-gorusmesi', 'resmi-daire', 'isyeri-sorun', 'sigorta-gorusmesi', 'kira-sozlesmesi', 'doktor-detay', 'seyahat-degisikligi',
  'oturum-izni', 'gorusme-sonrasi-telefon', 'ekip-toplantisi',
];
const NEW_LEVELS = {
  'kiyafet-magazasi': 'A1',
  'hobi-sohbeti': 'A1',
  'gunluk-rutin': 'A1',
  'randevu-erteleme': 'A2',
  'havaalani-pasaport': 'A2',
  'rica-izin-isteme': 'A2',
  'postane-paket': 'A2',
  'aile-tanitma': 'A1',
  'ev-tanitma': 'A1',
  'dogum-gunu-daveti': 'A1',
  'firin-kasap': 'A1',
  'saat-acilis-kapanis': 'A1',
  'ozur-mazeret': 'A2',
  'telefon-gorusmesi': 'A2',
  'muze-bileti': 'A2',
  'sehir-tanitimi': 'A2',
  'taksi-cagirma': 'A2',
  'urun-iade': 'B1',
  'mobil-sozlesme': 'B1',
  'hastalik-bildirimi': 'B1',
  'ariza-bildirme': 'B1',
  'komsu-gurultu': 'B1',
  'acil-durum': 'B1',
};
const NEW_IDS = Object.keys(NEW_LEVELS);

test('mevcut 28 senaryo aynı sırayla ve aynı seviyelerle korunur; yenilerle birlikte kimlikler benzersizdir', () => {
  const ids = S.SCENARIOS.map(scenario => scenario.id);
  assert.deepEqual(ids.filter(id => EXISTING_IN_ORDER.includes(id)), EXISTING_IN_ORDER);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, EXISTING_IN_ORDER.length + NEW_IDS.length);
  for (const id of NEW_IDS) assert.ok(ids.includes(id), `yeni senaryo eksik: ${id}`);
  const levelRank = { A1: 0, A2: 1, B1: 2 };
  const ranks = S.SCENARIOS.map(scenario => levelRank[scenario.level]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'senaryolar seviye gruplarının içinde kalır');
});

test('yeni senaryoların seviyeleri beklenen gibi ve seviye kilidi mevcut kuralla çalışır', () => {
  for (const [id, level] of Object.entries(NEW_LEVELS)) {
    assert.equal(S.getScenarioById(id).level, level, id);
    assert.equal(S.isScenarioLevelLocked(level, 'A1'), level !== 'A1', id);
  }
});

test('yeni senaryolar oynanabilir ve tam: en az 5 soru, tam bir karar noktası, her soruda anlamlar, yanlış nedenleri ve dil notu', () => {
  for (const id of NEW_IDS) {
    const scenario = S.getScenarioById(id);
    assert.deepEqual(E.validateScenario(scenario), [], `${id}: ${E.validateScenario(scenario).join('; ')}`);
    assert.equal(E.countChoices(scenario.steps), 1, `${id}: tam bir karar noktası`);
    const replies = scenario.steps.filter(step => step.type === 'reply');
    assert.ok(replies.length >= 5, `${id}: en az 5 soru`);
    assert.ok(scenario.description.trim().length > 10 && scenario.place.trim(), `${id}: açıklama ve yer`);
    for (const step of replies) {
      assert.equal(step.wrongTurkish?.length, 2, `${id}: yanlış seçenek anlamları`);
      assert.equal(step.wrongNotes?.length, 2, `${id}: yanlış seçenek notları`);
      assert.ok(step.note && step.note.length > 10, `${id}: dil notu`);
      assert.equal(new Set([step.german, ...step.wrongOptions]).size, 3, `${id}: seçenekler farklı`);
      assert.equal(new Set([step.turkish, ...step.wrongTurkish]).size, 3, `${id}: Türkçe anlamlar farklı`);
    }
  }
});

test('yeni senaryolarda Almanca başlık ve öğrenme hedefi var; sesle cevap KAPALI ve alternatif yok', () => {
  for (const id of NEW_IDS) {
    const meta = S.getScenarioMeta(id);
    assert.ok(meta?.germanTitle?.trim(), `${id}: Almanca başlık`);
    assert.ok(meta?.goal?.trim().length > 10, `${id}: öğrenme hedefi`);
    const choice = S.getScenarioById(id).steps.find(step => step.type === 'choice');
    assert.ok(!choice.voice, `${id}: sesle cevap kapalı olmalı`);
    for (const option of choice.options) assert.equal(option.accepted, undefined, `${id}: alternatif yok`);
  }
});

test('yeni senaryolarda iki seçim farklı yanıt verir ve her cevap bir konuşma satırının ardındandır', () => {
  for (const id of NEW_IDS) {
    const { steps } = S.getScenarioById(id);
    const index = steps.findIndex(step => step.type === 'choice');
    assert.ok(index > 0 && index < steps.length - 1, `${id}: karar noktası ortada`);
    assert.equal(steps[index + 1].type, 'say', `${id}: ortak devam`);
    const first = E.choiceOutcome(steps[index], 0);
    const second = E.choiceOutcome(steps[index], 1);
    assert.notEqual(first.response.german, second.response.german, id);
    steps.forEach((step, i) => {
      if (step.type === 'reply') assert.equal(steps[i - 1]?.type, 'say', `${id}: adım ${i + 1}`);
    });
  }
});
