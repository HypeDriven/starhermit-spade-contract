'use strict';

/* Spade Contract — StarHermit platform adapter.
 * Owns the hosted-mode handshake and nothing else: the launch token (read
 * once from the URL fragment, then stripped), Bearer auth with a 45-minute
 * re-mint, the account nickname, and the one-slot cloud save that mirrors
 * the match snapshot (stored zip + base64). Hosted mode activates iff a
 * token was read; without one the game is fully local and this module
 * never touches the network. Tokens live in memory only, never in storage;
 * localStorage stays the offline cache. */

(function (global) {

const LOCAL_KEY = 'spade-contract.save.v1';
const SAVE_NAME = 'save.json';
const SAVE_DEBOUNCE_MS = 2000;
const SAVE_RETRY_MS = 30000;
const REFRESH_MS = 45 * 60 * 1000;
const REFRESH_RETRY_MS = 60 * 1000;

const state = {
  token: null,     // raw JWT, in memory only (never persisted)
  sub: null,       // user id from the JWT payload
  slug: null,      // game scope from the JWT payload — never hard-coded
  hosted: false,
  nickname: null,
  sync: 'offline', // offline | saving | synced
};

let doc = null;          // { version, savedAt, match, checksum }
let lastCore = null;     // last serialized { version, match } — skip no-op writes
let saveTimer = null;
let retryTimer = null;
let refreshTimer = null;
let dirty = false;

/* --- minimal ZIP writer/reader (stored entries only, no compression) --- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(name, dataBytes) {
  const enc = new TextEncoder();
  const nameB = enc.encode(name);
  const crc = crc32(dataBytes);
  const out = [];
  const u16 = (v) => out.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (v) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  u32(0x04034b50); u16(20); u16(0); u16(0); u16(0); u16(0);
  u32(crc); u32(dataBytes.length); u32(dataBytes.length);
  u16(nameB.length); u16(0);
  const local = out.length;
  const head = new Uint8Array(out);
  const cd = [];
  const c16 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff);
  const c32 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  c32(0x02014b50); c16(20); c16(20); c16(0); c16(0); c16(0); c16(0);
  c32(crc); c32(dataBytes.length); c32(dataBytes.length);
  c16(nameB.length); c16(0); c16(0); c16(0); c16(0); c32(0); c32(0); // attrs + local-header offset
  const cdHead = new Uint8Array(cd);
  const cdOff = head.length + nameB.length + dataBytes.length;
  const parts = [head, nameB, dataBytes, cdHead, nameB];
  const eocd = [];
  const e32 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
  const e16 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff);
  e32(0x06054b50); e16(0); e16(0); e16(1); e16(1);
  e32(cdHead.length + nameB.length); e32(cdOff); e16(0);
  parts.push(new Uint8Array(eocd));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  return buf;
}
function unzipFirstEntry(zipBytes) {
  // Stored single-entry reader: scan local headers for compression 0.
  const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  let off = 0;
  while (off + 30 <= zipBytes.length && dv.getUint32(off, true) === 0x04034b50) {
    const method = dv.getUint16(off + 8, true);
    const size = dv.getUint32(off + 18, true);
    const nameLen = dv.getUint16(off + 26, true);
    const extraLen = dv.getUint16(off + 28, true);
    const dataOff = off + 30 + nameLen + extraLen;
    if (method !== 0) throw new Error('unsupported zip entry');
    return zipBytes.slice(dataOff, dataOff + size);
  }
  throw new Error('bad zip');
}
function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBytes(b64) {
  const s = atob(b64);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

/* --- launch token: fragment read once + strip, sub/game_scope decode --- */

function readLaunchToken() {
  // The platform delivers the token in the URL fragment; query params are
  // a local-dev fallback only. Read once, then strip it from the URL.
  let token = null;
  if (typeof location !== 'undefined' && location.hash) {
    const frag = new URLSearchParams(location.hash.slice(1));
    token = frag.get('game_token');
    if (frag.has('game_token') || frag.has('session_id')) {
      frag.delete('game_token');
      frag.delete('session_id');
      const rest = frag.toString();
      const url = location.pathname + location.search + (rest ? '#' + rest : '');
      if (typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', url);
    }
  }
  if (!token && typeof location !== 'undefined') {
    const q = new URLSearchParams(location.search);
    token = q.get('game_token') || q.get('token') || q.get('launch') || q.get('launch_token');
  }
  return token;
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
  } catch {
    return null;
  }
}

(function applyLaunchToken() {
  const token = readLaunchToken();
  const payload = token ? decodeJwtPayload(token) : null;
  if (payload && payload.sub && payload.game_scope) {
    state.token = token;
    state.sub = String(payload.sub);
    state.slug = String(payload.game_scope);
    state.hosted = true;
    scheduleRefresh(REFRESH_MS);
  }
})();

function authHeaders(extra) {
  return Object.assign({ Authorization: 'Bearer ' + state.token }, extra || {});
}

function cloudSaveUrl() {
  return '/api/v1/me/cloud-saves/' + encodeURIComponent(state.slug);
}

/* --- token refresh: re-mint the scoped token before its 60-min lifetime --- */

function scheduleRefresh(delay) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshToken, delay);
}

