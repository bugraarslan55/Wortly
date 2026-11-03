// Fail-closed bağlantı koruması: SAF karar mantığı testleri (henüz uygulamaya bağlı değil; tasarım doğrulaması).
// @utils: env-safety
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const E = require(path.join(out, 'utils', 'env-safety.js'));

const PROD = 'fakeprodref01';
const STAGE_URL = 'https://fakestageref2.supabase.co';
const PROD_URL = `https://${PROD}.supabase.co`;
const base = (extra = {}) => ({ isDev: true, url: STAGE_URL, appEnv: 'staging', productionRefs: PROD, ...extra });

test('YAYIN SÜRÜMÜ hiçbir koşulda engellenmez (production uygulaması ve mevcut hesaplar kilitlenmez)', () => {
  for (const extra of [{}, { url: PROD_URL }, { url: '' }, { appEnv: undefined, productionRefs: '' }, { url: null }]) {
    const verdict = E.evaluateConnection(base({ isDev: false, ...extra }));
    assert.equal(verdict.allow, true);
    assert.equal(verdict.mode, 'release');
    assert.equal(verdict.userMessage, null);
  }
});

test('geliştirme + production adresi: ortam işareti "staging" yazsa bile ENGELLENİR (işaret kanıt değildir)', () => {
  const verdict = E.evaluateConnection(base({ url: PROD_URL, appEnv: 'staging' }));
  assert.equal(verdict.allow, false);
  assert.equal(verdict.reason, 'is-production');
  assert.ok(verdict.userMessage.length > 20);
});

test('adres biçimi/büyük harf/sondaki eğik çizgi production karşılaştırmasını atlatamaz', () => {
  for (const url of [PROD_URL + '/', PROD_URL.toUpperCase().replace('HTTPS', 'https')]) {
    assert.equal(E.evaluateConnection(base({ url })).reason, 'is-production');
  }
  assert.equal(E.evaluateConnection(base({ productionRefs: ` ${PROD.toUpperCase()} , otherref12345 `, url: PROD_URL })).reason, 'is-production');
});

test('production kimliği bilinmiyorsa (karşılaştırma yapılamaz) FAIL-CLOSED: engellenir; yerel yığın hariç', () => {
  for (const productionRefs of [undefined, null, '', '  , ']) {
    const verdict = E.evaluateConnection(base({ productionRefs }));
    assert.equal(verdict.allow, false);
    assert.equal(verdict.reason, 'production-unknown');
  }
  const local = E.evaluateConnection(base({ url: 'http://127.0.0.1:54321', productionRefs: '' }));
  assert.equal(local.allow, true);
  assert.equal(local.mode, 'dev-local');
});

test('geçersiz/eksik adres engellenir', () => {
  for (const url of [undefined, null, '', 'abc', 'http://evil.example.com', 'https://example.com', 'https://x.supabase.co.evil.com']) {
    const verdict = E.evaluateConnection(base({ url }));
    assert.equal(verdict.allow, false, String(url));
    assert.equal(verdict.reason, 'invalid-url');
  }
});

test('production işaretli ya da işaretsiz geliştirme ortamı (production olmayan adresle bile) engellenir; staging/local izinli', () => {
  assert.equal(E.evaluateConnection(base({ appEnv: 'production' })).reason, 'marked-production');
  for (const appEnv of [undefined, '', 'prod', 'dev']) assert.equal(E.evaluateConnection(base({ appEnv })).reason, 'unmarked-environment');
  for (const appEnv of ['staging', 'LOCAL']) {
    const verdict = E.evaluateConnection(base({ appEnv }));
    assert.equal(verdict.allow, true);
    assert.equal(verdict.mode, 'dev-verified');
  }
});

test('bilinçli geçersiz kılma yalnızca geliştirmede ve açıkça verilince çalışır', () => {
  const verdict = E.evaluateConnection(base({ url: PROD_URL, allowProductionInDev: true }));
  assert.equal(verdict.allow, true);
  assert.equal(verdict.mode, 'dev-override');
  assert.equal(E.evaluateConnection(base({ url: PROD_URL, allowProductionInDev: false })).allow, false);
});

test('kullanıcı mesajları adres, anahtar veya proje kimliği içermez', () => {
  const cases = [{ url: PROD_URL }, { url: '' }, { productionRefs: '' }, { appEnv: 'production' }, { appEnv: undefined }];
  for (const extra of cases) {
    const verdict = E.evaluateConnection(base(extra));
    if (verdict.userMessage) assert.doesNotMatch(verdict.userMessage, /supabase\.co|https?:|sb_|eyJ|fakeprodref01|fakestageref2/i);
  }
});

test('projectRefOf / parseProductionRefs', () => {
  assert.equal(E.projectRefOf('https://abcdefghij1234.supabase.co'), 'abcdefghij1234');
  assert.equal(E.projectRefOf('http://localhost:54321'), 'local');
  assert.equal(E.projectRefOf('https://supabase.co'), null);
  assert.deepEqual(E.parseProductionRefs('A1b2c3d4e5f6, a1b2c3d4e5f6 ,x'), ['a1b2c3d4e5f6', 'x']);
});
