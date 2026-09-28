'use strict';

/* Unit tests for the pure graphics quality model (gfx.js). */

const test = require('node:test');
const assert = require('node:assert');
const G = require('../gfx.js');

test('detectPreset maps GPU strings to tiers', () => {
  assert.strictEqual(G.detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.strictEqual(G.detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.strictEqual(G.detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0)'), 'high');
  assert.strictEqual(G.detectPreset('Apple M2'), 'high');
  assert.strictEqual(G.detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'balanced');
  assert.strictEqual(G.detectPreset('Adreno (TM) 640'), 'balanced');
  assert.strictEqual(G.detectPreset(''), 'balanced');
  assert.strictEqual(G.detectPreset('', { noGl: true }), 'low');
});

test('detectPreset caps touch devices at balanced', () => {
  assert.strictEqual(G.detectPreset('Apple M1', { touch: true }), 'balanced');
  assert.strictEqual(G.detectPreset('SwiftShader', { touch: true }), 'low');
});

test('resolve uses the detected preset for auto and the preset row otherwise', () => {
  const auto = G.resolve({}, 'low');
  assert.strictEqual(auto.preset, 'low');
  assert.strictEqual(auto.auto, true);
  assert.strictEqual(auto.background, 'static');
  assert.strictEqual(auto.particles, 'off');
  assert.strictEqual(auto.animated, false);
  const high = G.resolve({ preset: 'high' }, 'low');
  assert.strictEqual(high.preset, 'high');
  assert.strictEqual(high.auto, false);
  assert.strictEqual(high.bloom, 'on');
  assert.strictEqual(high.detail, 'detailed');
  assert.strictEqual(high.animated, true);
  assert.strictEqual(G.resolve({ preset: 'bogus' }, 'nonsense').preset, 'balanced');
});

test('resolve applies valid overrides and ignores invalid ones', () => {
  const r = G.resolve({ preset: 'high', bloom: 'off', shadows: 'preset', particles: 'huge' }, 'low');
  assert.strictEqual(r.bloom, 'off');
  assert.strictEqual(r.shadows, 'high');
  assert.strictEqual(r.particles, 'high');
});

test('resolve clamps render scale to 50–200% and keeps toggles', () => {
  assert.strictEqual(G.resolve({ preset: 'high', render_scale: 5 }).scale, 2);
  assert.strictEqual(G.resolve({ preset: 'high', render_scale: 0.1 }).scale, 0.5);
  assert.strictEqual(G.resolve({ preset: 'ultra', render_scale: 1 }).scale, 1.25);
  const d = G.resolve({ preset: 'low' });
  assert.strictEqual(d.adaptive, true);
  assert.strictEqual(d.showFps, false);
  const t = G.resolve({ preset: 'low', adaptive: false, show_fps: true });
  assert.strictEqual(t.adaptive, false);
  assert.strictEqual(t.showFps, true);
});

test('choosing a preset clears overrides but keeps scale and toggles', () => {
  const next = G.choosePreset({ preset: 'high', bloom: 'off', detail: 'plain', render_scale: 1.5, show_fps: true }, 'ultra');
  assert.deepStrictEqual(next, { preset: 'ultra', render_scale: 1.5, show_fps: true });
  assert.strictEqual(G.resolve(next).bloom, 'on');
  assert.strictEqual(G.choosePreset({}, 'auto').preset, 'auto');
});

test('presetTier and describe', () => {
  assert.strictEqual(G.presetTier('low', 'shadows'), 'low');
  assert.strictEqual(G.presetTier('ultra', 'particles'), 'high');
  assert.strictEqual(G.presetTier('nope', 'bloom'), undefined);
  const s = G.describe(G.resolve({ preset: 'high' }), [1280, 800]);
  assert.match(s, /bloom/);
  assert.match(s, /1280×800 px/);
  assert.match(G.describe(G.resolve({ preset: 'low', shadows: 'off' })), /no shadows/);
  assert.match(G.describe(G.resolve({ preset: 'high' }), null, { bloom: 'glow' }), /glow/);
});

test('every preset row names a valid tier for every category', () => {
  for (const p of G.PRESETS) {
    for (const [cat, tiers] of Object.entries(G.CATEGORIES)) {
      assert.ok(tiers.includes(G.presetTier(p, cat)), `${p}.${cat}`);
    }
  }
});
