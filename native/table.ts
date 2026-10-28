// The card table and the cards (the browser build's .table-panel grid and
// .card elements with their style.css looks) as starhermit:draw, drawn by
// the table's widget in its rectangle: the felt (a gradient; with Detail
// the lamp-lit radial felt, its woven texture and the brass rim), the drop
// shadow by the Shadows tier, the four seats (name pill and card count) at
// their compass points, and the trick area in the middle (a dashed ghost
// slot per seat, or the card that seat played, sliding in when fresh with
// Detail, the winner outlined in gold and glowing with Bloom). Card faces
// (plain, or with Detail the card stock, bevel, inner hairline and corner
// index) are shared with the hand's buttons (screens.ts). The fx.js felt and
// paper textures are painted once into small canvases from the old seeded
// stream and tiled.
import { frame } from "starhermit:engine";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import { OffscreenCanvas } from "starhermit:canvas";
import type { Card } from "./classic.ts";
import { cardAria, cardText, isRed, seatLabel, state } from "./game.ts";
import { T } from "./i18n.ts";
import type { Look } from "./quality.ts";

let look: Look | null = null;
export function setLook(l: Look): void { look = l; }

// ------------------------------------------------------------------ textures (fx.js ensureTextures)
let felt: OffscreenCanvas | null = null;
let paper: OffscreenCanvas | null = null;
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
export function initTextures(): void {
  // felt weave: fine two-way fibre noise, tiled
  felt = new OffscreenCanvas(96, 96);
  const fx = felt.getContext("2d")!;
  const rnd = rng(0xfe17);
  for (let i = 0; i < 1600; i++) {
    const px = rnd() * 96, py = rnd() * 96;
    const light = rnd() < 0.5;
    fx.fillStyle = light ? `rgba(255,255,255,${0.03 + rnd() * 0.04})` : `rgba(0,0,0,${0.05 + rnd() * 0.06})`;
    if (rnd() < 0.5) fx.fillRect(px, py, 2 + rnd() * 3, 1);
    else fx.fillRect(px, py, 1, 2 + rnd() * 3);
  }
  // card stock: soft paper grain
  paper = new OffscreenCanvas(64, 64);
  const pp = paper.getContext("2d")!;
  for (let i = 0; i < 700; i++) {
    pp.fillStyle = `rgba(90,70,40,${0.02 + rnd() * 0.04})`;
    pp.fillRect(rnd() * 64, rnd() * 64, 1, 1);
  }
}

const motion = (): boolean => !ui.preferences().reducedMotion;
const ACCENT = "#e3b341";

// ------------------------------------------------------------------ card faces
export interface CardLook {
  /** Hand buttons: playable (glow with Bloom, lift on hover/focus) or blocked (dimmed) during play. */
  playable?: boolean; blocked?: boolean; lifted?: boolean; focused?: boolean;
  /** The trick's winning card. */
  winner?: boolean;
  /** 0 … 1 into the fresh-card slide (1 = settled). */
  enter?: number;
  /** The card width the text sizes follow (the old --card-w), logical px. */
  cw: number;
}
type Shadow = { x?: number; y?: number; blur?: number; spread?: number; color: string; inset?: boolean };
function dropShadows(lifted: boolean): Shadow[] {
  const s = look?.shadows ?? "low";
  if (lifted && (s === "medium" || s === "high")) return [{ y: 2, blur: 2, color: "#0000004d" }, { y: 12, blur: 20, color: "#00000073" }];
  if (s === "off") return [];
  if (s === "low") return [{ y: 2, blur: 5, color: "#00000059" }];
  if (s === "medium") return [{ y: 1, blur: 1, color: "#0000004d" }, { y: 4, blur: 10, color: "#00000061" }];
  return [{ y: 1, blur: 1, color: "#00000059" }, { y: 5, blur: 12, color: "#00000066" }, { y: 14, blur: 26, color: "#00000038" }];
}

