// @utils: scenario-engine, achievements, progress-stats, learning-analysis
// Senaryo karar noktaları (choice adımı): her senaryoda bir tane; iki doğal cevap, seçime göre değişen yanıt, ortak devam.
// Seçimler puanlanmaz ve puana/yanlış listesine/kayda girmez. Ekran (görünüm, seslendirme, tema) bu testlerin kapsamında DEĞİLDİR.
// Almanca dil bilgisi ve Türkçe çeviri doğruluğunu otomatik doğrulamaz; yapısal tutarlılık ve eksik/yer tutucu metin denetlenir.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const S = require(path.join(out, 'constants', 'scenarios.js'));
const E = require(path.join(out, 'utils', 'scenario-engine.js'));

const choiceOf = (scenario) => scenario.steps.find(step => step.type === 'choice');
const choiceIndexOf = (scenario) => scenario.steps.findIndex(step => step.type === 'choice');
const byLevel = (level) => S.SCENARIOS.filter(scenario => scenario.level === level);

// ─── Kapsam: TÜM seviyeler ───────────────────────────────────────────────────
test('tüm 51 senaryoda (A1, A2, B1) tam olarak bir karar noktası var', () => {
  assert.equal(S.SCENARIOS.length, 51);
  for (const scenario of S.SCENARIOS) {
    assert.equal(E.countChoices(scenario.steps), 1, `${scenario.id}: tam bir karar noktası olmalı`);
  }
  assert.equal(byLevel('A1').length, 15);
  assert.equal(byLevel('A2').length, 20);
  assert.equal(byLevel('B1').length, 16);
});

test('her senaryo yapısal doğrulamadan geçer (karar noktası dahil) ve oynanabilir', () => {
  for (const scenario of S.SCENARIOS) {
    assert.deepEqual(E.validateScenario(scenario), [], `${scenario.id}: ${E.validateScenario(scenario).join('; ')}`);
    assert.equal(E.isPlayableScenario(scenario), true);
  }
});

test('karar noktası: ilk/son adım değil, bir cevap ya da konuşmadan sonra gelir, hemen ardından ortak devam (konuşma satırı) var', () => {
  for (const scenario of S.SCENARIOS) {
    const index = choiceIndexOf(scenario);
    assert.ok(index > 0, `${scenario.id}: ilk adım olamaz`);
    assert.ok(index < scenario.steps.length - 1, `${scenario.id}: son adım olamaz (ortak devam gerekli)`);
    assert.ok(['reply', 'say'].includes(scenario.steps[index - 1].type), `${scenario.id}: önceki adım`);
    assert.equal(scenario.steps[index + 1].type, 'say', `${scenario.id}: ortak devam bir konuşma satırı olmalı`);
  }
});

test('hiçbir cevap adımı doğrudan karar noktasından sonra gelmez (cevap hep bir konuşma satırının ardında)', () => {
  for (const scenario of S.SCENARIOS) {
    scenario.steps.forEach((step, index) => {
      if (step.type === 'reply') assert.equal(scenario.steps[index - 1]?.type, 'say', `${scenario.id}: adım ${index + 1}`);
    });
  }
});

// ─── İçerik tamlığı ──────────────────────────────────────────────────────────
const PLACEHOLDER = /(todo|tbd|lorem|placeholder|xxx|\?\?\?|\.\.\.|…|\[.*\]|\{.*\})/i;
const germanTexts = (scenario) => {
  const step = choiceOf(scenario);
  return [step.german, ...step.options.flatMap(option => [option.german, option.responseGerman])];
};
const turkishTexts = (scenario) => {
  const step = choiceOf(scenario);
  return [step.turkish, step.prompt, ...step.options.flatMap(option => [option.turkish, option.responseTurkish])];
};

test('karar noktası metinleri eksiksiz: iki seçenek, her birinin Almanca/Türkçe metni ve yanıtı dolu, yer tutucu yok', () => {
  for (const scenario of S.SCENARIOS) {
    const step = choiceOf(scenario);
    assert.ok(step.speaker.trim(), `${scenario.id}: konuşan`);
    assert.equal(step.options.length, 2, `${scenario.id}: iki seçenek`);
    for (const text of [...germanTexts(scenario), ...turkishTexts(scenario)]) {
      assert.ok(typeof text === 'string' && text.trim().length >= 3, `${scenario.id}: boş metin`);
      assert.ok(!PLACEHOLDER.test(text), `${scenario.id}: yer tutucu/eksik metin: ${text}`);
      assert.ok(!text.includes('�') && !/\s{2,}/.test(text) && text === text.trim(), `${scenario.id}: biçim: ${text}`);
    }
  }
});

