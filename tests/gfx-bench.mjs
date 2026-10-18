// Graphics benchmark hook for tools/gfx-bench.mjs (dev-only): picks a preset in Settings → Graphics, starts a
// New Game and keeps playing through the real UI — the recommended bid on the visible bid buttons, the first
// legal (highlighted) card from the hand — so tricks resolve with sparks while the night sky turns and the dust
// motes drift. A finished match starts a new one with the New Game button.
export const presets = ['low', 'balanced', 'high', 'ultra'];
export const levels = { low: 0, balanced: 4, high: 10, ultra: 17 };

export async function setPreset(page, preset) {
  await page.waitForFunction(() => !!window.Game && !!window.Rules && !!window.Fx, null, { timeout: 20000 });
  await page.click('[data-action="settings"]');
  await page.waitForSelector('#gfx-section', { state: 'visible', timeout: 5000 });
  await page.locator('#gfx-preset').scrollIntoViewIfNeeded();
  await page.selectOption('#gfx-preset', preset);
  await page.waitForFunction((p) => document.body.dataset.gfxPreset === p, preset);
  await page.locator('.dialog-backdrop:not(.hidden) .dialog-head button').click();
  await page.waitForFunction(() => !document.querySelector('.dialog-backdrop:not(.hidden)'));
}

// Read-only view of the live match (captured from Rules.createMatch, as in tests/e2e.mjs).
async function installProbe(page) {
  await page.evaluate(() => {
    window.__spadeBench = { match: null };
    const cm = window.Rules.createMatch;
    window.Rules.createMatch = (seed) => { const m = cm(seed); window.__spadeBench.match = m; return m; };
  });
}

const readState = (page) => page.evaluate(() => {
  const m = window.__spadeBench.match;
  if (!m) return null;
  const r = m.roundState;
  return {
    over: m.over,
    bid: r && r.phase === 'bid' && r.currentBidder === 0 ? window.Rules.aiBid(r.hands[0]) : null,
    card: r && r.phase === 'play' && r.currentSeat === 0 ? (window.Rules.legalPlays(m, 0)[0] ?? null) : null,
  };
});

async function step(page) {
  const st = await readState(page);
  if (!st || st.over) {
    if (await page.locator('#btn-new-game').isVisible()) await page.click('#btn-new-game', { timeout: 3000 });
    return;
  }
  if (st.bid != null) await page.locator(`[data-action="bid-${st.bid}"]`).click({ timeout: 3000 });
  else if (st.card != null) await page.locator('#card-area .hand-card').nth(st.card).click({ timeout: 3000 });
}

export async function start(page) {
  await installProbe(page);
  await page.click('#btn-new-game');
  await page.waitForFunction(() => window.__spadeBench.match && window.__spadeBench.match.roundState, null, { timeout: 20000 });
  let open = true;
  page.once('close', () => { open = false; });
  (async () => {
    while (open) {
      try { await step(page); } catch (e) { if (!open) return; if (process.env.BENCH_DEBUG) console.error(e.message); }
      await page.waitForTimeout(150).catch(() => {});
    }
  })();
  await page.waitForTimeout(1500);
}