async function refreshToken() {
  if (!state.hosted) return;
  try {
    const res = await fetch('/api/v1/games/' + encodeURIComponent(state.slug) + '/launch-token', {
      method: 'POST',
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error('launch-token refresh HTTP ' + res.status);
    const data = await res.json().catch(() => ({}));
    if (!data || typeof data.token !== 'string' || !data.token) throw new Error('launch-token refresh returned no token');
    state.token = data.token;
    scheduleRefresh(REFRESH_MS);
  } catch {
    scheduleRefresh(REFRESH_RETRY_MS);
  }
}

/* --- profile nickname (NEVER /api/v1/me, never usernames) --- */

async function loadProfile() {
  if (!state.hosted) return;
  try {
    const res = await fetch('/api/v1/users/' + encodeURIComponent(state.sub) + '/profile', {
      headers: authHeaders(),
    });
    if (res.ok) {
      const p = await res.json().catch(() => ({}));
      const nick = typeof p.nickname === 'string' ? p.nickname.trim() : '';
      if (nick) state.nickname = nick;
    }
  } catch {
    // offline or private profile: use the fallback below
  }
  if (!state.nickname) state.nickname = 'Player ' + state.sub.slice(0, 8);
  renderChip();
}

/* --- save doc: versioned + checksummed; cloud is a mirror of localStorage --- */

function checksumOf(payload) {
  return crc32(new TextEncoder().encode(JSON.stringify(payload)));
}

function verifyDoc(d) {
  if (!d || d.version !== 1 || !('match' in d)) return false;
  if (typeof d.checksum !== 'number') return false;
  return d.checksum === checksumOf({ version: d.version, savedAt: d.savedAt, match: d.match });
}

function readLocalDoc() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
    if (verifyDoc(parsed)) return parsed;
  } catch {
    // corrupt cache: start fresh
  }
  return null;
}

function writeLocalDoc() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LOCAL_KEY, JSON.stringify(doc));
  } catch {
    // storage unavailable: the cloud mirror still works when hosted
  }
}

/** Load the save doc: cloud when hosted (remote wins), else the local cache. */
async function loadSave() {
  doc = readLocalDoc();
  if (!state.hosted) { setSync('offline'); return doc; }
  try {
    const res = await fetch(cloudSaveUrl(), { headers: authHeaders() });
    if (res.status === 404) { setSync('synced'); return doc; }
    if (!res.ok) throw new Error('cloud load HTTP ' + res.status);
    const remote = JSON.parse(new TextDecoder().decode(unzipFirstEntry(new Uint8Array(await res.arrayBuffer()))));
    // A local change queued while the read was in flight is newer than it.
    if (!dirty && verifyDoc(remote)) {
      doc = remote; // remote wins on conflict
      writeLocalDoc();
    }
    setSync('synced');
  } catch {
    setSync('offline'); // local copy stays authoritative until the net returns
  }
  return doc;
}

/** Mirror the current match snapshot: localStorage now, cloud debounced. */
function scheduleSave(matchSnapshot) {
  const match = matchSnapshot ? JSON.parse(JSON.stringify(matchSnapshot)) : null;
  const core = JSON.stringify({ version: 1, match: match });
  if (core === lastCore) return; // render with no state change
  lastCore = core;
  doc = { version: 1, savedAt: new Date().toISOString(), match: match };
  doc.checksum = checksumOf({ version: doc.version, savedAt: doc.savedAt, match: doc.match });
  writeLocalDoc();
  if (!state.hosted) { setSync('offline'); return; }
  dirty = true;
  setSync('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
}

async function flushSave(opts) {
  clearTimeout(saveTimer);
  saveTimer = null;
  clearTimeout(retryTimer);
  retryTimer = null;
  if (!dirty || !state.hosted) return;
  setSync('saving');
  try {
    const body = JSON.stringify({
      dataBase64: bytesToBase64(zipStore(SAVE_NAME, new TextEncoder().encode(JSON.stringify(doc)))),
    });
    const res = await fetch(cloudSaveUrl(), {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: body,
      keepalive: !!(opts && opts.keepalive),
    });
    if (!res.ok) throw new Error('cloud save HTTP ' + res.status);
    dirty = false;
    setSync('synced');
  } catch {
    setSync('offline');
    retryTimer = setTimeout(flushSave, SAVE_RETRY_MS);
  }
}

function onPageHide() {
  if (!dirty || !state.hosted) return;
  // Best-effort final flush; the server accepts a re-PUT of the same doc.
  flushSave({ keepalive: true });
  dirty = false;
}

/* --- profile chip + sync status (the game's profile/save slot) --- */

function setSync(sync) {
  state.sync = sync;
  renderChip();
}

function renderChip() {
  if (typeof document === 'undefined') return;
  const chip = document.getElementById('player-chip');
  if (!chip) return;
  if (!state.hosted) { chip.classList.add('hidden'); return; }
  chip.classList.remove('hidden');
  const name = document.getElementById('player-name');
  const sync = document.getElementById('sync-status');
  if (name) name.textContent = state.nickname || '';
  if (sync) {
    sync.textContent = state.sync === 'synced' ? 'synced'
      : state.sync === 'saving' ? 'saving…' : 'offline';
    sync.setAttribute('data-sync', state.sync);
  }
}

/* --- public API --- */

/** Async bootstrap: call once at game init; resolves to the loaded save doc. */
function init() {
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
    }
  }
  renderChip();
  if (state.hosted) loadProfile();
  return loadSave();
}

const api = {
  init: init,
  isHosted: () => state.hosted,
  nickname: () => state.nickname,
  sync: () => state.sync,
  scheduleSave: scheduleSave,
  flushSave: flushSave,
};
// Exposed for the unit tests (zip round-trip validation).
api.__zip = { zipStore, unzipFirstEntry, bytesToBase64, base64ToBytes, crc32 };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.Platform = api;

})(typeof window !== 'undefined' ? window : globalThis);