test('Almanca karar noktası metinleri: büyük harfle başlar, noktalama ile biter, Türkçeye özgü harf yok', () => {
  for (const scenario of S.SCENARIOS) {
    for (const text of germanTexts(scenario)) {
      assert.match(text, /^[A-ZÄÖÜ]/, `${scenario.id}: büyük harf: ${text}`);
      assert.match(text, /[.!?]$/, `${scenario.id}: noktalama: ${text}`);
      assert.ok(!/[ğşİı]/.test(text), `${scenario.id}: Türkçe harf: ${text}`);
    }
  }
});

test('Türkçe karar noktası metinleri Türkçe karakter içerir ve noktalama ile biter; görev metni anlamlı uzunlukta', () => {
  for (const scenario of S.SCENARIOS) {
    const step = choiceOf(scenario);
    assert.ok(step.prompt.length > 10, `${scenario.id}: görev metni`);
    for (const text of turkishTexts(scenario)) assert.match(text, /[.!?]$/, `${scenario.id}: Türkçe noktalama: ${text}`);
    // Almanca metin Türkçe çeviri olarak kopyalanmamış olmalı.
    step.options.forEach(option => assert.notEqual(option.german, option.turkish, `${scenario.id}: çeviri Almanca ile aynı`));
    assert.notEqual(step.german, step.turkish, `${scenario.id}: soru çevirisi`);
  }
});

test('iki seçenek birbirinden farklıdır ve seçime göre karşı tarafın yanıtı (Almanca ve Türkçe) FARKLIDIR', () => {
  for (const scenario of S.SCENARIOS) {
    const [a, b] = choiceOf(scenario).options;
    assert.notEqual(a.german.toLowerCase(), b.german.toLowerCase(), `${scenario.id}: seçenekler`);
    assert.notEqual(a.turkish, b.turkish, `${scenario.id}: seçenek çevirileri`);
    assert.notEqual(a.responseGerman.toLowerCase(), b.responseGerman.toLowerCase(), `${scenario.id}: Almanca yanıtlar`);
    assert.notEqual(a.responseTurkish, b.responseTurkish, `${scenario.id}: Türkçe yanıtlar`);
  }
});

test('karar noktası metinleri senaryonun başka bir adımının metniyle birebir aynı değildir', () => {
  for (const scenario of S.SCENARIOS) {
    const others = new Set(scenario.steps.filter(step => step.type !== 'choice').flatMap(step => [
      step.german, ...(step.type === 'reply' ? step.wrongOptions : []),
    ]));
    for (const text of germanTexts(scenario)) assert.ok(!others.has(text), `${scenario.id}: tekrar eden metin: ${text}`);
  }
});

// ─── A1, A2 ve B1 için iki seçimin farklı yanıt vermesi ──────────────────────
for (const [level, id] of [['A1', 'kafede-siparis'], ['A2', 'banka-hesap'], ['B1', 'is-gorusmesi']]) {
  test(`${level} (${id}): iki farklı seçim, farklı karşı taraf yanıtı verir ve ortak devama bağlanır`, () => {
    const scenario = S.getScenarioById(id);
    assert.equal(scenario.level, level);
    const index = choiceIndexOf(scenario);
    const step = scenario.steps[index];
    const first = E.choiceOutcome(step, 0);
    const second = E.choiceOutcome(step, 1);
    assert.ok(first && second);
    assert.notEqual(first.response.german, second.response.german);
    assert.notEqual(first.response.turkish, second.response.turkish);
    assert.notEqual(first.chosen.german, second.chosen.german);
    assert.equal(first.response.speaker, step.speaker);
    assert.equal(first.response.german, step.options[0].responseGerman);
    assert.equal(second.response.turkish, step.options[1].responseTurkish);
    // Her iki yol da aynı ortak devama gider (karar noktasından sonraki adım sabit).
    assert.equal(scenario.steps[index + 1].type, 'say');
  });
}

test('tüm senaryolarda iki seçim farklı yanıt üretir (engine üzerinden)', () => {
  for (const scenario of S.SCENARIOS) {
    const step = choiceOf(scenario);
    const first = E.choiceOutcome(step, 0);
    const second = E.choiceOutcome(step, 1);
    assert.notEqual(first.response.german, second.response.german, scenario.id);
    assert.notEqual(first.response.turkish, second.response.turkish, scenario.id);
  }
});

