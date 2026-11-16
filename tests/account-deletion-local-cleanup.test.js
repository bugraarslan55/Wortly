// Hesap silme sonrası YEREL temizlik düzeltmeleri:
//  1) Profil resetLocal, hesap silerken yalnızca silinen kullanıcının bekleyen profil kaydını kaldırır (başkasınınki ve sahibi
//     bilinmeyen kayıt korunur); normal çıkıştaki davranış (tüm profil kayıtları) aynen kalır.
//  2) Telaffuz kaydı ve bildirim temizliği başarısızlığı "başarılı" gibi dönmez: tamamlanmayan temizlik `false` döner,
//     hesap silme akışı bunu `localCleanupFailed` olarak bildirir ve kullanıcıya eksik temizlik açıkça söylenir.
//
// Gerçek mağaza ve gerçek utils kodu çalışır; yalnızca native modüller (expo-file-system, expo-notifications, react-native...)
// ve AsyncStorage/Supabase sahte olarak verilir. Gerçek Supabase'e bağlanılmaz.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createWorld } = require('./support/store-harness');

const ROOT = path.resolve(__dirname, '..');
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

// ─── Native modül taklitleri (store-harness'in kurduğu yükleyiden ÖNCE devreye girer) ────────────────────────
const platform = { OS: 'ios' };
const files = { existing: new Set(), failDelete: new Set(), stuck: new Set(), deleted: [] };
class FakeFile {
  constructor(uri) { this.uri = uri; }
  get exists() { return files.existing.has(this.uri); }
  delete() {
    if (files.failDelete.has(this.uri)) throw new Error('silinemedi');
    if (files.stuck.has(this.uri)) return; // "başarılı" döner ama dosya yerinde kalır
    files.existing.delete(this.uri);
    files.deleted.push(this.uri);
  }
}
const notifications = {
  scheduled: [], presented: [], cancelled: [], dismissed: [], failSchedule: false, failPresented: false, failCancel: false, failDismiss: false,
};
const managed = (userId) => ({ type: 'daily-review', userId });
const fakeNotifications = {
  setNotificationHandler: () => undefined,
  getAllScheduledNotificationsAsync: async () => {
    if (notifications.failSchedule) throw new Error('liste okunamadı');
    return notifications.scheduled;
  },
  cancelScheduledNotificationAsync: async (id) => {
    if (notifications.failCancel) throw new Error('iptal edilemedi');
    notifications.cancelled.push(id);
  },
  getPresentedNotificationsAsync: async () => {
    if (notifications.failPresented) throw new Error('liste okunamadı');
    return notifications.presented;
  },
  dismissNotificationAsync: async (id) => {
    if (notifications.failDismiss) throw new Error('kaldırılamadı');
    notifications.dismissed.push(id);
  },
};
const stubs = {
  'react-native': { Platform: platform },
  'expo-audio': { createAudioPlayer: () => ({}) },
  'expo-file-system': { File: FakeFile, Directory: class {}, Paths: { document: '' } },
  'expo-constants': { __esModule: true, default: { executionEnvironment: 'bare' }, ExecutionEnvironment: { StoreClient: 'storeClient' } },
  'expo-notifications': fakeNotifications,
};
const loadBeforeStubs = Module._load;
Module._load = function stubbedLoad(request, parent, isMain) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
  return loadBeforeStubs.call(this, request, parent, isMain);
};

const reset = () => {
  platform.OS = 'ios';
  files.existing.clear(); files.failDelete.clear(); files.stuck.clear(); files.deleted.length = 0;
  Object.assign(notifications, { scheduled: [], presented: [], cancelled: [], dismissed: [], failSchedule: false, failPresented: false, failCancel: false, failDismiss: false });
};

const fileA1 = 'file:///docs/pronunciation-1-aaaa.m4a';
const fileA2 = 'file:///docs/pronunciation-2-aaab.m4a';
const fileB1 = 'file:///docs/pronunciation-3-bbbb.m4a';
const mapKey = (id) => `@wortly:pronunciations:${id}`;

