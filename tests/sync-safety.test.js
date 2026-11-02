// Veri kaybını önleme ve senkron birleştirme kuralları için birim testleri (`npm test`).
// @utils: progress-merge, signout-plan
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const load = (name) => require(path.join(out, 'utils', `${name}.js`));

const {
  mergeProgress, mergeCustomWordProgress, normalizeMastery, normalizeTimestamp, MAX_FUTURE_SKEW_MS,
} = load('progress-merge');
const { buildSignOutPlan, countLocalOnlyProgress } = load('signout-plan');

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const H = 3600 * 1000;
const word = (id, extra = {}) => ({
  id, german: 'Apfel', article: 'der', turkish: 'elma', addedAt: 1, masteryLevel: 0, isCustom: true, ...extra,
});

// ─── mergeProgress: temel kurallar ──────────────────────────────────────────

test('daha yeni last_reviewed kazanır (yerel yeni)', () => {
  const r = mergeProgress({ masteryLevel: 2, lastReviewed: NOW - H }, { masteryLevel: 1, lastReviewed: NOW - 2 * H }, NOW);
  assert.equal(r.source, 'local');
  assert.equal(r.state.masteryLevel, 2);
});

test('daha yeni last_reviewed kazanır (bulut yeni)', () => {
  const r = mergeProgress({ masteryLevel: 3, lastReviewed: NOW - 3 * H }, { masteryLevel: 1, lastReviewed: NOW - H }, NOW);
  assert.equal(r.source, 'cloud');
  assert.equal(r.state.masteryLevel, 1);
});

test('"yüksek seviye kazanır" DEĞİL: yeni ama düşük seviye (yanlış cevap) eski yüksek seviyeyi geçer', () => {
  const r = mergeProgress({ masteryLevel: 1, lastReviewed: NOW }, { masteryLevel: 3, lastReviewed: NOW - H }, NOW);
  assert.equal(r.state.masteryLevel, 1);
  assert.equal(r.source, 'local');
});

test('zaman damgası eşitse yüksek seviye kazanır ve sıra fark etmez', () => {
  const a = { masteryLevel: 1, lastReviewed: NOW - H };
  const b = { masteryLevel: 3, lastReviewed: NOW - H };
  assert.equal(mergeProgress(a, b, NOW).state.masteryLevel, 3);
  assert.equal(mergeProgress(b, a, NOW).state.masteryLevel, 3);
  assert.equal(mergeProgress(a, a, NOW).source, 'same');
});

test('birleştirme değişmeli: iki taraf aynı sonuca yakınsar', () => {
  const x = { masteryLevel: 2, lastReviewed: NOW - H };
  const y = { masteryLevel: 0, lastReviewed: NOW - 30 * 60 * 1000 };
  assert.deepEqual(mergeProgress(x, y, NOW).state, mergeProgress(y, x, NOW).state);
});

// ─── Eksik ve geçersiz tarihler ─────────────────────────────────────────────

test('geçersiz/eksik tarih "bilinmiyor" sayılır; geçerli tarih taşıyan taraf kazanır', () => {
  const valid = { masteryLevel: 2, lastReviewed: NOW - H };
  for (const bad of [undefined, null, 0, -5, NaN, Infinity, 'abc', '', Date.UTC(1999, 0, 1), Date.UTC(2019, 11, 31)]) {
    const withBadLocal = mergeProgress({ masteryLevel: 3, lastReviewed: bad }, valid, NOW);
    assert.equal(withBadLocal.source, 'cloud', `yerel tarih ${String(bad)}`);
    assert.equal(withBadLocal.state.masteryLevel, 2);
    const withBadCloud = mergeProgress(valid, { masteryLevel: 3, lastReviewed: bad }, NOW);
    assert.equal(withBadCloud.source, 'local', `bulut tarih ${String(bad)}`);
  }
});

test('iki taraf da tarihsizse bulut değeri korunur', () => {
  const r = mergeProgress({ masteryLevel: 3 }, { masteryLevel: 1 }, NOW);
  assert.equal(r.source, 'cloud');
  assert.equal(r.state.masteryLevel, 1);
});

test('ISO metin tarihi desteklenir', () => {
  assert.equal(normalizeTimestamp('2026-11-01T10:00:00Z', NOW), Date.UTC(2026, 10, 1, 10));
  assert.equal(normalizeTimestamp('çöp', NOW), undefined);
});

test('ileri tarihli damga şimdiye çekilir; küçük saat sapması korunur', () => {
  assert.equal(normalizeTimestamp(NOW + 24 * H, NOW), NOW);
  assert.equal(normalizeTimestamp(NOW + MAX_FUTURE_SKEW_MS - 1, NOW), NOW + MAX_FUTURE_SKEW_MS - 1);
  // Saati ileri cihazın kaydı, gerçek yeni bir tekrarın önüne geçemez (şimdiye çekilir).
  const skewed = mergeProgress({ masteryLevel: 3, lastReviewed: NOW + 30 * 24 * H }, { masteryLevel: 1, lastReviewed: NOW - 1000 }, NOW);
  assert.equal(skewed.state.lastReviewed, NOW);
});

