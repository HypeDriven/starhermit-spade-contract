'use strict';

/* Spade Contract — effects renderer for the observatory card room.
 * The game itself is semantic DOM; this layer adds a 2D-canvas night sky
 * behind it (turning star field, brass orrery rings, lamp glow, dust motes,
 * colour grade + vignette), a spark overlay for won tricks, and drives the
 * CSS quality hooks (body[data-gfx-*]) for card/table shadows, bloom glow and
 * surface detail. Settings come from gfx.js and persist in localStorage. */

window.Fx = (() => {
  const G = window.Gfx;
  const STORE_KEY = 'spade-contract.gfx.v1';

  let saved = {};
  let detected = 'balanced';
  let gpuName = '';
  let resolved = null;
  let unavailable = false;       // true when the effects canvas could not be built
  let adaptiveScale = 1;
  let listeners = [];

  let sky = null, skyCtx = null;
  let sparks = null, sparkCtx = null;
  let fpsEl = null;
  let baseLayer = null, gradeLayer = null, starSprite = null, haloSprite = null;
  let stars = [], motes = [], bursts = [];
  let raf = 0, lastT = 0, frameAcc = 0, frameN = 0, fpsAcc = 0, fpsN = 0;
  let cssW = 0, cssH = 0, ratio = 1;
  const seenTricks = new Set();
  const reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /* --- settings --- */

  function load() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      const v = raw ? JSON.parse(raw) : null;
      saved = v && typeof v === 'object' ? v : {};
    } catch (_e) { saved = {}; }
  }

  function persist() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch (_e) { /* session only */ }
  }

  function detectGpu() {
    let noGl = false;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) noGl = true;
      else {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        gpuName = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch (_e) { noGl = true; }
    const touch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    detected = G.detectPreset(gpuName, { touch: touch, noGl: noGl });
  }

  function reducedMotion() { return !!(reducedMq && reducedMq.matches); }

  /* Effective tiers: reduced motion keeps the look but stills the sky and sparks. */
  function effective() {
    const r = Object.assign({}, resolved);
    if (reducedMotion()) { r.background = 'static'; r.particles = 'off'; }
    r.animated = !unavailable && (r.background === 'animated' || r.particles === 'high');
    return r;
  }

  /* --- sprites + layers --- */

  function glowSprite(size, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    return c;
  }

  // Deterministic decoration stream (cosmetic only; never touches the rules RNG).
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function buildStars(count) {
    const rnd = rng(0x5ade);
    stars = [];
    const reach = Math.hypot(cssW, cssH) * 1.15;
    for (let i = 0; i < count; i++) {
      const band = rnd() < 0.45; // cluster part of the field along a diagonal "milky" band
      const a = band ? 0.35 + (rnd() - 0.5) * 0.5 : rnd() * Math.PI * 2;
      const d = band ? reach * (0.3 + rnd() * 0.7) : reach * Math.sqrt(rnd());
      const m = rnd();
      stars.push({
        a: a, d: d,
        r: m > 0.97 ? 1.9 : m > 0.85 ? 1.3 : 0.8,
        b: 0.35 + rnd() * 0.65,
        tw: rnd() * Math.PI * 2,
        sp: 0.6 + rnd() * 1.8,
        warm: rnd() < 0.25,
      });
    }
    const moteCount = resolved.particles === 'high' ? 46 : 0;
    motes = [];
    for (let i = 0; i < moteCount; i++) {
      motes.push({ x: rnd(), y: rnd(), v: 0.004 + rnd() * 0.01, ph: rnd() * 6.28, r: 0.6 + rnd() * 1.2 });
    }
  }

  function pole() { return { x: cssW * 0.62, y: -cssH * 0.18 }; }

  function makeLayer() {
    const c = document.createElement('canvas');
    c.width = sky.width; c.height = sky.height;
    const x = c.getContext('2d');
    x.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { c: c, x: x };
  }

  function buildBase(r) {
    const L = makeLayer();
    const x = L.x;
    const w = cssW, h = cssH;
    const sg = x.createLinearGradient(0, 0, 0, h);
    sg.addColorStop(0, '#0b1a2a');
    sg.addColorStop(0.55, '#101c26');
    sg.addColorStop(1, '#0a131b');
    x.fillStyle = sg;
    x.fillRect(0, 0, w, h);
    // warm reading-lamp pool over the table
    const lamp = x.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, Math.max(w, h) * 0.6);
    lamp.addColorStop(0, r.bloom === 'on' ? 'rgba(227,179,65,0.16)' : 'rgba(227,179,65,0.08)');
    lamp.addColorStop(1, 'rgba(227,179,65,0)');
    x.fillStyle = lamp;
    x.fillRect(0, 0, w, h);
    if (r.detail === 'detailed') {
      // brass orrery rings sweeping across the dome, with hour ticks
      const p = pole();
      x.lineWidth = 1;
      [0.55, 0.78, 1.02].forEach((k, i) => {
        const rad = Math.hypot(w, h) * k;
        x.strokeStyle = 'rgba(227,179,65,' + (0.16 - i * 0.035) + ')';
        x.beginPath();
        x.ellipse(p.x, p.y, rad, rad * 0.92, 0.08, 0, Math.PI * 2);
        x.stroke();
        if (i === 1) {
          for (let t = 0; t < 72; t++) {
            const ang = (t / 72) * Math.PI * 2;
            const len = t % 6 === 0 ? 9 : 4;
            const cx = p.x + Math.cos(ang) * rad, cy = p.y + Math.sin(ang) * rad * 0.92;
            x.beginPath();
            x.moveTo(cx, cy);
            x.lineTo(cx - Math.cos(ang) * len, cy - Math.sin(ang) * len);
            x.stroke();
          }
        }
      });
    }
    baseLayer = L.c;
  }

  function buildGrade(r) {
    gradeLayer = null;
    if (r.grade !== 'on') return;
    const L = makeLayer();
    const x = L.x;
    const w = cssW, h = cssH;
    // cool shadows at the top of the dome, warm floor light at the bottom
    const tint = x.createLinearGradient(0, 0, 0, h);
    tint.addColorStop(0, 'rgba(40,70,120,0.16)');
    tint.addColorStop(0.6, 'rgba(0,0,0,0)');
    tint.addColorStop(1, 'rgba(120,70,20,0.12)');
    x.fillStyle = tint;
    x.fillRect(0, 0, w, h);
    const v = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = v;
    x.fillRect(0, 0, w, h);
    gradeLayer = L.c;
  }

  /* --- drawing --- */

  function drawSky(t) {
    const r = effective();
    const x = skyCtx;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.globalAlpha = 1;
    x.drawImage(baseLayer, 0, 0);
    x.setTransform(ratio, 0, 0, ratio, 0, 0);
    const p = pole();
    const rot = r.background === 'animated' ? t * 0.000012 : 0;
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const ang = s.a + rot;
      const sx = p.x + Math.cos(ang) * s.d;
      const sy = p.y + Math.sin(ang) * s.d;
      if (sx < -8 || sy < -8 || sx > cssW + 8 || sy > cssH + 8) continue;
      const tw = r.background === 'animated' ? 0.7 + 0.3 * Math.sin(s.tw + t * 0.001 * s.sp) : 0.85;
      const a = s.b * tw;
      const size = s.r * 5.5;
      x.globalAlpha = a;
      x.drawImage(starSprite, sx - size / 2, sy - size / 2, size, size);
      if (r.bloom === 'on' && s.r > 1) {
        const hs = s.r * 14;
        x.globalAlpha = a * (s.warm ? 0.5 : 0.4);
        x.drawImage(haloSprite, sx - hs / 2, sy - hs / 2, hs, hs);
      }
    }
    // dust motes rising through the lamp light
    if (motes.length && r.particles === 'high') {
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        const my = ((m.y - t * 0.00002 * m.v * 60) % 1 + 1) % 1;
        const mx = m.x + Math.sin(t * 0.0004 + m.ph) * 0.01;
        const px = cssW * (0.2 + mx * 0.6), py = cssH * (0.25 + my * 0.7);
        x.globalAlpha = 0.25 + 0.2 * Math.sin(t * 0.001 + m.ph);
        const sz = m.r * 5;
        x.drawImage(haloSprite, px - sz / 2, py - sz / 2, sz, sz);
      }
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    if (gradeLayer) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(gradeLayer, 0, 0);
    }
  }

  function drawSparks(dt) {
    const x = sparkCtx;
    const w = sparks.width, h = sparks.height;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, w, h);
    if (!bursts.length) return;
    const dpr = sparks.width / Math.max(1, window.innerWidth);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.globalCompositeOperation = resolved.bloom === 'on' ? 'lighter' : 'source-over';
    for (let i = bursts.length - 1; i >= 0; i--) {
      const p = bursts[i];
      p.life -= dt;
      if (p.life <= 0) { bursts.splice(i, 1); continue; }
      p.vy += 0.00045 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      x.globalAlpha = Math.min(1, k * 1.4);
      x.fillStyle = p.c;
      const sz = p.s * (0.5 + k * 0.5);
      x.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
  }

  /* --- loop + adaptive resolution --- */

  function frame(t) {
    raf = 0;
    const dt = lastT ? Math.min(100, t - lastT) : 16;
    lastT = t;
    try {
      const r = effective();
      if (r.animated) drawSky(t);
      drawSparks(dt);
    } catch (_e) {
      fail();
      return;
    }
    // adaptive resolution over ~90 frames
    if (resolved.adaptive && effective().animated) {
      frameAcc += dt; frameN++;
      if (frameN >= 90) {
        const avg = frameAcc / frameN;
        const prev = adaptiveScale;
        if (avg > 26) adaptiveScale = Math.max(0.6, adaptiveScale - 0.1);
        else if (avg < 14) adaptiveScale = Math.min(1, adaptiveScale + 0.05);
        frameAcc = 0; frameN = 0;
        if (Math.abs(prev - adaptiveScale) > 1e-6) { resize(); notify(); }
      }
    }
    if (fpsEl && resolved.showFps) {
      fpsAcc += dt; fpsN++;
      if (fpsAcc >= 500) {
        fpsEl.textContent = Math.round(1000 * fpsN / fpsAcc) + ' fps';
        fpsAcc = 0; fpsN = 0;
      }
    }
    schedule();
  }

  function schedule() {
    if (raf || document.hidden || unavailable) return;
    if (effective().animated || bursts.length || resolved.showFps) raf = window.requestAnimationFrame(frame);
    else if (sparkCtx) { try { drawSparks(0); } catch (_e) { /* ignore */ } }
  }

  function stop() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0; lastT = 0;
  }

  function fail() {
    unavailable = true;
    stop();
    if (sky) sky.classList.add('hidden');
    if (sparks) sparks.classList.add('hidden');
    document.body.dataset.gfxFx = 'unavailable';
    notify();
  }

  /* --- sizing + apply --- */

  function resize() {
    if (unavailable || !sky) return;
    cssW = window.innerWidth; cssH = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    ratio = Math.min(dpr, resolved.dprCap) * resolved.scale * (resolved.adaptive ? adaptiveScale : 1);
    ratio = G.clamp(ratio, 0.3, 4);
    sky.width = Math.max(1, Math.round(cssW * ratio));
    sky.height = Math.max(1, Math.round(cssH * ratio));
    const sr = Math.min(dpr, resolved.dprCap);
    sparks.width = Math.max(1, Math.round(cssW * sr));
    sparks.height = Math.max(1, Math.round(cssH * sr));
    try {
      const r = effective();
      buildStars(resolved.stars);
      buildBase(r);
      buildGrade(r);
      drawSky(performance.now());
    } catch (_e) { fail(); }
  }

  function applyCss() {
    const b = document.body;
    const r = effective();
    b.dataset.gfxPreset = resolved.preset;
    Object.keys(G.CATEGORIES).forEach((cat) => {
      b.dataset['gfx' + cat.charAt(0).toUpperCase() + cat.slice(1)] = r[cat];
    });
    b.dataset.gfxMotion = reducedMotion() ? 'reduced' : 'full';
    if (r.detail === 'detailed') ensureTextures();
    if (fpsEl) {
      fpsEl.classList.toggle('hidden', !resolved.showFps);
      if (!resolved.showFps) fpsEl.textContent = '';
      else if (!fpsEl.textContent) fpsEl.textContent = '… fps';
    }
  }

  let texturesMade = false;
  function ensureTextures() {
    if (texturesMade) return;
    texturesMade = true;
    try {
      // felt weave: fine two-way fibre noise, tiled
      const f = document.createElement('canvas');
      f.width = f.height = 96;
      const fx = f.getContext('2d');
      const rnd = rng(0xfe17);
      for (let i = 0; i < 1600; i++) {
        const px = rnd() * 96, py = rnd() * 96;
        const light = rnd() < 0.5;
        fx.fillStyle = light ? 'rgba(255,255,255,' + (0.03 + rnd() * 0.04) + ')' : 'rgba(0,0,0,' + (0.05 + rnd() * 0.06) + ')';
        if (rnd() < 0.5) fx.fillRect(px, py, 2 + rnd() * 3, 1);
        else fx.fillRect(px, py, 1, 2 + rnd() * 3);
      }
      // card stock: soft paper grain
      const p = document.createElement('canvas');
      p.width = p.height = 64;
      const px2 = p.getContext('2d');
      for (let i = 0; i < 700; i++) {
        px2.fillStyle = 'rgba(90,70,40,' + (0.02 + rnd() * 0.04) + ')';
        px2.fillRect(rnd() * 64, rnd() * 64, 1, 1);
      }
      const root = document.documentElement.style;
      root.setProperty('--felt-tex', 'url(' + f.toDataURL() + ')');
      root.setProperty('--paper-tex', 'url(' + p.toDataURL() + ')');
    } catch (_e) { /* plain surfaces stay */ }
  }

  function apply() {
    resolved = G.resolve(saved, detected);
    applyCss();
    stop();
    resize();
    schedule();
    notify();
  }

  function notify() { listeners.forEach((fn) => { try { fn(); } catch (_e) { /* ignore */ } }); }

  /* --- public events from the game view --- */

  function burstAt(el, count, palette) {
    if (unavailable || !el || !el.getBoundingClientRect) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const rnd = Math.random;
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const v = 0.08 + rnd() * 0.22;
      const life = 600 + rnd() * 600;
      bursts.push({
        x: cx + (rnd() - 0.5) * rect.width * 0.6,
        y: cy + (rnd() - 0.5) * rect.height * 0.6,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.12,
        life: life, max: life,
        s: 2 + rnd() * 3,
        c: palette[(rnd() * palette.length) | 0],
      });
    }
    schedule();
  }

  const GOLD = ['#ffe08a', '#e3b341', '#fff6d8', '#f2c75c'];
  const SILVER = ['#cfe3ff', '#9fb2c2', '#ffffff'];

  /** A trick completed; `el` is the winning card, `key` dedupes re-renders. */
  function trickWon(el, key, ourTeam) {
    if (seenTricks.has(key)) return;
    seenTricks.add(key);
    if (seenTricks.size > 200) seenTricks.clear();
    const r = effective();
    if (r.particles === 'off') return;
    window.requestAnimationFrame(() => burstAt(el, r.particles === 'high' ? 36 : 16, ourTeam ? GOLD : SILVER));
  }

  function matchOver(weWon) {
    const r = effective();
    if (r.particles === 'off') return;
    const target = document.querySelector('.table-panel');
    burstAt(target, r.particles === 'high' ? 140 : 60, weWon ? GOLD : SILVER);
  }

  /* --- panel API --- */

  function info() {
    return {
      gpu: gpuName,
      detected: detected,
      saved: Object.assign({}, saved),
      resolved: effective(), // what is actually drawn (reduced motion stills sky + sparks)
      pixels: sky && !unavailable ? [sky.width, sky.height] : null,
      unavailable: unavailable,
      adaptiveScale: adaptiveScale,
    };
  }

  function setGraphics(next) {
    saved = Object.assign({}, next);
    adaptiveScale = 1;
    frameAcc = 0; frameN = 0;
    persist();
    apply();
  }

  function onChange(fn) { listeners.push(fn); }

  function init() {
    load();
    detectGpu();
    try {
      sky = document.createElement('canvas');
      sky.id = 'fx-sky';
      sky.className = 'fx-layer fx-sky';
      sky.setAttribute('aria-hidden', 'true');
      skyCtx = sky.getContext('2d', { alpha: false });
      sparks = document.createElement('canvas');
      sparks.id = 'fx-sparks';
      sparks.className = 'fx-layer fx-sparks';
      sparks.setAttribute('aria-hidden', 'true');
      sparkCtx = sparks.getContext('2d');
      if (!skyCtx || !sparkCtx) throw new Error('no 2d');
      document.body.insertBefore(sky, document.body.firstChild);
      document.body.appendChild(sparks);
      starSprite = glowSprite(16, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(230,240,255,0.7)'], [1, 'rgba(200,220,255,0)']]);
      haloSprite = glowSprite(64, [[0, 'rgba(255,230,170,0.9)'], [0.25, 'rgba(255,215,140,0.35)'], [1, 'rgba(255,200,120,0)']]);
    } catch (_e) {
      unavailable = true;
      document.body.dataset.gfxFx = 'unavailable';
    }
    fpsEl = document.createElement('div');
    fpsEl.id = 'fx-fps';
    fpsEl.className = 'fx-fps hidden';
    fpsEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(fpsEl);
    apply();
    let rt = 0;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { resize(); schedule(); notify(); }, 120);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(); else schedule();
    });
    if (reducedMq && reducedMq.addEventListener) {
      reducedMq.addEventListener('change', () => apply());
    }
  }

  return { init, setGraphics, info, onChange, trickWon, matchOver, storeKey: STORE_KEY };
})();
