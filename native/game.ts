// The game controller (the browser build's ui.js without its DOM): the
// match state from rules.js, bidding and trick play for the human (South)
// and the three AI seats, the pacing between AI steps (650 ms a bid or card,
// 1.1 s to show a finished trick, 2.5 s between rounds), the round and match
// results, the status line, the leaderboard post, and the save mirror. Time
// is the runtime's fixed steps (60 a second): a pending step counts down in
// onFixedUpdate, so slow frames, a hidden window and play scripts never
// change the pacing. A new match bumps the generation and drops the pending
// step, so a step queued for the previous match never acts on the new one.
import { Rules, type Card, type Match, type RoundResult, type Suit } from "./classic.ts";
import * as audio from "./audio.ts";
import { N, S, T } from "./i18n.ts";
import * as platform from "./platform.ts";

export const HUMAN = 0;
const STEP_HZ = 60;
const AI_DELAY = Math.round(0.65 * STEP_HZ);
const TRICK_PAUSE = Math.round(1.1 * STEP_HZ);
const ROUND_PAUSE = Math.round(2.5 * STEP_HZ);

const SUIT_GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SUIT_NAME: Record<Suit, string> = { S: N("Spades"), H: N("Hearts"), D: N("Diamonds"), C: N("Clubs") };
const SEAT_NAMES = [N("South (You)"), N("West"), N("North (Partner)"), N("East")];
const SEAT_SHORT = [N("South"), N("West"), N("North"), N("East")];
export const seatLabel = (seat: number): string => T(SEAT_NAMES[seat]!);
export const suitName = (s: Suit): string => T(SUIT_NAME[s]);
export const cardText = (c: Card): string => c.rank + SUIT_GLYPH[c.suit];
export const cardAria = (c: Card): string => T("{rank} of {suit}", { rank: c.rank, suit: suitName(c.suit) });
export const isRed = (c: Card): boolean => c.suit === "H" || c.suit === "D";

export const state = {
  match: null as Match | null,
  busy: false,
  /** A transient status line (the follow-suit notice) until the next state change. */
  notice: null as (() => string) | null,
  /** The last round's result line, shown while the round is scored. */
  roundLine: null as (() => string) | null,
  /** Final score / winner lines once the match is over. */
  result: null as { score: () => string; winner: () => string } | null,
  /** The leaderboard line (signed in only). */
  lb: null as platform.Posted | "posting" | null,
  /** Bumped on every state change (the save mirror, focus and announcements follow it). */
  version: 0,
};

// -- events for the view (sparks, the fresh-card animation) -------------------------------
export type ViewEvent = { type: "card"; seat: number } | { type: "trick"; seat: number; ours: boolean } | { type: "match"; won: boolean } | { type: "deal" };
const viewListeners: ((e: ViewEvent) => void)[] = [];
export function onView(fn: (e: ViewEvent) => void): void { viewListeners.push(fn); }
const emit = (e: ViewEvent): void => { for (const fn of viewListeners) fn(e); };
let announceHook: (text: string) => void = () => undefined;
export function onAnnounce(fn: (text: string) => void): void { announceHook = fn; }

// -- pacing ---------------------------------------------------------------------------------
let generation = 0;
let pending: { steps: number; gen: number; fn: () => void } | null = null;
function later(fn: () => void, steps: number): void { pending = { steps, gen: generation, fn }; }
/** One fixed step (onFixedUpdate). */
export function step(): void {
  if (!pending) return;
  if (--pending.steps > 0) return;
  const p = pending;
  pending = null;
  if (p.gen === generation) p.fn();
}

function changed(): void {
  state.version++;
  state.notice = null;
  platform.saveMatch(state.match);
}

/** A spade cutting a non-spade lead gets the trump accent; every other play is a plain card sound. */
function playCardSfx(card: Card): void {
  const rs = state.match?.roundState;
  if (card.suit === "S" && rs && rs.leadSuit && rs.leadSuit !== "S") audio.play("spadeTrump");
  else audio.play("cardPlay");
}

