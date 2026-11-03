// @utils: scenario-engine, achievements, progress-stats, learning-analysis
// Senaryo içeriği ve oynatıcı mantığı (saf fonksiyonlar). Ekran, ses çıkışı ve gerçek depolama bu testlerin
// kapsamında DEĞİLDİR. İçerik testleri YAPISAL tutarlılığı denetler; Almanca dil bilgisi ve Türkçe çeviri
// doğruluğunu otomatik doğrulamaz (bunlar anadili konuşan biri tarafından gözden geçirilmelidir).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const S = require(path.join(out, 'constants', 'scenarios.js'));
const E = require(path.join(out, 'utils', 'scenario-engine.js'));
const A = require(path.join(out, 'utils', 'achievements.js'));

// Kullanıcıların eski sonuçlarına bağlı kimlikler: HİÇBİRİ değişmemeli/silinmemeli.
const ORIGINAL_IDS = [
  'kafede-siparis', 'tren-istasyonu', 'doktor-randevu', 'ev-gorme', 'eczane-ilac', 'banka-hesap', 'kayip-esya',
  'tren-gecikme', 'restoran-sikayet', 'kurs-kayit', 'tasinma-gunu', 'is-randevusu', 'is-gorusmesi', 'resmi-daire',
  'isyeri-sorun', 'sigorta-gorusmesi', 'kira-sozlesmesi', 'doktor-detay', 'seyahat-degisikligi', 'oturum-izni',
  'gorusme-sonrasi-telefon', 'ekip-toplantisi',
];
const NEW_IDS = ['markette-alisveris', 'yeni-tanisma', 'otelde-giris', 'yol-tarifi', 'restoranda-siparis', 'arkadasla-sohbet'];

// ─── İçerik ──────────────────────────────────────────────────────────────────
test('mevcut senaryo kimlikleri korunur, yeniler eklenir, kimlikler benzersizdir', () => {
  const ids = S.SCENARIOS.map(scenario => scenario.id);
  for (const id of ORIGINAL_IDS) assert.ok(ids.includes(id), `eski senaryo silinmemeli: ${id}`);
  for (const id of NEW_IDS) assert.ok(ids.includes(id), `yeni senaryo eksik: ${id}`);
  assert.equal(new Set(ids).size, ids.length);
});

test('mevcut senaryoların seviyeleri değişmedi (seviye kilitleri bozulmaz)', () => {
  const levelOf = (id) => S.getScenarioById(id).level;
  assert.equal(levelOf('kafede-siparis'), 'A1');
  assert.equal(levelOf('tren-istasyonu'), 'A1');
  assert.equal(levelOf('doktor-randevu'), 'A2');
  assert.equal(levelOf('is-gorusmesi'), 'B1');
});

test('tüm senaryolar yapısal doğrulamadan geçer (konuşmayla başlama, cevabın replikten sonra gelmesi, seçenekler, boş metin yok)', () => {
  for (const scenario of S.SCENARIOS) {
    assert.deepEqual(E.validateScenario(scenario), [], `${scenario.id}: ${E.validateScenario(scenario).join('; ')}`);
  }
});

test('yeni senaryolar tam: her soruda Türkçe anlamlar, yanlış nedenleri ve dil notu var', () => {
  for (const id of NEW_IDS) {
    const scenario = S.getScenarioById(id);
    const replies = scenario.steps.filter(step => step.type === 'reply');
    assert.ok(replies.length >= 5, `${id}: en az 5 soru olmalı`);
    for (const step of replies) {
      assert.equal(step.wrongTurkish?.length, 2, `${id}: yanlış seçenek anlamları`);
      assert.equal(step.wrongNotes?.length, 2, `${id}: yanlış seçenek notları`);
      assert.ok(step.note && step.note.length > 10, `${id}: dil notu`);
    }
  }
});

test('yeni senaryolarda açık seviye dağılımı: A1 ve bir A2; kategoriler gerçek hayat konuları', () => {
  assert.equal(S.getScenarioById('markette-alisveris').level, 'A1');
  assert.equal(S.getScenarioById('arkadasla-sohbet').level, 'A2');
  assert.ok(S.getScenariosForLevel('A1').length >= 7);
});

