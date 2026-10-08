'use strict';

/* Spade Contract — graphics quality model: presets, per-category overrides,
 * GPU detection and a cost summary. Pure (no DOM), shared by the effects
 * renderer (fx.js), the Graphics settings panel and the unit tests. */

(function (root) {

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

// Star counts per background tier and preset density (drawn on the backdrop canvas).
const STARS = { low: 140, balanced: 220, high: 320, ultra: 420 };

/** Best preset for this GPU, from the unmasked renderer string when the browser exposes it. */
function detectPreset(gpu, opts) {
  const g = String(gpu || '').toLowerCase();
  const touch = !!(opts && opts.touch);
  let p;
  if (!g) p = opts && opts.noGl ? 'low' : 'balanced';
  else if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(g)) p = 'low';
  else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|amd radeon(?!.*graphics)|apple m\d/.test(g)) p = 'high';
  else p = 'balanced';
  if (touch && (p === 'high' || p === 'ultra')) p = 'balanced';
  return p;
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

/**
 * Resolve saved settings into concrete tiers.
 * `saved`: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier }.
 */
function resolve(saved, detected) {
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
    stars: STARS[preset],
  };
  Object.keys(CATEGORIES).forEach((cat) => {
    out[cat] = CATEGORIES[cat].indexOf(s[cat]) !== -1 ? s[cat] : row[cat];
  });
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

const api = { PRESETS, CATEGORIES, TABLE, detectPreset, resolve, choosePreset, presetTier, describe, clamp };

if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.Gfx = api;

})(typeof window !== 'undefined' ? window : globalThis);
