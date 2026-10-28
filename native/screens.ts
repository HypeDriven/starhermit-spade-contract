// The browser build's page (index.html with style.css) as starhermit:ui,
// built every frame: the top bar (title, round, the signed-in chip with the
// avatar, name and sync state, Help, Settings, Sign in / Invite a friend,
// New Game), the score panel, the card table (table.ts), the side panel
// (phase, status, tricks taken, the results with the leaderboard line, the
// bid buttons and your hand as card buttons), the How to play dialog and
// the toast. The CSS breakpoints are layouts picked by the window's logical
// size: wide (≥ 1024 px: three columns), compact (stacked: scores, table,
// side panel; ≤ 480 px phones get a two-row top bar with full-width
// buttons) and short landscape (≤ 500 px tall: the table on the left, the
// scores and side panel on the right). Settings opens the runtime's Options
// (sound, graphics, language, controls, accessibility), which replaced the
// old Settings dialog and its Graphics section.
import { frame, openMenu } from "starhermit:engine";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import { primaryPointer } from "starhermit:input";
import { Rules } from "./classic.ts";
import * as audio from "./audio.ts";
import * as fx from "./fx.ts";
import * as game from "./game.ts";
import { S, T } from "./i18n.ts";
import * as platform from "./platform.ts";
import type { Look } from "./quality.ts";
import * as table from "./table.ts";

export const view = {
  help: false,
  helpOpened: -1,
  toast: null as { text: () => string; until: number } | null,
};
let look: Look | null = null;
export function setLook(l: Look): void { look = l; }

// ------------------------------------------------------------------ layout
type Mode = "wide" | "compact" | "land";
interface Layout { W: number; H: number; k: number; mode: Mode; narrow: boolean; cw: number; gap: number }
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
function layoutNow(): Layout {
  const f = frame();
  const k = ui.preferences().scale;
  const sa = f.safeArea;
  const W = Math.max(1, (f.width - sa.left - sa.right) / k), H = Math.max(1, (f.height - sa.top - sa.bottom) / k);
  const mode: Mode = H <= 500 && W > H ? "land" : W >= 1024 ? "wide" : "compact";
  const cw = mode === "land" ? 40 : mode === "wide" ? clamp(W * 0.1, 38, 54) : clamp(W * 0.095, 34, 48);
  const narrow = W <= 480;
  return { W, H, k, mode, narrow, cw, gap: mode === "land" ? 6 : narrow ? 8 : 12 };
}
/** Heights of blocks as last laid out (logical pixels). */
const lastH = new Map<string, number>();
const track = (key: string, r: ui.Rect): void => { lastH.set(key, r.height / ui.preferences().scale); };
const H = (key: string, def: number): number => lastH.get(key) ?? def;
const gapH = (h: number): void => { if (h > 0) ui.widget("", { role: "none", size: { width: 1, height: h } }); };

function textW(text: string, style: string, kind?: "button"): number {
  return ui.measureText(text, { ...(kind ? { kind } : {}), style }).width / ui.preferences().scale;
}
/** Text up to `width` wide: one label when it fits, else a paragraph. */
function para(text: string, width: number, style: string, id: string): ui.Rect {
  if (textW(text, style) <= width + 1) return ui.style(style).id(id).label(text);
  return ui.style(style).id(id).paragraph(text, width);
}
/** Items of known widths in rows no wider than `width` (CSS flex-wrap). */
function wrapRows<Tt>(items: Tt[], width: (t: Tt) => number, max: number, gap: number): Tt[][] {
  const rows: Tt[][] = [[]];
  let used = 0;
  for (const it of items) {
    const w = width(it);
    const row = rows[rows.length - 1]!;
    if (row.length && used + gap + w > max) { rows.push([it]); used = w; continue; }
    used += (row.length ? gap : 0) + w;
    row.push(it);
  }
  return rows.filter((r) => r.length);
}