/** Gerçek utils/pronunciation-storage.ts: sahte disk + sahte dosya sistemiyle. */
function bootPronunciation({ aMap = { w1: fileA1, w2: fileA2 }, bMap = { w9: fileB1 } } = {}) {
  reset();
  const world = createWorld();
  world.boot();
  if (aMap) world.disk.set(mapKey(A), typeof aMap === 'string' ? aMap : JSON.stringify(aMap));
  if (bMap) world.disk.set(mapKey(B), typeof bMap === 'string' ? bMap : JSON.stringify(bMap));
  for (const uri of [fileA1, fileA2, fileB1]) files.existing.add(uri);
  const storage = require(path.join(ROOT, 'utils', 'pronunciation-storage.ts'));
  return { world, storage };
}

/** Gerçek utils/review-reminder.ts: sahte expo-notifications ile. */
function bootReminders() {
  reset();
  createWorld().boot();
  notifications.scheduled = [
    { identifier: 'n1', content: { data: managed(A) } },
    { identifier: 'n2', content: { data: managed(B) } },
    { identifier: 'other-app', content: { data: { type: 'başka' } } },
  ];
  notifications.presented = [
    { request: { identifier: 'p1', content: { data: managed(A) } } },
    { request: { identifier: 'p-other', content: { data: { type: 'başka' } } } },
  ];
  return require(path.join(ROOT, 'utils', 'review-reminder.ts'));
}

// ─── 1) Bekleyen profil kayıtları ────────────────────────────────────────────────────────────────────────────

const pendingKey = '@wortly:pending-changes';
const seedPending = (world) => world.disk.set(pendingKey, JSON.stringify([
  { entity: 'profile', id: 'profile', operation: 'upsert', userId: A, queuedAt: 1 },
  { entity: 'profile', id: 'profile', operation: 'upsert', userId: B, queuedAt: 2 },
  { entity: 'profile', id: 'profile', operation: 'upsert', userId: null, queuedAt: 3 },
  { entity: 'word', id: 'w-b', operation: 'upsert', userId: B, queuedAt: 4 },
]));
const pendingLeft = (world) => JSON.parse(world.disk.get(pendingKey)).map(c => `${c.entity}:${c.userId ?? 'bilinmiyor'}`);

test('hesap silme: profil resetLocal yalnızca silinen kullanıcının bekleyen profil kaydını kaldırır; B ve sahibi bilinmeyen kayıt korunur', async () => {
  reset();
  const world = createWorld();
  const app = world.boot();
  seedPending(world);
  world.disk.set('@wortly:profile', '{}');

  await app.U.getState().resetLocal({ pendingOwnerId: A });

  assert.deepEqual(pendingLeft(world), ['profile:' + B, 'profile:bilinmiyor', 'word:' + B]);
  assert.equal(world.disk.has('@wortly:profile'), false, 'yerel profil yine silinir');
});

test('normal çıkış: profil resetLocal() davranışı değişmedi (tüm bekleyen profil kayıtları kaldırılır, diğer varlıklara dokunulmaz)', async () => {
  reset();
  const world = createWorld();
  const app = world.boot();
  seedPending(world);

  await app.U.getState().resetLocal();

  assert.deepEqual(pendingLeft(world), ['word:' + B]);
});

// ─── 2) Telaffuz kayıtları ───────────────────────────────────────────────────────────────────────────────────

test('telaffuz: hesap silme modunda A\'nın dosyaları ve haritası silinir, B\'ninkiler korunur; sonuç true', async () => {
  const { world, storage } = bootPronunciation();

  const complete = await storage.clearPronunciationRecordings(A, { strict: true });

  assert.equal(complete, true);
  assert.deepEqual(files.deleted.sort(), [fileA1, fileA2].sort());
  assert.equal(files.existing.has(fileB1), true);
  assert.equal(world.disk.has(mapKey(A)), false);
  assert.equal(world.disk.has(mapKey(B)), true);
});

test('telaffuz: dosya silinemezse (hata veya yerinde kalırsa) temizlik TAMAMLANMADI (false) döner', async () => {
  for (const mode of ['failDelete', 'stuck']) {
    const { storage } = bootPronunciation();
    files[mode].add(fileA2);
    assert.equal(await storage.clearPronunciationRecordings(A, { strict: true }), false, mode);
  }
});

