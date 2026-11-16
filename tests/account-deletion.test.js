// @utils: account-deletion, connectivity
// "Hesabımı Sil": sunucu işlevinin saf mantığı, istemci akışı, yalnızca-o-hesabın-yerel-verisi temizliği ve ekran/auth bağlantıları.
// GERÇEK mağaza kodu sahte AsyncStorage ile çalışır. Gerçek Supabase/GoTrue, Edge Function dağıtımı, ağ ve ekranın cihazda
// görünümü bu testlerin kapsamında DEĞİLDİR (sunucu işlevi dağıtılmadı).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createWorld } = require('./support/store-harness.js');

const ROOT = path.resolve(__dirname, '..');
const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const D = require(path.join(out, 'utils', 'account-deletion.js'));
const C = require(path.join(out, 'utils', 'connectivity.js'));

if (!Module._extensions['.ts']) {
  const ts = require(path.join(ROOT, 'node_modules', 'typescript'));
  Module._extensions['.ts'] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, filename);
  };
}
const H = require(path.join(ROOT, 'supabase', 'functions', 'delete-account', 'handler.ts'));
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const code = (source) => source.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';

// ─── Sunucu işlevi (handler.ts) ───────────────────────────────────────────────

function request({ method = 'POST', auth = 'Bearer valid.token.value', body = { confirm: H.CONFIRM_VALUE } } = {}) {
  const headers = {};
  if (auth !== null) headers.Authorization = auth;
  return new Request('https://example.invalid/functions/v1/delete-account', {
    method, headers, body: method === 'GET' || body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

function server({ user = { id: A }, verifyThrows = false, deleteThrows = false } = {}) {
  const calls = { verify: [], del: [], logs: [] };
  const deps = {
    verifyUser: async (token) => { calls.verify.push(token); if (verifyThrows) throw new Error('auth down'); return user; },
    deleteUser: async (id) => { calls.del.push(id); if (deleteThrows) throw new Error('db error with secret details'); },
    log: (event) => calls.logs.push(event),
  };
  return { calls, deps };
}

test('sunucu: geçerli belirteç + onay → yalnızca DOĞRULANAN kullanıcı silinir', async () => {
  const { calls, deps } = server();
  const response = await H.handleDeleteAccount(request(), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(calls.verify, ['valid.token.value']);
  assert.deepEqual(calls.del, [A]);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('sunucu: gövdede kullanıcı kimliği verilse bile yok sayılır; silinen yalnızca belirteçteki kullanıcıdır', async () => {
  const { calls, deps } = server({ user: { id: A } });
  const response = await H.handleDeleteAccount(request({ body: { confirm: H.CONFIRM_VALUE, userId: B, user_id: B, id: B } }), deps);
  assert.equal(response.status, 200);
  assert.deepEqual(calls.del, [A], 'başka bir kimlik silinemez');
});

test('sunucu: Authorization yok / bozuk → 401, doğrulama ve silme hiç çağrılmaz', async () => {
  for (const auth of [null, '', 'Bearer', 'Bearer ', 'Basic abc', 'bearer', 'Bearer a b', 'Bearer <script>']) {
    const { calls, deps } = server();
    const response = await H.handleDeleteAccount(request({ auth }), deps);
    assert.equal(response.status, 401, String(auth));
    assert.deepEqual(calls.verify, []);
    assert.deepEqual(calls.del, []);
  }
});

test('sunucu: geçersiz/süresi dolmuş/silinmiş kullanıcı belirteci (doğrulama null) → 401, silme yok', async () => {
  const { calls, deps } = server({ user: null });
  const response = await H.handleDeleteAccount(request(), deps);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { ok: false, error: 'unauthorized' });
  assert.deepEqual(calls.del, []);
});

test('sunucu: onay eksik/yanlış/bozuk gövde → 400 ve silme yok (doğrulamadan ÖNCE reddedilir)', async () => {
  for (const body of [{}, { confirm: true }, { confirm: 'yes' }, { confirm: 'delete_my_account' }, 'not json', '{"confirm":', '[]', 'null']) {
    const { calls, deps } = server();
    const response = await H.handleDeleteAccount(request({ body }), deps);
    assert.equal(response.status, 400, JSON.stringify(body));
    assert.deepEqual(await response.json(), { ok: false, error: 'confirmation-required' });
    assert.deepEqual(calls.del, []);
  }
});

test('sunucu: POST dışı yöntem 405 (GET ile silinemez); OPTIONS 204', async () => {
  for (const method of ['GET', 'DELETE', 'PUT']) {
    const { calls, deps } = server();
    const response = await H.handleDeleteAccount(request({ method }), deps);
    assert.equal(response.status, 405, method);
    assert.deepEqual(calls.del, []);
  }
  const preflight = await H.handleDeleteAccount(request({ method: 'OPTIONS' }), server().deps);
  assert.equal(preflight.status, 204);
});

test('sunucu: doğrulama servisi hatası → 503 ve silme yok; silme hatası → 500 ve iç ayrıntı sızmaz', async () => {
  const verifyDown = server({ verifyThrows: true });
  const first = await H.handleDeleteAccount(request(), verifyDown.deps);
  assert.equal(first.status, 503);
  assert.deepEqual(verifyDown.calls.del, []);

  const deleteDown = server({ deleteThrows: true });
  const second = await H.handleDeleteAccount(request(), deleteDown.deps);
  assert.equal(second.status, 500);
  const text = await second.text();
  assert.deepEqual(JSON.parse(text), { ok: false, error: 'delete-failed' });
  assert.doesNotMatch(text, /secret|db error|valid\.token/);
});

test('sunucu: günlük yalnızca olay adı taşır (belirteç, kimlik, e-posta yok)', async () => {
  const { calls, deps } = server();
  await H.handleDeleteAccount(request(), deps);
  await H.handleDeleteAccount(request({ auth: null }), deps);
  const failing = server({ deleteThrows: true });
  await H.handleDeleteAccount(request(), failing.deps);
  for (const log of [...calls.logs, ...failing.calls.logs]) assert.match(log, /^[a-z-]+$/);
});

test('sunucu: onay değeri istemciyle aynı; service_role yalnızca ortam değişkeninden okunur, uygulamada hiçbir yerde yok', () => {
  assert.equal(D.ACCOUNT_DELETE_CONFIRM_VALUE, H.CONFIRM_VALUE);
  const entry = read('supabase/functions/delete-account/index.ts');
  assert.match(entry, /Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)/);
  assert.doesNotMatch(entry, /eyJ[A-Za-z0-9_-]{10,}|sb_secret_/);
  assert.match(entry, /auth\.admin\.deleteUser\(userId, false\)/);
  assert.match(entry, /admin\.auth\.getUser\(accessToken\)/);
  // Uygulama kodu (RN) service_role anahtarını hiç anmaz.
  const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(entryItem => {
    const rel = path.join(dir, entryItem.name);
    if (entryItem.isDirectory()) return walk(rel);
    return /\.(ts|tsx)$/.test(entryItem.name) ? [rel] : [];
  });
  for (const dir of ['app', 'components', 'store', 'utils', 'hooks', 'constants', 'modules']) {
    for (const file of walk(dir)) {
      assert.doesNotMatch(code(read(file)), /service_role|SERVICE_ROLE|auth\.admin/i, file);
    }
  }
  assert.doesNotMatch(read('.env.example'), /SERVICE_ROLE\s*=\s*\S/);
});

// ─── İstemci akışı (utils/account-deletion.ts) ────────────────────────────────

function flow({ online = true, remote = async () => ({ ok: true }), wipe = async () => {}, end = async () => {} } = {}) {
  const log = [];
  const deps = {
    isOnline: async () => { log.push('online?'); return online; },
    revokeOwner: () => log.push('revoke'),
    restoreOwner: (id) => log.push(`restore:${id}`),
    remoteDelete: async () => { log.push('remote'); return remote(); },
    wipeLocal: async (id) => { log.push(`wipe:${id}`); return wipe(id); },
    endSession: async () => { log.push('end'); return end(); },
    clearSession: () => log.push('clear'),
  };
  return { log, deps };
}

test('akış: çevrimdışıyken HİÇBİR şey başlamaz (sahiplik, sunucu, yerel veri, oturum dokunulmaz)', async () => {
  const { log, deps } = flow({ online: false });
  const result = await D.runAccountDeletion(A, deps);
  assert.deepEqual(result, { ok: false, reason: 'offline', message: D.ACCOUNT_DELETION_MESSAGES.offline });
  assert.deepEqual(log, ['online?']);
});

test('akış: bağlantı kontrolü fırlatırsa çevrimdışı sayılır; oturum yoksa başlamaz', async () => {
  const { log, deps } = flow();
  deps.isOnline = async () => { throw new Error('x'); };
  assert.equal((await D.runAccountDeletion(A, deps)).reason, 'offline');
  assert.deepEqual(log, []);
  const none = flow();
  assert.equal((await D.runAccountDeletion(null, none.deps)).reason, 'no-session');
  assert.deepEqual(none.log, []);
});

test('akış: başarılı silme sırası — sahiplik, sunucu, yalnızca o hesabın yerel verisi, oturum kapanışı', async () => {
  const { log, deps } = flow();
  const result = await D.runAccountDeletion(A, deps);
  assert.deepEqual(result, { ok: true, localCleanupFailed: false });
  assert.deepEqual(log, ['online?', 'revoke', 'remote', `wipe:${A}`, 'end', 'clear']);
});

test('akış: sunucu silmesi başarısızsa yerel veri/oturum KORUNUR ve bildirim sahipliği geri yüklenir', async () => {
  for (const reason of ['network', 'unauthorized', 'unavailable', 'server']) {
    const { log, deps } = flow({ remote: async () => ({ ok: false, reason }) });
    const result = await D.runAccountDeletion(A, deps);
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.equal(result.message, D.ACCOUNT_DELETION_MESSAGES[reason]);
    assert.deepEqual(log, ['online?', 'revoke', 'remote', `restore:${A}`], reason);
  }
  const thrown = flow({ remote: async () => { throw new Error('boom'); } });
  assert.equal((await D.runAccountDeletion(A, thrown.deps)).reason, 'network');
  assert.deepEqual(thrown.log, ['online?', 'revoke', 'remote', `restore:${A}`]);
});

test('akış: sunucuda silindikten sonra yerel temizlik/oturum kaydı hatası oturumu yine kapatır ve bildirilir', async () => {
  const { log, deps } = flow({ wipe: async () => { throw new Error('disk'); }, end: async () => { throw new Error('auth'); } });
  const result = await D.runAccountDeletion(A, deps);
  assert.deepEqual(result, { ok: true, localCleanupFailed: true });
  assert.deepEqual(log, ['online?', 'revoke', 'remote', `wipe:${A}`, 'end', 'clear']);
});

test('akış: ağ mesajı sonucun belirsiz olduğunu dürüstçe söyler; diğer hata mesajları verinin durduğunu söyler', () => {
  assert.match(D.ACCOUNT_DELETION_MESSAGES.network, /doğrulanamadı/);
  for (const reason of ['offline', 'unauthorized', 'unavailable', 'server']) {
    assert.match(D.ACCOUNT_DELETION_MESSAGES[reason], /olduğu gibi duruyor/, reason);
  }
});

// ─── Sunucu yanıtının yorumlanması ────────────────────────────────────────────

test('yanıt: yalnızca açık { ok: true } başarıdır; belirsiz her sonuç başarısızlıktır', () => {
  assert.deepEqual(D.interpretDeleteResponse({ data: { ok: true }, error: null }), { ok: true });
  for (const result of [null, undefined, {}, { data: null, error: null }, { data: { ok: false } }, { data: 'ok' }, { data: { ok: 'true' } }]) {
    assert.deepEqual(D.interpretDeleteResponse(result), { ok: false, reason: 'server' }, JSON.stringify(result));
  }
});

test('yanıt: HTTP durumları ve ağ hataları doğru nedene eşlenir', () => {
  const http = (status) => D.interpretDeleteResponse({ data: null, error: { name: 'FunctionsHttpError', context: { status } } });
  assert.equal(http(401).reason, 'unauthorized');
  assert.equal(http(403).reason, 'unauthorized');
  assert.equal(http(404).reason, 'unavailable'); // işlev dağıtılmamış
  assert.equal(http(503).reason, 'unavailable');
  assert.equal(http(500).reason, 'server');
  assert.equal(http(400).reason, 'server');
  assert.equal(D.interpretDeleteResponse({ error: { name: 'FunctionsFetchError' } }).reason, 'network');
  assert.equal(D.interpretDeleteResponse({ error: { name: 'FunctionsRelayError' } }).reason, 'unavailable');
  assert.equal(D.interpretDeleteResponse({ error: new Error('x') }).reason, 'network');
});

// ─── Bağlantı kontrolü ───────────────────────────────────────────────────────

test('bağlantı: yalnızca sağlık ucuna GET atar; HTTP yanıtı = ulaşılabilir; hata/zaman aşımı/eksik ayar = ulaşılamaz', async () => {
  const seen = [];
  const ok = await C.isServerReachable('https://x.supabase.co/', 'pub', async (url, init) => { seen.push({ url, init }); return {}; });
  assert.equal(ok, true);
  assert.equal(seen[0].url, 'https://x.supabase.co/auth/v1/health');
  assert.equal(seen[0].init.method, 'GET');
  assert.deepEqual(seen[0].init.headers, { apikey: 'pub' });
  assert.equal(await C.isServerReachable('https://x.supabase.co', 'pub', async () => { throw new Error('offline'); }), false);
  assert.equal(await C.isServerReachable(undefined, 'pub', async () => ({})), false);
  assert.equal(await C.isServerReachable('https://x.supabase.co', undefined, async () => ({})), false);
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  assert.equal(await C.isServerReachable('https://x.supabase.co', 'pub', hang, 20), false);
});

// ─── Yalnızca bu hesabın yerel verisi ─────────────────────────────────────────

test('anahtar seçimi: kimliği tam parça olarak içeren Wortly anahtarları; başkaları, cihaz geneli ve Wortly dışı anahtarlar seçilmez', () => {
  const keys = [
    `@wortly:phrasebook:${A}`, `@wortly:achievements:${A}`, `@wortly:scenario-results:${A}`, `@wortly:review-reminder:${A}`,
    `@wortly:pronunciations:${A}`, `@wortly:pronunciations:${A}:kept`, `@wortly:pronunciations:${A}:corrupt`,
    `@wortly:parked:${A}:words:123`, `@wortly:parked:${A}:archive:456`, `@wortly:corrupt:@wortly:phrasebook:${A}:99`,
    `@wortly:phrasebook:${B}`, `@wortly:parked:${B}:words:1`, '@wortly:parked:__unknown__:words:1',
    '@wortly:theme-preference', '@wortly:handled-notification-taps', '@wortly:words', '@wortly:pending-changes', '@wortly:device-accounts',
    `sb-project-auth-token`, `other:${A}`,
  ];
  assert.deepEqual(D.selectAccountStorageKeys(keys, A).sort(), keys.slice(0, 10).sort());
  assert.deepEqual(D.selectAccountStorageKeys(keys, B).sort(), [`@wortly:phrasebook:${B}`, `@wortly:parked:${B}:words:1`].sort());
});

test('anahtar seçimi: güvensiz kimlikler (boş, kısa, UUID olmayan, ":" içeren) hiçbir anahtar seçmez', () => {
  const keys = [`@wortly:phrasebook:${A}`, '@wortly:words', '@wortly:a', '@wortly:parked:a:words:1'];
  for (const id of ['', 'a', 'words', '@wortly', 'phrasebook', `${A}:x`, null, undefined]) {
    assert.deepEqual(D.selectAccountStorageKeys(keys, id), [], String(id));
  }
});

test('bekleyen kayıtlar ve hesap geçmişi: yalnızca bu kullanıcı çıkarılır', () => {
  const pending = [
    { entity: 'word', id: '1', userId: A }, { entity: 'word', id: '2', userId: B }, { entity: 'profile', id: 'profile', userId: null },
  ];
  assert.deepEqual(D.removeUserPending(pending, A).map(item => item.id), ['2', 'profile']);
  assert.deepEqual(D.removeDeviceAccount([A, B], A), [B]);
  assert.deepEqual(D.removeDeviceAccount([B], A), [B]);
});

test('GERÇEK mağaza: purgeAccountStorage yalnızca A\'nın kayıtlarını siler; B, cihaz geneli ayar ve oturum anahtarı korunur', async () => {
  const world = createWorld();
  const app = world.boot();
  const disk = world.disk;
  const put = (key, value = '{}') => disk.set(key, value);
  const aKeys = [
    `@wortly:phrasebook:${A}`, `@wortly:achievements:${A}`, `@wortly:scenario-results:${A}`, `@wortly:review-reminder:${A}`,
    `@wortly:pronunciations:${A}`, `@wortly:pronunciations:${A}:kept`, `@wortly:parked:${A}:words:1`,
    `@wortly:corrupt:@wortly:phrasebook:${A}:5`,
  ];
  const keep = [
    `@wortly:phrasebook:${B}`, `@wortly:achievements:${B}`, `@wortly:parked:${B}:words:1`, '@wortly:theme-preference',
    '@wortly:handled-notification-taps', 'sb-test-auth-token',
  ];
  [...aKeys, ...keep].forEach(key => put(key));
  put('@wortly:pending-changes', JSON.stringify([
    { entity: 'word', id: 'a1', operation: 'upsert', userId: A, queuedAt: 1 },
    { entity: 'word', id: 'b1', operation: 'upsert', userId: B, queuedAt: 2 },
    { entity: 'session', id: 's0', operation: 'upsert', userId: null, queuedAt: 3 },
  ]));
  put('@wortly:device-accounts', JSON.stringify([A, B]));

  await app.store.purgeAccountStorage(A);

  for (const key of aKeys) assert.equal(disk.has(key), false, `silinmeliydi: ${key}`);
  for (const key of keep) assert.equal(disk.has(key), true, `korunmalıydı: ${key}`);
  assert.deepEqual(JSON.parse(disk.get('@wortly:pending-changes')).map(change => change.id), ['b1', 's0']);
  assert.deepEqual(JSON.parse(disk.get('@wortly:device-accounts')), [B]);
  await app.store.purgeAccountStorage(A); // tekrar çağrı zararsız
});

test('GERÇEK mağaza: A\'nın kelime/profil/oturum verisi resetLocal + purge ile gider; B hesabına geçince A\'nın verisi görünmez', async () => {
  const world = createWorld();
  const app = world.boot();
  world.cloud.session = A;
  await app.sync(A);
  await app.W.getState().addWord({ german: 'Haus', article: 'das', turkish: 'ev', isCustom: true });
  world.disk.set(`@wortly:phrasebook:${A}`, '[]');
  assert.ok(world.disk.has('@wortly:words'));

  world.cloud.session = null;
  await app.wipe();
  await app.store.purgeAccountStorage(A);

  assert.equal(world.disk.has('@wortly:words'), false);
  assert.equal(world.disk.has('@wortly:words-owner'), false);
  assert.equal(world.disk.has('@wortly:profile'), false);
  assert.equal(world.disk.has(`@wortly:phrasebook:${A}`), false);
  assert.equal(app.W.getState().words.length, 0);
});

test('GERÇEK mağaza: silme yazılamazsa purge HATA fırlatır (sessizce başarılı sayılmaz)', async () => {
  const world = createWorld();
  const app = world.boot();
  world.disk.set(`@wortly:phrasebook:${A}`, '[]');
  world.asyncStorage.faults.failRemove.add(`@wortly:phrasebook:${A}`);
  await assert.rejects(() => app.store.purgeAccountStorage(A), /Yerel temizlik tamamlanamadı: yerel kayıtlar/);
  await assert.rejects(() => app.store.purgeAccountStorage('not-a-uuid'), /Geçersiz/);
});

// ─── Bağlantılar (statik denetim) ─────────────────────────────────────────────

test('auth mağazası: silme sunucuda doğrulanır; kimlik gövdeden gönderilmez; yerel oturum ağ çağrısı olmadan kapanır', () => {
  const auth = read('store/auth.ts');
  assert.match(auth, /supabase\.functions\.invoke\('delete-account'/);
  assert.match(auth, /body: \{ confirm: ACCOUNT_DELETE_CONFIRM_VALUE \}/);
  assert.doesNotMatch(auth, /body: \{[^}]*(userId|user_id|id:)/);
  assert.match(auth, /signOut\(\{ scope: 'local' \}\)/);
  assert.match(auth, /purgeAccountStorage\(deletedUserId\)/);
  assert.match(auth, /isServerReachable\(/);
  // Yerel temizlik yalnızca silinen hesap için: tüm anahtarları süpüren çağrı yok.
  assert.doesNotMatch(code(auth + read('store/index.ts')), /AsyncStorage\.clear\(|multiRemove\(await AsyncStorage\.getAllKeys/);
});

test('ekran: profilde "Hesabımı Sil" girişi, onay kutusu, son uyarı ve başarısızlıkta veri korunur mesajı var', () => {
  assert.match(read('app/profile.tsx'), /router\.push\('\/hesabi-sil' as any\)/);
  assert.match(read('app/_layout.tsx'), /name="hesabi-sil"/);
  const screen = read('app/hesabi-sil.tsx');
  for (const pattern of [
    /accessibilityRole="checkbox"/, /disabled=\{!acknowledged \|\| busy\}/, /Hesabı kalıcı olarak sil\?/, /geri alınamaz/i,
    /İnternet bağlantısı gerekir/, /deleteAccount\(\)/, /replanReminders\(userId\)/, /router\.replace\('\/auth' as any\)/,
    /Hesap silinemedi/,
  ]) assert.match(screen, pattern);
  // Çift dokunma tek istek: meşgulken ikinci silme başlamaz.
  assert.match(screen, /if \(busyRef\.current\) return;/);
});

test('tsconfig yalnızca Deno giriş dosyasını dışarıda bırakır; handler.ts tür denetiminde kalır', () => {
  const config = JSON.parse(read('tsconfig.json'));
  assert.deepEqual(config.exclude, ['node_modules', 'supabase/functions/**/index.ts']);
});
