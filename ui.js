'use strict';

/* Spade Contract — DOM view + game controller.
 * Renders the rules state (window.Rules) into the semantic shell declared in
 * index.html and drives bidding / trick play for the human (South) and the
 * three AI seats. */

window.Game = (() => {

// Text goes through window.SCI18N (i18n.js); English source strings are the keys.
const T = (key, vars) => (window.SCI18N ? window.SCI18N.T(key, vars)
  : String(key).replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? vars[k] : m)));

const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAME = { S: () => T('Spades'), H: () => T('Hearts'), D: () => T('Diamonds'), C: () => T('Clubs') };
const SEAT_NAMES = [() => T('South (You)'), () => T('West'), () => T('North (Partner)'), () => T('East')];
const SEAT_SHORT = [() => T('South'), () => T('West'), () => T('North'), () => T('East')];
const seatLabel = (seat) => SEAT_NAMES[seat]();
const HUMAN = 0;
const AI_DELAY = 650;
const TRICK_PAUSE = 1100;

const els = {};
let match = null;
let busy = false;
let lastTrickLen = 0; // trick size at the previous render: only the newest card animates in

/* Scheduled AI / pacing steps belong to one match generation. Starting a new
 * match bumps the generation and cancels the pending step so a timer queued
 * for the previous match can never act on the new one. */
let generation = 0;
let pendingTimer = null;

function $(id) { return document.getElementById(id); }

function clearPending() {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
}

function later(fn, ms) {
  const gen = generation;
  clearPending();
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    if (gen !== generation) return;
    fn();
  }, ms);
}

function sfx(name) {
  if (window.Sfx && typeof window.Sfx.play === 'function') window.Sfx.play(name);
}

/* A spade cutting a non-spade lead gets the trump accent; every other play is
 * a plain card sound. rs.leadSuit already holds the trick's led suit here. */
function playCardSfx(card) {
  const rs = match && match.roundState;
  if (card.suit === 'S' && rs && rs.leadSuit && rs.leadSuit !== 'S') sfx('spadeTrump');
  else sfx('cardPlay');
}

function cardText(card) {
  return card.rank + SUIT_GLYPH[card.suit];
}

function cardAria(card) {
  return T('{rank} of {suit}', { rank: card.rank, suit: SUIT_NAME[card.suit]() });
}

/* --- rendering --- */

function renderScores() {
  $('score-a').textContent = String(match ? match.scores[0] : 0);
  $('score-b').textContent = String(match ? match.scores[1] : 0);
  $('round-label').textContent = T('Round {n} / {total}', {
    n: match ? Math.max(match.round, 1) : 0, total: window.Rules.ROUNDS_PER_MATCH,
  });
}

function renderHands() {
  const rs = match && match.roundState;
  document.querySelectorAll('.hand[data-seat]').forEach((el) => {
    const seat = window.Rules.SEATS.indexOf(el.dataset.seat);
    el.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'seat-label';
    label.textContent = seatLabel(seat);
    el.appendChild(label);
    if (rs) {
      const count = document.createElement('span');
      count.className = 'seat-count';
      const cardsLeft = rs.hands[seat].length;
      count.textContent = rs.phase === 'bid' ? T('bidding') : T('{n} cards', { n: cardsLeft });
      el.appendChild(count);
    }
  });
}

function renderTrick(relabelOnly) {
  const area = $('trick-area');
  area.innerHTML = '';
  const rs = match && match.roundState;
  window.Rules.SEATS.forEach((seatName, seat) => {
    const slot = document.createElement('div');
    slot.className = 'trick-slot trick-' + seatName;
    const played = rs && rs.trick.find(t => t.seat === seat);
    if (played) {
      const c = document.createElement('div');
      c.className = 'card face' + (played.card.suit === 'H' || played.card.suit === 'D' ? ' red' : '');
      c.dataset.corner = cardText(played.card);
      if (rs.trick.length !== lastTrickLen && rs.trick[rs.trick.length - 1].seat === seat) c.classList.add('fresh');
      c.textContent = cardText(played.card);
      if (rs.lastTrickWinner === seat && rs.trick.length === 4) {
        c.classList.add('winner');
        const done = rs.tricksWon.reduce((a, b) => a + b, 0);
        if (window.Fx && !relabelOnly) window.Fx.trickWon(c, match.seed + ':' + match.round + ':' + done, window.Rules.teamOf(seat) === 0);
      }
      c.setAttribute('aria-label', cardAria(played.card) + ', ' + seatLabel(seat));
      slot.appendChild(c);
    } else {
      const ghost = document.createElement('div');
      ghost.className = 'card ghost';
      slot.appendChild(ghost);
    }
    area.appendChild(slot);
  });
  lastTrickLen = rs ? rs.trick.length : 0;
}

