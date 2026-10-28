'use strict';
// The save's pure logic (store.js): the browser build's checksummed cloud doc
// read back from the old SDK slot, the snapshot checks and the merge rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules.js');
const St = require('../store.js');

// The browser build's checksum (platform.js): CRC-32 over TextEncoder's UTF-8.
function oldChecksum(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function matchAt(seed, plays) {
  const m = R.createMatch(seed);
  R.dealRound(m);
  for (let s = 0; s < 4; s++) R.placeBid(m, s, 1);
  for (let i = 0; i < plays; i++) {
    const p = R.playCard(m, m.roundState.currentSeat, R.aiChoose(m, m.roundState.currentSeat));
    if (p.completed) R.collectTrick(m);
  }
  return m;
}

test('the checksum matches the browser build’s, non-ASCII included', () => {
  for (const v of [{ a: 1 }, { s: 'é ♠ — 😀 ü' }, { version: 1, savedAt: '2026-10-01T00:00:00.000Z', match: matchAt(5, 7) }]) {
    assert.equal(St.checksumOf(v), oldChecksum(v));
  }
});

test('readForeign takes the old SDK doc only with a valid checksum', () => {
  const m = matchAt(77, 9);
  const doc = St.makeDoc(JSON.parse(JSON.stringify(m)), '2026-10-02T10:00:00.000Z');
  const back = St.readForeign(JSON.stringify(doc));
  assert.equal(back.savedAt, '2026-10-02T10:00:00.000Z');
  assert.deepEqual(back.match, JSON.parse(JSON.stringify(m)));
  assert.ok(St.sanitizeMatch(back.match, R));
  assert.equal(St.readForeign(JSON.stringify({ ...doc, checksum: doc.checksum + 1 })), null);
  assert.equal(St.readForeign('not json'), null);
  assert.equal(St.readForeign(null), null);
  assert.equal(St.readForeign(JSON.stringify({ version: 2, match: null, checksum: 0 })), null);
});

test('sanitizeMatch refuses broken snapshots', () => {
  const m = JSON.parse(JSON.stringify(matchAt(3, 5)));
  assert.ok(St.sanitizeMatch(m, R));
  assert.equal(St.sanitizeMatch(null, R), null);
  assert.equal(St.sanitizeMatch({ ...m, seed: 'x' }, R), null);
  const bad = JSON.parse(JSON.stringify(m));
  bad.roundState.hands[0][0] = { suit: 'X', rank: 'A' };
  assert.equal(St.sanitizeMatch(bad, R), null);
  const bad2 = JSON.parse(JSON.stringify(m));
  bad2.roundState.bids[1] = 7;
  assert.equal(St.sanitizeMatch(bad2, R), null);
});

test('pickMatch keeps the snapshot with more progress', () => {
  const a = matchAt(10, 4), aLater = matchAt(10, 9), b = matchAt(11, 2);
  const over = { ...matchAt(12, 1), over: true };
  assert.equal(St.pickMatch(null, a, true), a);
  assert.equal(St.pickMatch(a, null, true), a);
  assert.equal(St.pickMatch(over, a, false), a); // a live match beats a finished one
  assert.equal(St.pickMatch(a, aLater, false), aLater); // same match: further along
  assert.equal(St.pickMatch(aLater, a, true), aLater);
  assert.equal(St.pickMatch(a, b, true), b); // otherwise preferB decides
  assert.equal(St.pickMatch(a, b, false), a);
});

test('canon ignores key order', () => {
  assert.equal(St.canon({ b: 1, a: [1, { y: 2, x: 1 }] }), St.canon({ a: [1, { x: 1, y: 2 }], b: 1 }));
});