test('telaffuz: harita okunamazsa hiçbir dosya silinmez ve false döner (çıkıştaki davranış da bu)', async () => {
  for (const strict of [true, false]) {
    const { world, storage } = bootPronunciation();
    world.asyncStorage.faults.failRead.add(mapKey(A));
    const complete = await storage.clearPronunciationRecordings(A, strict ? { strict: true } : undefined);
    assert.equal(complete, false);
    assert.deepEqual(files.deleted, []);
    assert.equal(world.disk.has(mapKey(A)), true, 'harita okunamadıysa silinmez');
  }
});

test('telaffuz: anahtar silinemezse false döner', async () => {
  const { world, storage } = bootPronunciation();
  world.asyncStorage.faults.failRemove.add(mapKey(A));
  assert.equal(await storage.clearPronunciationRecordings(A, { strict: true }), false);
});

test('telaffuz: dosya başka kullanıcının haritasında da geçiyorsa SİLİNMEZ ve temizlik eksik bildirilir', async () => {
  const { storage } = bootPronunciation({ bMap: { w9: fileB1, shared: fileA2 } });

  const complete = await storage.clearPronunciationRecordings(A, { strict: true });

  assert.equal(complete, false);
  assert.deepEqual(files.deleted, [fileA1]);
  assert.equal(files.existing.has(fileA2), true, 'başkasına ait olabilecek dosya korunur');
});

test('telaffuz: başka kullanıcının haritası okunamıyor veya bozuksa sahiplik doğrulanamaz: dosya silinmez, false döner', async () => {
  {
    const { world, storage } = bootPronunciation();
    world.asyncStorage.faults.failRead.add(mapKey(B));
    assert.equal(await storage.clearPronunciationRecordings(A, { strict: true }), false);
    assert.deepEqual(files.deleted, []);
  }
  {
    const { world, storage } = bootPronunciation({ bMap: '{bozuk json' });
    assert.equal(await storage.clearPronunciationRecordings(A, { strict: true }), false);
    assert.deepEqual(files.deleted, []);
    assert.equal(world.disk.get(mapKey(B)), '{bozuk json', 'başka kullanıcının verisine yazılmaz (yedek bile alınmaz)');
    assert.equal(world.disk.has(`${mapKey(B)}:corrupt`), false);
  }
});

test('telaffuz: kendi haritası bozuksa hangi dosyaların silineceği bilinemez: false döner', async () => {
  const { storage } = bootPronunciation({ aMap: '{bozuk json' });
  assert.equal(await storage.clearPronunciationRecordings(A, { strict: true }), false);
  assert.deepEqual(files.deleted, []);
});

test('telaffuz: çıkış (strict yok) davranışı aynı: başka haritaya bakmaz, A\'nın dosyalarını siler; web/misafir/kimliksiz true', async () => {
  const { world, storage } = bootPronunciation({ bMap: { shared: fileA2 } });
  world.asyncStorage.faults.failRead.add(mapKey(B)); // çıkışta başka kullanıcının haritası okunmaz

  const complete = await storage.clearPronunciationRecordings(A);

  assert.equal(complete, true);
  assert.deepEqual(files.deleted.sort(), [fileA1, fileA2].sort());
  assert.equal(await storage.clearPronunciationRecordings(null), true);
  assert.equal(await storage.clearPronunciationRecordings('guest'), true);
  platform.OS = 'web';
  assert.equal(await storage.clearPronunciationRecordings(A, { strict: true }), true);
});

test('telaffuz: dosya zaten yoksa (daha önce silinmiş) bu başarısızlık sayılmaz', async () => {
  const { storage } = bootPronunciation();
  files.existing.delete(fileA1);
  assert.equal(await storage.clearPronunciationRecordings(A, { strict: true }), true);
});

// ─── 3) Bildirimler ──────────────────────────────────────────────────────────────────────────────────────────