/* Your cards are kept and updated in place, one button per card: the hand
 * re-renders on every AI step, and a card rebuilt between press and release
 * would lose the click. */
function renderPlayerHand() {
  const area = $('card-area');
  const rs = match && match.roundState;
  if (!rs) { area.innerHTML = ''; return; }
  const hand = rs.hands[HUMAN];
  const legal = rs.phase === 'play' ? window.Rules.legalPlays(match, HUMAN) : [];
  const inHand = new Set(hand.map(cardText));
  const kept = new Map();
  [...area.children].forEach((b) => {
    if (inHand.has(b.dataset.card) && !kept.has(b.dataset.card)) kept.set(b.dataset.card, b);
    else b.remove(); // gone cards leave first, so the cards that stay are never moved
  });
  hand.forEach((card, idx) => {
    let btn = kept.get(cardText(card));
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.card = cardText(card);
      btn.addEventListener('click', () => onCardClick(Number(btn.dataset.idx)));
    }
    btn.dataset.idx = String(idx);
    btn.className = 'card face hand-card' + (card.suit === 'H' || card.suit === 'D' ? ' red' : '');
    btn.textContent = cardText(card);
    btn.dataset.corner = cardText(card);
    btn.setAttribute('aria-label', cardAria(card));
    const playable = legal.indexOf(idx) !== -1;
    if (rs.phase === 'play') {
      btn.classList.add(playable ? 'playable' : 'blocked');
      // Blocked cards stay clickable on purpose: tapping one explains the
      // follow-suit rule, so they are described rather than marked disabled.
      if (!playable) {
        if (rs.currentSeat === HUMAN && rs.leadSuit) {
          btn.setAttribute('aria-label', T('{card}, not playable, must follow {suit}', { card: cardAria(card), suit: SUIT_NAME[rs.leadSuit]() }));
        }
      }
    }
    if (area.children[idx] !== btn) area.insertBefore(btn, area.children[idx] || null);
  });
}

function renderBidControls() {
  const rs = match && match.roundState;
  const bidding = rs && rs.phase === 'bid' && rs.currentBidder === HUMAN && !match.over;
  document.querySelectorAll('.bid-btn').forEach((b) => {
    b.classList.toggle('hidden', !bidding);
  });
}

function renderTrickList() {
  const list = $('trick-list');
  list.innerHTML = '';
  const rs = match && match.roundState;
  if (!rs) return;
  window.Rules.SEATS.forEach((seatName, seat) => {
    const li = document.createElement('li');
    li.textContent = T('{seat}: {n}', { seat: seatLabel(seat), n: rs.tricksWon[seat] });
    list.appendChild(li);
  });
}

/* Status line: a thunk, so a language change re-renders the same message. */
let statusText = null;
function renderStatus(text) {
  statusText = typeof text === 'function' ? text : () => text;
  $('bid-status').textContent = statusText();
}

function bidSummary() {
  const rs = match.roundState;
  return rs.bids.map((b, i) => SEAT_SHORT[i]() + ' ' + (b === null ? '…' : b)).join(' · ');
}

function renderPhase() {
  const rs = match && match.roundState;
  const title = $('phase-title');
  $('results-panel').classList.toggle('hidden', !(match && match.over));
  if (!match || !rs) {
    title.textContent = T('Welcome');
    renderStatus(() => T('Press New Game to start a match.'));
    return;
  }
  if (match.over) {
    title.textContent = T('Results');
    return;
  }
  if (rs.phase === 'bid') {
    title.textContent = T('Bid');
    renderStatus(rs.currentBidder === HUMAN
      ? () => T('Your bid: how many tricks will you take? ({bids})', { bids: bidSummary() })
      : () => T('{seat} is bidding… ({bids})', { seat: seatLabel(rs.currentBidder), bids: bidSummary() }));
  } else if (rs.phase === 'play') {
    const teamA = rs.bids[0] + rs.bids[2];
    const teamB = rs.bids[1] + rs.bids[3];
    title.textContent = T('Play');
    renderStatus(rs.currentSeat === HUMAN
      ? () => T('Your turn — play a highlighted card. Contracts: A {a}, B {b}.', { a: teamA, b: teamB })
      : () => T('{seat} is playing… Contracts: A {a}, B {b}.', { seat: seatLabel(rs.currentSeat), a: teamA, b: teamB }));
  } else {
    title.textContent = T('Round {n} scored', { n: match.round });
  }
}

