// The browser build's effects layer (fx.js) as starhermit:draw: the night
// sky behind the UI (the vertical gradient, the warm reading-lamp pool,
// brass orrery rings with hour ticks with Detail, the slowly turning and
// twinkling star field with bloom halos, dust motes rising through the lamp
// light with Particles high, the colour grade and vignette), and the spark
// bursts over everything for won tricks and the match end (gold for your
// team, silver for theirs). Positions are the old CSS pixels (the window's
// logical pixels) times the UI scale; the star field and motes come from the
// old seeded stream, so the sky looks the same as before. Reduced motion
// stills the sky and turns the sparks off (quality.ts).
import { frame } from "starhermit:engine";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import { OffscreenCanvas } from "starhermit:canvas";
import type { Look } from "./quality.ts";

let look: Look | null = null;
let starSprite: OffscreenCanvas | null = null;
let haloSprite: OffscreenCanvas | null = null;

function glowSprite(size: number, stops: [number, string][]): OffscreenCanvas {
  const c = new OffscreenCanvas(size, size);
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, col] of stops) g.addColorStop(at, col);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}
export function initFx(): void {
  starSprite = glowSprite(16, [[0, "rgba(255,255,255,1)"], [0.35, "rgba(230,240,255,0.7)"], [1, "rgba(200,220,255,0)"]]);
  haloSprite = glowSprite(64, [[0, "rgba(255,230,170,0.9)"], [0.25, "rgba(255,215,140,0.35)"], [1, "rgba(255,200,120,0)"]]);
}

/** fx.js rng: the deterministic decoration stream (cosmetic only; never touches the rules). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

interface Star { a: number; d: number; r: number; b: number; tw: number; sp: number; warm: boolean; halo: boolean }
interface Mote { x: number; y: number; v: number; ph: number; r: number }
let stars: Star[] = [];
let motes: Mote[] = [];
let builtKey = "";

/** fx.js buildStars for a window of w × h logical pixels. */
function build(w: number, h: number, L: Look): void {
  const key = `${Math.round(w)}x${Math.round(h)}:${L.budget.stars}:${L.budget.halos}:${L.particles}:${L.budget.motes}`;
  if (key === builtKey) return;
  builtKey = key;
  const rnd = rng(0x5ade);
  stars = [];
  const reach = Math.hypot(w, h) * 1.15;
  for (let i = 0; i < L.budget.stars; i++) {
    const band = rnd() < 0.45; // cluster part of the field along a diagonal "milky" band
    const a = band ? 0.35 + (rnd() - 0.5) * 0.5 : rnd() * Math.PI * 2;
    const d = band ? reach * (0.3 + rnd() * 0.7) : reach * Math.sqrt(rnd());
    const m = rnd();
    stars.push({ a, d, r: m > 0.97 ? 1.9 : m > 0.85 ? 1.3 : 0.8, b: 0.35 + rnd() * 0.65, tw: rnd() * Math.PI * 2, sp: 0.6 + rnd() * 1.8, warm: rnd() < 0.25, halo: false });
  }
  // the brightest stars get bloom halos, up to the budget's count
  let halos = L.budget.halos;
  for (let i = 0; i < stars.length && halos > 0; i++) if (stars[i]!.r > 1) { stars[i]!.halo = true; halos--; }
  const moteCount = L.particles === "high" ? L.budget.motes : 0;
  motes = [];
  for (let i = 0; i < moteCount; i++) motes.push({ x: rnd(), y: rnd(), v: 0.004 + rnd() * 0.01, ph: rnd() * 6.28, r: 0.6 + rnd() * 1.2 });
}

export function setLook(l: Look): void { look = l; builtKey = ""; }