test('bildirim: temizlik başarılıysa true; Wortly bildirimleri iptal/kaldırılır, başka uygulamanınkine dokunulmaz', async () => {
  const reminders = bootReminders();

  assert.equal(await reminders.cancelReviewReminders(), true);

  assert.deepEqual(notifications.cancelled.sort(), ['n1', 'n2']);
  assert.deepEqual(notifications.dismissed, ['p1']);
});

test('bildirim: zamanlanmış bildirimler iptal edilemezse veya listelenemezse false döner (hata yutulmaz)', async () => {
  for (const fault of ['failCancel', 'failSchedule']) {
    const reminders = bootReminders();
    notifications[fault] = true;
    const originalWarn = console.warn;
    console.warn = () => undefined;
    try {
      assert.equal(await reminders.cancelReviewReminders(), false, fault);
    } finally {
      console.warn = originalWarn;
    }
  }
});

test('bildirim: bildirim merkezindeki bildirimler kaldırılamazsa false döner', async () => {
  for (const fault of ['failPresented', 'failDismiss']) {
    const reminders = bootReminders();
    notifications[fault] = true;
    const originalWarn = console.warn;
    console.warn = () => undefined;
    try {
      assert.equal(await reminders.cancelReviewReminders(), false, fault);
    } finally {
      console.warn = originalWarn;
    }
  }
});

test('bildirim: sahiplik hata olsa da senkron geri alınır (yeni planlama kurulamaz); bildirim desteklenmiyorsa (web) true', async () => {
  const reminders = bootReminders();
  notifications.failCancel = true;
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    reminders.setReminderOwner(A);
    const token = reminders.reminderGate.token(A);
    assert.ok(reminders.reminderGate.isValid(token));
    const pending = reminders.cancelReviewReminders();
    assert.equal(reminders.reminderGate.isValid(token), false, 'sahiplik senkron geri alınır');
    await pending;
  } finally {
    console.warn = originalWarn;
  }
  platform.OS = 'web';
  createWorld().boot();
  const web = require(path.join(ROOT, 'utils', 'review-reminder.ts'));
  assert.equal(web.isReminderSupported, false);
  assert.equal(await web.cancelReviewReminders(), true);
});

// ─── 4) Hesap silme akışına bağlantı (kullanıcıya bildirilir) ────────────────────────────────────────────────

const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

test('auth mağazası: hesap silmede telaffuz temizliği strict, profil sıfırlama kullanıcıya özel; false sonuçlar eksik temizlik sayılır', () => {
  const src = read('store', 'auth.ts');
  const body = src.slice(src.indexOf('deleteAccount: async'));
  assert.match(body, /useUserStore\.getState\(\)\.resetLocal\(\{ pendingOwnerId: deletedUserId \}\)/);
  assert.match(body, /clearPronunciationRecordings\(deletedUserId, \{ strict: true \}\)/);
  assert.match(body, /status === 'fulfilled' && step\.value === false/);
  // Çıkış akışı değişmedi.
  const signOut = src.slice(src.indexOf('signOut: async'), src.indexOf('deleteAccount: async'));
  assert.match(signOut, /useUserStore\.getState\(\)\.resetLocal\(\)/);
  assert.match(signOut, /clearPronunciationRecordings\(previousUserId\)/);
  assert.doesNotMatch(signOut, /strict/);
});

test('ekran: eksik yerel temizlik kullanıcıya tüm yerel verilerin silinmediğini açıkça söyler', () => {
  createWorld().boot(); // .ts yükleyicisini kurar
  const D = require(path.join(ROOT, 'utils', 'account-deletion.ts'));
  assert.match(D.ACCOUNT_DELETED_LOCAL_INCOMPLETE_MESSAGE, /tamamı silinemedi/);
  assert.match(D.ACCOUNT_DELETED_LOCAL_INCOMPLETE_MESSAGE, /uygulamayı .*kaldır/);
  const screen = read('app', 'hesabi-sil.tsx');
  assert.match(screen, /localCleanupFailed\s*\?\s*ACCOUNT_DELETED_LOCAL_INCOMPLETE_MESSAGE/);
});
