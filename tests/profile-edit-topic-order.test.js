// @utils: profile-name, topic-order
// Görünen ad doğrulaması ve konu sıralaması (saf fonksiyonlar). Ekran ve depolama kapsam dışıdır.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const { validateProfileName, PROFILE_NAME_MAX_LENGTH } = require(path.join(out, 'utils', 'profile-name.js'));
const { moveTopicFirst } = require(path.join(out, 'utils', 'topic-order.js'));

test('boş ve yalnızca boşluktan oluşan ad reddedilir', () => {
  assert.equal(validateProfileName('').ok, false);
  assert.equal(validateProfileName('   \n ').ok, false);
});

test('ad kırpılır ve ardışık boşluklar tek boşluğa iner', () => {
  assert.deepEqual(validateProfileName('  Ayşe   Yılmaz '), { ok: true, name: 'Ayşe Yılmaz' });
});

test('en fazla uzunluk aşılırsa reddedilir', () => {
  assert.equal(validateProfileName('a'.repeat(PROFILE_NAME_MAX_LENGTH)).ok, true);
  assert.equal(validateProfileName('a'.repeat(PROFILE_NAME_MAX_LENGTH + 1)).ok, false);
});

test('moveTopicFirst hedef konuyu başa alır, diğerlerinin sırasını korur ve girdiyi değiştirmez', () => {
  const topics = [{ id: 'a' }, { id: 'b' }, { id: 'goethe' }, { id: 'c' }];
  const result = moveTopicFirst(topics, 'goethe');
  assert.deepEqual(result.map(t => t.id), ['goethe', 'a', 'b', 'c']);
  assert.deepEqual(topics.map(t => t.id), ['a', 'b', 'goethe', 'c']);
});

test('moveTopicFirst: konu yoksa veya zaten başta ise sıra değişmez', () => {
  const topics = [{ id: 'goethe' }, { id: 'a' }];
  assert.deepEqual(moveTopicFirst(topics, 'goethe').map(t => t.id), ['goethe', 'a']);
  assert.deepEqual(moveTopicFirst(topics, 'yok').map(t => t.id), ['goethe', 'a']);
  assert.deepEqual(moveTopicFirst([], 'goethe'), []);
});