/* Language change: relabel everything from the current state in place — no
 * new deal, no AI step, no save, no replayed trick animation. */
function relabel() {
  const status = statusText;
  renderScores();
  renderHands();
  renderTrick(true);
  renderPlayerHand();
  renderTrickList();
  renderPhase();
  if (status) renderStatus(status);
  if (resultText) {
    $('final-score').textContent = resultText.score();
    $('winner-line').textContent = resultText.winner();
  }
  if (lbText) $('results-lb').textContent = lbText();
}

function render() {
  renderScores();
  renderHands();
  renderTrick();
  renderPlayerHand();
  renderBidControls();
  renderTrickList();
  renderPhase();
  // Every state mutation funnels through render(); mirror the match into
  // the save doc (localStorage now, cloud debounced by the platform layer).
  // A null match (welcome screen) must never clobber a saved match on boot.
  if (window.Platform && match) window.Platform.scheduleSave(match);
}

/* --- persistence: restore a saved match after a reload --- */

function sanitizeMatch(m) {
  if (!m || typeof m !== 'object') return null;
  if (typeof m.seed !== 'number' || !isFinite(m.seed)) return null;
  if (typeof m.round !== 'number' || !Array.isArray(m.scores) || m.scores.length !== 2) return null;
  if (typeof m.over !== 'boolean' || typeof m.tick !== 'number') return null;
  const rs = m.roundState;
  if (rs === null) return m.round >= 0 && !m.over ? m : null;
  if (typeof rs !== 'object') return null;
  const suits = window.Rules.SUITS;
  const ranks = window.Rules.RANKS;
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

function resumeMatch(saved) {
  const m = sanitizeMatch(saved);
  if (!m) return;
  generation++;
  clearPending();
  busy = false;
  resultText = null;
  lbText = null;
  match = m;
  const rs = match.roundState;
  if (!match.over && (!rs || rs.phase === 'scored')) {
    // Saved during the inter-round pause (or before the first deal): settle
    // straight into the next deal.
    window.Rules.dealRound(match);
  }
  render();
  advanceAI(); // picks AI bids/plays back up when it is not the human's turn
}

/* Load the save doc (cloud when hosted, else the local cache) and take the
 * saved seat back — unless a fresh match already started while loading. */
function resumeSavedMatch() {
  if (!window.Platform) return;
  window.Platform.init().then((doc) => {
    if (match || !doc || !doc.match) return;
    resumeMatch(doc.match);
  }).catch(() => {});
}

/* --- flow --- */

function newMatch() {
  generation++;
  clearPending();
  busy = false;
  resultText = null;
  lbText = null;
  match = window.Rules.createMatch();
  window.Rules.dealRound(match);
  sfx('cardDeal');
  render();
  advanceAI();
}

function advanceAI() {
  if (!match || match.over || busy) return;
  const rs = match.roundState;

  if (rs.phase === 'bid' && rs.currentBidder !== HUMAN) {
    busy = true;
    later(() => {
      const seat = rs.currentBidder;
      const bid = window.Rules.aiBid(rs.hands[seat]);
      window.Rules.placeBid(match, seat, bid);
      sfx(bid === 0 ? 'bidPass' : 'bidPlace');
      busy = false;
      render();
      advanceAI();
    }, AI_DELAY);
    return;
  }

  if (rs.phase === 'play') {
    if (rs.trick.length === 4) {
      busy = true;
      const winner = rs.lastTrickWinner;
      renderStatus(() => T('{seat} wins the trick.', { seat: seatLabel(winner) }));
      later(() => {
        const result = window.Rules.collectTrick(match);
        sfx(window.Rules.teamOf(rs.lastTrickWinner) === 0 ? 'trickWin' : 'trickLose');
        busy = false;
        if (result) {
          onRoundScored(result);
        } else {
          render();
          advanceAI();
        }
      }, TRICK_PAUSE);
      return;
    }
    if (rs.currentSeat !== HUMAN) {
      busy = true;
      later(() => {
        const seat = rs.currentSeat;
        const idx = window.Rules.aiChoose(match, seat);
        const played = window.Rules.playCard(match, seat, idx);
        playCardSfx(played.card);
        busy = false;
        render();
        advanceAI();
      }, AI_DELAY);
    }
  }
}

// Signed in only: post your team's final match score and show the board rank.
let lbSeq = 0;
let lbText = null;    // thunk for the leaderboard line (follows the language)
let resultText = null; // thunks for the final score / winner lines
const shText = () => window.ShStrings.strings(window.SCI18N ? window.SCI18N.lang : 'en-US');
function postToLeaderboard(score) {
  const line = $('results-lb');
  const seq = ++lbSeq;
  lbText = null;
  if (!line) return;
  line.hidden = true;
  if (!window.Platform || !window.Platform.isHosted()) return;
  line.hidden = false;
  lbText = () => shText().lbPosting;
  line.textContent = lbText();
  window.Platform.submitScore(score).then((r) => {
    if (seq !== lbSeq) return;
    lbText = () => { const L = shText(); return !r.posted ? L.lbNotPosted : r.rank ? L.lbRank.replace('{rank}', r.rank) : L.lbPosted; };
    line.textContent = lbText();
  });
}

function onRoundScored(result) {
  const a = result.teams[0];
  const b = result.teams[1];
  if (result.gameOver) {
    resultText = {
      score: () => T('Final — Team A: {a} · Team B: {b}', { a: a.total, b: b.total }),
      winner: () => (result.winner === 2 ? T('The match is a tie.')
        : (result.winner === 0 ? T('Team A (your team) wins the contract!') : T('Team B wins the contract.'))),
    };
    $('final-score').textContent = resultText.score();
    $('winner-line').textContent = resultText.winner();
    sfx(result.winner === 0 ? 'gameWin' : 'gameLose');
    postToLeaderboard(a.total);
    if (window.Fx) window.Fx.matchOver(result.winner === 0);
  } else {
    $('phase-title').textContent = T('Round {n} scored', { n: result.round });
    const sign = (d) => (d >= 0 ? '+' : '') + d;
    renderStatus(() => T('A: bid {bidA}, took {tookA} ({deltaA}) · B: bid {bidB}, took {tookB} ({deltaB})', {
      bidA: a.contract, tookA: a.taken, deltaA: sign(a.delta), bidB: b.contract, tookB: b.taken, deltaB: sign(b.delta),
    }));
    sfx('roundEnd');
  }
  render();
  if (!result.gameOver) {
    busy = true;
    later(() => {
      busy = false;
      window.Rules.dealRound(match);
      sfx('roundStart');
      render();
      advanceAI();
    }, 2500);
  }
}

function onBid(bid) {
  const rs = match && match.roundState;
  if (!rs || match.over || rs.phase !== 'bid' || rs.currentBidder !== HUMAN || busy) return;
  window.Rules.placeBid(match, HUMAN, bid);
  render();
  advanceAI();
}

function onCardClick(idx) {
  const rs = match && match.roundState;
  if (!rs || match.over || rs.phase !== 'play' || rs.currentSeat !== HUMAN || busy) return;
  if (!window.Rules.isLegal(match, HUMAN, idx)) {
    const lead = rs.leadSuit;
    renderStatus(() => T('You must follow {suit} if you can.', { suit: SUIT_NAME[lead]() }));
    sfx('invalidMove');
    return;
  }
  const played = window.Rules.playCard(match, HUMAN, idx);
  playCardSfx(played.card);
  render();
  advanceAI();
}

function init() {
  ['round-label', 'score-a', 'score-b', 'phase-title', 'bid-status', 'trick-list',
    'results-panel', 'final-score', 'winner-line', 'card-area', 'trick-area',
  ].forEach((id) => { els[id] = $(id); });
  match = null;
  render();
  resumeSavedMatch();
  document.addEventListener('sc-language', relabel);
  if (window.Platform && window.Platform.onConflict) window.Platform.onConflict(adoptMatch);
}

/* Cloud-save conflict: the platform picked another device's snapshot of this
 * match (further along) — continue from it. */
function adoptMatch(saved) { resumeMatch(saved); }

return {
  init: init,
  adoptMatch: adoptMatch,
  currentMatch: () => match,
  newMatch: newMatch,
  onBid: onBid,
  onCardClick: onCardClick,
};

})();
