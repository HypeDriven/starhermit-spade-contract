/* Hosted-mode smoke test: the platform adapter against a mock StarHermit API.
 *
 * Covers the paths a real launch exercises that the offline suites cannot:
 *   - #game_token fragment read once + stripped from the URL
 *   - Bearer auth on every /api/v1 call; gameKey from game_scope
 *   - nickname via GET /api/v1/users/{sub}/profile (never /api/v1/me, never
 *     the username), with the 'Player '+id8 fallback when the profile 404s
 *   - cloud save PUT (zip+base64) after the 2 s debounce, remote-preferred
 *     load after reload, and the visible sync status chip
 *
 * Run: npm run test:hosted  (or: node tests/hosted-smoke.mjs)
 */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.opus': 'audio/ogg', '.json': 'application/json' };

const SUB = '2712e04e-461b-4d23-81ae-e40b429128a8';
const SLUG = 'spade-contract';
const USERNAME = 'ada_1815'; // must never be rendered
let profileStatus = 200;
const cloud = new Map();     // gameKey -> dataBase64
const requests = [];         // { method, path, auth }

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
const jwt = (sub) => 'e30.' + b64url({ sub, game_scope: SLUG, exp: 9999999999 }) + '.sig';

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p.startsWith('/api/')) {
      requests.push({ method: req.method, path: p, auth: req.headers.authorization || null });
      if (p === '/api/v1/users/' + SUB + '/profile' && req.method === 'GET') {
        if (profileStatus !== 200) { res.writeHead(profileStatus).end(); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: SUB, username: USERNAME, nickname: 'Ada Lovelace' }));
        return;
      }
      if (p === '/api/v1/me/cloud-saves/' + SLUG && req.method === 'GET') {
        const saved = cloud.get(SLUG);
        if (!saved) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': 'application/zip' });
        res.end(Buffer.from(saved, 'base64'));
        return;
      }
      if (p === '/api/v1/me/cloud-saves/' + SLUG && req.method === 'PUT') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          cloud.set(SLUG, JSON.parse(body).dataBase64);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{}');
        });
        return;
      }
      if (p === '/api/v1/games/' + SLUG + '/launch-token' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token: jwt(SUB) }));
        return;
      }
      res.writeHead(404).end();
      return;
    }
    let f = p === '/' ? '/index.html' : p;
    const data = await readFile(path.normalize(path.join(ROOT, f)));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
const fails = [];
const check = (cond, name) => {
  if (cond) console.log('ok - ' + name);
  else { fails.push(name); console.error('FAIL - ' + name); }
};

async function newHostedPage(token) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/AudioContext|Failed to load resource/.test(m.text())) page.errors.push('console: ' + m.text());
  });
  await page.goto(BASE + '/#game_token=' + token + '&session_id=abc', { waitUntil: 'load' });
  return { ctx, page };
}

try {
  // ---- pass 1: full hosted flow with a profile nickname ----
  {
    const { ctx, page } = await newHostedPage(jwt(SUB));
    await page.waitForFunction(() => !!window.Game && !!window.Rules && !!window.Platform);

    check(!(await page.evaluate(() => location.hash)).includes('game_token'), 'launch token stripped from the URL fragment');
    await page.waitForFunction(() => !document.getElementById('player-chip').classList.contains('hidden'), null, { timeout: 8000 });
    await page.waitForFunction(() => document.getElementById('player-name').textContent.length > 0, null, { timeout: 8000 });
    const chipText = await page.evaluate(() => document.getElementById('player-chip').textContent);
    check(chipText.includes('Ada Lovelace'), 'nickname from /users/{sub}/profile shown in the profile chip');
    check(!chipText.includes(USERNAME), 'username never rendered');

    // start a match; the cloud PUT must follow the 2 s debounce
    await page.click('#btn-new-game');
    await page.waitForFunction(() => document.getElementById('round-label').textContent.trim() === 'Round 1 / 5');
    await page.waitForFunction(() => {
      const s = document.getElementById('sync-status');
      return s.textContent.trim() === 'synced';
    }, null, { timeout: 10000 });
    check(true, 'sync status reaches "synced" after the debounced cloud save');

    // the stored zip must decode to a doc holding the live match
    const stored = cloud.get(SLUG);
    check(!!stored, 'cloud save PUT received a zip payload');
    const doc = await page.evaluate((b64) => {
      const bytes = window.Platform.__zip.base64ToBytes(b64);
      return JSON.parse(new TextDecoder().decode(window.Platform.__zip.unzipFirstEntry(bytes)));
    }, stored);
    check(doc && doc.version === 1 && doc.match && doc.match.round === 1 && doc.match.roundState.hands[0].length === 13, 'stored zip decodes to the in-progress match doc');

    // reload with a fresh launch token: remote save is preferred and resumes
    await page.goto(BASE + '/#game_token=' + jwt(SUB), { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('phase-title').textContent.trim() !== 'Welcome', null, { timeout: 8000 });
    const after = await page.evaluate(() => ({
      round: document.getElementById('round-label').textContent.trim(),
      hand: document.querySelectorAll('#card-area .hand-card').length,
    }));
    check(after.round === 'Round 1 / 5' && after.hand === 13, 'match resumed from the cloud save after reload (' + JSON.stringify(after) + ')');

    check(page.errors.length === 0, 'no page errors (hosted pass 1)' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await ctx.close();
  }

  // ---- pass 2: profile 404 → "Player "+id8 fallback ----
  profileStatus = 404;
  {
    const { ctx, page } = await newHostedPage(jwt(SUB));
    await page.waitForFunction(() => !document.getElementById('player-chip').classList.contains('hidden'), null, { timeout: 8000 });
    await page.waitForFunction(() => document.getElementById('player-name').textContent.length > 0, null, { timeout: 8000 });
    const name = await page.evaluate(() => document.getElementById('player-name').textContent);
    check(name === 'Player ' + SUB.slice(0, 8), 'nickname falls back to "Player "+id8 (' + name + ')');
    check(page.errors.length === 0, 'no page errors (hosted pass 2)' + (page.errors.length ? ': ' + page.errors.join(' | ') : ''));
    await ctx.close();
  }

  // ---- request log assertions ----
  const apiCalls = requests.filter((r) => r.path.startsWith('/api/'));
  check(apiCalls.length > 0 && apiCalls.every((r) => r.auth === 'Bearer ' + jwt(SUB)), 'Authorization: Bearer on every REST call');
  check(apiCalls.every((r) => r.path !== '/api/v1/me'), 'GET /api/v1/me never called');
  check(apiCalls.every((r) => !r.path.includes(USERNAME)), 'no request carries a username');
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}

if (fails.length) {
  console.error('\nHOSTED FAIL:', fails.join('; '));
  process.exit(1);
}
console.log('\nHOSTED PASS - spade-contract platform adapter against mock API');
