# Spade Contract — specification

Spade Contract is a Spades-style team trick-taking card game for one player and three AI seats, set in an
observatory card room. It is a StarHermit engine script game (TypeScript on the host API, engine 1.27.0,
`engine.minor=29`): one package played natively by the StarHermit client and in browsers by the engine's
web runtime (the loader `index.html` that `npm run package` writes).

## Rules (rules.js)

- Four seats: South (you), West, North (your partner), East. Team A is South + North, Team B West + East.
- A match is five rounds. Each round deals the 52-card deck, 13 cards a seat, each hand sorted by suit
  (♠ ♥ ♦ ♣) then rank. The deal is seeded from the match seed and the round number.
- Bidding goes South, West, North, East; each bids 0–3 tricks (0 is "Pass"). A team's contract is the sum
  of its two bids.
- South leads the first trick; the winner of a trick leads the next. You must follow the led suit if you
  can. Spades are always trump: the highest spade, else the highest card of the led suit, wins.
- Scoring: a team that takes at least its contract scores +10 per trick bid and +1 per extra trick (extra
  tricks are counted as bags); a team that misses scores −10 per trick bid. After five rounds the higher
  score wins (or a tie).
- AI: bids from trump length and high cards; plays lead the cheapest non-trump, duck under a winning
  partner, otherwise win as cheaply as possible or throw the cheapest card.

## Pacing (native/game.ts)

AI steps are timed on the runtime's fixed steps (60 a second): 650 ms per AI bid or card, 1.1 s to show a
finished trick (the winning card outlined, "X wins the trick."), 2.5 s on the round's scored line
("A: bid 3, took 4 (+31) · B: …") before the next deal. A new match cancels any pending step.

## Screens and layout (native/screens.ts, native/table.ts)

- Top bar: the title, "Round n / 5", the signed-in chip (avatar, name, sync dot and synced / saving… /
  offline), Help, Settings, Sign in with StarHermit (guests) or Invite a friend (signed in), New Game.
- Score panel (Team A / Team B), the card table, and the side panel: phase title (Welcome, Bid, Play,
  Round n scored, Results), the status line, tricks taken per seat, the Results box (final score, winner
  line, leaderboard line), the bid buttons (Pass (0), Bid 1–3, on your bid), and your hand as card buttons.
  Before the first match the panel says "Press New Game to start a match."
- The table: seat name pills with card counts (or "bidding"), and the trick area with a dashed ghost slot
  per seat or the card that seat played; a fresh card slides in.
- Your hand during play: playable cards glow (Bloom) and lift on hover/focus; others are dimmed. A dimmed
  card is still pressable: on your turn it explains "You must follow Hearts if you can." with the
  invalid-move sound.
- Layouts by the window's logical size: wide (≥ 1024 px: three columns, content up to 1200 px), compact
  (scores, table, side panel stacked; phones ≤ 480 px get a two-row top bar with full-width buttons; the
  page scrolls when even the table's minimum does not fit), short landscape (≤ 500 px tall: the table left,
  scores and side panel right, the side panel scrolling when needed).
