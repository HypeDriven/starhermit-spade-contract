'use strict';

/* Spade Contract — StarHermit platform adapter over window.StarHermit
 * (starhermit-sdk.js, loaded first). The SDK owns the launch token (read
 * from the URL fragment and stripped), renewal and every platform call; this
 * adapter keeps the game-facing API: the account nickname + avatar chip,
 * the one-slot cloud save (game:<slug>) mirroring the checksummed match
 * snapshot, the settings KV, keyboard bindings, sign-in and the invite link.
 * Without a token the game is fully local and nothing here touches the
 * network; localStorage stays the offline cache. */

(function (global) {

const LOCAL_KEY = 'spade-contract.save.v1';

// Keyboard actions; mirrors the control.* lines in starhermit.txt.
const DEFAULT_CONTROLS = { close: ['Escape'] };

const SH = () => global.StarHermit || null;
const T = (key, vars) => (global.SCI18N ? global.SCI18N.T(key, vars)
  : String(key).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)));

const state = {
  nickname: null,
  avatar: null,    // object URL of the avatar PNG
  sync: 'offline', // offline | saving | synced
};

let doc = null;          // { version, savedAt, match, checksum }
let lastCore = null;     // last serialized { version, match } — skip no-op writes
let controls = { close: DEFAULT_CONTROLS.close.slice() };
let wired = false;
let signedOutHook = null;
let conflictHook = null; // (match) => void: continue from another device's snapshot

const hosted = () => { const sh = SH(); return !!(sh && sh.signedIn); };

/* --- save doc: versioned + checksummed; cloud is a mirror of localStorage --- */

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

let dirty = false;

/**
 * The single save slot holds one match snapshot, so "merging" two saves means
 * keeping the snapshot with more progress: a match still in play beats a
 * finished or empty one; two snapshots of the same match (same seed) keep the
 * one further along (higher tick); otherwise `preferB` decides (this device's
 * current match during play, the newer save at boot).
 */
function pickMatch(a, b, preferB) {
  const live = (m) => !!(m && !m.over);
  if (!a) return b || null;
  if (!b) return a;
  if (live(a) !== live(b)) return live(a) ? a : b;
  if (a.seed === b.seed) return (Number(a.tick) || 0) > (Number(b.tick) || 0) ? a : b;
  return preferB ? b : a;
}

/** Load the save doc: cloud when hosted, merged with the local cache (see pickMatch). */
async function loadSave() {
  doc = readLocalDoc();
  if (!hosted()) { setSync('offline'); return doc; }
  const remote = await SH().loadJSON().catch(() => null);
  // A local change queued while the read was in flight is newer than it.
  if (!dirty && verifyDoc(remote)) {
    const localNewer = !!(doc && String(doc.savedAt) > String(remote.savedAt));
    const pick = pickMatch(remote.match, doc && doc.match, localNewer);
    if (!doc || pick === remote.match) { doc = remote; writeLocalDoc(); }
    else { lastCore = null; scheduleSave(doc.match); } // the cloud lacked this device's progress
  }
  if (state.sync !== 'saving') setSync('synced');
  return doc;
}

/* Another device saved since our last load (the SDK refused the conditional
 * write): reload, keep the snapshot with more progress, and save it back. */
async function resolveConflict() {
  const sh = SH();
  const remote = await sh.loadJSON().catch(() => null);
  if (sh.saveConflicted() || sh.saveLoadFailed()) { setSync('offline'); return; }
  const local = doc && doc.match;
  const pick = pickMatch(verifyDoc(remote) ? remote.match : null, local, true);
  lastCore = null; // write even if the snapshot is unchanged: the cloud holds the other device's
  if (pick && pick !== local && conflictHook) conflictHook(JSON.parse(JSON.stringify(pick)));
  else scheduleSave(local);
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
  if (!hosted()) { setSync('offline'); return; }
  dirty = true;
  setSync('saving');
  SH().saveJSON(doc);
}