// -- the status line and titles (ui.js renderPhase) ---------------------------------------
function bidSummary(): string {
  const rs = state.match!.roundState!;
  return rs.bids.map((b, i) => `${T(SEAT_SHORT[i]!)} ${b === null ? "…" : b}`).join(" · ");
}
export function phaseTitle(): string {
  const m = state.match, rs = m?.roundState;
  if (!m || !rs) return T("Welcome");
  if (m.over) return T("Results");
  if (rs.phase === "bid") return T("Bid");
  if (rs.phase === "play") return T("Play");
  return T("Round {n} scored", { n: m.round });
}
export function statusLine(): string {
  if (state.notice) return state.notice();
  const m = state.match, rs = m?.roundState;
  if (!m || !rs) return T("Press New Game to start a match.");
  if (rs.phase === "scored" && !m.over) return state.roundLine ? state.roundLine() : "";
  if (m.over || (rs.phase === "play" && rs.trick.length === 4)) {
    return rs.lastTrickWinner >= 0 ? T("{seat} wins the trick.", { seat: seatLabel(rs.lastTrickWinner) }) : "";
  }
  if (rs.phase === "bid") {
    return rs.currentBidder === HUMAN
      ? T("Your bid: how many tricks will you take? ({bids})", { bids: bidSummary() })
      : T("{seat} is bidding… ({bids})", { seat: seatLabel(rs.currentBidder), bids: bidSummary() });
  }
  const a = (rs.bids[0] ?? 0) + (rs.bids[2] ?? 0), b = (rs.bids[1] ?? 0) + (rs.bids[3] ?? 0);
  return rs.currentSeat === HUMAN
    ? T("Your turn — play a highlighted card. Contracts: A {a}, B {b}.", { a, b })
    : T("{seat} is playing… Contracts: A {a}, B {b}.", { seat: seatLabel(rs.currentSeat), a, b });
}
export function roundLabel(): string {
  const m = state.match;
  return T("Round {n} / {total}", { n: m ? Math.max(m.round, 1) : 0, total: Rules.ROUNDS_PER_MATCH });
}
export function humanBidding(): boolean {
  const m = state.match, rs = m?.roundState;
  return !!(m && rs && rs.phase === "bid" && rs.currentBidder === HUMAN && !m.over);
}
export function humanPlaying(): boolean {
  const m = state.match, rs = m?.roundState;
  return !!(m && rs && !m.over && rs.phase === "play" && rs.currentSeat === HUMAN && rs.trick.length < 4 && !state.busy);
}
export function lbLine(): string | null {
  const r = state.lb;
  if (!r) return null;
  if (r === "posting") return S("lbPosting");
  return !r.posted ? S("lbNotPosted") : r.rank ? S("lbRank", { rank: r.rank }) : S("lbPosted");
}

// -- flow ---------------------------------------------------------------------------------------
function reset(): void {
  generation++;
  pending = null;
  state.busy = false;
  state.result = null;
  state.roundLine = null;
  state.lb = null;
}

export function newMatch(): void {
  audio.play("newGame");
  reset();
  state.match = Rules.createMatch();
  Rules.dealRound(state.match);
  audio.play("cardDeal");
  emit({ type: "deal" });
  changed();
  advanceAI();
}

/** ui.js resumeMatch: take a saved (or another device's) snapshot back. */
export function resumeMatch(m: Match): void {
  reset();
  state.match = m;
  const rs = m.roundState;
  // Saved during the inter-round pause (or before the first deal): settle straight into the next deal.
  if (!m.over && (!rs || rs.phase === "scored")) Rules.dealRound(m);
  emit({ type: "deal" });
  changed();
  advanceAI();
}

