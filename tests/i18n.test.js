'use strict';
// Localization coverage: every English key the engine client shows (T("…") /
// N("…") calls in native/*.ts) is translated in every locale (en-GB → en-US,
// es-ES → es-419, fr-CA → fr-FR inherit) with the same {placeholders}, the
// tables carry no unused rows, the account strings cover all nine locales,
// and T falls back and switches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const I18N = require('../i18n.js');
const SH = require('../sh-strings.js');

const ROOT = path.join(__dirname, '..');
function keys() {
  const out = new Set();
  const call = /(?<![\w.$])(?:T|N)\(\s*(?:'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)")/g;
  for (const f of fs.readdirSync(path.join(ROOT, 'native'))) {
    if (!f.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(ROOT, 'native', f), 'utf8');
    let m;
    while ((m = call.exec(src))) out.add((m[1] != null ? m[1] : m[2]).replace(/\\(['"\\])/g, '$1'));
  }
  return out;
}
const ALL = keys();
const ph = (s) => (String(s).match(/\{(\w+)\}/g) || []).sort().join(',');
const BASE = ['es-419', 'de-DE', 'fr-FR', 'pt-BR', 'it-IT'];

test('nine locales and a scanned key set', () => {
  assert.deepEqual(I18N.LOCALES, ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT']);
  assert.ok(ALL.size > 40, 'only ' + ALL.size + ' keys');
});

for (const loc of BASE) {
  test(loc + ' covers every key with matching placeholders, no stray rows', () => {
    const d = I18N.tables[loc];
    const missing = [...ALL].filter((k) => !(k in d));
    assert.deepEqual(missing, []);
    assert.deepEqual([...ALL].filter((k) => ph(d[k]) !== ph(k)), []);
    assert.deepEqual(Object.keys(d).filter((k) => !ALL.has(k)), []);
  });
}
test('regional tables only override used keys', () => {
  for (const loc of ['en-GB', 'es-ES', 'fr-CA']) {
    assert.deepEqual(Object.keys(I18N.tables[loc]).filter((k) => !ALL.has(k)), [], loc);
  }
});

test('account strings cover all nine locales', () => {
  for (const loc of I18N.LOCALES) {
    assert.ok(SH.strings(loc).signIn, loc);
    assert.ok(SH.strings(loc).lbRank.includes('{rank}'), loc);
  }
});

test('T formats, inherits and falls back', () => {
  I18N.setLocale('fr-CA');
  assert.equal(I18N.T('Round {n} / {total}', { n: 2, total: 5 }), 'Manche 2 / 5');
  I18N.setLocale('es-ES');
  assert.equal(I18N.T('Bid'), 'Puja');
  assert.equal(I18N.T('{seat} wins the trick.', { seat: 'Oeste' }), 'Oeste gana la baza.');
  I18N.setLocale('de-DE');
  assert.equal(I18N.T('New Game'), 'Neues Spiel');
  I18N.setLocale('xx');
  assert.equal(I18N.getLang(), 'en-US');
  assert.equal(I18N.T('Anything'), 'Anything');
});