test('seviye normalleştirilir (0-3 tam sayı, geçersiz → 0)', () => {
  assert.equal(normalizeMastery(4), 3);
  assert.equal(normalizeMastery(-1), 0);
  assert.equal(normalizeMastery(NaN), 0);
  assert.equal(normalizeMastery(undefined), 0);
  assert.equal(normalizeMastery(2.6), 3);
  assert.equal(normalizeMastery('2'), 2);
});

// ─── Kişisel kelime senkron birleştirmesi (çevrimdışı ve iki cihaz) ─────────

const cloudMap = (...words) => new Map(words.map(w => [w.id, w]));

test('çevrimdışı cevap: yerel yeni ilerleme eski bulut verisi tarafından ezilmez ve buluta gönderilir', () => {
  const cloud = word('w', { masteryLevel: 1, lastReviewed: NOW - 5 * H });
  const result = mergeCustomWordProgress({
    cloudWords: cloudMap(cloud),
    localCustomWords: [word('w', { masteryLevel: 1, lastReviewed: NOW - 5 * H })],
    reviewStates: { w: { masteryLevel: 2, lastReviewed: NOW - H } },
    pendingUpsertIds: new Set(),
    now: NOW,
  });
  assert.equal(result.words.get('w').masteryLevel, 2);
  assert.equal(result.words.get('w').lastReviewed, NOW - H);
  assert.deepEqual(result.pushIds, ['w']);
});

test('bayat yerel reviewStates, başka cihazda yapılan daha yeni çalışmayı bastırmaz', () => {
  const cloud = word('w', { masteryLevel: 3, lastReviewed: NOW - H });
  const result = mergeCustomWordProgress({
    cloudWords: cloudMap(cloud),
    localCustomWords: [word('w', { masteryLevel: 1, lastReviewed: NOW - 48 * H })],
    reviewStates: { w: { masteryLevel: 1, lastReviewed: NOW - 48 * H } },
    pendingUpsertIds: new Set(),
    now: NOW,
  });
  assert.equal(result.words.get('w').masteryLevel, 3);
  assert.equal(result.reviewStates.w.masteryLevel, 3);
  assert.equal(result.reviewStatesChanged, true);
  assert.deepEqual(result.pushIds, []);
});

test('yeni ama düşük seviyeli yerel cevap (yanlış) buluttaki eski yüksek seviyeyi geçer', () => {
  const result = mergeCustomWordProgress({
    cloudWords: cloudMap(word('w', { masteryLevel: 3, lastReviewed: NOW - 24 * H })),
    localCustomWords: [word('w')],
    reviewStates: { w: { masteryLevel: 2, lastReviewed: NOW - H } },
    pendingUpsertIds: new Set(),
    now: NOW,
  });
  assert.equal(result.words.get('w').masteryLevel, 2);
  assert.deepEqual(result.pushIds, ['w']);
});

test('bekleyen yerel yazması olan kelimeye dokunulmaz', () => {
  const cloud = word('w', { masteryLevel: 3, lastReviewed: NOW });
  const result = mergeCustomWordProgress({
    cloudWords: cloudMap(cloud),
    localCustomWords: [word('w')],
    reviewStates: { w: { masteryLevel: 0, lastReviewed: NOW - H } },
    pendingUpsertIds: new Set(['w']),
    now: NOW,
  });
  assert.equal(result.words.get('w'), cloud); // aynı nesne: değişmedi
  assert.equal(result.reviewStatesChanged, false);
});

test('bu cihazda geçmişi olmayan kelime buluttaki değeri alır; reviewStates eklenmez', () => {
  const result = mergeCustomWordProgress({
    cloudWords: cloudMap(word('new', { masteryLevel: 2, lastReviewed: NOW - H })),
    localCustomWords: [],
    reviewStates: {},
    pendingUpsertIds: new Set(),
    now: NOW,
  });
  assert.equal(result.words.get('new').masteryLevel, 2);
  assert.equal(result.reviewStatesChanged, false);
});

test('yalnızca kelime alanında ilerlemesi olan yerel kopya da karşılaştırılır', () => {
  const result = mergeCustomWordProgress({
    cloudWords: cloudMap(word('w', { masteryLevel: 0 })), // bulutta tarih yok
    localCustomWords: [word('w', { masteryLevel: 2, lastReviewed: NOW - H })],
    reviewStates: {},
    pendingUpsertIds: new Set(),
    now: NOW,
  });
  assert.equal(result.words.get('w').masteryLevel, 2);
  assert.deepEqual(result.pushIds, ['w']);
});