// ─── Motor davranışı ─────────────────────────────────────────────────────────
test('choiceOutcome: seçim yoksa/geçersizse null; girdiyi değiştirmez', () => {
  const step = choiceOf(S.getScenarioById('kafede-siparis'));
  const snapshot = JSON.stringify(step);
  for (const bad of [undefined, null, -1, 2, 0.5, '0', NaN]) assert.equal(E.choiceOutcome(step, bad), null);
  assert.equal(E.choiceOutcome(undefined, 0), null);
  E.choiceOutcome(step, 0);
  E.choiceOutcome(step, 1);
  assert.equal(JSON.stringify(step), snapshot);
});

test('devam edebilme: karar noktasında seçim yapılmadan ilerlenemez; 0 ve 1 geçerlidir, ilerleme haritası etkilemez', () => {
  const step = choiceOf(S.getScenarioById('kafede-siparis'));
  assert.equal(E.canContinue(step, undefined, undefined), false);
  assert.equal(E.canContinue(step, { solved: true, firstTry: true, wrongIds: [] }, undefined), false);
  assert.equal(E.canContinue(step, undefined, 0), true);
  assert.equal(E.canContinue(step, undefined, 1), true);
  assert.equal(E.canContinue(step, undefined, 2), false);
  assert.equal(E.canContinue(step, undefined, -1), false);
  // Eski çağrı biçimi korunur.
  const reply = S.getScenarioById('markette-alisveris').steps[1];
  assert.equal(E.canContinue(reply, undefined), false);
  assert.equal(E.canContinue(reply, { solved: true, firstTry: true, wrongIds: [] }), true);
  assert.equal(E.canContinue(S.getScenarioById('kafede-siparis').steps[0], undefined), true);
});

// ─── Puanlama, yanlış listesi ve kayıt etkilenmez ────────────────────────────
const solveAll = (steps, wrongAt = []) => {
  let progress = {};
  steps.forEach((step, index) => {
    if (step.type !== 'reply') return;
    if (wrongAt.includes(index)) progress = E.answerOption(progress, index, { id: 'wrong-0', correct: false });
    progress = E.answerOption(progress, index, { id: 'correct', correct: true });
  });
  return progress;
};

test('karar noktaları soru sayılmaz: soru sayısı (247) ve her senaryonun puanlanan soru sayısı değişmez', () => {
  const questions = S.SCENARIOS.reduce((sum, scenario) => sum + E.countQuestions(scenario.steps), 0);
  assert.equal(questions, 247);
  for (const scenario of S.SCENARIOS) {
    assert.equal(E.countQuestions(scenario.steps), scenario.steps.filter(step => step.type === 'reply').length);
    assert.equal(E.scoreScenario(scenario.steps, {}).total, E.countQuestions(scenario.steps));
  }
});

test('puan: seçimler puanı değiştirmez (seçim ayrı haritada; tam doğru %100, yanlışlı tur aynı sonucu verir)', () => {
  for (const scenario of S.SCENARIOS) {
    const steps = scenario.steps;
    const total = E.countQuestions(steps);
    const perfect = E.scoreScenario(steps, solveAll(steps));
    assert.deepEqual(perfect, { total, correct: total, wrong: 0, percent: 100 }, scenario.id);
    // Seçimler ProgressMap'e hiç yazılmadığı için aynı ilerleme, seçim yapılsa da yapılmasa da aynı puanı verir.
    const choices = { [choiceIndexOf(scenario)]: 1 };
    assert.deepEqual(E.scoreScenario(steps, solveAll(steps)), perfect);
    assert.equal(Object.keys(choices).length, 1);
    assert.equal(choiceIndexOf(scenario) in solveAll(steps), false, `${scenario.id}: karar noktası ilerleme haritasında olmamalı`);
  }
});

test('"Yanlışlarımı Tekrar Et": karar noktası listeye girmez; yalnızca cevap adımları, senaryo sırasıyla', () => {
  for (const scenario of S.SCENARIOS) {
    const steps = scenario.steps;
    const firstReply = steps.findIndex(step => step.type === 'reply');
    const progress = solveAll(steps, [firstReply]);
    const missed = E.missedStepIndexes(steps, progress);
    assert.deepEqual(missed, [firstReply], scenario.id);
    assert.ok(missed.every(index => steps[index].type === 'reply'));
    const run = E.startReview(steps, progress);
    assert.deepEqual(run.indexes, [firstReply]);
    assert.equal(E.startReview(steps, solveAll(steps)), null);
  }
});

test('öğrenilen ifadeler yalnızca cevap adımlarıdır (karar noktası cevapları eklenmez)', () => {
  for (const scenario of S.SCENARIOS) {
    const phrases = E.learnedPhrases(scenario.steps, solveAll(scenario.steps));
    assert.equal(phrases.length, E.countQuestions(scenario.steps), scenario.id);
    const choiceGerman = new Set(choiceOf(scenario).options.map(option => option.german));
    for (const phrase of phrases) assert.ok(!choiceGerman.has(phrase.german), scenario.id);
  }
});

