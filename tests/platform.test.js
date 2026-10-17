/* Unit tests for the platform adapter over the shipped StarHermit SDK
 * (node:test): stubbed fetch + launch fragment → token read/strip, profile
 * nickname, checksummed cloud save round-trip on game:<slug>, settings KV
 * patch, bindings, sign-out, and no network at all standalone. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SDK = require('../starhermit-sdk.js');

const USER = '2712e04e-461b-4d23-81ae-e40b429128a8';
const SLUG = 'spade-contract-test';
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = b64u({ alg: 'none' }) + '.' + b64u({ sub: USER, game_scope: SLUG, exp: Math.floor(Date.now() / 1000) + 3600 }) + '.sig';

const mem = new Map();
global.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

function res(status, body) {
  const bytes = body instanceof Uint8Array ? body : null;
  const text = bytes || body == null ? '' : JSON.stringify(body);
  return {
    status, ok: status >= 200 && status < 300, statusText: String(status),
    text: async () => text, json: async () => JSON.parse(text),
    arrayBuffer: async () => (bytes || Buffer.from(text)).slice().buffer,
    blob: async () => null,
  };
}
function win(hash, hostname = 'localhost') {
  return {
    location: { hash, search: '', pathname: '/', hostname, href: 'http://' + hostname + '/' + hash },
    history: { state: null, replaceState(_s, _t, url) { this.last = url; } },
  };
}
function fresh(sh) {
  global.StarHermit = sh;
  delete require.cache[require.resolve('../platform.js')];
  return require('../platform.js');
}

test('hosted: token, nickname, cloud save game:<slug>, settings, bindings, sign-out', async () => {
  const calls = [];
  let save = null;
  const kv = { volume: 0.3 };
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET', path = url.split('?')[0];
    calls.push({ url, method, auth: init.headers.Authorization, keepalive: init.keepalive });
    if (path === `/api/v1/users/${USER}/profile`) return res(200, { username: 'ada_1815', nickname: 'Ada Lovelace' });
    if (path === `/api/v1/users/${USER}/avatar`) return res(404);
    if (path === '/api/v1/me/cloud-saves/' + encodeURIComponent('game:' + SLUG)) {
      if (method === 'PUT') { save = Buffer.from(JSON.parse(init.body).dataBase64, 'base64'); return res(200, { etag: '"v' + calls.length + '"' }); }
      return save ? res(200, new Uint8Array(save)) : res(404);
    }
    if (path === `/api/v1/games/${SLUG}/settings`) {
      if (method === 'PATCH') Object.assign(kv, JSON.parse(init.body).settings);
      return res(200, { settings: kv });
    }
    if (path === `/api/v1/games/${SLUG}/controls`) return res(200, { actions: [{ action: 'close', codes: ['KeyQ'] }] });
    return res(404);
  };
  const w = win('#game_token=' + TOKEN + '&session_id=abc');
  const sh = SDK.create({ window: w, fetch, setTimeout: () => 0, clearTimeout() {} });
  sh.init();
  const P = fresh(sh);
  assert.equal(w.history.last, '/', 'token + session_id stripped');
  assert.equal(P.isHosted(), true);
  assert.equal(await P.init(), null, 'empty slot, no local doc');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(P.nickname(), 'Ada Lovelace', 'nickname, never the username');
  assert.equal(P.actionFor('KeyQ'), 'close', 'binding override');

  P.scheduleSave({ round: 2, scores: [30, -10] });
  assert.equal(P.sync(), 'saving');
  await P.flushSave();
  const put = calls.find((c) => c.method === 'PUT');
  assert.ok(put.url.endsWith('/cloud-saves/game%3A' + SLUG), 'slot game:<slug>');
  assert.equal(put.keepalive, true);
  assert.equal(P.sync(), 'synced');
  mem.clear();
  const doc = await P.init();
  assert.deepEqual(doc.match, { round: 2, scores: [30, -10] }, 'cloud round-trip');
  assert.equal(typeof doc.checksum, 'number');

  assert.deepEqual(await P.loadSettings(), { volume: 0.3 });
  P.pushSettings({ muted: true, volume: 0.5 });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(kv, { volume: 0.5, muted: true }, 'settings PATCH');
  assert.ok(calls.every((c) => c.auth === 'Bearer ' + TOKEN), 'Bearer on every call');
  assert.ok(!calls.some((c) => c.url === '/api/v1/me'));

  assert.ok(P.inviteLink().endsWith(`/game-invite/${USER}/${SLUG}`));
  assert.equal(P.canSignIn(), false);
  let out = 0;
  P.onSignedOut(() => out++);
  sh.signOut('expired');
  assert.equal(out, 1);
  assert.equal(P.isHosted(), false);
  assert.equal(P.inviteLink(), null);
});

test('standalone: local cache only, no fetch', async () => {
  mem.clear();
  const calls = [];
  const sh = SDK.create({ window: win(''), fetch: async (u) => { calls.push(u); return res(500); } });
  sh.init();
  const P = fresh(sh);
  assert.equal(await P.init(), null);
  P.scheduleSave({ round: 1 });
  await P.flushSave();
  assert.ok(mem.has('spade-contract.save.v1'), 'local cache written');
  assert.deepEqual(await P.loadSettings(), {});
  P.pushSettings({ muted: true });
  assert.equal(P.actionFor('Escape'), 'close');
  assert.equal(P.canSignIn(), false);
  assert.equal(P.sync(), 'offline');
  assert.equal(calls.length, 0);
});

test('on <id>.starhermit.com without a token: sign-in offered', () => {
  // canSignIn() is only true on a game's UUID host (<uuid>.starhermit.com).
  const sh = SDK.create({ window: win('', '0b9d6f2e-3c4a-4e5b-9a7c-1d2e3f405162.starhermit.com'), fetch: async () => res(500) });
  sh.init();
  assert.equal(fresh(sh).canSignIn(), true);
});

// Cloud-save conflicts: another device saved since our load, so the SDK refuses
// the conditional write; the platform reloads and keeps the snapshot with more
// progress, then writes it on top of the other device's version.
async function conflictRig() {
  mem.clear();
  const slot = '/api/v1/me/cloud-saves/' + encodeURIComponent('game:' + SLUG);
  const zipOf = async (doc) => {
    let bytes = null;
    const z = SDK.create({ window: win('#game_token=' + TOKEN), fetch: async (u, init = {}) => {
      if (init.method === 'PUT') { bytes = Buffer.from(JSON.parse(init.body).dataBase64, 'base64'); return res(200, { etag: '"z"' }); }
      return res(404);
    }, setTimeout: () => 0, clearTimeout() {} });
    z.init();
    await z.writeSave(JSON.stringify(doc));
    return bytes;
  };
  const rig = { stored: null, etag: null, puts: [] };
  const fetch = async (url, init = {}) => {
    const method = init.method || 'GET', path = url.split('?')[0];
    if (path === slot + '/info') return res(200, { exists: !!rig.stored, etag: rig.etag });
    if (path === slot && method === 'GET') return res(200, new Uint8Array(rig.stored));
    if (path === slot && method === 'PUT') {
      const match = init.headers['If-Match'];
      rig.puts.push(match || init.headers['If-None-Match']);
      if ((match && match !== rig.etag) || (!match && rig.stored)) return res(412, { error: 'precondition_failed' });
      rig.stored = Buffer.from(JSON.parse(init.body).dataBase64, 'base64');
      rig.etag = '"v' + rig.puts.length + '"';
      return res(200, { etag: rig.etag });
    }
    return res(404);
  };
  const sh = SDK.create({ window: win('#game_token=' + TOKEN), fetch, setTimeout: () => 0, clearTimeout() {} });
  sh.init();
  rig.P = fresh(sh);
  rig.sh = sh;
  // Another device writes its own snapshot (with the checksum platform.js verifies).
  rig.otherDevice = async (match) => {
    const doc = { version: 1, savedAt: new Date().toISOString(), match };
    doc.checksum = checksumFor(doc);
    rig.stored = await zipOf(doc);
    rig.etag = '"other"';
  };
  return rig;
}
function checksumFor(d) {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  const bytes = new TextEncoder().encode(JSON.stringify({ version: d.version, savedAt: d.savedAt, match: d.match }));
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const settle = () => new Promise((r) => setTimeout(r, 10));

test('save conflict: another device got further in this match → continue from its snapshot', async () => {
  const rig = await conflictRig();
  assert.equal(await rig.P.init(), null);
  let adopted = null;
  rig.P.onConflict((m) => { adopted = m; });
  rig.P.scheduleSave({ seed: 7, round: 1, tick: 5, over: false, scores: [0, 0] });
  await rig.P.flushSave();
  await rig.otherDevice({ seed: 7, round: 2, tick: 40, over: false, scores: [20, 10] });
  rig.P.scheduleSave({ seed: 7, round: 1, tick: 6, over: false, scores: [0, 0] });
  await rig.P.flushSave();
  await settle();
  assert.equal(rig.sh.saveConflicted(), false, 'reloaded after the refused write');
  assert.deepEqual(adopted, { seed: 7, round: 2, tick: 40, over: false, scores: [20, 10] });
});

test('save conflict: this device is further along → keep it and write it over the other version', async () => {
  const rig = await conflictRig();
  await rig.P.init();
  let adopted = null;
  rig.P.onConflict((m) => { adopted = m; });
  rig.P.scheduleSave({ seed: 7, round: 3, tick: 90, over: false, scores: [40, 10] });
  await rig.P.flushSave();
  await rig.otherDevice({ seed: 7, round: 1, tick: 12, over: false, scores: [0, 0] });
  rig.P.scheduleSave({ seed: 7, round: 3, tick: 91, over: false, scores: [40, 10] });
  await rig.P.flushSave();
  await settle();
  assert.equal(adopted, null, 'the local match stays on screen');
  await rig.P.flushSave();
  assert.equal(rig.puts.at(-1), '"other"', 'merged write is conditional on the reloaded version');
  assert.equal(rig.P.sync(), 'synced');
});

test('pickMatch keeps the snapshot with more progress', () => {
  const P = fresh(SDK.create({ window: win(''), fetch: async () => res(500) }));
  const live = { seed: 1, tick: 3, over: false };
  const done = { seed: 1, tick: 9, over: true };
  assert.equal(P.pickMatch(live, done, true), live, 'a match in play beats a finished one');
  assert.equal(P.pickMatch(null, live, false), live);
  assert.equal(P.pickMatch({ seed: 1, tick: 8, over: false }, live, true).tick, 8, 'same match: further along');
  assert.equal(P.pickMatch({ seed: 2, tick: 1, over: false }, live, true), live, 'different matches: preferred side');
});
