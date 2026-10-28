// The game's data and the StarHermit platform, on the runtime's modules
// (what platform.js did over the JS SDK):
// - the save (starhermit:storage `saves`, on the device and in the player's
//   cloud slot) is { match }: the current match snapshot, the browser
//   build's one-slot save. Two devices' saves merge on a conflict through
//   store.js pickMatch (the snapshot with more progress), as the browser
//   build's saveconflict handler did, and the game continues from another
//   device's snapshot when it wins. The slot the browser build wrote (the JS
//   SDK's game:<slug> doc: { version, savedAt, match, checksum }) shows as
//   foreign: its match is merged in the same way and the slot replaced once;
// - the browser build's keys in the account's settings KV (muted, volume,
//   graphics) are removed: sound, graphics and language are the runtime's
//   Options now;
// - the player (name and avatar for the top bar's chip), the sync line, the
//   invite link, and posting a finished match's team score through
//   score-script.js (a practice session whose socket carries
//   { type: 'result', scores }, as the JS SDK's submitScores did) with the
//   rank on the board.
import { clipboard, type JsonValue } from "starhermit:engine";
import type { ImageBitmap } from "starhermit:canvas";
import {
  avatar as fetchAvatar, connectGame, requestSignIn as platformSignIn, inviteLink as fetchInviteLink, leaderboards, onPlayerChange, player, sessions, type Leaderboard,
} from "starhermit:platform";
import { saves, settings as store } from "starhermit:storage";
import { Rules, Store, type Match } from "./classic.ts";

/** The browser build's platform KV keys (Settings: mute, volume, the Graphics section). */
const BROWSER_KEYS = ["muted", "volume", "graphics"];

// --- the save ------------------------------------------------------------------------------
let current: Match | null = null;
let lastCore = "";
let lastSavedAt = 0;
let adoptHook: ((m: Match) => void) | null = null;
/** fn(match): another device's (or the browser build's) snapshot won the merge; the game continues from it. */
export function onAdopt(fn: (m: Match) => void): void { adoptHook = fn; }

const matchOf = (d: unknown): Match | null => {
  const m = d && typeof d === "object" ? (d as { match?: unknown }).match : null;
  return Store.sanitizeMatch(m ? JSON.parse(JSON.stringify(m)) : null, Rules);
};
const docOf = (m: Match | null): JsonValue => ({ match: m as unknown as JsonValue });

function persist(opts: { replaceForeign?: boolean } = {}): void {
  try {
    saves.save(docOf(current), { schema: 1, ...opts });
    lastSavedAt = saves.load()?.savedAt ?? lastSavedAt;
  } catch (e) { console.warn(`save: ${String(e)}`); }
}

/** ui.js render() → Platform.scheduleSave: mirror the match snapshot when it changed. */
export function saveMatch(m: Match | null): void {
  if (!m) return; // the welcome screen never clobbers a saved match
  const core = Store.canon(m);
  if (core === lastCore) return;
  lastCore = core;
  current = JSON.parse(JSON.stringify(m)) as Match;
  persist();
}

/** The other snapshot when it beats this device's match (pickMatch), else null. */
function winner(other: Match | null, preferMine: boolean): Match | null {
  if (!other) return null;
  const pick = Store.pickMatch(other, current, preferMine);
  if (!pick || pick === current || Store.canon(pick) === Store.canon(current)) return null;
  return pick;
}
function adopt(m: Match): void {
  current = m;
  lastCore = Store.canon(m);
  if (adoptHook) adoptHook(JSON.parse(JSON.stringify(m)) as Match);
}

saves.onConflict((mine, remote) => {
  const pick = Store.pickMatch(matchOf(remote.data), matchOf(mine?.data ?? null), true);
  return { merged: docOf(pick) };
});
saves.onStatus((_status, state) => {
  if (state === "foreign") { migrateForeign(); return; }
  // The account's save replaced the device's (another device saved last, or a merge): continue from it when it wins.
  const cur = saves.load();
  if (!cur || cur.savedAt === lastSavedAt) return;
  lastSavedAt = cur.savedAt;
  const w = winner(matchOf(cur.data), true);
  if (w) adopt(w);
});
/** The browser build's cloud doc: merged with this device's match, saved over it once. */
function migrateForeign(): void {
  const old = saves.foreign();
  if (!old) return;
  const doc = Store.readForeign(old.text);
  const w = doc ? winner(Store.sanitizeMatch(doc.match, Rules), true) : null;
  if (w) { current = w; lastCore = Store.canon(w); }
  persist({ replaceForeign: true });
  if (w && adoptHook) adoptHook(JSON.parse(JSON.stringify(w)) as Match);
}