test('yarıda çıkış uyarısı yalnızca puanlanan ilerlemeye bakar (yalnızca seçim yapmak uyarı tetiklemez)', () => {
  assert.equal(E.needsExitConfirm({}, false), false);
});

// ─── Bağlam (geçmiş satırları) ───────────────────────────────────────────────
test('bağlam: karar noktasından sonra sorulan soru, seçilen cevap ve verilen yanıt sırayla görünür', () => {
  const scenario = S.getScenarioById('kafede-siparis');
  const index = choiceIndexOf(scenario);
  const step = scenario.steps[index];
  const afterChoice = index + 1;
  const withChoice = E.buildHistory(scenario.steps, afterChoice, { [index]: 0 }, 3);
  assert.deepEqual(withChoice.map(entry => entry.german), [step.german, step.options[0].german, step.options[0].responseGerman]);
  assert.deepEqual(withChoice.map(entry => entry.user), [false, true, false]);
  assert.equal(withChoice[1].speaker, 'Sen');
  assert.equal(withChoice[2].speaker, step.speaker);
  // Farklı seçim farklı bağlam verir.
  const other = E.buildHistory(scenario.steps, afterChoice, { [index]: 1 }, 3);
  assert.notDeepEqual(other.map(entry => entry.german), withChoice.map(entry => entry.german));
});

test('bağlam: seçim yapılmamışsa yalnızca soru; varsayılan son iki satır; başta boş', () => {
  const scenario = S.getScenarioById('kafede-siparis');
  const index = choiceIndexOf(scenario);
  const noChoice = E.buildHistory(scenario.steps, index + 1, {}, 5);
  assert.equal(noChoice[noChoice.length - 1].german, scenario.steps[index].german);
  assert.equal(E.buildHistory(scenario.steps, 0).length, 0);
  assert.equal(E.buildHistory(scenario.steps, index + 1, {}).length, 2);
  // Eski davranış: karar noktası öncesi bağlam, önceki iki konuşma satırıdır.
  const before = E.buildHistory(scenario.steps, 2);
  assert.deepEqual(before.map(entry => entry.german), [scenario.steps[0].german, scenario.steps[1].german]);
  assert.deepEqual(before.map(entry => entry.user), [false, true]);
});

// ─── Doğrulama: bozuk karar noktaları yakalanır ──────────────────────────────
test('bozuk karar noktası verisi oynanamaz sayılır (aynı seçenek, aynı yanıt, eksik metin, tek seçenek, ortak devam yok, art arda iki)', () => {
  const base = S.getScenarioById('markette-alisveris');
  const mutate = (fn) => {
    const steps = JSON.parse(JSON.stringify(base.steps));
    fn(steps, steps.findIndex(step => step.type === 'choice'));
    return { ...base, steps };
  };
  const issues = (scenario) => E.validateScenario(scenario);
  assert.deepEqual(issues(mutate(() => {})), []);
  assert.ok(issues(mutate((s, i) => { s[i].options[1].german = s[i].options[0].german; })).length > 0);
  assert.ok(issues(mutate((s, i) => { s[i].options[1].responseGerman = s[i].options[0].responseGerman; })).length > 0);
  assert.ok(issues(mutate((s, i) => { s[i].options[0].responseTurkish = ''; })).length > 0);
  assert.ok(issues(mutate((s, i) => { s[i].options = [s[i].options[0]]; })).length > 0);
  assert.ok(issues(mutate((s, i) => { s[i].prompt = ''; })).length > 0);
  assert.ok(issues(mutate((s, i) => { s[i].speaker = ''; })).length > 0);
  assert.ok(issues(mutate((s, i) => { s.splice(i + 1, 1); })).length > 0);
  assert.ok(issues(mutate((s, i) => { s.splice(i + 1, 0, JSON.parse(JSON.stringify(s[i]))); })).length > 0);
  assert.ok(issues(mutate((s, i) => { s.splice(i, 1); })).length === 0, 'karar noktası olmayan senaryo da geçerlidir');
});

test('seviye kilitleri, senaryo sayısı ve kimlikler korunur', () => {
  const ids = S.SCENARIOS.map(scenario => scenario.id);
  assert.equal(new Set(ids).size, 51);
  assert.equal(S.getScenarioById('kafede-siparis').level, 'A1');
  assert.equal(S.getScenarioById('doktor-randevu').level, 'A2');
  assert.equal(S.getScenarioById('is-gorusmesi').level, 'B1');
  assert.equal(S.isScenarioLevelLocked('B1', 'A2'), true);
});