test('geçersiz bulut tarihi yerel geçerli ilerlemeyi ezmez', () => {
  const result = mergeCustomWordProgress({
    cloudWords: cloudMap(word('w', { masteryLevel: 3, lastReviewed: Date.UTC(1970, 0, 1) })),
    localCustomWords: [word('w')],
    reviewStates: { w: { masteryLevel: 1, lastReviewed: NOW - H } },
    pendingUpsertIds: new Set(),
    now: NOW,
  });
  assert.equal(result.words.get('w').masteryLevel, 1);
});

test('birleştirme kararlıdır: aynı girdiyle ikinci kez çalışınca değişiklik çıkmaz', () => {
  const input = {
    cloudWords: cloudMap(word('w', { masteryLevel: 3, lastReviewed: NOW - H })),
    localCustomWords: [word('w')],
    reviewStates: { w: { masteryLevel: 1, lastReviewed: NOW - 48 * H } },
    pendingUpsertIds: new Set(),
    now: NOW,
  };
  const first = mergeCustomWordProgress(input);
  const second = mergeCustomWordProgress({ ...input, reviewStates: first.reviewStates, cloudWords: first.words });
  assert.equal(second.reviewStatesChanged, false);
  assert.deepEqual(second.pushIds, []);
});

test('kişisel olmayan (statik) kelimeye birleştirme dokunmaz', () => {
  const result = mergeCustomWordProgress({
    cloudWords: cloudMap(word('s', { isCustom: false, masteryLevel: 3, lastReviewed: NOW })),
    localCustomWords: [],
    reviewStates: { s: { masteryLevel: 0, lastReviewed: NOW - H } },
    pendingUpsertIds: new Set(),
    now: NOW,
  });
  assert.equal(result.reviewStatesChanged, false);
});

// ─── Çıkış uyarısı ──────────────────────────────────────────────────────────

test('yerelde kalan konu ilerlemesi yalnızca kişisel olmayan, tekrar edilmiş kayıtları sayar', () => {
  const reviewStates = {
    'goethe-a1-haus': { masteryLevel: 2, lastReviewed: NOW },
    'goethe-a1-tisch': { masteryLevel: 1, lastReviewed: NOW - H },
    'goethe-a1-yok': { masteryLevel: 0 }, // hiç tekrar edilmemiş
    custom1: { masteryLevel: 3, lastReviewed: NOW }, // kişisel kelime zaten buluta gider
  };
  assert.equal(countLocalOnlyProgress(reviewStates, [word('custom1')]), 2);
  assert.equal(countLocalOnlyProgress({}, []), 0);
  assert.equal(countLocalOnlyProgress(null, null), 0);
});

test('çıkış planı: ilerleme ve bekleyen yoksa sade onay, silme onayı gerekmez', () => {
  const plan = buildSignOutPlan(0, 0);
  assert.equal(plan.kind, 'plain');
  assert.equal(plan.needsDeleteConfirmation, false);
  assert.equal(plan.offerSync, false);
});

test('çıkış planı: yalnızca bekleyen değişiklik → senkron önerilir', () => {
  const plan = buildSignOutPlan(3, 0);
  assert.equal(plan.kind, 'pending');
  assert.equal(plan.offerSync, true);
  assert.match(plan.message, /3 değişiklik/);
});

test('çıkış planı: yalnızca konu ilerlemesi → kaybolacağı açıkça yazılır, senkron SUNULMAZ', () => {
  const plan = buildSignOutPlan(0, 12);
  assert.equal(plan.kind, 'progress');
  assert.equal(plan.needsDeleteConfirmation, true);
  assert.equal(plan.offerSync, false); // henüz buluta gönderilemez; "senkronize edildi" izlenimi verilmez
  assert.match(plan.message, /12 konu kelimesi/);
  assert.match(plan.message, /silinir/);
  assert.match(plan.message, /buluta kaydedilmiyor/);
});

test('çıkış planı: ikisi birden → senkron önerilir ama ilerlemenin silineceği de yazılır', () => {
  const plan = buildSignOutPlan(2, 5);
  assert.equal(plan.kind, 'both');
  assert.equal(plan.offerSync, true);
  assert.equal(plan.needsDeleteConfirmation, true);
  assert.match(plan.message, /2 değişiklik/);
  assert.match(plan.message, /5 konu kelimesi/);
  assert.match(plan.message, /silinir/);
});

test('çıkış planı geçersiz sayıları güvenle ele alır', () => {
  assert.equal(buildSignOutPlan(-3, NaN).kind, 'plain');
  assert.equal(buildSignOutPlan(0, 2.9).kind, 'progress');
});