- How to play is a dialog (Close, Escape or the pad's East closes it). Settings opens the runtime's Options.
- A toast shows "Invite link copied" (or the link when copying failed) and the signed-out notice.

## Controls

- Mouse or touch: press New Game, a bid button or a card.
- Keyboard and pads: the runtime's focus navigation (arrow keys / Tab, D-pad) moves between buttons and
  cards; Enter / Space (South) presses. On your bid the focus starts on Pass (0); on your turn on your first
  playable card (not on touch devices). `control.close` (Escape; pad East) closes How to play. Players rebind
  in the runtime's Options.

## Look per graphics tier (native/quality.ts, native/fx.ts)

The browser build's four presets map onto the runtime's quality tiers (frame().quality), the counts scaled
within a tier by frame().levelIndex (at most 2×):

| Tier | Shadows | Bloom | Grade | Particles | Sky | Detail |
| --- | --- | --- | --- | --- | --- | --- |
| Low | low | off | off | off | static | plain |
| Balanced | medium | on | on | low | animated | detailed |
| High / Ultra | high | on | on | high | animated | detailed |

- Sky: night gradient, the warm lamp pool, brass orrery rings with hour ticks (Detail), the seeded star field
  (turning and twinkling when animated) with bloom halos, dust motes (Particles high), colour grade and
  vignette (Grade).
- Detail: felt weave on the lamp-lit radial felt with a brass rim, card stock with bevel, inner hairline and
  corner index, seat pills, detailed panels and top bar; Bloom: glowing title, scores, primary buttons,
  playable and winning cards; Shadows: card, table and panel drop shadows.
- Sparks burst from a won trick's card (gold for your team, silver for theirs) and over the table at the
  match end. Reduced motion stills the sky and turns sparks off; high contrast drops the textured surfaces.
- The runtime owns Auto, render scale, frame-rate limit and its readout; the old per-effect overrides and
  the large-screen UI scale (ui-scale.js) are replaced by the runtime's graphics level and UI scale.

## Sound (native/audio.ts)

The authored one-shots in `sfx/` (manifest.json events: cardSelect, cardPlay, cardDeal, bidPlace,
bidPass, trickWin, trickLose, spadeTrump, roundStart, roundEnd, gameWin, gameLose, invalidMove, newGame,
uiClick, uiOpen) on the effects bus, UI clicks on the interface bus. Volumes and mute are the runtime's
Options. The old procedural fallbacks while a sample loads are not ported (a clip still loading is silent).

## Localization (strings.js, i18n.js, sh-strings.js, native/i18n.ts)

Nine locales (en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT), English text as the key,
following the runtime's interface language; a change shows on the next frame. Card ranks and suit glyphs
are shown as-is; spoken names use "{rank} of {suit}".

## Accessibility

Cards are buttons named "8 of Spades" (a blocked card's description says it must follow suit); the table's
seats and trick cards are labelled targets; new tricks, round results and the final score are announced;
reduced motion and high contrast follow the runtime's options.

## Platform integration (native/platform.ts)

- Save: `saves` holds `{ match }`, the current match snapshot (written on every state change; a match is
  resumed on start, a snapshot saved between rounds deals the next round). The snapshot is validated
  (store.js sanitizeMatch) before it is resumed.
- Merge: two saves keep the snapshot with more progress (store.js pickMatch: a match in play beats a
  finished or empty one; the same match keeps the higher tick; otherwise this device's). When another
  device's snapshot wins, the game continues from it.
- Migration: the browser build's cloud slot (`game:<slug>`, `{ version: 1, savedAt, match, checksum }`)
  shows as foreign; a valid checksum's match is merged in the same way and the slot replaced once. The old
  settings-KV keys (muted, volume, graphics) are removed. Guests' old browser localStorage cannot migrate.
- Leaderboard: signed in, every finished match posts your team's (Team A) final score through
  `score-script.js` (declared `server=score-script.js`; a practice session whose socket carries
  `{ type: 'result', scores: { 'high-score': n } }`, range-checked to −1000…1000 on the integer "Match score"
  board). The Results box shows "Leaderboard rank: #N" (or posted / not posted). Solo scores are
  client-reported and range-checked only (user decision for solo AI games).
- Sign in (runtime sign-in), Invite a friend (the platform invite link copied to the clipboard), and the
  signed-out toast. There is no multiplayer: the old page only copied an invite link to the game; no rooms
  or hosted sessions exist, so nothing is refereed beyond score-script.js.

## Checks

- `npm test`: rules, store and i18n unit tests (node --test), then `tests/native.mjs`: web index up to date,
  tsc, `starhermit check .` with zero warnings, and the render-check play scripts in `tests/native/`
  (desktop mouse + keys, a whole match by keys, phone 390×844@3 by touch with How to play, short landscape).
- `npm run test:browser` (tools/browser-play.mjs): the packaged loader in Chrome on the GPU at desktop,
  phone (DPR 3) and landscape (DPR 3): a full first round by keys, touch bids and leads, How to play;
  fails on console errors or warnings.
- `npm run package` after every change (it rewrites index.html + starhermit-files.json); `npm run css`
  after editing tools/ui-style.css.

## Known limitations

- The AI is the browser build's simple heuristic (kept, scores depend on it).
- Solo leaderboard scores are not server-verified (range check only).
- Avatar in the chip is drawn square (the old page rounded it).