/** The top bar's sync line (platform.js renderChip): local (a guest) | saving | synced | offline. */
export function syncState(): "local" | "saving" | "synced" | "offline" {
  if (!player()) return "local";
  const st = saves.state();
  if (st === "error" || st === "read-blocked") return "offline";
  if (st === "loading" || st === "foreign" || st === "uploading" || saves.status() === "pending") return "saving";
  return "synced";
}
export function flush(): void { void saves.flush().catch(() => undefined); }

function dropLegacy(): void {
  const keys = store.legacyKeys();
  if (!keys) return;
  for (const k of keys) if (BROWSER_KEYS.includes(k)) store.removeLegacy(k);
}

/** Reads the device's save (from onStart); the saved match to resume, or null. */
export function initPlatform(): Match | null {
  const cur = saves.load();
  lastSavedAt = cur?.savedAt ?? 0;
  current = matchOf(cur?.data ?? null);
  lastCore = current ? Store.canon(current) : "";
  store.onLegacy(dropLegacy);
  dropLegacy();
  if (saves.state() === "foreign") migrateForeign();
  refreshPlayer();
  return current ? (JSON.parse(JSON.stringify(current)) as Match) : null;
}

/** Sign in with StarHermit (the runtime's sign-in). */
export function requestSignIn(): Promise<void> { return platformSignIn().then(() => undefined, () => undefined); }
/** Copies text to the clipboard; whether it worked. */
export function copy(text: string): boolean {
  try { clipboard.writeText(text); return true; } catch { return false; }
}

// --- the player ------------------------------------------------------------------------------
export function signedIn(): boolean { return !!player(); }
export function displayName(): string { return player()?.displayName ?? ""; }
let invite: string | null = null;
let avatarImage: ImageBitmap | null = null;
/** The invite link, fetched ahead so a button press can copy it at once. */
export function inviteLink(): string | null { return player() ? invite : null; }
/** The player's avatar for the chip (null while loading or without one). */
export function avatarBitmap(): ImageBitmap | null { return player() ? avatarImage : null; }
function refreshPlayer(): void {
  invite = null;
  avatarImage = null;
  board = undefined;
  const me = player();
  if (!me) return;
  fetchInviteLink().then((u) => { invite = u; }, () => { invite = null; });
  fetchAvatar(me.userId).then((b) => { if (player()?.userId === me.userId) avatarImage = b; }, () => undefined);
}
onPlayerChange(() => refreshPlayer());

// --- the high-score board ----------------------------------------------------------------
let board: Leaderboard | null | undefined;
async function highScoreBoard(): Promise<Leaderboard | null> {
  if (board !== undefined) return board;
  const list = await leaderboards.list();
  board = list.find((b) => b.key === "high-score") ?? list[0] ?? null;
  return board;
}
export interface Posted { posted: boolean; rank: number | null }

/** Signed in only: post your team's final match score through score-script.js; { posted, rank }. Never rejects. */
export async function postScore(total: number): Promise<Posted> {
  const me = player();
  if (!me) return { posted: false, rank: null };
  const score = Math.round(total);
  let accepted: string[] = [];
  try {
    const sessionId = await sessions.practice();
    accepted = await new Promise<string[]>((resolve) => {
      const socket = connectGame(sessionId);
      let done = false;
      const finish = (list: string[]): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.close();
        resolve(list);
      };
      const timer = setTimeout(() => finish([]), 15000);
      socket.on("open", () => { socket.sendCommand({ type: "result", scores: { "high-score": score } }); });
      socket.on("game", (d) => {
        const m = d as { type?: string; accepted?: string[] } | null;
        if (m && m.type === "result-ack") finish(Array.isArray(m.accepted) ? m.accepted : []);
      });
      socket.on("error", () => finish([]));
      socket.on("stopped", () => finish([]));
      socket.on("abandoned", () => finish([]));
    });
  } catch { return { posted: false, rank: null }; }
  if (!accepted.includes("high-score")) return { posted: false, rank: null };
  try {
    const b = await highScoreBoard();
    if (!b) return { posted: true, rank: null };
    const r = await leaderboards.entries(b.id, { pageSize: 100 });
    const mine = r.items.find((e) => e.userId === me.userId);
    return { posted: true, rank: mine ? mine.rank : null };
  } catch { return { posted: true, rank: null }; }
}
