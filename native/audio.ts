// Sound, as the browser build's sfx.js: the authored one-shots
// (sfx/<name>.opus, sfx/manifest.json: one clip per event) on the effects
// bus, the menu clicks and dialog opens on the interface bus. The procedural
// fallbacks sfx.js synthesized while a sample loaded are not ported (a live
// synthesis graph makes clip loads fail on the engine's web runtime), so a
// clip still loading is silent. The runtime's Options own the volumes and
// the mute (the old Settings' Mute and Volume). Clips load once the mixer
// runs (natively at once, in a browser after the first press), one at a time.
import { context, loadClip, play as playClip, type AudioClip, type Bus } from "starhermit:audio";
import { files } from "starhermit:engine";

export type Sfx =
  | "cardSelect" | "cardPlay" | "cardDeal" | "bidPlace" | "bidPass" | "trickWin" | "trickLose" | "spadeTrump"
  | "roundStart" | "roundEnd" | "gameWin" | "gameLose" | "invalidMove" | "newGame" | "uiClick" | "uiOpen";
const UI: Sfx[] = ["uiClick", "uiOpen"];
const byEvent = new Map<string, string>();
const clips = new Map<string, AudioClip>();
const queue: string[] = [];
let loading = false;
let wantClips = false;

/** Reads the manifest; the clips load once the mixer runs (see update). */
export function loadSfx(): void {
  try {
    const list = files.readJson("sfx/manifest.json") as unknown as { name: string; event: string }[];
    for (const it of list) if (it && typeof it.name === "string" && typeof it.event === "string") byEvent.set(it.event, it.name);
  } catch (e) { console.warn(`sfx manifest: ${String(e)}`); }
  wantClips = true;
}

/** sfx.js play(event). */
export function play(kind: Sfx): void {
  const name = byEvent.get(kind);
  if (!name) return;
  const clip = clips.get(name);
  if (!clip) return;
  const bus: Bus = UI.includes(kind) ? "interface" : "effects";
  try { playClip(clip, { bus }); }
  catch { clips.delete(name); if (!queue.includes(name)) queue.push(name); } // a clip the mixer lost: load it again
}

/** Each frame: the clips once the mixer runs, one at a time. */
export function update(): void {
  if (context.state !== "running") return;
  if (wantClips) {
    wantClips = false;
    for (const n of byEvent.values()) if (!queue.includes(n)) queue.push(n);
  }
  if (loading || !queue.length) return;
  const name = queue.shift()!;
  if (clips.has(name)) return;
  loading = true;
  loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); loading = false; }, (e: unknown) => { console.warn(`sfx ${name}: ${String(e)}`); loading = false; });
}
