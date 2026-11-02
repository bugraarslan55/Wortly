// GERÇEK mağaza (store/index.ts) entegrasyon test donanımı.
//
// Ne yapar: repodaki GERÇEK TypeScript kaynaklarını (store/index.ts ve bağımlı utils/*.ts) Node'da çalıştırır
// (TypeScript API'siyle anında dönüştürerek; yeni paket yok). Yalnızca iki DIŞ bağımlılık değiştirilir:
//   - '@react-native-async-storage/async-storage' → bellekte kalıcı diske sahip, hata enjekte edilebilen sahte AsyncStorage
//   - '../utils/supabase'                         → kontrollü, bellekte sahte Supabase (gerçek ağ/hesap/production YOK)
// Zustand ve mağaza mantığı (reconcile, park, restore, sync, resetLocal, kuyruk, sahip anahtarları) gerçektir.
//
// Ne YAPMAZ: gerçek AsyncStorage (native) davranışı, gerçek Supabase/RLS, React bileşenleri ve ekranlar.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..', '..');
const ts = require(path.join(ROOT, 'node_modules', 'typescript'));

// ─── .ts yükleyici ───────────────────────────────────────────────────────────
let installed = false;
let current = null; // etkin dünya (disk + bulut)

function install() {
  if (installed) return;
  installed = true;
  globalThis.__DEV__ = false;

  Module._extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    module._compile(output, filename);
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@react-native-async-storage/async-storage') {
      return { __esModule: true, default: current.asyncStorage };
    }
    if (/(^|[\\/])utils[\\/]supabase$/.test(request)) {
      return { __esModule: true, supabase: current.supabase };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}

// ─── Sahte AsyncStorage ──────────────────────────────────────────────────────
const tick = () => new Promise(resolve => setImmediate(resolve));

function createAsyncStorage(disk) {
  const faults = {
    failWrite: new Set(),   // bu anahtarlara yazma hata verir
    failRemove: new Set(),  // bu anahtarları silme hata verir
    failRead: new Set(),    // bu anahtarları okuma hata verir
    failWriteMatch: [],     // adı bu düzenlere uyan anahtarlara yazma hata verir (ör. /parked/)
    dropWrite: new Set(),   // yazma "başarılı" görünür ama kaybolur
    crashAfter: null,       // n işlemden sonra TÜM işlemler hata verir ("süreç öldü")
  };
  let ops = 0;
  const gate = async (kind, key) => {
    ops += 1;
    if (faults.crashAfter !== null && ops > faults.crashAfter) throw new Error('süreç öldü');
    if (kind === 'read' && faults.failRead.has(key)) throw new Error('okuma hatası ' + key);
    if (kind === 'write' && (faults.failWrite.has(key) || faults.failWriteMatch.some(re => re.test(key)))) throw new Error('yazma hatası ' + key);
    if (kind === 'remove' && faults.failRemove.has(key)) throw new Error('silme hatası ' + key);
    await tick();
  };
  return {
    faults,
    opCount: () => ops,
    getItem: async (key) => { await gate('read', key); return disk.has(key) ? disk.get(key) : null; },
    setItem: async (key, value) => {
      await gate('write', key);
      if (faults.dropWrite.has(key)) return;
      disk.set(key, String(value));
    },
    removeItem: async (key) => { await gate('remove', key); disk.delete(key); },
    multiRemove: async (keys) => { for (const key of keys) await gate('remove', key); keys.forEach(key => disk.delete(key)); },
    getAllKeys: async () => { await gate('read', '*'); return [...disk.keys()]; },
  };
}

// ─── Sahte Supabase (kontrollü; gerçek ağ yok) ───────────────────────────────
function createCloud() {
  return {
    session: null,           // oturumdaki kullanıcı kimliği
    online: true,
    tables: { user_words: new Map(), study_sessions: new Map(), profiles: new Map() },
    calls: [],               // { table, op, userId, ids } — ağa giden her yazma kaydedilir
    failWrites: false,
    delayMs: 0,              // her bulut isteğine eklenen gecikme (yarış testleri için)
  };
}

