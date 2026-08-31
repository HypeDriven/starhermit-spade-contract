'use strict';

/* Spade Contract SFX engine.
 * Authored one-shot samples (sfx/<name>.opus, see sfx/manifest.json) played
 * through a WebAudio effects bus; each event falls back to a procedural
 * synthesized effect while its sample is loading or if it fails to load.
 * The audio context is created/resumed only after a user gesture. */

window.Sfx = (() => {
  const SFX_BASE = 'sfx/';

  let ctx = null;
  let master = null;
  let fxBus = null;
  let unlocked = false;
  let muted = false;
  let volume = 0.8;

  // sample name -> AudioBuffer | 'loading' | 'error'
  const samples = new Map();

  /* --- tiny synth helpers for fallbacks --- */

  function tone(bus, freq, dur, gain, type, when, glideTo) {
    const t = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(bus, dur, gain, filterFreq, filterType, when) {
    const t = ctx.currentTime + (when || 0);
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType || 'bandpass';
    filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filt).connect(g).connect(bus);
    src.start(t);
  }

  function knock(bus, when, freq) {
    tone(bus, freq || 170, 0.09, 0.5, 'sine', when, 70);
  }

  /* --- events: named methods backed by sfx/<sample>.opus + a fallback --- */

  const EVENTS = {
    cardSelect: {
      sample: 'card-select',
      fallback(bus) { noiseBurst(bus, 0.07, 0.25, 4000, 'highpass'); },
    },
    cardPlay: {
      sample: 'card-play',
      fallback(bus) {
        noiseBurst(bus, 0.06, 0.4, 2500, 'bandpass');
        knock(bus, 0.02, 140);
      },
    },
    cardDeal: {
      sample: 'card-deal',
      fallback(bus) {
        noiseBurst(bus, 0.05, 0.3, 3500, 'bandpass');
        noiseBurst(bus, 0.05, 0.3, 3500, 'bandpass', 0.09);
      },
    },
    bidPlace: {
      sample: 'bid-place',
      fallback(bus) { knock(bus, 0, 220); knock(bus, 0.12, 220); },
    },
    bidPass: {
      sample: 'bid-pass',
      fallback(bus) { knock(bus, 0, 110); },
    },
    spadeTrump: {
      sample: 'spade-trump',
      fallback(bus) {
        knock(bus, 0, 90);
        tone(bus, 620, 0.5, 0.2, 'triangle', 0.01, 300);
      },
    },
    trickWin: {
      sample: 'trick-win',
      fallback(bus) {
        noiseBurst(bus, 0.15, 0.2, 3000, 'highpass');
        tone(bus, 520, 0.18, 0.25, 'sine', 0.05);
        tone(bus, 780, 0.25, 0.25, 'sine', 0.16);
      },
    },
    trickLose: {
      sample: 'trick-lose',
      fallback(bus) {
        noiseBurst(bus, 0.12, 0.18, 2000, 'bandpass');
        tone(bus, 320, 0.3, 0.2, 'sine', 0.05, 180);
      },
    },
    invalidMove: {
      sample: 'invalid-move',
      fallback(bus) { knock(bus, 0, 120); knock(bus, 0.11, 120); },
    },
    roundStart: {
      sample: 'round-start',
      fallback(bus) {
        noiseBurst(bus, 0.25, 0.3, 2800, 'highpass');
        knock(bus, 0.28, 160);
      },
    },
    roundEnd: {
      sample: 'round-end',
      fallback(bus) {
        knock(bus, 0, 240); knock(bus, 0.12, 240); knock(bus, 0.24, 240);
        tone(bus, 440, 0.35, 0.2, 'sine', 0.38);
      },
    },
    gameWin: {
      sample: 'game-win',
      fallback(bus) {
        tone(bus, 523, 0.5, 0.25, 'sine', 0);
        tone(bus, 659, 0.5, 0.25, 'sine', 0.18);
        tone(bus, 784, 0.8, 0.3, 'sine', 0.36);
      },
    },
    gameLose: {
      sample: 'game-lose',
      fallback(bus) {
        tone(bus, 196, 0.9, 0.3, 'sine', 0, 130);
        tone(bus, 98, 1.1, 0.2, 'triangle', 0.1);
      },
    },
    uiClick: {
      sample: 'ui-click',
      fallback(bus) { tone(bus, 900, 0.05, 0.25, 'square'); },
    },
    uiOpen: {
      sample: 'ui-open',
      fallback(bus) {
        noiseBurst(bus, 0.18, 0.2, 1200, 'bandpass');
        tone(bus, 380, 0.15, 0.15, 'sine', 0.02, 560);
      },
    },
    newGame: {
      sample: 'new-game',
      fallback(bus) {
        knock(bus, 0, 180); knock(bus, 0.12, 180);
        noiseBurst(bus, 0.3, 0.28, 3000, 'highpass', 0.26);
      },
    },
  };

  /* --- core --- */

  function unlock() {
    if (unlocked) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    fxBus = ctx.createGain();
    fxBus.connect(master);
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
  }

  function loadSample(name) {
    samples.set(name, 'loading');
    fetch(SFX_BASE + name + '.opus')
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => samples.set(name, buf))
      .catch(() => samples.set(name, 'error'));
  }

  function play(event) {
    const def = EVENTS[event];
    if (!def) return;
    if (!unlocked) unlock();
    if (!unlocked || muted) return;
    const cached = samples.get(def.sample);
    if (cached instanceof AudioBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = cached;
      src.connect(fxBus);
      src.start();
      return;
    }
    if (!cached) loadSample(def.sample);
    def.fallback(fxBus);
  }

  function setMuted(value) {
    muted = !!value;
    if (master) master.gain.value = muted ? 0 : volume;
  }

  function setVolume(value) {
    volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (master && !muted) master.gain.value = volume;
  }

  /* Bind SFX to the existing UI handlers declared in index.html. */
  function bind() {
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    const on = (action, event) => {
      document.querySelectorAll('[data-action="' + action + '"]').forEach((el) => {
        el.addEventListener('click', () => play(event));
      });
    };
    on('help', 'uiOpen');
    on('settings', 'uiOpen');
    on('new-game', 'newGame');
    on('bid-0', 'bidPass');
    on('bid-1', 'bidPlace');
    on('bid-2', 'bidPlace');
    on('bid-3', 'bidPlace');

    const cardArea = document.getElementById('card-area');
    if (cardArea) {
      cardArea.addEventListener('click', (e) => {
        if (e.target !== cardArea) play('cardSelect');
      });
    }
  }

  const api = { play, unlock, bind, setMuted, setVolume, events: Object.keys(EVENTS) };
  Object.keys(EVENTS).forEach((name) => {
    api[name] = () => play(name);
  });
  return api;
})();
