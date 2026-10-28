'use strict';

/* Spade Contract — the save's pure logic, shared by the engine client
 * (native/platform.ts) and the node tests: the match snapshot check
 * (sanitizeMatch: a saved match is only resumed when every field is sane),
 * the browser build's checksummed cloud doc ({ version: 1, savedAt, match,
 * checksum }, CRC-32 over the JSON of { version, savedAt, match }) read back
 * from the old JS SDK's game:<slug> slot (readForeign), and pickMatch, the
 * browser build's merge of two saves: one match snapshot per slot, so the
 * snapshot with more progress wins — a match still in play beats a finished
 * or empty one; two snapshots of the same match (same seed) keep the one
 * further along (higher tick); otherwise `preferB` decides.
 * Exposes globalThis.SpadeStore in the engine and module.exports in node. */

(function (root) {

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** UTF-8 bytes of a string (as TextEncoder; written out so it runs anywhere). */
function utf8(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function checksumOf(payload) { return crc32(utf8(JSON.stringify(payload))); }

/** The browser build's save doc: version 1 with a matching checksum. */
function verifyDoc(d) {
  if (!d || typeof d !== 'object' || d.version !== 1 || !('match' in d)) return false;
  if (typeof d.checksum !== 'number') return false;
  return d.checksum === checksumOf({ version: d.version, savedAt: d.savedAt, match: d.match });
}

/** A browser-build doc as it wrote it (for tests and tools). */
function makeDoc(match, savedAt) {
  const doc = { version: 1, savedAt: savedAt, match: match };
  doc.checksum = checksumOf({ version: doc.version, savedAt: doc.savedAt, match: doc.match });
  return doc;
}

function pickMatch(a, b, preferB) {
  const live = (m) => !!(m && !m.over);
  if (!a) return b || null;
  if (!b) return a;
  if (live(a) !== live(b)) return live(a) ? a : b;
  if (a.seed === b.seed) return (Number(a.tick) || 0) > (Number(b.tick) || 0) ? a : b;
  return preferB ? b : a;
}

/** ui.js sanitizeMatch: the snapshot when every field is sane, else null. */
function sanitizeMatch(m, Rules) {
  if (!m || typeof m !== 'object') return null;
  if (typeof m.seed !== 'number' || !isFinite(m.seed)) return null;
  if (typeof m.round !== 'number' || !Array.isArray(m.scores) || m.scores.length !== 2) return null;
  if (typeof m.over !== 'boolean' || typeof m.tick !== 'number') return null;
  const rs = m.roundState;
  if (rs === null) return m.round >= 0 && !m.over ? m : null;
  if (typeof rs !== 'object') return null;
  const suits = Rules.SUITS;
  const ranks = Rules.RANKS;
  const seatIdx = (v) => typeof v === 'number' && v >= 0 && v <= 3 && (v | 0) === v;
  const cardOk = (c) => c && suits.indexOf(c.suit) !== -1 && ranks.indexOf(c.rank) !== -1;
  if (['bid', 'play', 'scored'].indexOf(rs.phase) === -1) return null;
  if (!seatIdx(rs.currentBidder) || !seatIdx(rs.currentSeat)) return null;
  if (typeof rs.lastTrickWinner !== 'number' || rs.lastTrickWinner < -1 || rs.lastTrickWinner > 3) return null;
  if (!Array.isArray(rs.bids) || rs.bids.length !== 4) return null;
  if (!rs.bids.every((b) => b === null || (b >= 0 && b <= 3))) return null;
  if (!Array.isArray(rs.tricksWon) || rs.tricksWon.length !== 4) return null;
  if (!Array.isArray(rs.hands) || rs.hands.length !== 4) return null;
  if (!rs.hands.every((h) => Array.isArray(h) && h.every(cardOk))) return null;
  if (rs.leadSuit !== null && suits.indexOf(rs.leadSuit) === -1) return null;
  if (!Array.isArray(rs.trick) || rs.trick.length > 4) return null;
  if (!rs.trick.every((t) => t && seatIdx(t.seat) && cardOk(t.card))) return null;
  return m;
}

/** The old SDK slot's save.json text → its doc ({ savedAt, match }) when the checksum holds, else null. */
function readForeign(text) {
  if (typeof text !== 'string' || !text) return null;
  let d = null;
  try { d = JSON.parse(text); } catch (_e) { return null; }
  if (!verifyDoc(d)) return null;
  return { savedAt: String(d.savedAt || ''), match: d.match || null };
}

/** Canonical JSON (sorted keys) for "did anything change" comparisons. */
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

const api = { crc32, checksumOf, verifyDoc, makeDoc, pickMatch, sanitizeMatch, readForeign, canon };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.SpadeStore = api;

})(globalThis);