/** Presses collected while building; acted on after the frame's UI is built. */
const pressed: (() => void)[] = [];
interface Btn { id: string; text: string; primary?: boolean; act: () => void; width?: number; height?: number }
const btnClass = (b: Btn): string => (b.primary ? (look?.bloom ? "btn-primary-glow" : "btn-primary") : "btn");
function button(b: Btn, L: Layout): void {
  const size: ui.Style = {};
  if (b.width != null) Object.assign(size, { width: b.width, text: { align: "center" } });
  if (L.mode === "land") Object.assign(size, { minHeight: 36, padding: { top: 4, bottom: 4, start: 10, end: 10 } });
  if (b.height != null) size.minHeight = b.height;
  if (ui.style(btnClass(b), size).id(b.id).button(b.text)) pressed.push(b.act);
}
function btnW(b: Btn, L: Layout): number {
  const w = textW(b.text, btnClass(b), "button");
  return L.mode === "land" ? w - 8 : w;
}

// ------------------------------------------------------------------ the frame
export function drawScreens(): void {
  const L = layoutNow();
  fx.drawSky();
  const sa = frame().safeArea;
  ui.place("page", { anchor: "top-start", x: sa.left / L.k, y: sa.top / L.k }, () => {
    ui.column("app", () => {
      topbar(L);
      content(L);
    }, { width: L.W, height: L.H, spacing: 0 });
  });
  helpDialog(L);
  toast(L);
  // the sparks over everything (a widget that takes no pointer)
  ui.place("fx-sparks", { anchor: "top-start" }, () => { ui.widget("", { role: "none", size: { width: 0, height: 0 }, draw: () => fx.drawSparks() }); });
  autoFocus(L);
  for (const a of pressed.splice(0)) a();
}

// ------------------------------------------------------------------ the top bar
function topbarButtons(): Btn[] {
  const list: Btn[] = [
    { id: "btn-help", text: T("Help"), act: openHelp },
    { id: "btn-settings", text: T("Settings"), act: () => { audio.play("uiOpen"); openMenu(); } },
  ];
  if (!platform.signedIn()) list.push({ id: "btn-signin", text: S("signIn"), act: signIn });
  else if (platform.inviteLink()) list.push({ id: "btn-invite", text: S("invite"), act: copyInvite });
  list.push({ id: "btn-new-game", text: T("New Game"), primary: true, act: () => game.newMatch() });
  return list;
}
export function openHelp(): void {
  audio.play("uiOpen");
  view.help = true;
  view.helpOpened = frame().frame;
  ui.setFocus("help-close");
}
function closeHelp(): void {
  if (!view.help) return;
  audio.play("uiClick");
  view.help = false;
  ui.setFocus(null);
}
export function closeDialog(): boolean {
  if (!view.help || frame().frame === view.helpOpened) return false;
  closeHelp();
  return true;
}
function signIn(): void { audio.play("uiClick"); void platform.requestSignIn(); }
function copyInvite(): void {
  audio.play("uiClick");
  const link = platform.inviteLink();
  if (!link) return;
  if (platform.copy(link)) showToast(() => S("copied"));
  else showToast(() => `${S("copyFailed")}: ${link}`);
}
export function showToast(text: () => string): void { view.toast = { text, until: frame().time + 3.2 }; }

function syncText(): string {
  const s = platform.syncState();
  return s === "synced" ? T("synced") : s === "saving" ? T("saving…") : T("offline");
}
function chipWidth(): number {
  if (!platform.signedIn()) return 0;
  const name = platform.displayName();
  return 24 + 1 + textW(name, "player-name") + 8 + 13 + textW(syncText(), "sync-status") + (platform.avatarBitmap() ? 32 : 0) + 2;
}
function chip(): void {
  if (!platform.signedIn()) return;
  const state = platform.syncState();
  ui.style("player-chip").row("player-chip", () => {
    const av = platform.avatarBitmap();
    if (av) ui.widget("", { role: "none", size: { width: 24, height: 24 }, draw: (r) => { draw.image(av, r.x, r.y, r.width, r.height); } });
    ui.style("player-name").id("player-name").label(platform.displayName());
    ui.widget("", { role: "none", size: { width: 8, height: 8 }, draw: (r) => {
      draw.circle(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, state === "synced" ? "#4caf7d" : state === "saving" ? "#e3b341" : "#b3243a");
    } });
    ui.style("sync-status").id("sync-status").label(syncText());
  }, { spacing: 6, align: "center" });
}