function createSupabase(cloud) {
  const owner = (table, row) => (table === 'profiles' ? row.id : row.user_id);

  function builder(table) {
    const q = { table, op: 'select', filters: [], opts: null, payload: null, single: false, order: null };
    const exec = async () => {
      await tick();
      if (cloud.delayMs) await new Promise(resolve => setTimeout(resolve, cloud.delayMs));
      if (!cloud.online) return { data: null, count: null, error: { message: 'çevrimdışı' } };
      const store = cloud.tables[table];
      if (q.op === 'select') {
        let rows = [...store.values()].filter(row => q.filters.every(([col, value]) => row[col] === value));
        if (q.order) {
          const [col, asc] = q.order;
          rows = rows.sort((a, b) => (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1));
        }
        if (q.opts && q.opts.count === 'exact') return { data: null, count: rows.length, error: null };
        if (q.single) return { data: rows[0] ?? null, error: null };
        return { data: rows.map(row => ({ ...row })), error: null };
      }
      if (q.op === 'upsert') {
        if (cloud.failWrites) return { data: null, error: { message: 'yazma hatası' } };
        const rows = Array.isArray(q.payload) ? q.payload : [q.payload];
        if (rows.some(row => owner(table, row) !== cloud.session)) {
          cloud.calls.push({ table, op: 'upsert-reddedildi', userId: cloud.session, ids: rows.map(r => r.id) });
          return { data: null, error: { message: 'RLS: başka kullanıcı adına yazılamaz' } };
        }
        for (const row of rows) store.set(row.id, { created_at: new Date().toISOString(), ...store.get(row.id), ...row });
        cloud.calls.push({ table, op: 'upsert', userId: cloud.session, ids: rows.map(r => r.id) });
        return { data: null, error: null };
      }
      if (q.op === 'delete') {
        if (cloud.failWrites) return { data: null, error: { message: 'silme hatası' } };
        const targets = [...store.values()].filter(row => q.filters.every(([col, value]) => row[col] === value));
        for (const row of targets) store.delete(row.id);
        cloud.calls.push({ table, op: 'delete', userId: cloud.session, ids: targets.map(r => r.id) });
        return { data: null, error: null };
      }
      return { data: null, error: { message: 'bilinmeyen işlem' } };
    };
    const api = {
      select(_columns, opts) { if (q.op === 'select') q.opts = opts ?? null; return api; },
      upsert(payload) { q.op = 'upsert'; q.payload = payload; return api; },
      delete() { q.op = 'delete'; return api; },
      eq(col, value) { q.filters.push([col, value]); return api; },
      order(col, options) { q.order = [col, options?.ascending !== false]; return api; },
      maybeSingle() { q.single = true; return exec(); },
      then(resolve, reject) { return exec().then(resolve, reject); },
    };
    return api;
  }

  return {
    from: builder,
    auth: {
      getSession: async () => ({ data: { session: cloud.session ? { user: { id: cloud.session } } : null } }),
    },
  };
}

// ─── Dünya: kalıcı disk + bulut; her "boot" uygulamanın yeniden başlatılması ─────
function createWorld() {
  const disk = new Map();
  const cloud = createCloud();
  const world = {
    disk, cloud,
    asyncStorage: null,
    supabase: createSupabase(cloud),
    /** Uygulamayı (yeniden) başlatır: modül önbelleği temizlenir, gerçek mağaza aynı disk ve bulutla yeniden yüklenir. */
    boot() {
      install();
      current = world;
      world.asyncStorage = createAsyncStorage(disk);
      for (const key of Object.keys(require.cache)) {
        if (key.startsWith(ROOT) && !key.includes(path.sep + 'node_modules' + path.sep)) delete require.cache[key];
      }
      const store = require(path.join(ROOT, 'store', 'index.ts'));
      const ownership = require(path.join(ROOT, 'utils', 'data-ownership.ts'));
      const gate = require(path.join(ROOT, 'utils', 'access-gate.ts'));
      const isolation = require(path.join(ROOT, 'utils', 'data-isolation.ts'));
      const W = store.useWordStore;
      const U = store.useUserStore;
      const S = store.useSessionStore;
      return {
        store, W, U, S, ownership, gate, isolation, storage: world.asyncStorage,
        /** Açılışta yapılan yerel yüklemeler (auth'tan bağımsız). */
        async load() {
          await Promise.all([W.getState().loadWords(), U.getState().loadProfile(), S.getState().loadSessions()]);
        },
        /** Oturum açıldığında yapılan eşitlemeler (layout'taki gibi). */
        async sync(userId) {
          await Promise.all([U.getState().syncProfile(userId), W.getState().syncWords(userId), S.getState().syncSessions(userId)]);
        },
        /** Başarılı çıkış sonrası yerel temizlik (store/auth.ts -> wipeLocal ile aynı çağrılar). */
        async wipe() {
          await Promise.all([W.getState().resetLocal(), U.getState().resetLocal(), S.getState().resetLocal()]);
        },
        /** Layout kapısının GERÇEK mağaza durumuyla kararı. */
        gateFor(userId, { dataSynced = true, forceOpen = false } = {}) {
          const w = W.getState(); const u = U.getState(); const s = S.getState();
          return gate.computeAccessGate({
            userId, dataSynced, forceOpen,
            state: {
              profile: u.profile, profileOwner: u.profileOwner, wordsOwner: w.wordsOwner, wordCount: w.words.length,
              reviewOwner: w.reviewOwner, reviewCount: Object.keys(w.reviewStates).length,
              sessionsOwner: s.sessionsOwner, sessionCount: s.sessions.length,
            },
          });
        },
      };
    },
  };
  return world;
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = { createWorld, tick, sleep };
