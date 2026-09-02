'use strict';

/* Spade Contract — Spades-style trick-taking rules engine.
 * Pure, deterministic, and browser-safe: exposes window.Rules in the page
 * and module.exports under Node. Rendering layers query legality and apply
 * transitions only through the functions exported here. */

(function (global) {

const SUITS = ['S', 'H', 'D', 'C']; // spade, heart, diamond, club
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

// 0=South(bottom) 1=West(left) 2=North(top) 3=East(right)
const SEATS = ['south', 'west', 'north', 'east'];

const ROUNDS_PER_MATCH = 5;
const POINTS_PER_TRICK_BID = 10;

function teamOf(seat) {
  // South+North = team A (0), West+East = team B (1)
  return seat % 2 === 0 ? 0 : 1;
}

function makeDeck() {
  const cards = [];
  for (let s = 0; s < SUITS.length; s++) {
    for (let r = 0; r < RANKS.length; r++) {
      cards.push({ suit: SUITS[s], rank: RANKS[r] });
    }
  }
  return cards;
}

/* Deterministic Fisher-Yates shuffle driven by a LCG seeded stream. */
function shuffle(deck, seed) {
  let s = (seed >>> 0) || 1;
  for (let i = deck.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
  }
  return deck;
}

function rankValue(rank) {
  // A=13 (highest) ... 2=1 (lowest)
  const i = RANKS.indexOf(rank);
  return i < 0 ? 0 : RANKS.length - i;
}

/* --- match / round state --- */

function createMatch(seed) {
  const s = (typeof seed === 'number' && isFinite(seed)) ? (seed >>> 0)
    : ((Date.now() ^ 0x9e3779b9) >>> 0);
  return {
    seed: s,
    round: 0,
    scores: [0, 0],      // team A, team B
    bags: [0, 0],
    over: false,
    winner: -1,          // -1 undecided, 0 team A, 1 team B, 2 tie
    endReason: '',
    tick: 0,
    roundState: null,
  };
}

function dealRound(match) {
  if (match.over) return null;
  match.round += 1;
  const deck = shuffle(makeDeck(), (match.seed ^ (match.round * 2654435761)) >>> 0);
  const hands = [[], [], [], []];
  for (let i = 0; i < deck.length; i++) {
    hands[i % 4].push(deck[i]);
  }
  // sort each hand by suit then rank for readability
  for (const hand of hands) {
    hand.sort((a, b) => (SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit)) ||
      (rankValue(b.rank) - rankValue(a.rank)));
  }
  match.roundState = {
    phase: 'bid',                 // bid | play | scored
    currentBidder: 0,
    bids: [null, null, null, null],
    hands: hands,
    leadSuit: null,
    trick: [],                    // [{ seat, card }] in play order
    tricksWon: [0, 0, 0, 0],
    currentSeat: 0,
    lastTrickWinner: -1,
  };
  return match.roundState;
}

/* --- legality --- */

function legalPlays(match, seat) {
  const rs = match.roundState;
  if (!rs || match.over || rs.phase !== 'play') return [];
  if (seat !== rs.currentSeat) return [];
  const hand = rs.hands[seat];
  const legal = [];
  let hasLead = false;
  if (rs.leadSuit) {
    for (let i = 0; i < hand.length; i++) {
      if (hand[i].suit === rs.leadSuit) { hasLead = true; break; }
    }
  }
  for (let i = 0; i < hand.length; i++) {
    if (!rs.leadSuit || !hasLead || hand[i].suit === rs.leadSuit) legal.push(i);
  }
  return legal;
}

function isLegal(match, seat, cardIdx) {
  return legalPlays(match, seat).indexOf(cardIdx) !== -1;
}

/* --- bidding --- */

function placeBid(match, seat, bid) {
  const rs = match.roundState;
  if (!rs || match.over || rs.phase !== 'bid') throw new Error('not bidding phase');
  if (seat !== rs.currentBidder) throw new Error('not this seat\'s bid');
  const value = bid | 0;
  if (value < 0 || value > 3) throw new Error('bid out of range');
  rs.bids[seat] = value;
  rs.currentBidder = (rs.currentBidder + 1) % 4;
  if (rs.bids.every(b => b !== null)) {
    rs.phase = 'play';
    rs.currentSeat = 0;
    rs.leadSuit = null;
    rs.trick = [];
  }
  match.tick++;
  return rs.bids.slice();
}

/* Heuristic AI bid: expected tricks from trump length and high cards. */
function aiBid(hand) {
  let strength = 0;
  for (const c of hand) {
    if (c.suit === 'S') strength += 0.6;
    if (c.rank === 'A') strength += 0.75;
    else if (c.rank === 'K') strength += 0.4;
  }
  return Math.max(0, Math.min(3, Math.round(strength / 2)));
}

/* --- trick play --- */

function cardBeats(a, b, leadSuit) {
  // true if card a beats card b, given b was played earlier this trick
  if (a.suit === b.suit) return rankValue(a.rank) > rankValue(b.rank);
  if (a.suit === 'S') return true;
  if (b.suit === 'S') return false;
  return a.suit === leadSuit && b.suit !== leadSuit;
}

function trickWinner(trick) {
  let best = trick[0];
  const leadSuit = trick[0].card.suit;
  for (let i = 1; i < trick.length; i++) {
    if (cardBeats(trick[i].card, best.card, leadSuit)) best = trick[i];
  }
  return best.seat;
}

function playCard(match, seat, cardIdx) {
  const rs = match.roundState;
  if (!isLegal(match, seat, cardIdx)) throw new Error('illegal move');
  const card = rs.hands[seat].splice(cardIdx, 1)[0];
  if (rs.trick.length === 0) rs.leadSuit = card.suit;
  rs.trick.push({ seat: seat, card: card });
  rs.currentSeat = (seat + 1) % 4;

  let completed = null;
  if (rs.trick.length === 4) {
    const winner = trickWinner(rs.trick);
    rs.tricksWon[winner]++;
    rs.lastTrickWinner = winner;
    completed = { winner: winner, team: teamOf(winner) };
  }
  match.tick++;
  return { card: card, completed: completed };
}

/* Called after the UI has shown a finished trick. Clears it and, when the
 * hand is empty, scores the round and possibly ends the match. */
function collectTrick(match) {
  const rs = match.roundState;
  if (!rs || rs.trick.length < 4) return null;
  rs.trick = [];
  rs.leadSuit = null;
  rs.currentSeat = rs.lastTrickWinner;
  if (rs.hands[0].length === 0) {
    rs.phase = 'scored';
    return scoreRound(match);
  }
  return null;
}

function scoreRound(match) {
  const rs = match.roundState;
  const result = { round: match.round, teams: [], gameOver: false, winner: -1 };
  for (let team = 0; team < 2; team++) {
    const seats = team === 0 ? [0, 2] : [1, 3];
    const contract = rs.bids[seats[0]] + rs.bids[seats[1]];
    const taken = rs.tricksWon[seats[0]] + rs.tricksWon[seats[1]];
    let delta;
    if (taken >= contract) {
      delta = contract * POINTS_PER_TRICK_BID + (taken - contract);
      match.bags[team] += taken - contract;
    } else {
      delta = -contract * POINTS_PER_TRICK_BID;
    }
    match.scores[team] += delta;
    result.teams.push({ contract: contract, taken: taken, delta: delta, total: match.scores[team] });
  }
  if (match.round >= ROUNDS_PER_MATCH) {
    match.over = true;
    match.winner = match.scores[0] === match.scores[1] ? 2
      : (match.scores[0] > match.scores[1] ? 0 : 1);
    match.endReason = 'match complete after ' + match.round + ' rounds';
    result.gameOver = true;
    result.winner = match.winner;
  }
  return result;
}

/* Simple AI card choice over legal indices. */
function aiChoose(match, seat) {
  const rs = match.roundState;
  const legal = legalPlays(match, seat);
  if (legal.length === 0) return -1;
  const hand = rs.hands[seat];

  const lowest = (idxs) => idxs.reduce((a, b) =>
    rankValue(hand[a].rank) < rankValue(hand[b].rank) ? a : b);
  const byStrength = (a, b) => rankValue(hand[a].rank) - rankValue(hand[b].rank);

  if (rs.trick.length === 0) {
    // lead: cheapest non-trump if possible, else cheapest card
    const nonTrump = legal.filter(i => hand[i].suit !== 'S');
    return lowest(nonTrump.length ? nonTrump : legal);
  }

  // partner's card currently winning? then duck with the cheapest card
  const currentWinnerSeat = trickWinner(rs.trick);
  const partnerWinning = teamOf(currentWinnerSeat) === teamOf(seat) && currentWinnerSeat !== seat;

  const winning = legal.filter(i => {
    const candidate = { seat: seat, card: hand[i] };
    return cardBeats(candidate.card, rs.trick.find(t => t.seat === currentWinnerSeat).card, rs.leadSuit);
  });

  if (partnerWinning || winning.length === 0) {
    return lowest(legal);
  }
  // win as cheaply as possible
  return winning.slice().sort(byStrength)[0];
}

const Rules = {
  SUITS: SUITS,
  RANKS: RANKS,
  SEATS: SEATS,
  ROUNDS_PER_MATCH: ROUNDS_PER_MATCH,
  teamOf: teamOf,
  makeDeck: makeDeck,
  shuffle: shuffle,
  rankValue: rankValue,
  createMatch: createMatch,
  dealRound: dealRound,
  legalPlays: legalPlays,
  isLegal: isLegal,
  placeBid: placeBid,
  aiBid: aiBid,
  trickWinner: trickWinner,
  playCard: playCard,
  collectTrick: collectTrick,
  scoreRound: scoreRound,
  aiChoose: aiChoose,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rules;
}
global.Rules = Rules;

})(typeof window !== 'undefined' ? window : globalThis);
