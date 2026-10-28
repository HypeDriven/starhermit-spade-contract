// Spade Contract on the StarHermit engine: the entry module (starhermit.txt
// engine.entry), played natively by the StarHermit client and in browsers by
// the engine's web runtime. The rules (rules.js) are the browser build's,
// unchanged; game.ts is what ui.js did around them, screens.ts and table.ts
// draw what index.html, style.css and fx.js showed. This module wires them
// to the runtime: the fixed steps that pace the AI, the keys (Escape / East
// closes How to play), the look per graphics tier, the save, the sounds,
// announcements, and the lifecycle (a hidden window flushes the save, as
// pagehide / visibilitychange did).
import "./classic.ts";
import { frame, onFixedUpdate, onPreferencesChange, onRender, onStart, onSuspend, onUpdate, setFixedRate } from "starhermit:engine";
import { onAction } from "starhermit:input";
import * as ui from "starhermit:ui";
import { onSessionEnded } from "starhermit:platform";
import * as audio from "./audio.ts";
import * as fx from "./fx.ts";
import * as game from "./game.ts";
import { S } from "./i18n.ts";
import * as platform from "./platform.ts";
import { lookFor } from "./quality.ts";
import { closeDialog, drawScreens, setLook as setScreensLook, showToast } from "./screens.ts";
import { initStyles } from "./style.ts";
import * as table from "./table.ts";

// ------------------------------------------------------------------ announcements
let pendingAnnounce: string[] = [];
/** The live regions (aria-live): at most one announcement a frame, flushed in onRender. */
function announce(text: string): void { const t = text.trim(); if (t) pendingAnnounce.push(t); }
game.onAnnounce(announce);

game.onView((e) => {
  if (e.type === "card") table.cardArrived(e.seat);
  else if (e.type === "deal") table.clearArrivals();
  else if (e.type === "trick") {
    const r = table.lastRects.trick[e.seat];
    if (r) fx.trickWon(r, e.ours);
  } else if (e.type === "match") fx.matchOver(table.lastRects.table, e.won);
});

onAction((e) => {
  if (!e.pressed || ui.capturingKeys()) return;
  if (e.action === "close") closeDialog();
});

// ------------------------------------------------------------------ the look
let lookKey = "";
function applyLook(): void {
  const f = frame();
  const reduced = ui.preferences().reducedMotion;
  const k = `${f.quality}:${f.levelIndex}:${reduced}`;
  if (k === lookKey) return;
  lookKey = k;
  const look = lookFor(f.quality, f.levelIndex, reduced);
  fx.setLook(look);
  table.setLook(look);
  setScreensLook(look);
}

// ------------------------------------------------------------------ boot and lifecycle
onStart(() => {
  setFixedRate(60);
  initStyles();
  fx.initFx();
  table.initTextures();
  audio.loadSfx();
  applyLook();
  const saved = platform.initPlatform();
  if (saved) game.resumeMatch(saved);
});
// a save conflict or the browser build's cloud save picked another device's snapshot (further along): continue from it
platform.onAdopt((m) => game.resumeMatch(m));
onPreferencesChange(() => { lookKey = ""; });
onSessionEnded(() => showToast(() => S("signedOut"))); // keep playing locally
onSuspend(() => platform.flush());

onFixedUpdate(() => game.step());
onUpdate(() => {
  applyLook();
  audio.update();
});
onRender(() => {
  drawScreens();
  if (pendingAnnounce.length) {
    try { ui.announce(pendingAnnounce.join(" ").slice(0, 500)); } catch { /* next frame */ }
    pendingAnnounce = [];
  }
});