/** The sky behind everything (fx.js buildBase + drawSky + buildGrade), each frame. */
export function drawSky(): void {
  const f = frame();
  const k = ui.preferences().scale;
  const W = f.width, H = f.height, w = W / k, h = H / k;
  const L = look;
  draw.box(0, 0, W, H, { radius: 0, background: { type: "linear", angle: 180, stops: [
    { color: "#0b1a2a", at: 0 }, { color: "#101c26", at: 0.55 }, { color: "#0a131b", at: 1 },
  ] } });
  if (!L) return;
  // warm reading-lamp pool over the table
  const lr = Math.max(W, H) * 0.6;
  draw.box(W * 0.5 - lr, H * 0.52 - lr, lr * 2, lr * 2, { radius: 0, background: { type: "radial", shape: "circle", radius: "closest-side", stops: [
    { color: L.bloom ? "#e3b34129" : "#e3b34114", at: 0 }, { color: "#e3b34100", at: 1 },
  ] } });
  const px = W * 0.62, py = -H * 0.18;
  if (L.detailed) {
    // brass orrery rings sweeping across the dome, with hour ticks
    [0.55, 0.78, 1.02].forEach((m, i) => {
      const rad = Math.hypot(W, H) * m;
      const col: [number, number, number, number] = [227 / 255, 179 / 255, 65 / 255, 0.16 - i * 0.035];
      draw.strokeEllipse(px, py, rad, rad * 0.92, col, k, { rotation: 0.08, origin: { x: px, y: py } });
      if (i === 1) {
        // (fx.js draws the ticks on the unturned ellipse)
        for (let t = 0; t < 72; t++) {
          const ang = (t / 72) * Math.PI * 2;
          const len = (t % 6 === 0 ? 9 : 4) * k;
          const x1 = px + Math.cos(ang) * rad, y1 = py + Math.sin(ang) * rad * 0.92;
          const x2 = x1 - Math.cos(ang) * len, y2 = y1 - Math.sin(ang) * len;
          if ((x1 < -10 && x2 < -10) || (y1 < -10 && y2 < -10) || (x1 > W + 10 && x2 > W + 10) || (y1 > H + 10 && y2 > H + 10)) continue;
          draw.line(x1, y1, x2, y2, col, k);
        }
      }
    });
  }
  build(w, h, L);
  const t = f.time;
  const rot = L.animated ? t * 0.012 : 0;
  if (starSprite && haloSprite) {
    for (const s of stars) {
      const ang = s.a + rot;
      const sx = (w * 0.62 + Math.cos(ang) * s.d) * k;
      const sy = (-h * 0.18 + Math.sin(ang) * s.d) * k;
      if (sx < -8 * k || sy < -8 * k || sx > W + 8 * k || sy > H + 8 * k) continue;
      const tw = L.animated ? 0.7 + 0.3 * Math.sin(s.tw + t * s.sp) : 0.85;
      const a = s.b * tw;
      const size = s.r * 5.5 * k;
      draw.image(starSprite, sx - size / 2, sy - size / 2, size, size, { blend: "add", tint: [1, 1, 1, a] });
      if (L.bloom && s.halo) {
        const hs = s.r * 14 * k;
        draw.image(haloSprite, sx - hs / 2, sy - hs / 2, hs, hs, { blend: "add", tint: [1, 1, 1, a * (s.warm ? 0.5 : 0.4)] });
      }
    }
    // dust motes rising through the lamp light
    if (motes.length && L.particles === "high") {
      for (const m of motes) {
        const my = (((m.y - t * 1.2 * m.v) % 1) + 1) % 1;
        const mx = m.x + Math.sin(t * 0.4 + m.ph) * 0.01;
        const mpx = W * (0.2 + mx * 0.6), mpy = H * (0.25 + my * 0.7);
        const sz = m.r * 5 * k;
        draw.image(haloSprite, mpx - sz / 2, mpy - sz / 2, sz, sz, { blend: "add", tint: [1, 1, 1, 0.25 + 0.2 * Math.sin(t + m.ph)] });
      }
    }
  }
  if (L.grade) {
    // cool shadows at the top of the dome, warm floor light at the bottom, and the vignette
    draw.box(0, 0, W, H, { radius: 0, background: { type: "linear", angle: 180, stops: [
      { color: "#28467829", at: 0 }, { color: "#00000000", at: 0.6 }, { color: "#7846141f", at: 1 },
    ] } });
    const inner = Math.min(W, H) * 0.35, outer = Math.hypot(W, H) * 0.62;
    draw.box(W / 2 - outer, H / 2 - outer, outer * 2, outer * 2, { radius: 0, background: { type: "radial", shape: "circle", radius: "closest-side", stops: [
      { color: "#00000000", at: inner / outer }, { color: "#0000008c", at: 1 },
    ] } });
  }
}

// ------------------------------------------------------------------ sparks
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; c: string }
let sparks: Spark[] = [];
const GOLD = ["#ffe08a", "#e3b341", "#fff6d8", "#f2c75c"];
const SILVER = ["#cfe3ff", "#9fb2c2", "#ffffff"];

/** fx.js burstAt over a rectangle in logical pixels. */
function burstAt(r: { x: number; y: number; width: number; height: number }, count: number, palette: string[]): void {
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 0.08 + Math.random() * 0.22;
    const life = 600 + Math.random() * 600;
    sparks.push({
      x: cx + (Math.random() - 0.5) * r.width * 0.6, y: cy + (Math.random() - 0.5) * r.height * 0.6,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.12, life, max: life, s: 2 + Math.random() * 3,
      c: palette[Math.floor(Math.random() * palette.length)]!,
    });
  }
}
/** A trick completed: sparks from the winning card (logical-pixel rect). */
export function trickWon(r: { x: number; y: number; width: number; height: number }, ours: boolean): void {
  const L = look;
  if (!L || L.particles === "off") return;
  const n = L.budget.sparks;
  burstAt(r, L.particles === "high" ? n : Math.round(n * 0.45), ours ? GOLD : SILVER);
}
/** The match ended: a burst over the table. */
export function matchOver(r: { x: number; y: number; width: number; height: number }, won: boolean): void {
  const L = look;
  if (!L || L.particles === "off") return;
  const n = L.budget.finale;
  burstAt(r, L.particles === "high" ? n : Math.round(n * 0.45), won ? GOLD : SILVER);
}
export function clearSparks(): void { sparks = []; }

let lastT = -1;
/** Steps and draws the sparks (from a widget built after the whole UI, so they draw over it). */
export function drawSparks(): void {
  const t = frame().time;
  const dt = lastT < 0 ? 16 : Math.min(100, Math.max(0, (t - lastT) * 1000));
  lastT = t;
  if (!sparks.length) return;
  const k = ui.preferences().scale;
  const blend = look?.bloom ? "add" : "normal";
  const next: Spark[] = [];
  for (const p of sparks) {
    p.life -= dt;
    if (p.life <= 0) continue;
    p.vy += 0.00045 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const q = p.life / p.max;
    const sz = p.s * (0.5 + q * 0.5) * k;
    const a = Math.round(Math.min(1, q * 1.4) * 255).toString(16).padStart(2, "0");
    draw.rect(p.x * k - sz / 2, p.y * k - sz / 2, sz, sz, p.c + a, { blend });
    next.push(p);
  }
  sparks = next;
}