function flushSave() {
  if (!hosted()) return Promise.resolve(false);
  return SH().flushSave(true);
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
  if (!hosted()) { chip.classList.add('hidden'); return; }
  chip.classList.remove('hidden');
  const name = document.getElementById('player-name');
  const sync = document.getElementById('sync-status');
  const avatar = document.getElementById('player-avatar');
  if (name) name.textContent = state.nickname || (state.fallbackId ? T('Player {id}', { id: state.fallbackId }) : '');
  if (avatar) {
    if (state.avatar) avatar.src = state.avatar;
    avatar.classList.toggle('hidden', !state.avatar);
  }
  if (sync) {
    sync.textContent = state.sync === 'synced' ? T('synced')
      : state.sync === 'saving' ? T('saving…') : T('offline');
    sync.setAttribute('data-sync', state.sync);
  }
}

async function loadProfile() {
  const sh = SH();
  const p = await sh.profile().catch(() => null);
  state.nickname = p ? p.displayName : null;
  state.fallbackId = String(sh.userId).slice(0, 6);
  renderChip();
  state.avatar = await sh.avatarUrl().catch(() => null);
  renderChip();
}

function wire() {
  if (wired) return;
  wired = true;
  const sh = SH();
  if (sh) {
    if (!sh.token) sh.init();
    sh.on('saved', (ok) => { if (ok) dirty = false; setSync(ok ? 'synced' : 'offline'); });
    sh.on('saveconflict', () => { resolveConflict(); });
    sh.on('auth', (a) => {
      if (a.signedIn) return;
      state.nickname = null;
      setSync('offline');
      if (signedOutHook) { try { signedOutHook(); } catch (_e) { /* UI hook */ } }
    });
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', () => { flushSave(); });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });
      document.addEventListener('sc-language', renderChip);
    }
  }
}

/* --- public API --- */

/** Async bootstrap: call once at game init; resolves to the loaded save doc. */
function init() {
  wire();
  renderChip();
  if (hosted()) {
    loadProfile();
    SH().loadBindings(DEFAULT_CONTROLS).then((b) => { controls = b; }, () => {});
  }
  return loadSave();
}

/** Post a finished match's team score to the high-score board (score-script.js);
 *  resolves { posted, rank } (rank or null). No request standalone. */
function submitScore(score) {
  const sh = SH();
  if (!hosted()) return Promise.resolve({ posted: false, rank: null });
  return sh.submitScores({ 'high-score': score }).then((keys) => {
    if (!keys || keys.indexOf('high-score') < 0) return { posted: false, rank: null };
    return sh.leaderboard('high-score', { pageSize: 100 }).then((r) => {
      const me = ((r && r.items) || []).find((i) => i.userId === sh.userId);
      return { posted: true, rank: me ? me.rank : null };
    }, () => ({ posted: true, rank: null }));
  }, () => ({ posted: false, rank: null }));
}

const api = {
  init: init,
  submitScore: submitScore,
  isHosted: hosted,
  nickname: () => state.nickname,
  sync: () => state.sync,
  scheduleSave: scheduleSave,
  flushSave: flushSave,
  canSignIn: () => { wire(); const sh = SH(); return !!(sh && sh.canSignIn()); },
  signIn: () => { const sh = SH(); return !!(sh && sh.signIn()); },
  inviteLink: () => (hosted() ? SH().inviteLink() : null),
  onSignedOut: (fn) => { signedOutHook = fn; },
  /** fn(match): a save conflict picked another device's snapshot; the game continues from it. */
  onConflict: (fn) => { conflictHook = fn; },
  pickMatch: pickMatch,
  /** Player settings from the platform KV ({} standalone). */
  loadSettings: () => { wire(); return hosted() ? SH().getSettings().catch(() => ({})) : Promise.resolve({}); },
  /** Merge preference keys into the platform KV (no-op standalone). */
  pushSettings: (obj) => { if (hosted()) SH().patchSettings(obj); },
  actionFor: (code) => {
    for (const a of Object.keys(controls)) if (controls[a].indexOf(code) !== -1) return a;
    return null;
  },
  DEFAULT_CONTROLS: DEFAULT_CONTROLS,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.Platform = api;

})(typeof window !== 'undefined' ? window : globalThis);
