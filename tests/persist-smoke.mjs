/* Targeted smoke test: an in-progress match survives a reload.
 *
 * Flow: New Game -> bid once -> play one legal card -> reload the page ->
 * the same match is restored from the save doc (localStorage is the offline
 * cache; the hosted cloud path is the same doc mirrored via
 * /api/v1/me/cloud-saves/{slug}) -> play continues on the restored match.
 * All assertions are DOM-based: no game code is modified and no internal
 * state is published, matching the e2e conventions in tests/e2e.mjs.
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.opus': 'audio/ogg', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    let p = new URL(req.url, 'http://x').pathname;
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('no'); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/AudioContext|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

  const table = () => page.evaluate(() => ({
    title: document.getElementById('phase-title').textContent.trim(),
    round: document.getElementById('round-label').textContent.trim(),
    scoreA: document.getElementById('score-a').textContent.trim(),
    scoreB: document.getElementById('score-b').textContent.trim(),
    hand: document.querySelectorAll('#card-area .hand-card').length,
  }));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.Game && !!window.Rules && !!window.Platform);
  await page.click('#btn-new-game');
  await page.waitForFunction(() => {
    const chip = document.getElementById('round-label');
    return chip && chip.textContent.trim() === 'Round 1 / 5';
  }, null, { timeout: 8000 });

  // bid 1 on the visible button, then play one highlighted card
  await page.waitForFunction(() => !document.querySelector('[data-action="bid-1"]').classList.contains('hidden'), null, { timeout: 20000 });
  await page.click('[data-action="bid-1"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('phase-title').textContent;
    return t.trim() === 'Play' && document.querySelectorAll('#card-area .hand-card.playable').length > 0;
  }, null, { timeout: 30000 });
  await page.locator('#card-area .hand-card.playable').first().click();
  await page.waitForTimeout(400);
  const before = await table();
  if (before.hand !== 12) throw new Error('expected 12 cards after one play, got ' + before.hand);
  console.log('before reload:', JSON.stringify(before));

  // reload: the match must come back exactly where it was
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!window.Game && !!window.Rules);
  await page.waitForFunction(() => document.getElementById('phase-title').textContent.trim() !== 'Welcome', null, { timeout: 8000 });
  await page.waitForTimeout(300); // let the post-restore render settle
  const after = await table();
  console.log('after reload:', JSON.stringify(after));
  if (after.title !== before.title || after.round !== before.round ||
      after.scoreA !== before.scoreA || after.scoreB !== before.scoreB ||
      after.hand !== before.hand) {
    throw new Error('match state changed across reload: ' + JSON.stringify({ before, after }));
  }
  console.log('ok - in-progress match restored across reload');

  // play continues on the restored match: AI chain settles and South acts again.
  // During the trick-winner pause the next leader's cards already render
  // playable while input is intentionally locked, so retry the click until
  // the hand actually shrinks (same tolerance as tests/e2e.mjs).
  let cont = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    await page.waitForFunction(() => {
      const t = document.getElementById('phase-title').textContent.trim();
      return t === 'Play' && document.querySelectorAll('#card-area .hand-card.playable').length > 0;
    }, null, { timeout: 30000 });
    await page.locator('#card-area .hand-card.playable').first().click();
    await page.waitForTimeout(400);
    cont = await table();
    if (cont.hand === 11) break;
  }
  if (!cont || cont.hand !== 11) throw new Error('play did not continue after reload: ' + JSON.stringify(cont));
  console.log('ok - play continues on the restored match');

  // a fresh New Game replaces the saved match (persistence is not a trap)
  await page.click('#btn-new-game');
  await page.waitForFunction(() => document.getElementById('round-label').textContent.trim() === 'Round 1 / 5', null, { timeout: 8000 });
  const fresh = await table();
  if (fresh.hand !== 13 || fresh.scoreA !== '0' || fresh.scoreB !== '0') {
    throw new Error('New Game did not reset: ' + JSON.stringify(fresh));
  }
  console.log('ok - New Game still resets cleanly');

  if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
  console.log('ok - no page errors');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(r => server.close(r));
}