function advanceAI(): void {
  const m = state.match;
  if (!m || m.over || state.busy) return;
  const rs = m.roundState!;
  if (rs.phase === "bid" && rs.currentBidder !== HUMAN) {
    state.busy = true;
    later(() => {
      const seat = rs.currentBidder;
      const bid = Rules.aiBid(rs.hands[seat]!);
      Rules.placeBid(m, seat, bid);
      audio.play(bid === 0 ? "bidPass" : "bidPlace");
      state.busy = false;
      changed();
      advanceAI();
    }, AI_DELAY);
    return;
  }
  if (rs.phase !== "play") return;
  if (rs.trick.length === 4) {
    state.busy = true;
    const winner = rs.lastTrickWinner;
    emit({ type: "trick", seat: winner, ours: Rules.teamOf(winner) === 0 });
    announceHook(T("{seat} wins the trick.", { seat: seatLabel(winner) }));
    later(() => {
      const result = Rules.collectTrick(m);
      audio.play(Rules.teamOf(rs.lastTrickWinner) === 0 ? "trickWin" : "trickLose");
      state.busy = false;
      if (result) onRoundScored(result);
      else { changed(); advanceAI(); }
    }, TRICK_PAUSE);
    return;
  }
  if (rs.currentSeat !== HUMAN) {
    state.busy = true;
    later(() => {
      const seat = rs.currentSeat;
      const idx = Rules.aiChoose(m, seat);
      const played = Rules.playCard(m, seat, idx);
      playCardSfx(played.card);
      emit({ type: "card", seat });
      state.busy = false;
      changed();
      advanceAI();
    }, AI_DELAY);
  }
}

function onRoundScored(result: RoundResult): void {
  const a = result.teams[0]!, b = result.teams[1]!;
  if (result.gameOver) {
    state.result = {
      score: () => T("Final — Team A: {a} · Team B: {b}", { a: a.total, b: b.total }),
      winner: () => (result.winner === 2 ? T("The match is a tie.")
        : result.winner === 0 ? T("Team A (your team) wins the contract!") : T("Team B wins the contract.")),
    };
    audio.play(result.winner === 0 ? "gameWin" : "gameLose");
    postToLeaderboard(a.total);
    emit({ type: "match", won: result.winner === 0 });
    announceHook(`${state.result.score()} ${state.result.winner()}`);
  } else {
    const sign = (d: number): string => (d >= 0 ? "+" : "") + d;
    state.roundLine = () => T("A: bid {bidA}, took {tookA} ({deltaA}) · B: bid {bidB}, took {tookB} ({deltaB})", {
      bidA: a.contract, tookA: a.taken, deltaA: sign(a.delta), bidB: b.contract, tookB: b.taken, deltaB: sign(b.delta),
    });
    audio.play("roundEnd");
    announceHook(state.roundLine());
  }
  changed();
  if (!result.gameOver) {
    state.busy = true;
    const m = state.match!;
    later(() => {
      state.busy = false;
      Rules.dealRound(m);
      audio.play("roundStart");
      emit({ type: "deal" });
      changed();
      advanceAI();
    }, ROUND_PAUSE);
  }
}

/** Signed in only: post your team's final match score and show the board rank. */
function postToLeaderboard(score: number): void {
  state.lb = null;
  if (!platform.signedIn()) return;
  state.lb = "posting";
  const gen = generation;
  void platform.postScore(score).then((r) => { if (gen === generation) state.lb = r; });
}

export function onBid(bid: number): void {
  const m = state.match, rs = m?.roundState;
  if (!m || !rs || m.over || rs.phase !== "bid" || rs.currentBidder !== HUMAN || state.busy) return;
  audio.play(bid === 0 ? "bidPass" : "bidPlace");
  Rules.placeBid(m, HUMAN, bid);
  changed();
  advanceAI();
}

export function onCardClick(idx: number): void {
  audio.play("cardSelect");
  const m = state.match, rs = m?.roundState;
  if (!m || !rs || m.over || rs.phase !== "play" || rs.currentSeat !== HUMAN || state.busy) return;
  if (!Rules.isLegal(m, HUMAN, idx)) {
    const lead = rs.leadSuit!;
    const text = (): string => T("You must follow {suit} if you can.", { suit: suitName(lead) });
    state.notice = text;
    announceHook(text());
    audio.play("invalidMove");
    return;
  }
  const played = Rules.playCard(m, HUMAN, idx);
  playCardSfx(played.card);
  emit({ type: "card", seat: HUMAN });
  changed();
  advanceAI();
}
