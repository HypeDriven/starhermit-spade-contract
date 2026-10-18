'use strict';

/* Spade Contract — graphics quality model: presets, per-category overrides,
 * StarHermit hardware-level detection, per-preset effect budgets and a cost
 * summary. Pure (no DOM), shared by the effects renderer (fx.js), the
 * Graphics settings panel and the unit tests. */

(function (root) {

// gpu-level.js (shared StarHermit copy, window.StarHermitGpu) loads before this
// script in the page; under node it is required directly.
const GPU = typeof module !== 'undefined' && module.exports ? require('./gpu-level.js') : root.StarHermitGpu;

const PRESETS = ['low', 'balanced', 'high', 'ultra'];

// Category -> allowed tiers, cheapest first.
const CATEGORIES = {
  shadows: ['off', 'low', 'medium', 'high'], // card / table drop shadows
  bloom: ['off', 'on'],                      // glow on stars, lamp, winning card, playable cards
  grade: ['off', 'on'],                      // colour grade + vignette on the room backdrop
  particles: ['off', 'low', 'high'],         // trick-win sparks, drifting dust motes
  background: ['static', 'animated'],        // observatory sky: still or slowly turning + twinkling
  detail: ['plain', 'detailed'],             // felt weave, card paper, bevels, corner indices, brass trim
};

// Each preset is a row of tiers plus a render scale (multiplies the device pixel ratio)
// and a device-pixel-ratio cap so Low stays as cheap as the original flat page.
const TABLE = {
  low: { scale: 1, dprCap: 1, shadows: 'low', bloom: 'off', grade: 'off', particles: 'off', background: 'static', detail: 'plain' },
  balanced: { scale: 1, dprCap: 1.5, shadows: 'medium', bloom: 'on', grade: 'on', particles: 'low', background: 'animated', detail: 'detailed' },
  high: { scale: 1, dprCap: 2, shadows: 'high', bloom: 'on', grade: 'on', particles: 'high', background: 'animated', detail: 'detailed' },
  ultra: { scale: 1.25, dprCap: 2, shadows: 'high', bloom: 'on', grade: 'on', particles: 'high', background: 'animated', detail: 'detailed' },
};

// Auto picks the preset from the StarHermit hardware level (0 = Galaxy S20 /
// Intel UHD or weaker, 20 = RTX 5090, each level ~1.23x the one below): Low
// from 0, Balanced from 4, High from 10, Ultra from 17. Phones, tablets and
// <= 4 GB machines are capped at level 9; no WebGL at all rates level 0.
const LEVELS = { low: 0, balanced: 4, high: 10, ultra: 17 };

/** Hardware level 0-20 for an unmasked renderer string plus StarHermitGpu.detectSystem() facts. */
function detectLevel(gpu, system) {
  if (!GPU) return LEVELS.balanced;
  return GPU.detectLevel(Object.assign({ webgl: true, webgl2: true }, system || {}, { gpu: String(gpu || '') }));
}

/** The preset Auto starts from for a hardware level. */
function presetForLevel(level) {
  if (GPU) return GPU.presetForLevel(level, LEVELS);
  return PRESETS.filter((p) => LEVELS[p] <= level).pop() || 'low';
}

/** Best preset for this GPU (the level already caps phones/tablets at Balanced). */
function detectPreset(gpu, system) {
  return presetForLevel(detectLevel(gpu, system));
}

/*
 * Per-preset effect budget for the 2D effects layer. Each preset is tuned to
 * hold 60 FPS on the weakest machine Auto gives it (Low -> level 0, Balanced
 * -> 4, High -> 10, Ultra -> 17; measured with tests/gfx-bench.mjs). The cards,
 * table and every control are identical on every preset — only the backdrop
 * and effects change.
 *   skyRes  backdrop canvas resolution as a share of the (capped) pixel ratio
 *           — the sky is soft gradients and points, so it never needs full DPR
 *   stars   stars on the backdrop, scaled with the level
 *   halos   bloom halos drawn around the brightest stars (Bloom on)
 *   motes   dust motes rising through the lamp light (Particles high), scaled with the level
 *   sparks  sparks per won trick at Particles high (low: ~45%), scaled with the level
 *   finale  sparks for the match-end burst at Particles high (low: ~45%)
 */
const BUDGETS = {
  low: { skyRes: 1, stars: 140, halos: 0, motes: 0, sparks: 16, finale: 60 },
  balanced: { skyRes: 0.75, stars: 220, halos: 16, motes: 24, sparks: 24, finale: 90 },
  high: { skyRes: 1, stars: 320, halos: 40, motes: 46, sparks: 36, finale: 140 },
  ultra: { skyRes: 1, stars: 420, halos: 64, motes: 64, sparks: 48, finale: 180 },
};
const STAR_MAX = 840;
const MOTE_MAX = 128;

/** A preset's concrete budget for a hardware level (counts scale <= 2x within the preset). */
function budgetFor(preset, level) {
  const b = Object.assign({}, BUDGETS[preset] || BUDGETS.balanced);
  const floor = LEVELS[preset] || 0;
  const lv = Math.max(Number.isFinite(level) ? level : floor, floor);
  const k = GPU ? Math.min(2, GPU.scaleBudget(1, lv, floor)) : 1;
  b.stars = Math.min(STAR_MAX, Math.round(b.stars * k));
  b.motes = Math.min(MOTE_MAX, Math.round(b.motes * k));
  b.sparks = Math.round(b.sparks * k);
  b.finale = Math.round(b.finale * k);
  return b;
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

/**
 * Resolve saved settings into concrete tiers.
 * `saved`: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier }.
 */
function resolve(saved, detected, level) {
  const s = saved || {};
  const preset = PRESETS.indexOf(s.preset) !== -1 ? s.preset : (PRESETS.indexOf(detected) !== -1 ? detected : 'balanced');
  const row = TABLE[preset];
  const userScale = clamp(Number(s.render_scale) || 1, 0.5, 2);
  const out = {
    preset: preset,
    auto: PRESETS.indexOf(s.preset) === -1,
    userScale: userScale,
    scale: row.scale * userScale,
    dprCap: row.dprCap,
  };
  Object.keys(CATEGORIES).forEach((cat) => {
    out[cat] = CATEGORIES[cat].indexOf(s[cat]) !== -1 ? s[cat] : row[cat];
  });
  out.level = Number.isFinite(level) ? level : LEVELS[preset];
  out.budget = budgetFor(preset, out.level);
  out.stars = out.budget.stars;
  out.adaptive = s.adaptive !== false;
  out.showFps = !!s.show_fps;
  // The effects loop only runs when something moves (sky or dust motes); a static
  // room is drawn once and trick sparks run the loop only while they live.
  out.animated = out.background === 'animated' || out.particles === 'high';
  return out;
}

/** Saved settings after picking a preset: overrides are cleared, scale/toggles kept. */
function choosePreset(saved, preset) {
  const s = saved || {};
  const out = { preset: PRESETS.indexOf(preset) !== -1 ? preset : 'auto' };
  if (s.render_scale !== undefined) out.render_scale = s.render_scale;
  if (s.adaptive !== undefined) out.adaptive = s.adaptive;
  if (s.show_fps !== undefined) out.show_fps = s.show_fps;
  return out;
}

/** The preset's own tier for a category (for "From preset (…)" labels). */
function presetTier(preset, cat) {
  return TABLE[preset] ? TABLE[preset][cat] : undefined;
}

/** Short cost summary; `words` lets the panel localize the fragments. */
function describe(r, pixels, words) {
  const w = words || {};
  const t = (k, d) => w[k] || d;
  const parts = [
    r.shadows === 'off' ? t('noShadows', 'no shadows') : t('shadows_' + r.shadows, r.shadows + ' shadows'),
    r.bloom === 'on' ? t('bloom', 'bloom') : null,
    r.grade === 'on' ? t('grade', 'grade') : null,
    r.particles === 'off' ? null : t('particles_' + r.particles, r.particles + ' particles'),
    r.background === 'animated' ? t('animatedSky', 'animated sky') : t('staticSky', 'static sky'),
    pixels ? pixels[0] + '×' + pixels[1] + ' px' : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

const api = { PRESETS, CATEGORIES, TABLE, LEVELS, BUDGETS, STAR_MAX, MOTE_MAX, budgetFor, detectLevel, presetForLevel, detectPreset, resolve, choosePreset, presetTier, describe, clamp };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Gfx = api;

})(typeof window !== 'undefined' ? window : globalThis);