function topbar(L: Layout): void {
  const btns = topbarButtons();
  const bw = btns.map((b) => btnW(b, L));
  const titleCls = look?.bloom ? "game-title-glow" : "game-title";
  const titleSize = L.mode === "land" ? 17.6 : clamp(L.W * 0.04, 17.6, 24);
  const titleStyle: ui.Style = { text: { size: titleSize } };
  const title = "Spade Contract";
  const tW = ui.measureText(title, { style: [titleCls, titleStyle] }).width / L.k;
  const round = game.roundLabel();
  const rW = textW(round, "round-info");
  const cW = chipWidth();
  const padX = L.narrow || L.mode === "land" ? 10 : 16;
  const inner = L.W - padX * 2;
  const leftW = tW + 16 + rW + (cW ? 16 + cW : 0);
  const btnsW = bw.reduce((a, b) => a + b, 0) + 8 * (btns.length - 1);
  const oneRow = leftW + 16 + btnsW <= inner;
  const pad = L.mode === "land" ? { top: 4, bottom: 4, start: padX, end: padX } : L.narrow ? { top: 6, bottom: 8, start: padX, end: padX } : { top: 8, bottom: 10, start: padX, end: padX };
  const left = (): void => {
    ui.row("brand", () => {
      ui.style(titleCls, titleStyle).id("game-title").label(title);
      ui.style("round-info").id("round-label").label(round);
      chip();
    }, { spacing: 16, align: "center" });
  };
  const right = (stretch: boolean): void => {
    const rows = wrapRows(btns, (b) => btnW(b, L), inner, 8);
    ui.column(T("Menu actions"), () => {
      rows.forEach((row, ri) => {
        ui.row(`top-actions-${ri}`, () => {
          // flex: 1 1 auto (≤ 480 px): every button takes an equal share of the room left over
          const total = row.reduce((a, b) => a + btnW(b, L), 0);
          const extra = stretch ? Math.max(0, (inner - 8 * (row.length - 1) - total) / row.length) : 0;
          for (const b of row) button(stretch ? { ...b, width: btnW(b, L) + extra } : b, L);
        }, { spacing: 8, align: "center" });
      });
    }, { spacing: 8, align: "end" });
  };
  const cls = look?.detailed && !ui.preferences().highContrast ? "topbar-detailed" : "topbar";
  track("topbar", ui.style(cls, { padding: pad }).column("topbar", () => {
    if (oneRow) {
      ui.row("topbar-row", () => { left(); ui.spacer(); right(false); }, { width: inner, align: "center" });
    } else {
      ui.column("topbar-rows", () => {
        left();
        if (L.narrow) right(true);
        else ui.row("topbar-row2", () => { ui.spacer(); right(false); }, { width: inner });
      }, { width: inner, spacing: L.mode === "land" ? 4 : 8 });
    }
  }, { width: L.W, spacing: 0 }));
}

// ------------------------------------------------------------------ the content
function panelClass(): string {
  const hc = ui.preferences().highContrast;
  const det = look?.detailed && !hc, sh = look?.shadows === "high";
  return det ? (sh ? "panel-detailed-shadow" : "panel-detailed") : sh ? "panel-shadow" : "panel";
}