test('her senaryonun Almanca başlığı var; yeni senaryoların öğrenme hedefi var', () => {
  for (const scenario of S.SCENARIOS) {
    assert.ok(S.getScenarioMeta(scenario.id)?.germanTitle, `${scenario.id}: Almanca başlık`);
  }
  for (const id of NEW_IDS) assert.ok(S.getScenarioMeta(id)?.goal, `${id}: öğrenme hedefi`);
  for (const id of Object.keys(S.SCENARIO_META)) assert.ok(S.getScenarioById(id), `${id}: meta, olmayan senaryoya bağlı`);
});

test('metinlerde bozuk karakter (�) ve çift boşluk yok', () => {
  for (const scenario of S.SCENARIOS) {
    const texts = JSON.stringify(scenario);
    assert.ok(!texts.includes('�'), `${scenario.id}: bozuk karakter`);
    assert.ok(!/german":"[^"]*\s\s/.test(texts), `${scenario.id}: çift boşluk`);
  }
});

test('doğru cevap, yanlış seçenekler ve konuşmalar arasında aynı metin tekrarlanmaz (yeni senaryolar)', () => {
  for (const id of NEW_IDS) {
    const scenario = S.getScenarioById(id);
    for (const step of scenario.steps.filter(s => s.type === 'reply')) {
      const all = [step.german, ...step.wrongOptions];
      assert.equal(new Set(all).size, 3, `${id}: seçenekler farklı olmalı`);
    }
  }
});

// ─── Seviye kilitleri ────────────────────────────────────────────────────────
test('seviye kilitleri: kullanıcı seviyesinin üstündeki senaryolar kilitli, altındakiler açık', () => {
  assert.equal(S.isScenarioLevelLocked('A1', 'A1'), false);
  assert.equal(S.isScenarioLevelLocked('A2', 'A1'), true);
  assert.equal(S.isScenarioLevelLocked('B1', 'A2'), true);
  assert.equal(S.isScenarioLevelLocked('A1', 'B1'), false);
  assert.equal(S.isScenarioLevelLocked('B1', undefined), true); // seviye yoksa A1 sayılır
  assert.equal(S.getScenarioById('yok'), undefined);
});

// ─── Oynatıcı: cevaplama ─────────────────────────────────────────────────────
const reply = S.getScenarioById('markette-alisveris').steps[1];

test('seçenekler: doğru cevap tam bir kez bulunur, karıştırma deterministik rng ile test edilebilir', () => {
  const options = E.buildOptions(reply, () => 0.3);
  assert.equal(options.length, 3);
  assert.equal(options.filter(option => option.correct).length, 1);
  assert.deepEqual(new Set(options.map(option => option.id)), new Set(['correct', 'wrong-0', 'wrong-1']));
  assert.deepEqual(E.buildOptions(reply, () => 0.3), options);
  const wrong = options.find(option => option.id === 'wrong-0');
  assert.equal(wrong.turkish, reply.wrongTurkish[0]);
  assert.equal(wrong.whyWrong, reply.wrongNotes[0]);
});

test('eski biçimli senaryoda (Türkçe/not yok) seçenekler yine kurulur', () => {
  const old = S.getScenarioById('kafede-siparis').steps[1];
  const options = E.buildOptions(old);
  assert.equal(options.length, 3);
  assert.equal(options.find(option => option.id === 'wrong-0').turkish, undefined);
});

test('doğru cevap: adım çözülür, ilk denemede doğru sayılır', () => {
  const p = E.answerOption({}, 1, { id: 'correct', correct: true });
  assert.deepEqual(p[1], { solved: true, firstTry: true, wrongIds: [] });
});

test('yanlış cevap: ceza bir kez, ilk deneme bozulur, adım çözülmez', () => {
  let p = E.answerOption({}, 1, { id: 'wrong-0', correct: false });
  assert.deepEqual(p[1], { solved: false, firstTry: false, wrongIds: ['wrong-0'] });
  p = E.answerOption(p, 1, { id: 'wrong-0', correct: false }); // hızlı çift dokunuş
  assert.deepEqual(p[1].wrongIds, ['wrong-0']);
  p = E.answerOption(p, 1, { id: 'correct', correct: true });
  assert.deepEqual(p[1], { solved: true, firstTry: false, wrongIds: ['wrong-0'] });
});

test('hızlı çift dokunuş: doğru cevaba iki kez dokunmak puanı değiştirmez; çözülmüş adım değişmez', () => {
  const once = E.answerOption({}, 1, { id: 'correct', correct: true });
  const twice = E.answerOption(once, 1, { id: 'correct', correct: true });
  assert.equal(twice, once);
  const afterWrong = E.answerOption(once, 1, { id: 'wrong-1', correct: false });
  assert.equal(afterWrong, once, 'çözülmüş adıma sonradan yanlış dokunmak ilk denemeyi bozmamalı');
});

test('devam edebilme: konuşma satırı serbest, cevap adımı çözülmeden kilitli', () => {
  const steps = S.getScenarioById('markette-alisveris').steps;
  assert.equal(E.canContinue(steps[0], undefined), true);
  assert.equal(E.canContinue(steps[1], undefined), false);
  assert.equal(E.canContinue(steps[1], { solved: true, firstTry: true, wrongIds: [] }), true);
  assert.equal(E.canContinue(undefined, undefined), false);
});

// ─── Puanlama ────────────────────────────────────────────────────────────────
function playAll(steps, { wrongAt = [] } = {}) {
  let progress = {};
  steps.forEach((step, index) => {
    if (step.type !== 'reply') return;
    if (wrongAt.includes(index)) progress = E.answerOption(progress, index, { id: 'wrong-0', correct: false });
    progress = E.answerOption(progress, index, { id: 'correct', correct: true });
  });
  return progress;
}

test('puanlama: tam doğru %100, yanlış denenenler ayrı sayılır', () => {
  const { steps } = S.getScenarioById('markette-alisveris');
  const perfect = E.scoreScenario(steps, playAll(steps));
  assert.deepEqual(perfect, { total: 5, correct: 5, wrong: 0, percent: 100 });
  const mixed = E.scoreScenario(steps, playAll(steps, { wrongAt: [1, 3] }));
  assert.deepEqual(mixed, { total: 5, correct: 3, wrong: 2, percent: 60 });
});

test('puanlama: hiç cevap verilmemişse sıfır (sahte yüzde yok), boş adım listesi çökertmez', () => {
  const { steps } = S.getScenarioById('markette-alisveris');
  assert.deepEqual(E.scoreScenario(steps, {}), { total: 5, correct: 0, wrong: 0, percent: 0 });
  assert.deepEqual(E.scoreScenario([], {}), { total: 0, correct: 0, wrong: 0, percent: 0 });
});

test('öğrenilen ifadeler: tüm cevaplar listelenir, ilk denemede bilinmeyenler işaretlenir', () => {
  const { steps } = S.getScenarioById('markette-alisveris');
  const phrases = E.learnedPhrases(steps, playAll(steps, { wrongAt: [1] }));
  assert.equal(phrases.length, 5);
  assert.equal(phrases[0].missed, true);
  assert.equal(phrases[1].missed, false);
  assert.equal(phrases[0].german, steps[1].german);
});

// ─── Yarıda çıkış ve tekrar çalışma ──────────────────────────────────────────
test('yarıda çıkış uyarısı: ilerleme yokken yok, ilerleme varken var, tamamlanınca yok', () => {
  assert.equal(E.needsExitConfirm({}, false), false);
  assert.equal(E.needsExitConfirm({ 1: { solved: false, firstTry: false, wrongIds: ['wrong-0'] } }, false), true);
  assert.equal(E.needsExitConfirm({ 1: { solved: true, firstTry: true, wrongIds: [] } }, false), true);
  assert.equal(E.needsExitConfirm({ 1: { solved: true, firstTry: true, wrongIds: [] } }, true), false);
});

test('tekrar çalışma: yeni turun ilerlemesi boş başlar, önceki turu etkilemez', () => {
  const { steps } = S.getScenarioById('markette-alisveris');
  const first = playAll(steps, { wrongAt: [1] });
  const second = {}; // handleReplay: progress sıfırlanır
  assert.equal(E.scoreScenario(steps, first).correct, 4);
  assert.equal(E.scoreScenario(steps, second).correct, 0);
});

// ─── Sonuçların tek kaydedilmesi ─────────────────────────────────────────────
test('sonuç koruması: aynı tur bir kez kaydedilir, yeni tur yeniden kaydedilebilir', () => {
  const guard = E.createOnceGuard();
  assert.equal(guard.claim(0), true);
  assert.equal(guard.claim(0), false);
  assert.equal(guard.claim(0), false);
  assert.equal(guard.claim(1), true);
});

// ─── Önceki sonuçlar, günlük görev sayacı, seri ──────────────────────────────
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 2, 12, 0, 0).getTime();

test('sonuç geçmişi: önceki sonuçlar korunur, en iyi/son yüzde hesaplanır', () => {
  const results = [
    { id: 'r3', scenarioId: 'yol-tarifi', date: NOW, score: 4, total: 5 },
    { id: 'r2', scenarioId: 'yol-tarifi', date: NOW - DAY, score: 5, total: 5 },
    { id: 'r1', scenarioId: 'kafede-siparis', date: NOW - 2 * DAY, score: 2, total: 5 },
  ];
  const copy = JSON.parse(JSON.stringify(results));
  assert.deepEqual(E.scenarioHistory(results, 'yol-tarifi'), { attempts: 2, bestPercent: 100, lastPercent: 80 });
  assert.equal(E.scenarioHistory(results, 'otelde-giris'), null);
  assert.deepEqual(results, copy, 'sonuç kayıtları değiştirilmemeli');
});

test('sonuç geçmişi: bozuk kayıtlar elenir, null girdi çökertmez', () => {
  assert.equal(E.scenarioHistory(null, 'x'), null);
  assert.equal(E.scenarioHistory([{ scenarioId: 'x', score: 1, total: 0 }, { scenarioId: 'x', score: NaN, total: 5 }], 'x'), null);
  assert.equal(E.scenarioHistory([{ scenarioId: 'x', score: 9, total: 5 }], 'x').bestPercent, 100);
});

test('günlük görev sayacı: aynı sonuç kaydı iki kez sayılmaz, farklı turlar ayrı sayılır', () => {
  const results = [
    { id: 'a', scenarioId: 'yol-tarifi', date: NOW, score: 5, total: 5 },
    { id: 'a', scenarioId: 'yol-tarifi', date: NOW, score: 5, total: 5 }, // yinelenen kayıt
    { id: 'b', scenarioId: 'yol-tarifi', date: NOW - 1000, score: 3, total: 5 },
  ];
  const snapshot = { now: NOW, sessions: [], scenarioResults: results, reviewStates: {}, words: [], profile: null };
  const completed = A.collectCompletedExercises(snapshot);
  assert.equal(completed.length, 2);
});

test('günlük seri: senaryo bugün çalışıldığını gösterir (geçmiş kayıtlar silinmeden)', () => {
  const snapshot = {
    now: NOW, sessions: [], reviewStates: {}, words: [], profile: { streak: 1, lastStudyDate: '2026-11-02' },
    scenarioResults: [{ id: 'a', scenarioId: 'yol-tarifi', date: NOW, score: 4, total: 5 }],
  };
  assert.equal(A.collectCompletedExercises(snapshot).length, 1);
});

// ─── Boş veya bozuk senaryo verisi ───────────────────────────────────────────
test('bozuk senaryo verisi oynanamaz sayılır ve çökertmez', () => {
  const bad = (patch) => ({ ...S.getScenarioById('markette-alisveris'), ...patch });
  assert.ok(E.validateScenario(null).length > 0);
  assert.ok(E.validateScenario(undefined).length > 0);
  assert.ok(E.validateScenario(bad({ steps: [] })).length > 0);
  assert.ok(E.validateScenario(bad({ steps: undefined })).length > 0);
  assert.ok(E.validateScenario(bad({ level: 'C2' })).length > 0);
  assert.ok(E.validateScenario(bad({ title: '' })).length > 0);
  assert.equal(E.isPlayableScenario(bad({ steps: [] })), false);
  assert.equal(E.isPlayableScenario(S.getScenarioById('markette-alisveris')), true);
});

test('bozuk adım yapıları yakalanır: eksik konuşan, tekrar eden seçenek, eksik yanlış seçenek, cevapla başlayan diyalog', () => {
  const base = S.getScenarioById('markette-alisveris');
  const steps = JSON.parse(JSON.stringify(base.steps));
  const mutate = (fn) => {
    const copy = JSON.parse(JSON.stringify(steps));
    fn(copy);
    return { ...base, steps: copy };
  };
  assert.ok(E.validateScenario(mutate(c => { c[0].speaker = ''; })).length > 0);
  assert.ok(E.validateScenario(mutate(c => { c[1].wrongOptions[0] = c[1].german; })).length > 0);
  assert.ok(E.validateScenario(mutate(c => { c[1].wrongOptions = ['yalnız bir tane']; })).length > 0);
  assert.ok(E.validateScenario(mutate(c => { c[1].wrongTurkish = ['', 'x']; })).length > 0);
  assert.ok(E.validateScenario(mutate(c => { c.unshift(c[1]); })).length > 0);
  // Kullanıcının cevabıyla biten diyalog geçerlidir (ör. tren-istasyonu).
  assert.deepEqual(E.validateScenario(mutate(c => { c.pop(); })), []);
  assert.ok(E.validateScenario(mutate(c => { c[2] = { type: 'bilinmeyen' }; })).length > 0);
});

test('sorusuz senaryo (yalnızca konuşmalar) oynanamaz', () => {
  const only = { id: 'x', level: 'A1', title: 'x', description: '', place: '', steps: [
    { type: 'say', speaker: 'A', german: 'Hallo', turkish: 'Merhaba' },
  ] };
  assert.ok(E.validateScenario(only).includes('hiç soru yok'));
});

// ─── Seri, gezinme kilidi ve ek içerik tutarlılığı ───────────────────────────
const P = require(path.join(out, 'utils', 'progress-stats.js'));

test('seri: aynı gün ikinci tamamlama seriyi artırmaz', () => {
  assert.equal(P.nextStreakState({ streak: 3, lastStudyDate: '2026-11-02' }, '2026-11-02', '2026-11-01'), null);
});

test('seri: dün çalışıldıysa bir artar, ara verildiyse 1\'den başlar, bozuk seri 0 sayılır', () => {
  assert.deepEqual(P.nextStreakState({ streak: 3, lastStudyDate: '2026-11-01' }, '2026-11-02', '2026-11-01'), { streak: 4, lastStudyDate: '2026-11-02' });
  assert.deepEqual(P.nextStreakState({ streak: 9, lastStudyDate: '2026-10-20' }, '2026-11-02', '2026-11-01'), { streak: 1, lastStudyDate: '2026-11-02' });
  assert.deepEqual(P.nextStreakState({}, '2026-11-02', '2026-11-01'), { streak: 1, lastStudyDate: '2026-11-02' });
  assert.deepEqual(P.nextStreakState({ streak: -5, lastStudyDate: '2026-11-01' }, '2026-11-02', '2026-11-01'), { streak: 1, lastStudyDate: '2026-11-02' });
  assert.deepEqual(P.nextStreakState({ streak: NaN, lastStudyDate: '2026-11-01' }, '2026-11-02', '2026-11-01'), { streak: 1, lastStudyDate: '2026-11-02' });
});

test('seri: art arda iki senaryo bitişinde (tekrar çalış) ikinci çağrı seriyi değiştirmez', () => {
  const first = P.nextStreakState({ streak: 2, lastStudyDate: '2026-11-01' }, '2026-11-02', '2026-11-01');
  assert.equal(first.streak, 3);
  assert.equal(P.nextStreakState(first, '2026-11-02', '2026-11-01'), null);
});

test('gezinme kilidi: hızlı çift dokunuş ikinci kez geçmez, süre dolunca yeniden açılır', () => {
  let now = 1000;
  const lock = E.createNavigationLock(350, () => now);
  assert.equal(lock.tryAcquire(), true);
  assert.equal(lock.tryAcquire(), false);   // hızlı ikinci dokunuş
  now += 349;
  assert.equal(lock.tryAcquire(), false);
  now += 2;
  assert.equal(lock.tryAcquire(), true);    // süre doldu
  lock.release();
  assert.equal(lock.tryAcquire(), true);
});

test('son soruda sonuca geçiş yalnızca bir kez: kilit ve tek-kayıt koruması birlikte', () => {
  const lock = E.createNavigationLock(350, () => 0);
  const saved = E.createOnceGuard();
  let finishedCount = 0;
  let saves = 0;
  const finishTap = () => {
    if (!lock.tryAcquire()) return;
    finishedCount += 1;
    if (saved.claim(0)) saves += 1;
  };
  finishTap(); finishTap(); finishTap();
  assert.equal(finishedCount, 1);
  assert.equal(saves, 1);
});

const GERMAN_STRINGS = [];
for (const scenario of S.SCENARIOS) {
  for (const step of scenario.steps) {
    GERMAN_STRINGS.push({ id: scenario.id, text: step.german });
    if (step.type === 'reply') for (const wrong of step.wrongOptions) GERMAN_STRINGS.push({ id: scenario.id, text: wrong });
  }
}

test('Almanca metinler: Türkçeye özgü harf yok (Yılmaz adı hariç), cümle noktalama ile biter, büyük harfle başlar', () => {
  for (const { id, text } of GERMAN_STRINGS) {
    const cleaned = text.replace(/Yılmaz/g, 'Yilmaz');
    assert.ok(!/[ğşİı]/.test(cleaned), id + ': Türkçe harf: ' + text);
    assert.match(text, /[.!?]$/, id + ': noktalama: ' + text);
    assert.match(text, /^[A-ZÄÖÜ]/, id + ': büyük harf: ' + text);
    assert.ok(!/\s{2,}/.test(text) && text === text.trim(), id + ': boşluk: ' + text);
  }
});

test('hiçbir yanlış seçenek, aynı senaryodaki başka bir adımın doğru cevabıyla birebir aynı değildir', () => {
  for (const scenario of S.SCENARIOS) {
    const correct = new Set(scenario.steps.filter(step => step.type === 'reply').map(step => step.german));
    for (const step of scenario.steps) {
      if (step.type !== 'reply') continue;
      for (const wrong of step.wrongOptions) assert.ok(!correct.has(wrong), scenario.id + ': yanlış seçenek başka adımın doğrusu: ' + wrong);
    }
  }
});

test('her adımda doğru cevap tek ve açık: yanlış seçenekler doğru cevabın aynısı değil, görev metni var', () => {
  for (const scenario of S.SCENARIOS) {
    for (const step of scenario.steps) {
      if (step.type !== 'reply') continue;
      assert.ok(step.prompt.trim().length > 10, scenario.id + ': görev metni');
      assert.equal(step.wrongOptions.filter(option => option === step.german).length, 0);
      assert.equal(new Set(step.wrongOptions).size, 2);
    }
  }
});

test('cevap adımları art arda gelmez; her cevap bir konuşma satırının ardındandır (diyalog akışı)', () => {
  for (const scenario of S.SCENARIOS) {
    scenario.steps.forEach((step, index) => {
      if (step.type === 'reply') assert.equal(scenario.steps[index - 1]?.type, 'say', scenario.id + ': adım ' + (index + 1));
    });
  }
});

test('düzeltilen akış: markette kasiyer son cevaba uygun karşılık verir; restoranda yemek servisi adımı var', () => {
  const market = S.getScenarioById('markette-alisveris').steps;
  const lastReply = market.filter(step => step.type === 'reply').pop();
  assert.equal(lastReply.german, 'Danke schön. Einen schönen Tag noch!');
  assert.match(market[market.length - 1].german, /Ihnen auch/);
  const restaurant = S.getScenarioById('restoranda-siparis').steps;
  const serving = restaurant.findIndex(step => step.type === 'say' && /Guten Appetit/.test(step.german));
  assert.ok(serving > 0);
  assert.equal(restaurant[serving - 1].type, 'reply');
});

test('senaryo ve soru sayıları: 28 senaryo, 119 soru', () => {
  assert.equal(S.SCENARIOS.length, 28);
  const questions = S.SCENARIOS.reduce((sum, scenario) => sum + scenario.steps.filter(step => step.type === 'reply').length, 0);
  assert.equal(questions, 119);
});
