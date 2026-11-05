// Sound, as the browser build's sfx.js: the authored one-shots
// (sfx/<name>.opus, sfx/manifest.json: one clip per event) on the effects
// bus, the menu clicks and dialog opens on the interface bus. The procedural
// fallbacks sfx.js synthesized while a sample loaded are not ported, so a
// clip still loading is silent. The runtime's Options own the volumes and
// the mute (the old Settings' Mute and Volume). Every clip loads at once in
// onStart.
import { loadClip, play as playClip, type AudioClip, type Bus } from "starhermit:audio";
import { files } from "starhermit:engine";

export type Sfx =
  | "cardSelect" | "cardPlay" | "cardDeal" | "bidPlace" | "bidPass" | "trickWin" | "trickLose" | "spadeTrump"
  | "roundStart" | "roundEnd" | "gameWin" | "gameLose" | "invalidMove" | "newGame" | "uiClick" | "uiOpen";
const UI: Sfx[] = ["uiClick", "uiOpen"];
const byEvent = new Map<string, string>();
const clips = new Map<string, AudioClip>();
/** Reads the manifest and loads every clip (onStart). */
export function loadSfx(): void {
  try {
    const list = files.readJson("sfx/manifest.json") as unknown as { name: string; event: string }[];
    for (const it of list) if (it && typeof it.name === "string" && typeof it.event === "string") byEvent.set(it.event, it.name);
  } catch (e) { console.warn(`sfx manifest: ${String(e)}`); }
  for (const name of new Set(byEvent.values())) {
    loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); }, (e: unknown) => { console.warn(`sfx ${name}: ${String(e)}`); });
  }
}

/** sfx.js play(event). */
export function play(kind: Sfx): void {
  const name = byEvent.get(kind);
  if (!name) return;
  const clip = clips.get(name);
  if (!clip) return;
  const bus: Bus = UI.includes(kind) ? "interface" : "effects";
  try { playClip(clip, { bus }); }
  catch { /* the mixer is full this frame: skip it */ }
}