function content(L: Layout): void {
  const topH = H("topbar", 62);
  const g = L.gap;
  const availH = Math.max(100, L.H - topH);
  if (L.mode === "wide") {
    const cwid = Math.min(L.W, 1200) - g * 2;
    const rest = cwid - g * 2;
    const scoreW = Math.min(220, rest * 0.25), sideW = Math.min(320, rest * 0.35);
    const tableW = Math.max(0, rest - scoreW - sideW);
    const h = availH - g * 2;
    ui.row("content", () => {
      ui.row("content-grid", () => {
        scorePanel(L, scoreW, h);
        tableWidget(L, tableW, h);
        sidePanel(L, sideW, h);
      }, { spacing: g, align: "start" });
    }, { width: L.W, justify: "center", padding: { top: g }, align: "start" });
    return;
  }
  if (L.mode === "land") {
    const rightW = clamp(L.W * 0.5, 300, 420);
    const tableW = Math.max(0, L.W - g * 3 - rightW);
    const h = availH - g * 2;
    ui.row("content", () => {
      tableWidget(L, tableW, h);
      ui.column("right", () => {
        scorePanel(L, rightW, null);
        sidePanel(L, rightW, Math.max(60, h - H("score", 40) - g));
      }, { spacing: g, width: rightW });
    }, { spacing: g, padding: { top: g, start: g, end: g }, align: "start" });
    return;
  }
  // compact: scores, the table, the side panel; the table takes the room left (the page scrolls when even its minimum does not fit)
  const w = L.W - g * 2;
  const minTable = 3 * (L.cw * 1.42 + 6) + 12 + 2 * 44 + 30;
  const tableH = Math.max(minTable, availH - g * 4 - H("score", 50) - H("side", 260));
  const body = (): void => {
    track("compact-body", ui.column("compact-body", () => {
      scorePanel(L, w, null);
      tableWidget(L, w, tableH);
      sidePanel(L, w, null);
    }, { spacing: g, padding: { top: g, bottom: g, start: g, end: g }, width: L.W }));
  };
  if (H("compact-body", 0) > availH + 1) ui.scrollArea("compact-scroll", { width: L.W, height: availH }, body);
  else body();
}

function scorePanel(L: Layout, width: number, height: number | null): void {
  const m = game.state.match;
  const vals = [m ? m.scores[0] : 0, m ? m.scores[1] : 0];
  const labels = [T("Team A (South / North)"), T("Team B (West / East)")];
  const valCls = look?.bloom ? "score-value-glow" : "score-value";
  const small = L.narrow || L.mode === "land";
  const labelCls = small ? "score-label-small" : "score-label";
  const pad = L.mode === "wide" ? 12 : L.mode === "land" ? { top: 4, bottom: 4, start: 10, end: 10 } : small ? { top: 6, bottom: 6, start: 10, end: 10 } : { top: 8, bottom: 8, start: 12, end: 12 };
  const padX = typeof pad === "number" ? pad : pad.start;
  const inner = width - padX * 2 - 2;
  const vStyle: ui.Style = L.mode === "land" ? { text: { size: 18 } } : small ? { text: { size: 20 } } : {};
  const scoreRow = (i: number, w: number): void => {
    ui.row(`score-row-${i}`, () => {
      const vw = ui.measureText(String(vals[i]), { style: [valCls, vStyle] }).width / L.k;
      para(labels[i]!, Math.max(40, w - vw - 6), labelCls, `score-label-${i}`);
      ui.spacer();
      ui.style(valCls, vStyle).id(`score-${i}`).label(String(vals[i]));
    }, { width: w, align: "center", ...(L.mode === "wide" ? { padding: { top: 6, bottom: 6 } } : {}) });
  };
  const r = ui.style(panelClass(), { padding: pad, ...(height != null ? { height } : {}), width }).column(T("Score summary"), () => {
    if (L.mode === "wide") { scoreRow(0, inner); scoreRow(1, inner); return; }
    const gap = small ? 12 : 18;
    // compact: side by side; phones and landscape share the line equally
    const half = (inner - gap) / 2;
    ui.row("score-rows", () => { scoreRow(0, half); scoreRow(1, half); }, { spacing: gap, align: "center" });
  }, { spacing: 0 });
  track("score", r);
}

function tableWidget(L: Layout, width: number, height: number): void {
  ui.widget(T("Card table"), {
    role: "none", size: { width, height },
    draw: (r, st) => table.drawTable(r, st.scale, L.cw, L.mode === "land" || L.narrow),
  });
  table.tableTargets();
}

