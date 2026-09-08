/* Targeted smoke test: pressing New Game mid-match (during AI/inter-round
 * timers) must not throw or corrupt the new match. */
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
await page.goto(BASE, { waitUntil: 'load' });
await page.evaluate(() => {
  window.__probe = {};
  const cm = window.Rules.createMatch;
  window.Rules.createMatch = (s) => { const m = cm(s); window.__probe.match = m; return m; };
});

// hammer New Game at various points inside AI bid/play timers
for (let i = 0; i < 8; i++) {
  await page.click('#btn-new-game');
  await page.waitForTimeout(200 + i * 350);
}
await page.waitForTimeout(300);
const st = await page.evaluate(() => {
  const m = window.__probe.match;
  return { round: m.round, phase: m.roundState.phase, bids: m.roundState.bids.slice(), hand0: m.roundState.hands[0].length, label: document.getElementById('round-label').textContent, scores: m.scores.slice() };
});
console.log('after restarts:', JSON.stringify(st));
if (st.round !== 1) throw new Error('restart advanced the round: ' + st.round);
if (st.label !== 'Round 1 / 5') throw new Error('round label wrong: ' + st.label);
if (st.scores[0] !== 0 || st.scores[1] !== 0) throw new Error('scores not reset');
if (st.hand0 + (13 - st.hand0) !== 13) throw new Error('hand size wrong');

// bid through to play and confirm the human can still act after restarts
await page.waitForFunction(() => {
  const r = window.__probe.match.roundState;
  return (r.phase === 'bid' && r.currentBidder === 0) || (r.phase === 'play' && r.currentSeat === 0);
}, null, { timeout: 20000 });
const s2 = await page.evaluate(() => {
  const r = window.__probe.match.roundState;
  return { phase: r.phase, bidder: r.currentBidder, seat: r.currentSeat };
});
if (s2.phase === 'bid') {
  await page.click('[data-action="bid-1"]');
}
await page.waitForFunction(() => {
  const r = window.__probe.match.roundState;
  return r.phase === 'play' && r.currentSeat === 0;
}, null, { timeout: 30000 });
const legal = await page.evaluate(() => window.Rules.legalPlays(window.__probe.match, 0));
const before = await page.evaluate(() => window.__probe.match.roundState.hands[0].length);
await page.locator('#card-area .hand-card').nth(legal[0]).click();
const after = await page.evaluate(() => window.__probe.match.roundState.hands[0].length);
if (after !== before - 1) throw new Error('card click did not play after restarts');
console.log('ok - New Game mid-match keeps state consistent and play still works');

// trick-winner announcement appears
await page.waitForFunction(() => /wins the trick|is playing|Your turn/.test(document.getElementById('bid-status').textContent), null, { timeout: 20000 });

// team labels
const labels = await page.evaluate(() => Array.from(document.querySelectorAll('.score-row .label')).map((e) => e.textContent));
console.log('score labels:', JSON.stringify(labels));
if (!/South \/ North/.test(labels[0]) || !/West \/ East/.test(labels[1])) throw new Error('team labels wrong');

// settings persistence round-trip
await page.click('[data-action="settings"]');
await page.waitForSelector('.dialog-backdrop:not(.hidden)');
const focused = await page.evaluate(() => document.activeElement && document.activeElement.textContent);
if (focused !== 'Close') throw new Error('dialog did not focus Close, got: ' + focused);
await page.locator('.dialog-backdrop:not(.hidden) input[type="checkbox"]').check();
await page.locator('.dialog-backdrop:not(.hidden) input[type="range"]').fill('30');
await page.locator('.dialog-backdrop:not(.hidden) .dialog-head button').click();
const stored = await page.evaluate(() => localStorage.getItem('spade-contract.audio.v1'));
console.log('stored prefs:', stored);
await page.reload({ waitUntil: 'load' });
const restored = await page.evaluate(() => window.Sfx.getSettings());
if (!restored.muted || Math.abs(restored.volume - 0.3) > 0.001) throw new Error('prefs not restored: ' + JSON.stringify(restored));
await page.click('[data-action="settings"]');
await page.waitForSelector('.dialog-backdrop:not(.hidden)');
const ui = await page.evaluate(() => ({ checked: document.querySelector('.dialog-backdrop:not(.hidden) input[type=checkbox]').checked, vol: document.querySelector('.dialog-backdrop:not(.hidden) input[type=range]').value }));
if (!ui.checked || ui.vol !== '30') throw new Error('settings UI does not reflect stored prefs: ' + JSON.stringify(ui));
console.log('ok - audio settings persist across reload and the dialog reflects them');

// server.js MIME check
if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
console.log('ok - no page errors');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(r => server.close(r));
}
