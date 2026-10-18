'use strict';

/* Unit tests for the pure graphics quality model (gfx.js). */

const test = require('node:test');
const assert = require('node:assert');
const G = require('../gfx.js');

const DESK = { cores: 8, memoryGb: 8 };
const PHONE = { mobile: true, cores: 8, memoryGb: 8 };

test('hardware level picks the Auto preset (Low 0, Balanced 4, High 10, Ultra 17)', () => {
  assert.strictEqual(G.detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', DESK), 'low');
  assert.strictEqual(G.detectLevel('llvmpipe (LLVM 15.0.7, 256 bits)', DESK), 0);
  assert.strictEqual(G.detectPreset('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', DESK), 'low');
  assert.strictEqual(G.detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)', DESK), 'low');
  assert.strictEqual(G.detectPreset('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', DESK), 'balanced');
  assert.strictEqual(G.detectPreset('ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0)', DESK), 'high');
  assert.strictEqual(G.detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0)', DESK), 'ultra');
  assert.strictEqual(G.detectLevel('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0)', DESK), 20);
  assert.strictEqual(G.detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 5090 Direct3D11 vs_5_0 ps_5_0)', DESK), 'ultra');
  assert.strictEqual(G.detectPreset('', Object.assign({ webgl: false }, DESK)), 'low', 'no WebGL at all → Low');
  for (const [p, lv] of Object.entries(G.LEVELS)) assert.strictEqual(G.presetForLevel(lv), p);
  assert.strictEqual(G.presetForLevel(3), 'low');
  assert.strictEqual(G.presetForLevel(16), 'high');
});

test('phones and tablets are Balanced at most; software GPUs stay Low', () => {
  assert.strictEqual(G.detectPreset('Adreno (TM) 740', PHONE), 'balanced');
  assert.ok(G.detectLevel('Adreno (TM) 740', PHONE) <= 9);
  assert.strictEqual(G.detectPreset('NVIDIA GeForce RTX 5090', PHONE), 'balanced');
  assert.strictEqual(G.detectPreset('SwiftShader', PHONE), 'low');
});

test('per-preset budgets are explicit, grow from Low to Ultra and scale with the level', () => {
  const keys = ['skyRes', 'stars', 'halos', 'motes', 'sparks', 'finale'];
  for (const p of G.PRESETS) for (const k of keys) assert.ok(G.BUDGETS[p][k] != null, `${p}.${k}`);
  for (let i = 1; i < G.PRESETS.length; i++) {
    for (const k of keys) if (k !== 'skyRes') assert.ok(G.BUDGETS[G.PRESETS[i]][k] >= G.BUDGETS[G.PRESETS[i - 1]][k], `${G.PRESETS[i]}.${k}`);
  }
  assert.deepStrictEqual(G.resolve({ preset: 'high' }, 'low', 10).budget, Object.assign({}, G.BUDGETS.high), 'floor level = the tuned budget');
  assert.deepStrictEqual(G.resolve({ preset: 'ultra' }, 'low', 0).budget, G.resolve({ preset: 'ultra' }, 'ultra', 17).budget,
    'manual Ultra on a weak machine keeps the Ultra floor budget');
  assert.ok(G.budgetFor('high', 14).stars > G.budgetFor('high', 10).stars, 'counts scale up within the preset');
  assert.ok(G.budgetFor('ultra', 20).stars <= G.STAR_MAX && G.budgetFor('ultra', 20).motes <= G.MOTE_MAX);
  assert.strictEqual(G.resolve({}, 'low', 0).stars, G.BUDGETS.low.stars);
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
