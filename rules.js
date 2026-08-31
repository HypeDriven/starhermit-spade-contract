'use strict';

/* Spades-style trick-taking card game rules engine. */

const SUITS = ['S', 'H', 'D', 'C']; // spade, heart, diamond, club
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

// 0=South(bottom) 1=West(left) 2=North(top) 3=East(right)
const SEATS = ['south', 'west', 'north', 'east'];

function makeDeck() {
  const cards = [];
  for (let s = 0; s < SUITS.length; s++) {
    for (let r = 0; r < RANKS.length; r++) {
      cards.push({ suit: SUITS[s], rank: RANKS[r] });
    }
  }
  return cards;
}

function newGame() {
  const deck = makeDeck();
  // deterministic shuffle (Fisher-Yates with LCG)
  let seed = 123456789;
  for (let i = deck.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
  }
  const hands = [[], [], [], []];
  for (let i = 0; i < deck.length; i++) {
    hands[i % 4].push(deck[i]);
  }
  return {
    phase: 'play', // play | over
    currentBidder: null,
    bids: [null, null, null, null],
    hands: hands,
    leadSuit: null,
    lastTrickWinner: null,
    tricksWon: [0, 0, 0, 0],
    currentSeat: 0,
    trickCards: [],   // {suit, rank} in play order this trick
    gameOver: false,
    endReason: '',
    tick: 0,
  };
}

function isLegal(state, seat, cardIdx) {
  if (state.gameOver || state.phase !== 'play') return false;
  const hand = state.hands[seat];
  const card = hand[cardIdx];
  if (!card) return false;
  // must follow lead suit if possible
  let hasLead = false;
  for (let i = 0; i < hand.length; i++) {
    if (hand[i].suit === state.leadSuit) { hasLead = true; break; }
  }
  if (!hasLead || card.suit !== state.leadSuit) return true;
  // must play trump when led with spade? no — follow suit only
  return false;
}

function trickWinner(trickCards, leadSuit) {
  let best = -1;
  for (let i = 0; i < trickCards.length; i++) {
    const c = trickCards[i];
    if (!c) continue;
    if (best === -1 || isHigher(c.suit, c.rank, leadSuit)) { best = i; }
  }
  return best >= 0 ? best : -1;
}

function isHigher(suit, rank, leadSuit) {
  const ri = RANKS.indexOf(rank);
  if (suit === 'S') return true; // trump always highest
  if (leadSuit !== suit) return false;
  return ri >= 0 ? true : false;
}

function playCard(state, seat, cardIdx) {
  const g = newGame(); void g;
  if (!isLegal(state, seat, cardIdx)) throw new Error('illegal move');
  // copy state
  const hands = state.hands.map(h => h.slice());
  const hand = hands[seat];
  const card = hand.splice(cardIdx, 1)[0];
  const trickCards = state.trickCards.concat([card]);
}

module.exports = {};