function sidePanel(L: Layout, width: number, height: number | null): void {
  const padX = L.mode === "land" ? 10 : 12;
  const inner = width - padX * 2 - 2;
  const pad = L.mode === "land" ? { top: 8, bottom: 8, start: 10, end: 10 } : 12;
  const build = (w: number): void => {
    track("side-inner", ui.column("side-inner", () => sideContent(L, w), { width: w, spacing: 0 }));
  };
  const r = ui.style(panelClass(), { padding: pad, width, ...(height != null ? { height } : {}) }).column("side-panel", () => {
    const avail = height != null ? height - (typeof pad === "number" ? pad * 2 : pad.top + pad.bottom) - 2 : 0;
    if (height != null && H("side-inner", 0) > avail + 1) ui.scrollArea("side-scroll", { width: inner, height: avail }, () => build(inner - 10));
    else build(inner);
  }, { spacing: 0 });
  if (height == null) track("side", r);
}

function sideContent(L: Layout, w: number): void {
  const m = game.state.match, rs = m?.roundState ?? null;
  const land = L.mode === "land";
  para(game.phaseTitle(), w, "panel-title", "phase-title");
  gapH(land ? 2 : 6);
  para(game.statusLine(), w, "status-text", "bid-status");
  gapH(land ? 6 : 10);
  if (rs) {
    const items = Rules.SEATS.map((_s, seat) => T("{seat}: {n}", { seat: game.seatLabel(seat), n: rs.tricksWon[seat]! }));
    const rows = wrapRows(items, (t) => textW(t, "trick-item"), w, 12);
    ui.column(T("Tricks taken this round"), () => {
      rows.forEach((row, ri) => ui.row(`trick-row-${ri}`, () => { row.forEach((t, i) => ui.style("trick-item").id(`trick-${ri}-${i}`).label(t)); }, { spacing: 12 }));
    }, { spacing: 4 });
    gapH(land ? 6 : 12);
  }
  if (m && m.over && game.state.result) {
    const res = game.state.result;
    ui.style("results-box").column("results-panel", () => {
      const iw = w - 22;
      para(T("Results"), iw, "panel-title", "results-title");
      gapH(4);
      para(res.score(), iw, "status-text", "final-score");
      gapH(4);
      para(res.winner(), iw, "winner-line", "winner-line");
      const lb = game.lbLine();
      if (lb) { gapH(4); para(lb, iw, "status-text", "results-lb"); }
    }, { width: w, spacing: 0 });
    gapH(10);
  }
  if (game.humanBidding()) {
    const names = [T("Pass (0)"), T("Bid 1"), T("Bid 2"), T("Bid 3")];
    const bids: Btn[] = names.map((text, n) => ({ id: `bid-${n}`, text, primary: n > 0, act: () => game.onBid(n) }));
    const rows = wrapRows(bids, (b) => btnW(b, L), w, 8);
    ui.column("bids", () => {
      rows.forEach((row, ri) => ui.row(`bid-row-${ri}`, () => { for (const b of row) button(b, L); }, { spacing: 8 }));
    }, { spacing: 8 });
    gapH(land ? 6 : 10);
  }
  hand(L, w);
}

/** Your hand (#card-area): one button per card, wrapping and centred; blocked cards stay pressable (they explain the follow-suit rule). */
function hand(L: Layout, w: number): void {
  const m = game.state.match, rs = m?.roundState;
  if (!m || !rs) return;
  const cards = rs.hands[game.HUMAN]!;
  if (!cards.length) return;
  const playing = rs.phase === "play";
  const legal = playing ? Rules.legalPlays(m, game.HUMAN) : [];
  const myTurn = playing && rs.currentSeat === game.HUMAN;
  const cw = L.cw;
  const bw = Math.max(cw, 44), bh = Math.max(cw * 1.42, 44);
  const gap = L.mode === "land" ? 6 : 5;
  const idx = cards.map((_c, i) => i);
  const rows = wrapRows(idx, () => bw, w, gap);
  gapH(L.mode === "wide" ? 6 : 0);
  ui.column("card-area", () => {
    rows.forEach((row, ri) => ui.row(`hand-row-${ri}`, () => {
      for (const i of row) {
        const card = cards[i]!;
        const playable = legal.includes(i);
        const name = game.cardAria(card);
        const desc = playing && !playable && myTurn && rs.leadSuit ? T("{card}, not playable, must follow {suit}", { card: name, suit: game.suitName(rs.leadSuit) }) : "";
        const res = ui.id(`card-${game.cardText(card)}`).widget(name, {
          role: "button", style: "hand-card", size: { width: bw, height: bh }, ...(desc ? { description: desc } : {}),
          draw: (r, st) => {
            table.drawCard(card, r.x, r.y, r.width, r.height, st.scale, {
              playable: playing && playable, blocked: playing && !playable, lifted: playing && playable && (st.hovered || st.focused), focused: st.focused, cw,
            });
          },
        });
        if (res.activated) pressed.push(() => game.onCardClick(i));
      }
    }, { spacing: gap }));
  }, { spacing: gap, align: "center", width: w, padding: { top: 6 } });
}

