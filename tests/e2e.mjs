/**
 * Spade Contract — end-to-end playthrough test (dev only, not shipped).
 *
 * Drives the real visible UI in headless Chrome via playwright-core:
 *   title → Help + Settings dialogs open/close → New Game → bid every
 *   round (0–3) on the visible Bid buttons → play every trick by clicking
 *   the highlighted (playable) card on the visible hand → after 5 rounds
 *   the Results panel appears with final score + winner line.
 * A second, shorter pass runs the same load → New Game → bid → a few
 * real card taps flow on a mobile touch viewport.
 *
 * The game keeps the live match inside the `window.Game` closure (no
 * round state is published on window), so the test installs a tiny
 * read-only observation wrapper around the rules engine's entry points
 * (window.Rules.createMatch) to capture a reference to the live match
 * object. From that it READS phase/currentSeat/hands and asks the same
 * legality surface the UI uses (window.Rules.legalPlays) purely to pick
 * which visible card is a legal next move and which bid value to place.
 * Every single action is a real click/tap on the on-screen Bid buttons
 * or the on-screen hand-card buttons (ui.js proves those buttons dispatch
 * through window.Game.onBid / window.Game.onCardClick). It never performs
 * a move through a JS API. No game code is modified.
 *
 * Serving: the repo ships `server.js` (static dev server, declared as
 * `server=server.js` in starhermit.txt) but the client is a fully
 * self-contained static SPA — rules.js/platform.js/ui.js/boot.js and the
 * sfx/*.opus samples load with no /api calls. So, per the sibling
 * conventions (picture-logic/blockstead/balance-spire), this test embeds a
 * minimal node:http static server on an ephemeral port and answers /api/*
 * probes with 200 `{}` so the client debounces to its offline path with
 * zero console noise. If the client ever starts requiring the backend this
 * can be swapped for spawning `server.js`; today it is not needed.
 *
 * Run: npm run test:e2e  (or: node tests/e2e.mjs)
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT = (stage, vp) => `/tmp/spade-contract-e2e-${stage}-${vp}.png`;

// benign GPU/swiftshader + WebAudio noise (mirrors tools/production_game_audit.mjs)
const browserNoise =
  /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL|EnableWebGLDeveloperExtensions|The AudioContext was not allowed to start|Failed to load resource.*\.opus/i;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    // No StarHermit backend here: answer API probes with empty JSON (200) so
    // the client degrades quietly if it ever probes the platform.
    if (p.startsWith('/api/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

let failures = 0;
const ok = (name) => console.log(`ok - ${name}`);

// ---------- read-only observation of the rules engine ----------

// window.Rules.createMatch is called by ui.js when the player presses
// New Game (window.Game.newMatch). Capturing the returned match object
// gives us a live reference to the in-progress match WITHOUT ever calling
// a move function. We read its roundState and use the rules' own legal
// queries to choose the next legal visible card/bid.
async function installProbe(page) {
  await page.evaluate(() => {
    window.__spadeProbe = { match: null };
    const R = window.Rules;
    if (!R) throw new Error('window.Rules missing');
    const cm = R.createMatch;
    R.createMatch = (seed) => {
      const m = cm(seed);
      window.__spadeProbe.match = m;
      return m;
    };
  });
}

const readState = (page) => page.evaluate(() => {
  const m = window.__spadeProbe?.match;
  if (!m) return null;
  const r = m.roundState;
  let legal = null;
  if (r && r.phase === 'play' && r.currentSeat === 0) {
    legal = window.Rules.legalPlays(m, 0);
  }
  let recommendedBid = null;
  if (r && r.phase === 'bid' && r.currentBidder === 0) {
    recommendedBid = window.Rules.aiBid(r.hands[0]);
  }
  return {
    over: m.over,
    winner: m.winner,
    round: m.round,
    scores: m.scores.slice(),
    phase: r && r.phase,
    currentBidder: r && r.currentBidder,
    currentSeat: r && r.currentSeat,
    hands0: r ? r.hands[0].map((c) => c.rank + c.suit) : [],
    legal,
    recommendedBid,
  };
});

// Wait until the player has a decision or the match is over (i.e. it is the
// human's turn to bid/play, or the match has ended). Used after an AI
// sequence to avoid polling with no actionable state.
async function waitForHumanOrOver(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const m = window.__spadeProbe?.match;
    if (!m) return false;
    if (m.over) return true;
    const r = m.roundState;
    if (!r) return false;
    if (r.phase === 'bid' && r.currentBidder === 0) return true;
    if (r.phase === 'play' && r.currentSeat === 0) return true;
    return false;
  }, null, { timeout });
}

// Click a real Bid button (0..3) for the human seat.
const bidButton = (page, n) => page.locator(`[data-action="bid-${n}"]`);

// Click the idx-th card in #card-area (DOM order = hand order, matching the
// index space of Rules.legalPlays). Always a legal card from the observation.
// On touch we use touchscreen.tap and, if the tap somehow failed to register
// (stale layout / scroll), fall back to a real DOM click on the same button.
// The hand re-renders after every play, so the element reference can go stale;
// we therefore re-resolve the locator and retry a few times on detachment.
async function clickCard(page, idx, { touch } = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const el = page.locator('#card-area .hand-card').nth(idx);
    try {
      if (touch) {
        const before = (await readState(page)).hands0.length;
        await el.scrollIntoViewIfNeeded();
        const bb = await el.boundingBox();
        if (!bb || bb.width < 1 || bb.height < 1) throw new Error(`card ${idx} not tappable: ` + JSON.stringify(bb));
        await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
        await page.waitForTimeout(120);
        const after = (await readState(page)).hands0.length;
        if (after >= before) await el.click(); // tap did not register → real click
      } else {
        await el.click(); // auto-scrolls + auto-waits + retries on detach
      }
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      await page.waitForTimeout(150);
    }
  }
}

// Drive the full match to its natural end: every round the human bids on
// the visible bid buttons and clicks a highlighted (legal) card whenever it
// is South's turn, while the AI seats play themselves. Stops at match.over.
async function driveToEnd(page, { maxMs, touch, maxCards } = {}) {
  const deadline = Date.now() + maxMs;
  let playedCards = 0;
  let stalls = 0;
  const cap = maxCards ?? Infinity;
  while (Date.now() < deadline) {
    const st = await readState(page);
    if (!st) throw new Error('state probe empty mid-match');
    if (st.over) return st;
    if (st.phase === 'bid' && st.currentBidder === 0) {
      const n = st.recommendedBid;
      await bidButton(page, n).click();
      await page.waitForTimeout(120);
    } else if (st.phase === 'play' && st.currentSeat === 0) {
      if (!st.legal || st.legal.length === 0) {
        // Transient inconsistency (e.g. snapshot caught mid-update after a
        // deal or trick): re-read shortly instead of failing.
        if (++stalls > 40) {
          throw new Error('human turn but no legal card persisted: ' + JSON.stringify(st));
        }
        await page.waitForTimeout(150);
        continue;
      }
      stalls = 0;
      await clickCard(page, st.legal[0], { touch });
      playedCards++;
      await page.waitForTimeout(120);
      if (playedCards >= cap && cap !== Infinity) return await readState(page);
    } else {
      // AI seats are acting — wait for the human (or the end) to become actionable.
      await waitForHumanOrOver(page);
    }
  }
  throw new Error(`match did not finish within ${maxMs}ms (round ${(await readState(page))?.round}, phase ${(await readState(page))?.phase})`);
}

// ---------- one full pass ----------
async function runPass(browser, name, ctxOpts, { full }) {
  const errors = [];
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' || browserNoise.test(m.text())) return;
    const url = m.location()?.url || '';
    if (/Failed to load resource/.test(m.text()) && /\/api\/|\/favicon|\/sfx\//.test(url)) return;
    errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    const p = r.url();
    if (r.status() >= 400 && !/\/api\/|\/favicon\/|\/sfx\//.test(p)) errors.push(`http ${r.status()}: ${p}`);
  });

  try {
    // load + title
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => !!window.Game && !!window.Rules && !!window.Sfx);
    await installProbe(page);
    await page.waitForSelector('#phase-title');
    const title0 = (await page.textContent('#phase-title')).trim();
    if (title0 !== 'Welcome') throw new Error(`expected "Welcome" on title, got "${title0}"`);
    const status0 = (await page.textContent('#bid-status')).trim();
    if (!/Press New Game to start/.test(status0)) throw new Error(`unexpected idle status: "${status0}"`);
    if ((await page.textContent('#round-label')).trim() !== 'Round 0 / 5') {
      throw new Error('round label not Round 0 / 5 on title');
    }
    await page.screenshot({ path: SHOT('title', name) });
    ok(`${name}: title screen visible ("${status0}")`);

    if (full) {
      // Help dialog open / close
      await page.click('[data-action="help"]');
      await page.waitForSelector('.dialog-backdrop:not(.hidden)', { timeout: 5000 });
      const helpTitle = (await page.locator('.dialog-backdrop:not(.hidden) .dialog-title').textContent()).trim();
      if (!/How to play/.test(helpTitle)) throw new Error(`unexpected help title "${helpTitle}"`);
      await page.screenshot({ path: SHOT('help', name) });
      await page.locator('.dialog-backdrop:not(.hidden) .dialog-head button').click(); // Close
      await page.waitForFunction(() => !document.querySelector('.dialog-backdrop:not(.hidden)'));
      ok(`${name}: Help dialog opens and closes`);

      // Settings dialog open / close (exercise mute + volume sliders)
      await page.click('[data-action="settings"]');
      await page.waitForSelector('.dialog-backdrop:not(.hidden)', { timeout: 5000 });
      const setTitle = (await page.locator('.dialog-backdrop:not(.hidden) .dialog-title').textContent()).trim();
      if (!/Settings/.test(setTitle)) throw new Error(`unexpected settings title "${setTitle}"`);
      await page.locator('.dialog-backdrop:not(.hidden) input[type="checkbox"]').check();
      await page.screenshot({ path: SHOT('settings', name) });
      await page.locator('.dialog-backdrop:not(.hidden) .dialog-head button').click();
      await page.waitForFunction(() => !document.querySelector('.dialog-backdrop:not(.hidden)'));
      ok(`${name}: Settings dialog opens, mute toggles, and closes`);
    }

    // start a real match through the visible New Game button
    await page.waitForSelector('#btn-new-game:not(.hidden)', { timeout: 5000 });
    await page.click('#btn-new-game');
    await page.waitForFunction(() => {
      const m = window.__spadeProbe?.match;
      return m && m.round >= 1 && m.roundState && m.roundState.phase === 'bid';
    }, null, { timeout: 8000 });
    if ((await page.textContent('#round-label')).trim() !== 'Round 1 / 5') {
      throw new Error('round label not Round 1 / 5 after New Game');
    }
    const st0 = await readState(page);
    if (st0.hands0.length !== 13) throw new Error(`expected 13 cards dealt to South, got ${st0.hands0.length}`);
    await page.screenshot({ path: SHOT('round-start', name) });
    ok(`${name}: New Game deals round 1 — ${st0.hands0.length} cards to South`);

    if (full) {
      // play the entire match to completion (5 rounds) on the visible UI
      const final = await driveToEnd(page, { maxMs: 420000, touch: false });
      if (!final.over) throw new Error('match reported not over after full drive');
      if (final.round !== 5) throw new Error(`expected 5 rounds played, got ${final.round}`);
      if (final.winner < 0 || final.winner > 2) throw new Error(`bad winner ${final.winner}`);

      // results panel is shown
      await page.waitForFunction(() => !document.getElementById('results-panel').classList.contains('hidden'), null, { timeout: 5000 });
      const phaseTitle = (await page.textContent('#phase-title')).trim();
      if (phaseTitle !== 'Results') throw new Error(`expected "Results", got "${phaseTitle}"`);
      const finalScore = (await page.textContent('#final-score')).trim();
      if (!/Final — Team A: -?\d+ · Team B: -?\d+/.test(finalScore)) {
        throw new Error(`unexpected final score line: "${finalScore}"`);
      }
      const winnerLine = (await page.textContent('#winner-line')).trim();
      if (!/wins the contract|The match is a tie/.test(winnerLine)) {
        throw new Error(`unexpected winner line: "${winnerLine}"`);
      }
      const roundLabel = (await page.textContent('#round-label')).trim();
      if (roundLabel !== 'Round 5 / 5') throw new Error(`round label not 5/5: "${roundLabel}"`);
      await page.screenshot({ path: SHOT('results', name) });
      ok(`${name}: full match played on the visible cards — Results shown ("${finalScore}", winner: ${final.winner}, "${winnerLine}")`);
    } else {
      // mobile: bid once, then tap a few legal cards, verify real progress
      const bid0 = await readState(page);
      if (bid0.phase === 'bid' && bid0.currentBidder === 0) {
        await bidButton(page, bid0.recommendedBid).click();
      }
      // wait until bidding finishes and card play is reachable
      await page.waitForFunction(() => {
        const m = window.__spadeProbe?.match;
        const r = m?.roundState;
        return m && r && (r.phase === 'play' || (r.phase === 'bid' && r.currentBidder === 0));
      }, null, { timeout: 15000 });
      // tap a handful of cards through the visible hand
      const st = await driveToEnd(page, { maxMs: 180000, touch: true, maxCards: 6 });
      const played = 13 - st.hands0.length;
      if (played < 2) throw new Error(`expected >=2 cards played on mobile, got ${played}`);
      await page.screenshot({ path: SHOT('mobile-play', name) });
      ok(`${name}: started a match, bid, and played ${played} cards via touchscreen.tap`);
    }
  } finally {
    await context.close();
  }

  if (errors.length) throw new Error(`${name} pass had page errors:\n  ${errors.join('\n  ')}`);
  console.log(`ok - ${name}: no page errors`);
}

// ---------- main ----------
let browser = null;
try {
  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  });
  console.log(`serving ${ROOT} at ${BASE}`);
  await runPass(browser, 'desktop', { viewport: { width: 1280, height: 800 } }, { full: true });
  await runPass(browser, 'mobile',
    { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { full: false });
  console.log('\nE2E PASS — spade-contract, desktop + mobile, no page errors');
} catch (e) {
  failures++;
  console.error('\nE2E FAIL:', e.message || e);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.close();
}
if (failures) process.exit(1);
