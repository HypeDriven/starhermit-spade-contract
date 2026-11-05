'use strict';
// Localization coverage: every English key the engine client shows (T("…") /
// N("…") calls in native/*.ts) is translated in every locale (en-GB → en-US,
// es-ES → es-419, fr-CA → fr-FR inherit) with the same {placeholders}, the
// tables carry no unused rows; the account strings are the engine's.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TABLES = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/strings.json'), 'utf8'));
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
  assert.deepEqual(Object.keys(TABLES).sort(), ['de-DE', 'en-GB', 'en-US', 'es-419', 'es-ES', 'fr-CA', 'fr-FR', 'it-IT', 'pt-BR']);
  assert.ok(ALL.size > 40, 'only ' + ALL.size + ' keys');
});

for (const loc of BASE) {
  test(loc + ' covers every key with matching placeholders, no stray rows', () => {
    const d = TABLES[loc];
    const missing = [...ALL].filter((k) => !(k in d));
    assert.deepEqual(missing, []);
    assert.deepEqual([...ALL].filter((k) => ph(d[k]) !== ph(k)), []);
    assert.deepEqual(Object.keys(d).filter((k) => !ALL.has(k)), []);
  });
}
test('regional tables only override used keys', () => {
  for (const loc of ['en-GB', 'es-ES', 'fr-CA']) {
    assert.deepEqual(Object.keys(TABLES[loc]).filter((k) => !ALL.has(k)), [], loc);
  }
});