/** One card face in window pixels (x, y, w, h); k = the UI scale. */
export function drawCard(card: Card, x: number, y: number, w: number, h: number, k: number, o: CardLook): void {
  const L = look;
  const detailed = !!L?.detailed && !ui.preferences().highContrast;
  let opacity = o.blocked ? 0.45 : 1;
  let lift = o.lifted && motion() ? 6 * k : 0;
  let scale = 1;
  if (o.enter !== undefined && o.enter < 1 && detailed && motion()) {
    const e = 1 - Math.pow(1 - o.enter, 3);
    lift += 12 * k * (1 - e);
    scale = 1 + 0.08 * (1 - e);
    opacity *= 0.2 + 0.8 * e;
  }
  const cw = w * scale, ch = h * scale;
  const cx = x - (cw - w) / 2, cy = y - (ch - h) / 2 - lift;
  const shadow: Shadow[] = [];
  if (detailed) shadow.push({ y: 1, color: "#fffffff2", inset: true }, { y: -2, color: "#78603229", inset: true });
  shadow.push(...dropShadows(!!o.lifted));
  if (L?.bloom && o.winner) {
    const pulse = motion() ? 0.5 + 0.5 * Math.sin(frame().time * Math.PI / 1.1) : 0.5;
    shadow.push({ blur: 20 + 7 * pulse, spread: 4, color: withAlpha("#ffd26e", 0.6 + 0.2 * pulse) });
  } else if (L?.bloom && o.playable) shadow.push({ blur: 10, spread: 1, color: "#e3b34159" });
  const borderCol = detailed ? "#c3b89f" : L?.shadows === "off" ? "#8f887a" : "#b9b2a4";
  draw.box(cx, cy, cw, ch, {
    background: detailed
      ? [{ type: "linear", angle: 155, stops: [{ color: "#ffffff99", at: 0 }, { color: "#ffffff00", at: 0.4 }] },
        { type: "linear", angle: 180, stops: [{ color: "#fcf9f1", at: 0 }, { color: "#eee6d4", at: 1 }] }]
      : "#f7f4ec",
    border: { width: 1, color: borderCol }, radius: 7, shadow, opacity,
  });
  if (detailed && paper) draw.image(paper, cx + 2 * k, cy + 2 * k, cw - 4 * k, ch - 4 * k, { tint: [1, 1, 1, opacity] });
  const ink = isRed(card) ? "#b3243a" : "#1a2430";
  if (detailed) {
    draw.box(cx + 3 * k, cy + 3 * k, cw - 6 * k, ch - 6 * k, { radius: 4, opacity, border: { width: 1, color: isRed(card) ? "#b3243a24" : "#1a24301a" } });
    const cs = Math.max(7, o.cw * 0.17) * k * scale;
    draw.text(cardText(card), cx + 3 * k, cy + 2 * k, { size: cs, weight: 700, color: withAlpha(ink, 0.75 * opacity) });
  }
  const size = o.cw * 0.36 * k * scale;
  const label = cardText(card);
  const m = draw.measureText(label, { size, weight: 700, letterSpacing: -0.02 * size });
  draw.text(label, cx + cw / 2, cy + ch / 2 - m.height / 2, { size, weight: 700, align: "center", letterSpacing: -0.02 * size, color: withAlpha(ink, opacity) });
  if (o.winner) draw.box(cx - 4 * k, cy - 4 * k, cw + 8 * k, ch + 8 * k, { radius: 10, border: { width: 3, color: ACCENT } });
  else if (o.lifted || o.focused) draw.box(cx - 2 * k, cy - 2 * k, cw + 4 * k, ch + 4 * k, { radius: 8, border: { width: 2, color: ACCENT } });
}
function withAlpha(hex: string, a: number): string { return hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0"); }

/** An empty trick slot (.card.ghost): a faint dashed outline. */
function ghost(x: number, y: number, w: number, h: number, k: number): void {
  const detailed = !!look?.detailed;
  draw.box(x, y, w, h, { radius: 7, background: detailed
    ? { type: "radial", shape: "circle", center: { x: 0.5, y: 0.45 }, radius: "farthest-corner", stops: [{ color: "#ffffff17", at: 0 }, { color: "#ffffff05", at: 0.7 }] }
    : "#ffffff12" });
  const col = detailed ? "#e3b34159" : "#ffffff40";
  const dash = 3 * k, gap = 3 * k, r = 7 * k, t = Math.max(1, k);
  const edge = (x0: number, y0: number, x1: number, y1: number): void => {
    const len = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    for (let d = 0; d < len; d += dash + gap) {
      const e = Math.min(len, d + dash);
      draw.line(x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e, col, t);
    }
  };
  const h2 = t / 2;
  edge(x + r, y + h2, x + w - r, y + h2);
  edge(x + r, y + h - h2, x + w - r, y + h - h2);
  edge(x + h2, y + r, x + h2, y + h - r);
  edge(x + w - h2, y + r, x + w - h2, y + h - r);
  // the rounded corners as short arcs
  for (const [cx, cy, a] of [[x + r, y + r, Math.PI], [x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2]] as [number, number, number][]) {
    draw.strokeArc(cx, cy, r - h2, a + 0.35, a + Math.PI / 2 - 0.35, col, t);
  }
}

// ------------------------------------------------------------------ the table
/** When each seat's trick card arrived (frame time), for the fresh-card slide. */
const arrived = [-1, -1, -1, -1];
export function cardArrived(seat: number): void { arrived[seat] = frame().time; }
export function clearArrivals(): void { arrived.fill(-1); }
/** The winning trick card's rectangle in logical px (for the sparks), set while drawing. */
export const lastRects: { trick: ({ x: number; y: number; width: number; height: number } | null)[]; table: { x: number; y: number; width: number; height: number } } = {
  trick: [null, null, null, null], table: { x: 0, y: 0, width: 0, height: 0 },
};

/** Text heights (logical px) of the seat lines. */
const LABEL = 13.1, COUNT = 12.5;

/** The table's accessible labels (seats, trick cards) from its last drawing: a draw callback builds no widgets, so the screen adds them as ui.target areas. */
let targets: { text: string; rect: ui.Rect }[] = [];
let shown: { text: string; rect: ui.Rect }[] = [];
export function tableTargets(): void { for (const t of shown) ui.target(t.text, t.rect, { role: "label" }); }

/** The table panel in window rect r (cw: the card width, logical px). */
export function drawTable(r: ui.Rect, k: number, cw: number, compact: boolean): void {
  const L = look;
  const detailed = !!L?.detailed && !ui.preferences().highContrast;
  const x = r.x, y = r.y, w = r.width, h = r.height;
  lastRects.table = { x: x / k, y: y / k, width: w / k, height: h / k };
  shown = targets;
  targets = [];
  const drop: Shadow[] = L?.shadows === "medium" ? [{ y: 10, blur: 30, color: "#00000066" }]
    : L?.shadows === "high" ? [{ y: 20, blur: 50, color: "#0000008c" }, { y: 4, blur: 10, color: "#0000004d" }] : [];
  const inset: Shadow[] = detailed ? [{ spread: 3, color: "#160e048c", inset: true }, { spread: 4, color: "#e3b34180", inset: true }, { blur: 70, color: "#00000073", inset: true }] : [];
  draw.box(x, y, w, h, {
    background: detailed
      ? { type: "radial", center: { x: 0.5, y: 0.46 }, radius: { x: 0.75, y: 0.65 }, stops: [{ color: "#24735a", at: 0 }, { color: "#1b5d46", at: 0.48 }, { color: "#103a2c", at: 1 }] }
      : { type: "linear", angle: 160, stops: [{ color: "#1d5c46", at: 0 }, { color: "#144233", at: 1 }] },
    border: { width: 1, color: detailed ? "#6b5220" : "#2c4356" }, radius: 14, shadow: drop,
  });
  if (detailed && felt) {
    const t = 96 * k;
    const clip = { x: x + 2 * k, y: y + 2 * k, width: w - 4 * k, height: h - 4 * k };
    for (let ty = y; ty < y + h; ty += t) for (let tx = x; tx < x + w; tx += t) draw.image(felt, tx, ty, t, t, { clip });
  }
  if (inset.length) draw.box(x, y, w, h, { radius: 14, shadow: inset });
  const m = state.match, rs = m?.roundState ?? null;
  // the grid: north / west trick east / south, rows sharing the free height (style.css .table-panel)
  const pad = (compact ? 6 : 10) * k, gapY = (compact ? 4 : 8) * k;
  const ch = cw * 1.42;
  const slotW = (cw + 6) * k, slotH = (ch + (compact ? 2 : 6)) * k;
  const tGap = 6 * k;
  const trickH = slotH * 3 + tGap * 2;
  const seatH = (LABEL * 1.45 + 2 + (rs ? COUNT * 1.45 : 0) + 8) * k;
  const free = Math.max(0, h - pad * 2 - gapY * 2 - seatH * 2 - trickH);
  const rowN = seatH + free / 3, rowM = trickH + free / 3;
  const innerX = x + pad, innerW = w - pad * 2;
  const colW = (innerW - 16 * k) / 4; // 1fr 2fr 1fr with 8 px gaps
  const yN = y + pad + rowN / 2, yM = y + pad + rowN + gapY + rowM / 2, yS = y + pad + rowN + gapY + rowM + gapY + rowN / 2;
  seat(2, innerX + innerW / 2, yN, k, seatH);
  seat(1, innerX + colW / 2, yM, k, seatH);
  seat(3, innerX + colW * 3 + 16 * k + colW / 2, yM, k, seatH);
  seat(0, innerX + innerW / 2, yS, k, seatH);
  // the trick area: 2 columns, north and south centred
  const ax = innerX + colW + 8 * k + colW; // the middle column's centre
  const top = yM - trickH / 2;
  const slots: [number, number][] = [
    [ax - slotW / 2, top + (slotH + tGap) * 2], // south
    [ax - tGap / 2 - slotW, top + slotH + tGap], // west
    [ax - slotW / 2, top], // north
    [ax + tGap / 2, top + slotH + tGap], // east
  ];
  const now = frame().time;
  for (let s = 0; s < 4; s++) {
    const [sx, sy] = slots[s]!;
    const cx = sx + (slotW - cw * k) / 2, cy = sy + (slotH - ch * k) / 2;
    const played = rs ? rs.trick.find((t) => t.seat === s) : undefined;
    lastRects.trick[s] = { x: cx / k, y: cy / k, width: cw, height: ch };
    if (!played) { ghost(cx, cy, cw * k, ch * k, k); continue; }
    const winner = !!rs && rs.trick.length === 4 && rs.lastTrickWinner === s;
    const enter = arrived[s]! < 0 ? 1 : Math.min(1, (now - arrived[s]!) / 0.26);
    drawCard(played.card, cx, cy, cw * k, ch * k, k, { winner, enter, cw });
    targets.push({ text: `${cardAria(played.card)}, ${seatLabel(s)}`, rect: { x: cx, y: cy, width: cw * k, height: ch * k } });
  }
}

function seat(s: number, cx: number, cy: number, k: number, hgt: number): void {
  const detailed = !!look?.detailed && !ui.preferences().highContrast;
  const rs = state.match?.roundState ?? null;
  const name = seatLabel(s);
  const size = LABEL * k;
  const tw = draw.measureText(name, { size, weight: 700 }).width;
  const lineH = LABEL * 1.45 * k;
  const count = rs ? (rs.phase === "bid" ? T("bidding") : T("{n} cards", { n: rs.hands[s]!.length })) : "";
  const top = cy - hgt / 2 + 4 * k;
  if (detailed) {
    draw.box(cx - tw / 2 - 10 * k, top, tw + 20 * k, lineH + 2 * k, { radius: 999, background: "#06161066", shadow: [{ spread: 1, color: "#e3b3414d", inset: true }] });
  }
  const nh = draw.measureText(name, { size, weight: 700 }).height;
  draw.text(name, cx, top + (lineH + 2 * k - nh) / 2, { size, weight: 700, align: "center", color: detailed ? "#eef6f1" : "#d7e6df" });
  if (count) draw.text(count, cx, top + lineH + 4 * k, { size: COUNT * k, align: "center", color: "#a8c4b8" });
  targets.push({ text: count ? `${name}: ${count}` : name, rect: { x: cx - tw / 2, y: top, width: tw, height: lineH * 2 } });
}

