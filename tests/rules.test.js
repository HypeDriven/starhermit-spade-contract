'use strict';
// The rules (rules.js, shipped unchanged): deal, bidding, follow suit, trump,
// scoring, a whole AI-played match, and determinism by seed.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../rules.js');

test('a deal gives 13 cards each, sorted by suit then rank, from a 52-card deck', () => {
  const m = R.createMatch(42);
  const rs = R.dealRound(m);
  assert.equal(m.round, 1);
  const all = rs.hands.flat().map((c) => c.suit + c.rank);
  assert.equal(new Set(all).size, 52);
  for (const h of rs.hands) {
    assert.equal(h.length, 13);
    for (let i = 1; i < h.length; i++) {
      const a = h[i - 1], b = h[i];
      const so = R.SUITS.indexOf(a.suit) - R.SUITS.indexOf(b.suit);
      assert.ok(so < 0 || (so === 0 && R.rankValue(a.rank) > R.rankValue(b.rank)));
    }
  }
  assert.deepEqual(R.dealRound(R.createMatch(42)).hands, rs.hands);
});

test('bidding goes South, West, North, East, then South leads', () => {
  const m = R.createMatch(7);
  R.dealRound(m);
  assert.throws(() => R.placeBid(m, 1, 1));
  assert.throws(() => R.placeBid(m, 0, 4));
  [2, 1, 0, 3].forEach((b, seat) => R.placeBid(m, seat, b));
  assert.equal(m.roundState.phase, 'play');
  assert.equal(m.roundState.currentSeat, 0);
  assert.deepEqual(R.legalPlays(m, 0).length, 13);
  assert.deepEqual(R.legalPlays(m, 1), []);
});

test('follow suit when you can; spades trump', () => {
  const trick = [
    { seat: 0, card: { suit: 'H', rank: 'K' } },
    { seat: 1, card: { suit: 'H', rank: 'A' } },
    { seat: 2, card: { suit: 'S', rank: '2' } },
    { seat: 3, card: { suit: 'D', rank: 'A' } },
  ];
  assert.equal(R.trickWinner(trick), 2);
  assert.equal(R.trickWinner(trick.slice(0, 2)), 1);
  const m = R.createMatch(9);
  R.dealRound(m);
  [0, 0, 0, 0].forEach((b, s) => R.placeBid(m, s, b));
  R.playCard(m, 0, 0);
  const lead = m.roundState.leadSuit;
  const legal = R.legalPlays(m, 1);
  const hand = m.roundState.hands[1];
  if (hand.some((c) => c.suit === lead)) assert.ok(legal.every((i) => hand[i].suit === lead));
  else assert.equal(legal.length, hand.length);
});

test('scoring: +10 a trick bid and +1 an extra trick, -10 a trick bid when missed', () => {
  const m = R.createMatch(1);
  R.dealRound(m);
  const rs = m.roundState;
  rs.bids = [2, 1, 1, 1];
  rs.tricksWon = [3, 2, 4, 4];
  rs.phase = 'scored';
  const r = R.scoreRound(m);
  assert.deepEqual(r.teams.map((t) => t.delta), [30 + 4, 20 + 4]);
  assert.deepEqual(m.bags, [4, 4]);
  rs.tricksWon = [1, 6, 1, 5];
  const r2 = R.scoreRound(m);
  assert.deepEqual(r2.teams.map((t) => t.delta), [-30, 20 + 9]);
});

function playMatch(seed) {
  const m = R.createMatch(seed);
  const log = [];
  while (!m.over) {
    R.dealRound(m);
    const rs = m.roundState;
    for (let s = 0; s < 4; s++) R.placeBid(m, s, R.aiBid(rs.hands[s]));
    while (rs.phase === 'play') {
      const seat = rs.currentSeat;
      const p = R.playCard(m, seat, R.aiChoose(m, seat));
      log.push(p.card.suit + p.card.rank);
      if (p.completed) R.collectTrick(m);
    }
  }
  return { m, log };
}

test('a whole AI match ends after five rounds with a winner; the same seed plays the same', () => {
  const a = playMatch(12345), b = playMatch(12345);
  assert.equal(a.m.round, 5);
  assert.ok(a.m.over);
  assert.equal(a.log.length, 5 * 52);
  assert.deepEqual(a.log, b.log);
  assert.ok([0, 1, 2].includes(a.m.winner));
  for (let s = 1; s < 40; s++) {
    const { m } = playMatch(s * 7919);
    assert.ok(m.scores.every((v) => v >= -1000 && v <= 1000), 'within the board range');
  }
});
