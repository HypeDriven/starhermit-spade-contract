// The pure scripts, shared with the node tests and evaluated as classic
// scripts (their globals land on globalThis): the rules (rules.js: deal,
// bidding, legal plays, tricks, scoring, the AI), the save logic (store.js:
// snapshot checks, the browser build's checksummed doc, the merge).
import { loadClassic } from "starhermit:script";

for (const f of ["rules.js", "store.js"]) loadClassic(f);

export type Suit = "S" | "H" | "D" | "C";
export interface Card { suit: Suit; rank: string }
export interface Play { seat: number; card: Card }
export interface RoundState {
  phase: "bid" | "play" | "scored";
  currentBidder: number;
  bids: (number | null)[];
  hands: Card[][];
  leadSuit: Suit | null;
  trick: Play[];
  tricksWon: number[];
  currentSeat: number;
  lastTrickWinner: number;
}
export interface Match {
  seed: number; round: number; scores: [number, number]; bags: [number, number];
  over: boolean; winner: number; endReason: string; tick: number; roundState: RoundState | null;
}
export interface TeamResult { contract: number; taken: number; delta: number; total: number }
export interface RoundResult { round: number; teams: TeamResult[]; gameOver: boolean; winner: number }

interface RulesApi {
  SUITS: Suit[]; RANKS: string[]; SEATS: string[]; ROUNDS_PER_MATCH: number;
  teamOf(seat: number): number;
  createMatch(seed?: number): Match;
  dealRound(m: Match): RoundState | null;
  legalPlays(m: Match, seat: number): number[];
  isLegal(m: Match, seat: number, idx: number): boolean;
  placeBid(m: Match, seat: number, bid: number): (number | null)[];
  aiBid(hand: Card[]): number;
  trickWinner(trick: Play[]): number;
  playCard(m: Match, seat: number, idx: number): { card: Card; completed: { winner: number; team: number } | null };
  collectTrick(m: Match): RoundResult | null;
  aiChoose(m: Match, seat: number): number;
}
interface StoreApi {
  pickMatch(a: Match | null, b: Match | null, preferB: boolean): Match | null;
  sanitizeMatch(m: unknown, rules: RulesApi): Match | null;
  readForeign(text: string | null): { savedAt: string; match: Match | null } | null;
  canon(v: unknown): string;
}
const G = globalThis as unknown as {
  Rules: RulesApi; SpadeStore: StoreApi;
};
export const Rules = G.Rules;
export const Store = G.SpadeStore;