// ------------------------------------------------------------------ focus for keys and pads
let focusedVersion = -1;
/** On your bid or your turn, the focus starts on the first bid / playable card (keyboard and pad play); not for touch. */
function autoFocus(L: Layout): void {
  const v = game.state.version;
  if (v === focusedVersion || view.help) return;
  const touch = primaryPointer() === "coarse" || L.narrow;
  if (game.humanBidding()) {
    focusedVersion = v;
    if (!touch) ui.setFocus("bid-0");
    return;
  }
  if (game.humanPlaying()) {
    focusedVersion = v;
    const m = game.state.match!, rs = m.roundState!;
    const first = Rules.legalPlays(m, game.HUMAN)[0];
    if (!touch && first !== undefined) ui.setFocus(`card-${game.cardText(rs.hands[game.HUMAN]![first]!)}`);
  }
}

// ------------------------------------------------------------------ How to play
function helpDialog(L: Layout): void {
  if (!view.help) return;
  const w = Math.min(520, L.W - 32);
  const stillOpen = ui.dialog("How to play", "", true, () => {
    ui.style("dialog-panel").column("help-panel", () => {
      ui.style("dialog-head").row("help-head", () => {
        ui.style("dialog-title").id("help-title").label(T("How to play"));
        ui.spacer();
        if (ui.style("btn").id("help-close").button(T("Close"))) pressed.push(closeHelp);
      }, { width: w - 2, align: "center" });
      const lines = [
        `${T("Goal:")} ${T("across five rounds, your team (South and North) bids how many tricks it will take, then tries to make that contract.")}`,
        ...[
          T("Each player bids 0–3 tricks. Your team's contract is the sum of its bids."),
          T("South leads the first trick; afterwards the winner of a trick leads the next one."),
          T("You must follow the led suit if you can."),
          T("Spades are always trump and beat every other suit."),
          T("Highest trump — or highest card of the led suit — wins the trick; the winner leads next."),
          T("Make your contract: +10 per trick bid, +1 per extra trick. Miss it: −10 per trick bid."),
          T("After five rounds the team with the higher score wins."),
        ].map((t) => `• ${t}`),
      ];
      const bodyW = w - 30;
      const body = (): void => {
        track("help-body", ui.column("help-body", () => {
          lines.forEach((t, i) => { if (i) gapH(i === 1 ? 10 : 6); ui.style("dialog-text").id(`help-${i}`).paragraph(t, bodyW); });
        }, { width: w - 2, spacing: 0, padding: { top: 12, bottom: 12, start: 14, end: 14 } }));
      };
      const maxBody = L.H - 48 - H("help-head", 66);
      if (H("help-body", 0) > maxBody) ui.scrollArea("help-scroll", { width: w - 2, height: maxBody }, body);
      else body();
    }, { width: w, spacing: 0 });
  });
  if (!stillOpen && frame().frame > view.helpOpened) pressed.push(closeHelp);
}

// ------------------------------------------------------------------ toast
function toast(L: Layout): void {
  const t = view.toast;
  if (!t) return;
  if (t.until < frame().time) { view.toast = null; return; }
  const w = Math.min(L.W * 0.92, 520);
  ui.place("toast", { anchor: "bottom", y: 16 }, () => {
    ui.style("sh-toast").column("toast-box", () => { para(t.text(), w - 34, "toast-text", "toast-text"); }, { align: "center" });
  });
}
