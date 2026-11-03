// @utils: sign-out-flow, reminder-guard
// Çıkış akışı ve bildirim sahipliği (saf mantık, sahte Supabase/depolama ile). Gerçek Supabase, ağ ve
// AsyncStorage çağrıları ve ekranlar bu testlerin kapsamında DEĞİLDİR.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const out = process.env.UTILS_OUT;
if (!out) throw new Error('UTILS_OUT tanımlı değil; testleri `npm test` ile çalıştırın.');
const F = require(path.join(out, 'utils', 'sign-out-flow.js'));
const G = require(path.join(out, 'utils', 'reminder-guard.js'));

function harness({ remote }) {
  const gate = G.createOwnerGate();
  gate.setOwner('a');
  const state = { wiped: false, sessionCleared: false, log: [] };
  const deps = {
    revokeOwner: () => { state.log.push('revoke'); gate.revoke(); },
    restoreOwner: (id) => { state.log.push(`restore:${id}`); gate.setOwner(id); },
    remoteSignOut: async () => { state.log.push('remote'); return remote(); },
    wipeLocal: async () => { state.log.push('wipe'); state.wiped = true; },
    clearSession: () => { state.log.push('clear'); state.sessionCleared = true; },
  };
  return { gate, state, deps };
}

test('başarılı çıkış: sahiplik önce geri alınır, sonra uzak çıkış, yerel temizlik ve oturum kapanır', async () => {
  const { gate, state, deps } = harness({ remote: async () => ({ error: null }) });
  const result = await F.runSignOut('a', deps);
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(state.log, ['revoke', 'remote', 'wipe', 'clear']);
  assert.equal(gate.getOwner(), null);
});

test('Supabase hata döndürürse (ağ hatası): oturum açık kalır, veri silinmez, sahiplik geri yüklenir', async () => {
  const { gate, state, deps } = harness({ remote: async () => ({ error: new Error('Network request failed') }) });
  const result = await F.runSignOut('a', deps);
  assert.equal(result.ok, false);
  assert.equal(result.message, F.SIGN_OUT_FAILED_MESSAGE);
  assert.equal(state.wiped, false, 'çıkış başarısızken yerel veri silinmemeli');
  assert.equal(state.sessionCleared, false, 'oturum kapatılmamalı');
  assert.deepEqual(state.log, ['revoke', 'remote', 'restore:a']);
  assert.equal(gate.getOwner(), 'a');
});

test('Supabase istisna fırlatırsa aynı şekilde güvenli davranır', async () => {
  const { gate, state, deps } = harness({ remote: async () => { throw new Error('boom'); } });
  const result = await F.runSignOut('a', deps);
  assert.equal(result.ok, false);
  assert.equal(state.wiped, false);
  assert.equal(gate.getOwner(), 'a');
});

test('başarısız çıkış sırasında süren eski planlama geçersiz kalır; yeni dönem için alınan belirteç geçerlidir', async () => {
  const { gate, deps } = harness({ remote: async () => ({ error: new Error('offline') }) });
  const oldToken = gate.token('a'); // çıkıştan ÖNCE başlayan planlama
  await F.runSignOut('a', deps);
  assert.ok(!gate.isValid(oldToken), 'çıkış denemesinden önce başlayan plan geçerli olmamalı');
  assert.ok(gate.isValid(gate.token('a')), 'geri yüklenen sahip için yeniden planlama yapılabilmeli');
});

test('çıkış denemesi sürerken (uzak çağrı beklerken) eski planlama bildirim kuramaz', async () => {
  let release;
  const { gate, deps } = harness({ remote: () => new Promise(resolve => { release = () => resolve({ error: null }); }) });
  const token = gate.token('a');
  const pending = F.runSignOut('a', deps);
  assert.ok(!gate.isValid(token), 'uzak çıkış beklenirken bile eski belirteç geçersiz');
  await new Promise(resolve => setImmediate(resolve));
  release();
  await pending;
  assert.ok(!gate.isValid(token));
});

test('A → (başarısız çıkış) → A: eski planlamalar yeniden geçerli olmaz', async () => {
  const { gate, deps } = harness({ remote: async () => ({ error: new Error('x') }) });
  const t1 = gate.token('a');
  await F.runSignOut('a', deps);
  const t2 = gate.token('a');
  assert.ok(!gate.isValid(t1));
  assert.ok(gate.isValid(t2));
  await F.runSignOut('a', deps);
  assert.ok(!gate.isValid(t2), 'her çıkış denemesi yeni bir dönem açar');
});

test('A → B → A: başarılı çıkış + yeniden girişte eski A planı geçersiz kalır', async () => {
  const { gate, deps } = harness({ remote: async () => ({ error: null }) });
  const tokenA1 = gate.token('a');
  await F.runSignOut('a', deps);
  gate.setOwner('b');
  gate.setOwner('a');
  assert.ok(!gate.isValid(tokenA1));
});

test('yerel temizlik hata verse bile uzak çıkış yapıldıysa oturum arayüzde kapatılır', async () => {
  const { state, deps } = harness({ remote: async () => ({ error: null }) });
  deps.wipeLocal = async () => { throw new Error('disk'); };
  await assert.rejects(F.runSignOut('a', deps));
  assert.equal(state.sessionCleared, true);
});

test('kullanıcı kimliği yoksa başarısız çıkışta sahiplik geri yüklenmez', async () => {
  const { state, deps } = harness({ remote: async () => ({ error: new Error('x') }) });
  const result = await F.runSignOut(null, deps);
  assert.equal(result.ok, false);
  assert.ok(!state.log.some(entry => entry.startsWith('restore')));
});
