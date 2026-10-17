// Spade Contract — localization coverage: every English key the markup and
// code use is translated in every locale (en-GB → en-US, es-ES → es-419,
// fr-CA → fr-FR inherit), placeholders survive, the language follows
// sh-language.js and switches live, and the Graphics / account strings cover
// the nine locales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadTables, codeKeys, htmlKeys, audit, bootI18n, LOCALES } from './i18n-common.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

export function usedKeys() {
  const keys = new Set(htmlKeys(read('index.html')));
  for (const f of ['ui.js', 'boot.js', 'platform.js']) codeKeys(read(f), ['makeDialog']).forEach((k) => keys.add(k));
  return [...keys].filter((k) => /[A-Za-z]/.test(k)).sort();
}

test('every used key is translated in every locale; placeholders intact', () => {
  assert.deepEqual(audit(loadTables(ROOT, 'strings.js', 'SC_STRINGS'), usedKeys()), []);
});

test('the locale follows sh-language and switches live', () => {
  const { I18N, events, doc } = bootI18n(ROOT, { strings: 'strings.js', i18n: 'i18n.js', global: 'SCI18N', languages: ['de-DE'] });
  assert.equal(I18N.lang, 'de-DE');
  assert.equal(doc.documentElement.lang, 'de-DE');
  assert.equal(I18N.T('New Game'), 'Neues Spiel');
  I18N.language.setChoice('fr-CA');
  assert.equal(I18N.lang, 'fr-CA');
  assert.equal(events.at(-1), 'fr-CA');
  assert.equal(I18N.T('Round {n} / {total}', { n: 2, total: 5 }), 'Manche 2 / 5');
  I18N.language.setChoice('es-ES');
  assert.equal(I18N.T('{seat} wins the trick.', { seat: 'Oeste' }), 'Oeste gana la baza.');
});

test('Graphics panel and account strings cover all nine locales and follow the game language', () => {
  const sb = { window: {}, self: {} };
  vm.runInNewContext(read('sh-strings.js'), sb);
  const SHS = sb.window.ShStrings || sb.self.ShStrings;
  for (const l of LOCALES) assert.ok(SHS.STRINGS[l] && SHS.STRINGS[l].signIn, `sh-strings ${l}`);
  const gfx = read('gfx-panel.js');
  for (const l of LOCALES) assert.ok(gfx.includes(`'${l}': {`), `gfx-panel ${l}`);
  assert.match(gfx, /window\.SCI18N \? window\.SCI18N\.lang/);
  assert.match(gfx, /addEventListener\('sc-language'/);
});

test('index.html loads sh-language.js, strings.js and i18n.js before the game scripts', () => {
  const html = read('index.html');
  const at = (s) => html.indexOf(`src="./${s}"`);
  assert.ok(at('sh-language.js') > 0 && at('sh-language.js') < at('i18n.js') && at('strings.js') < at('i18n.js') && at('i18n.js') < at('platform.js'));
});
