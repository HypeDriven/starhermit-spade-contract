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
      if (method === 'PUT') { save = Buffer.from(JSON.parse(init.body).dataBase64, 'base64'); return res(204); }
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
  const sh = SDK.create({ window: win('', 'spade-contract.starhermit.com'), fetch: async () => res(500) });
  sh.init();
  assert.equal(fresh(sh).canSignIn(), true);
});
