// The look per graphics level: the browser build's four presets and budgets
// (gfx.js TABLE / BUDGETS, each tuned to hold 60 FPS on the weakest GPU its
// Auto gave it) keyed by the runtime's quality tier (frame().quality), with
// the star, mote and spark counts scaled within the tier by the level
// (frame().levelIndex, at most 2×, stars capped at 840 and motes at 128), as
// the browser build scaled them by its hardware level. The runtime owns the
// rest of what the old Graphics section did: Auto and the level choice,
// render scale and the pixel-ratio cap, adaptive resolution, the frame-rate
// limit and its readout. The old section's per-effect overrides are not
// offered (the runtime's Options choose a level).
import type { QualityTier } from "starhermit:engine";

export interface Budget {
  /** Stars on the backdrop. */
  stars: number;
  /** Bloom halos around the brightest stars (Bloom on). */
  halos: number;
  /** Dust motes rising through the lamp light (Particles high). */
  motes: number;
  /** Sparks per won trick at Particles high (low: ~45 %). */
  sparks: number;
  /** Sparks for the match-end burst at Particles high (low: ~45 %). */
  finale: number;
}
export interface Look {
  preset: QualityTier;
  /** Card / table / panel drop shadows. */
  shadows: "off" | "low" | "medium" | "high";
  /** Glow on stars, the lamp, the title, scores, the primary button, playable and winning cards. */
  bloom: boolean;
  /** Colour grade + vignette on the room backdrop. */
  grade: boolean;
  /** Trick-win sparks (low, high) and drifting dust motes (high). */
  particles: "off" | "low" | "high";
  /** The observatory sky slowly turns and twinkles. */
  animated: boolean;
  /** Felt weave, card stock, bevels, corner indices, brass trim and orrery rings. */
  detailed: boolean;
  budget: Budget;
}

const TABLE: Record<QualityTier, Omit<Look, "preset" | "budget">> = {
  low: { shadows: "low", bloom: false, grade: false, particles: "off", animated: false, detailed: false },
  balanced: { shadows: "medium", bloom: true, grade: true, particles: "low", animated: true, detailed: true },
  high: { shadows: "high", bloom: true, grade: true, particles: "high", animated: true, detailed: true },
  ultra: { shadows: "high", bloom: true, grade: true, particles: "high", animated: true, detailed: true },
};
const BUDGETS: Record<QualityTier, Budget> = {
  low: { stars: 140, halos: 0, motes: 0, sparks: 16, finale: 60 },
  balanced: { stars: 220, halos: 16, motes: 24, sparks: 24, finale: 90 },
  high: { stars: 320, halos: 40, motes: 46, sparks: 36, finale: 140 },
  ultra: { stars: 420, halos: 64, motes: 64, sparks: 48, finale: 180 },
};
/** The first level index of each tier. */
const TIER_FLOOR: Record<QualityTier, number> = { low: 0, balanced: 2, high: 4, ultra: 7 };
const STAR_MAX = 840, MOTE_MAX = 128;

/** The look for a quality tier at a level index (0 … 9); reduced motion stills the sky and the sparks. */
export function lookFor(preset: QualityTier, levelIndex: number, reducedMotion: boolean): Look {
  const b = { ...BUDGETS[preset] };
  // Levels are about 1.64× apart in GPU throughput: counts grow with the level above the tier's first, at most 2× (gfx.js budgetFor).
  const k = Math.min(2, Math.pow(1.64, Math.max(0, levelIndex - TIER_FLOOR[preset])));
  b.stars = Math.min(STAR_MAX, Math.round(b.stars * k));
  b.motes = Math.min(MOTE_MAX, Math.round(b.motes * k));
  b.sparks = Math.round(b.sparks * k);
  b.finale = Math.round(b.finale * k);
  const row = { ...TABLE[preset] };
  if (reducedMotion) { row.animated = false; row.particles = "off"; }
  return { preset, ...row, budget: b };
}
