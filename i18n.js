/* Spade Contract — localization core (classic script / CommonJS).
 *
 * Nine locales: en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT.
 * English source strings are the keys; strings.js (loaded first, required in
 * node) holds the tables: en-GB, es-ES and fr-CA carry only their differences
 * from en-US, es-419 and fr-FR. The engine client picks the locale from the
 * runtime's interface language (native/i18n.ts) and draws every string
 * through T() each frame, so a change shows on the next frame.
 * Engine global: globalThis.SCI18N.
 */
(function (root) {
  'use strict';
  var TABLES = root.SC_STRINGS || (typeof module !== 'undefined' && module.exports ? (require('./strings.js'), root.SC_STRINGS) : {});
  var LOCALES = ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT'];
  var PARENT = { 'en-GB': 'en-US', 'es-ES': 'es-419', 'fr-CA': 'fr-FR' };
  var lang = 'en-US';
  var hasOwn = Object.prototype.hasOwnProperty;

  function lookup(key) {
    for (var l = lang; l; l = PARENT[l]) {
      var t = TABLES[l];
      if (t && hasOwn.call(t, key)) return t[key];
    }
    return key;
  }

  /** Translate an English source string; {name} placeholders filled from vars. */
  function T(key, vars) {
    var s = lookup(String(key));
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return hasOwn.call(vars, k) ? String(vars[k]) : m; });
    return s;
  }

  function setLocale(next) { lang = LOCALES.indexOf(next) >= 0 ? next : 'en-US'; }

  var api = { T: T, setLocale: setLocale, getLang: function () { return lang; }, LOCALES: LOCALES, PARENT: PARENT, tables: TABLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SCI18N = api;
})(globalThis);
