// @utils: scenario-engine, speech-answer, achievements, progress-stats, learning-analysis
// Sesle cevap pilotu için veri kuralları: yalnızca seçili A1 karar noktalarında açık; alternatifler seçenekler arasında çakışmaz;
// geçerli doğrulama; puan/kayıt etkilenmez. Gerçek tanıma ve ekran bu testlerin kapsamında DEĞİLDİR.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const S = require(path.join(out, 'constants', 'scenarios.js'));
const E = require(path.join(out, 'utils', 'scenario-engine.js'));
const V = require(path.join(out, 'utils', 'speech-answer.js'));

const VOICE_IDS = ['kafede-siparis', 'tren-istasyonu', 'markette-alisveris'];
const choiceOf = (scenario) => scenario.steps.find(step => step.type === 'choice');
const voiceScenarios = () => S.SCENARIOS.filter(scenario => choiceOf(scenario)?.voice === true);

test('sesle cevap yalnızca seçili 3 A1 karar noktasında açık; diğer 48 senaryoda kapalı', () => {
  assert.deepEqual(voiceScenarios().map(scenario => scenario.id).sort(), [...VOICE_IDS].sort());
  for (const scenario of voiceScenarios()) assert.equal(scenario.level, 'A1', scenario.id);
  for (const scenario of S.SCENARIOS.filter(item => !VOICE_IDS.includes(item.id))) {
    assert.ok(!choiceOf(scenario).voice, `${scenario.id}: sesle cevap kapalı olmalı`);
    for (const option of choiceOf(scenario).options) assert.equal(option.accepted, undefined, `${scenario.id}: alternatif yok`);
  }
});

test('sesli karar noktaları yapısal doğrulamadan geçer ve soru sayısı/puanlama etkilenmez', () => {
  for (const scenario of S.SCENARIOS) assert.deepEqual(E.validateScenario(scenario), [], scenario.id);
  const questions = S.SCENARIOS.reduce((sum, scenario) => sum + E.countQuestions(scenario.steps), 0);
  assert.equal(questions, 247);
  for (const scenario of voiceScenarios()) {
    const steps = scenario.steps;
    assert.equal(E.scoreScenario(steps, {}).total, steps.filter(step => step.type === 'reply').length);
    assert.equal(E.countChoices(steps), 1);
  }
});

test('her sesli seçenek, kendi Almanca cümlesiyle ve tüm kabul edilen alternatifleriyle KENDİ dalını seçer, diğerini seçmez', () => {
  for (const scenario of voiceScenarios()) {
    const step = choiceOf(scenario);
    step.options.forEach((option, index) => {
      assert.ok(option.accepted && option.accepted.length >= 2, `${scenario.id}: en az iki alternatif`);
      for (const spoken of [option.german, ...option.accepted]) {
        assert.deepEqual(V.matchSpokenChoice(spoken, step.options), { kind: 'match', index }, `${scenario.id}: "${spoken}"`);
        // Tanıyıcı noktalama/büyük harf farkı üretse de aynı dal seçilir.
        assert.deepEqual(V.matchSpokenChoice(spoken.toLowerCase().replace(/[.,!?]/g, ''), step.options), { kind: 'match', index });
      }
    });
  }
});

test('seçeneklerin adayları birbiriyle çakışmaz (belirsiz eşleşme yok)', () => {
  for (const scenario of voiceScenarios()) {
    assert.deepEqual(V.overlappingCandidates(choiceOf(scenario).options), [], scenario.id);
  }
});

test('alternatif metinler Almanca biçim kurallarına uyar (büyük harf, noktalama, Türkçe harf yok)', () => {
  for (const scenario of voiceScenarios()) {
    for (const option of choiceOf(scenario).options) {
      for (const text of option.accepted) {
        assert.match(text, /^[A-ZÄÖÜ]/, `${scenario.id}: ${text}`);
        assert.match(text, /[.!?]$/, `${scenario.id}: ${text}`);
        assert.ok(!/[ğşİı]/.test(text) && !/\s{2,}/.test(text) && text === text.trim(), `${scenario.id}: ${text}`);
      }
    }
  }
});

test('yanlış/ilgisiz cevaplar sesli karar noktasında hiçbir dalı seçmez', () => {
  for (const scenario of voiceScenarios()) {
    const options = choiceOf(scenario).options;
    for (const spoken of ['Wo ist der Bahnhof?', 'Ich weiß es nicht.', 'Entschuldigung, wie bitte?', '']) {
      assert.notEqual(V.matchSpokenChoice(spoken, options).kind, 'match', `${scenario.id}: "${spoken}"`);
    }
  }
});

test('doğrulama: sesli karar noktasında çakışan alternatifler ve boş alternatif yakalanır', () => {
  const base = S.getScenarioById('kafede-siparis');
  const mutate = (fn) => {
    const steps = JSON.parse(JSON.stringify(base.steps));
    fn(choiceOf({ steps }));
    return { ...base, steps };
  };
  assert.deepEqual(E.validateScenario(mutate(() => {})), []);
  assert.ok(E.validateScenario(mutate(step => { step.options[1].accepted.push(step.options[0].german); })).length > 0);
  assert.ok(E.validateScenario(mutate(step => { step.options[0].accepted = ['   ']; })).length > 0);
  assert.ok(E.validateScenario(mutate(step => { step.options[0].accepted = 'Mit Milch.'; })).length > 0);
  // Sesli olmayan karar noktasında alternatif alanı serbest bırakılmaz, ama çakışma yine de sorun değildir (kullanılmaz).
  assert.deepEqual(E.validateScenario(mutate(step => { step.voice = false; step.options[1].accepted = [step.options[0].german]; })), []);
});

test('sesli seçimler de puanı, yanlış listesini ve kaydı etkilemez: seçim ayrı haritada, ilerleme haritasında karar noktası yok', () => {
  for (const scenario of voiceScenarios()) {
    const steps = scenario.steps;
    let progress = {};
    steps.forEach((step, index) => {
      if (step.type === 'reply') progress = E.answerOption(progress, index, { id: 'correct', correct: true });
    });
    const index = steps.findIndex(step => step.type === 'choice');
    assert.equal(index in progress, false);
    assert.equal(E.scoreScenario(steps, progress).percent, 100);
    assert.deepEqual(E.missedStepIndexes(steps, progress), []);
    // Sesle eşleşen dal, dokunarak seçilen dalla aynı sonucu verir.
    const spoken = V.matchSpokenChoice(choiceOf(scenario).options[1].german, choiceOf(scenario).options);
    assert.equal(spoken.index, 1);
    assert.deepEqual(E.choiceOutcome(choiceOf(scenario), spoken.index), E.choiceOutcome(choiceOf(scenario), 1));
  }
});
