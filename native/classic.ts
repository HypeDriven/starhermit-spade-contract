// The pure scripts, shared with the node tests and evaluated as classic
// scripts (their globals land on globalThis): the rules (rules.js: deal,
// bidding, legal plays, tricks, scoring, the AI), the save logic (store.js:
// snapshot checks, the browser build's checksummed doc, the merge), the
// string tables (strings.js through i18n.js) and the account strings
// (sh-strings.js).
import { loadClassic } from "starhermit:script";

for (const f of ["rules.js", "store.js", "strings.js", "i18n.js", "sh-strings.js"]) loadClassic(f);

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
interface I18nApi {
  LOCALES: string[];
  T(key: string, vars?: Record<string, string | number> | null): string;
  setLocale(tag: string): void;
  getLang(): string;
}
export interface AccountStrings {
  signIn: string; invite: string; copied: string; copyFailed: string; signedOut: string;
  lbPosting: string; lbRank: string; lbPosted: string; lbNotPosted: string;
}

const G = globalThis as unknown as {
  Rules: RulesApi; SpadeStore: StoreApi; SCI18N: I18nApi; ShStrings: { strings(lang: string): AccountStrings };
};
export const Rules = G.Rules;
export const Store = G.SpadeStore;
export const I18n = G.SCI18N;
export const ShStrings = G.ShStrings;
