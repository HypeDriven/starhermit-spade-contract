'use strict';

/* Spade Contract — Graphics section of the Settings dialog.
 * Builds the controls (quality preset, render scale, one select per effect
 * category, adaptive resolution, frame-rate readout, cost summary) on top of
 * window.Fx / window.Gfx. The game has no i18n system, so only these panel
 * strings are localized, picked from navigator.language. */

window.GfxPanel = (() => {
  const STRINGS = {
    'en-US': {
      graphics: 'Graphics', quality: 'Quality', auto: 'Auto (detected: {tier})', renderScale: 'Render scale',
      fromPreset: 'From preset ({tier})', adaptive: 'Adaptive resolution', showFps: 'Show frame rate',
      unavailable: 'Effects are unavailable in this browser; the table is drawn without them.',
      reduced: 'Reduced motion is on: the sky and sparks stay still.', unknownGpu: 'Unknown GPU',
      presets: { low: 'Low', balanced: 'Balanced', high: 'High', ultra: 'Ultra' },
      cats: { shadows: 'Shadows', bloom: 'Glow (bloom)', grade: 'Color grade & vignette', particles: 'Particles', background: 'Night sky', detail: 'Surface detail' },
      tiers: { off: 'Off', on: 'On', low: 'Low', medium: 'Medium', high: 'High', static: 'Still', animated: 'Animated', plain: 'Plain', detailed: 'Detailed' },
      words: { noShadows: 'no shadows', shadows_low: 'soft shadows', shadows_medium: 'layered shadows', shadows_high: 'deep shadows', bloom: 'glow', grade: 'color grade', particles_low: 'sparks', particles_high: 'sparks + dust', animatedSky: 'animated sky', staticSky: 'still sky' },
    },
    'en-GB': {
      graphics: 'Graphics', quality: 'Quality', auto: 'Auto (detected: {tier})', renderScale: 'Render scale',
      fromPreset: 'From preset ({tier})', adaptive: 'Adaptive resolution', showFps: 'Show frame rate',
      unavailable: 'Effects are unavailable in this browser; the table is drawn without them.',
      reduced: 'Reduced motion is on: the sky and sparks stay still.', unknownGpu: 'Unknown GPU',
      presets: { low: 'Low', balanced: 'Balanced', high: 'High', ultra: 'Ultra' },
      cats: { shadows: 'Shadows', bloom: 'Glow (bloom)', grade: 'Colour grade & vignette', particles: 'Particles', background: 'Night sky', detail: 'Surface detail' },
      tiers: { off: 'Off', on: 'On', low: 'Low', medium: 'Medium', high: 'High', static: 'Still', animated: 'Animated', plain: 'Plain', detailed: 'Detailed' },
      words: { noShadows: 'no shadows', shadows_low: 'soft shadows', shadows_medium: 'layered shadows', shadows_high: 'deep shadows', bloom: 'glow', grade: 'colour grade', particles_low: 'sparks', particles_high: 'sparks + dust', animatedSky: 'animated sky', staticSky: 'still sky' },
    },
    'es-419': {
      graphics: 'Gráficos', quality: 'Calidad', auto: 'Automática (detectada: {tier})', renderScale: 'Escala de renderizado',
      fromPreset: 'Según el ajuste ({tier})', adaptive: 'Resolución adaptable', showFps: 'Mostrar cuadros por segundo',
      unavailable: 'Los efectos no están disponibles en este navegador; la mesa se dibuja sin ellos.',
      reduced: 'El movimiento reducido está activo: el cielo y las chispas quedan quietos.', unknownGpu: 'GPU desconocida',
      presets: { low: 'Baja', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra' },
      cats: { shadows: 'Sombras', bloom: 'Resplandor (bloom)', grade: 'Corrección de color y viñeta', particles: 'Partículas', background: 'Cielo nocturno', detail: 'Detalle de superficies' },
      tiers: { off: 'No', on: 'Sí', low: 'Bajas', medium: 'Medias', high: 'Altas', static: 'Quieto', animated: 'Animado', plain: 'Simple', detailed: 'Detallado' },
      words: { noShadows: 'sin sombras', shadows_low: 'sombras suaves', shadows_medium: 'sombras en capas', shadows_high: 'sombras profundas', bloom: 'resplandor', grade: 'corrección de color', particles_low: 'chispas', particles_high: 'chispas + polvo', animatedSky: 'cielo animado', staticSky: 'cielo quieto' },
    },
    'es-ES': {
      graphics: 'Gráficos', quality: 'Calidad', auto: 'Automática (detectada: {tier})', renderScale: 'Escala de renderizado',
      fromPreset: 'Según el ajuste ({tier})', adaptive: 'Resolución adaptativa', showFps: 'Mostrar fotogramas por segundo',
      unavailable: 'Los efectos no están disponibles en este navegador; la mesa se dibuja sin ellos.',
      reduced: 'El movimiento reducido está activado: el cielo y las chispas se quedan quietos.', unknownGpu: 'GPU desconocida',
      presets: { low: 'Baja', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra' },
      cats: { shadows: 'Sombras', bloom: 'Resplandor (bloom)', grade: 'Etalonaje y viñeta', particles: 'Partículas', background: 'Cielo nocturno', detail: 'Detalle de superficies' },
      tiers: { off: 'No', on: 'Sí', low: 'Bajas', medium: 'Medias', high: 'Altas', static: 'Quieto', animated: 'Animado', plain: 'Sencillo', detailed: 'Detallado' },
      words: { noShadows: 'sin sombras', shadows_low: 'sombras suaves', shadows_medium: 'sombras en capas', shadows_high: 'sombras profundas', bloom: 'resplandor', grade: 'etalonaje', particles_low: 'chispas', particles_high: 'chispas + polvo', animatedSky: 'cielo animado', staticSky: 'cielo quieto' },
    },
    'de-DE': {
      graphics: 'Grafik', quality: 'Qualität', auto: 'Automatisch (erkannt: {tier})', renderScale: 'Renderskalierung',
      fromPreset: 'Laut Voreinstellung ({tier})', adaptive: 'Adaptive Auflösung', showFps: 'Bildrate anzeigen',
      unavailable: 'Effekte sind in diesem Browser nicht verfügbar; der Tisch wird ohne sie dargestellt.',
      reduced: 'Reduzierte Bewegung ist aktiv: Himmel und Funken bleiben still.', unknownGpu: 'Unbekannte GPU',
      presets: { low: 'Niedrig', balanced: 'Ausgewogen', high: 'Hoch', ultra: 'Ultra' },
      cats: { shadows: 'Schatten', bloom: 'Leuchten (Bloom)', grade: 'Farbkorrektur & Vignette', particles: 'Partikel', background: 'Nachthimmel', detail: 'Oberflächendetails' },
      tiers: { off: 'Aus', on: 'An', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', static: 'Still', animated: 'Animiert', plain: 'Schlicht', detailed: 'Detailliert' },
      words: { noShadows: 'keine Schatten', shadows_low: 'weiche Schatten', shadows_medium: 'mehrlagige Schatten', shadows_high: 'tiefe Schatten', bloom: 'Leuchten', grade: 'Farbkorrektur', particles_low: 'Funken', particles_high: 'Funken + Staub', animatedSky: 'animierter Himmel', staticSky: 'stiller Himmel' },
    },
    'fr-FR': {
      graphics: 'Graphismes', quality: 'Qualité', auto: 'Auto (détectée : {tier})', renderScale: 'Échelle de rendu',
      fromPreset: 'Selon le préréglage ({tier})', adaptive: 'Résolution adaptative', showFps: 'Afficher les images par seconde',
      unavailable: 'Les effets ne sont pas disponibles dans ce navigateur ; la table est affichée sans eux.',
      reduced: 'Le mouvement réduit est activé : le ciel et les étincelles restent immobiles.', unknownGpu: 'GPU inconnu',
      presets: { low: 'Basse', balanced: 'Équilibrée', high: 'Haute', ultra: 'Ultra' },
      cats: { shadows: 'Ombres', bloom: 'Lueur (bloom)', grade: 'Étalonnage et vignette', particles: 'Particules', background: 'Ciel nocturne', detail: 'Détail des surfaces' },
      tiers: { off: 'Non', on: 'Oui', low: 'Basses', medium: 'Moyennes', high: 'Hautes', static: 'Immobile', animated: 'Animé', plain: 'Simple', detailed: 'Détaillé' },
      words: { noShadows: 'sans ombres', shadows_low: 'ombres douces', shadows_medium: 'ombres en couches', shadows_high: 'ombres profondes', bloom: 'lueur', grade: 'étalonnage', particles_low: 'étincelles', particles_high: 'étincelles + poussière', animatedSky: 'ciel animé', staticSky: 'ciel immobile' },
    },
    'fr-CA': {
      graphics: 'Graphiques', quality: 'Qualité', auto: 'Auto (détectée : {tier})', renderScale: 'Échelle de rendu',
      fromPreset: 'Selon le préréglage ({tier})', adaptive: 'Résolution adaptative', showFps: 'Afficher les images par seconde',
      unavailable: 'Les effets ne sont pas offerts dans ce navigateur; la table est affichée sans eux.',
      reduced: 'Le mouvement réduit est activé : le ciel et les étincelles restent immobiles.', unknownGpu: 'GPU inconnu',
      presets: { low: 'Basse', balanced: 'Équilibrée', high: 'Haute', ultra: 'Ultra' },
      cats: { shadows: 'Ombres', bloom: 'Lueur (bloom)', grade: 'Correction des couleurs et vignette', particles: 'Particules', background: 'Ciel nocturne', detail: 'Détail des surfaces' },
      tiers: { off: 'Non', on: 'Oui', low: 'Basses', medium: 'Moyennes', high: 'Hautes', static: 'Immobile', animated: 'Animé', plain: 'Simple', detailed: 'Détaillé' },
      words: { noShadows: 'sans ombres', shadows_low: 'ombres douces', shadows_medium: 'ombres en couches', shadows_high: 'ombres profondes', bloom: 'lueur', grade: 'correction des couleurs', particles_low: 'étincelles', particles_high: 'étincelles + poussière', animatedSky: 'ciel animé', staticSky: 'ciel immobile' },
    },
    'pt-BR': {
      graphics: 'Gráficos', quality: 'Qualidade', auto: 'Automática (detectada: {tier})', renderScale: 'Escala de renderização',
      fromPreset: 'Da predefinição ({tier})', adaptive: 'Resolução adaptável', showFps: 'Mostrar taxa de quadros',
      unavailable: 'Os efeitos não estão disponíveis neste navegador; a mesa é desenhada sem eles.',
      reduced: 'O movimento reduzido está ativado: o céu e as faíscas ficam parados.', unknownGpu: 'GPU desconhecida',
      presets: { low: 'Baixa', balanced: 'Equilibrada', high: 'Alta', ultra: 'Ultra' },
      cats: { shadows: 'Sombras', bloom: 'Brilho (bloom)', grade: 'Correção de cor e vinheta', particles: 'Partículas', background: 'Céu noturno', detail: 'Detalhe das superfícies' },
      tiers: { off: 'Desligado', on: 'Ligado', low: 'Baixas', medium: 'Médias', high: 'Altas', static: 'Parado', animated: 'Animado', plain: 'Simples', detailed: 'Detalhado' },
      words: { noShadows: 'sem sombras', shadows_low: 'sombras suaves', shadows_medium: 'sombras em camadas', shadows_high: 'sombras profundas', bloom: 'brilho', grade: 'correção de cor', particles_low: 'faíscas', particles_high: 'faíscas + poeira', animatedSky: 'céu animado', staticSky: 'céu parado' },
    },
    'it-IT': {
      graphics: 'Grafica', quality: 'Qualità', auto: 'Automatica (rilevata: {tier})', renderScale: 'Scala di rendering',
      fromPreset: 'Dal preset ({tier})', adaptive: 'Risoluzione adattiva', showFps: 'Mostra frequenza fotogrammi',
      unavailable: 'Gli effetti non sono disponibili in questo browser; il tavolo è disegnato senza.',
      reduced: 'Il movimento ridotto è attivo: il cielo e le scintille restano fermi.', unknownGpu: 'GPU sconosciuta',
      presets: { low: 'Bassa', balanced: 'Bilanciata', high: 'Alta', ultra: 'Ultra' },
      cats: { shadows: 'Ombre', bloom: 'Bagliore (bloom)', grade: 'Correzione colore e vignettatura', particles: 'Particelle', background: 'Cielo notturno', detail: 'Dettaglio superfici' },
      tiers: { off: 'No', on: 'Sì', low: 'Basse', medium: 'Medie', high: 'Alte', static: 'Fermo', animated: 'Animato', plain: 'Semplice', detailed: 'Dettagliato' },
      words: { noShadows: 'senza ombre', shadows_low: 'ombre morbide', shadows_medium: 'ombre a strati', shadows_high: 'ombre profonde', bloom: 'bagliore', grade: 'correzione colore', particles_low: 'scintille', particles_high: 'scintille + polvere', animatedSky: 'cielo animato', staticSky: 'cielo fermo' },
    },
  };

  function pickLocale(lang) {
    const l = String(lang || 'en-US');
    if (STRINGS[l]) return l;
    const low = l.toLowerCase();
    const exact = Object.keys(STRINGS).find((k) => k.toLowerCase() === low);
    if (exact) return exact;
    const base = low.split('-')[0];
    if (base === 'es') return /-(es)$/.test(low) ? 'es-ES' : 'es-419';
    if (base === 'fr') return /-ca$/.test(low) ? 'fr-CA' : 'fr-FR';
    if (base === 'pt') return 'pt-BR';
    if (base === 'de') return 'de-DE';
    if (base === 'it') return 'it-IT';
    if (/^en-(gb|ie|au|nz|za|in)$/.test(low)) return 'en-GB';
    return 'en-US';
  }

  const locale = pickLocale(typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  const T = STRINGS[locale];
  const fmt = (s, tier) => s.replace('{tier}', tier);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /** Builds the Graphics section; returns a node to append to the Settings body. */
  function build() {
    const G = window.Gfx;
    const Fx = window.Fx;
    const root = el('section', 'gfx-section');
    root.id = 'gfx-section';
    root.setAttribute('lang', locale);
    root.setAttribute('aria-labelledby', 'gfx-heading');
    const h = el('h3', 'gfx-heading', T.graphics);
    h.id = 'gfx-heading';
    root.appendChild(h);

    function row(labelText, control, id) {
      const r = el('div', 'gfx-row');
      const lab = el('label', 'gfx-label', labelText);
      lab.htmlFor = id;
      control.id = id;
      r.appendChild(lab);
      r.appendChild(control);
      root.appendChild(r);
      return r;
    }

    // quality preset
    const preset = el('select', 'gfx-select');
    preset.dataset.gfx = 'preset';
    row(T.quality, preset, 'gfx-preset');

    // render scale
    const scaleWrap = el('div', 'gfx-scale');
    const scale = el('input');
    scale.type = 'range'; scale.min = '50'; scale.max = '200'; scale.step = '10';
    scale.id = 'gfx-scale';
    scale.dataset.gfx = 'render_scale';
    const scaleOut = el('output', 'gfx-scale-value');
    scaleOut.id = 'gfx-scale-value';
    scaleOut.htmlFor = 'gfx-scale';
    scaleWrap.appendChild(scale);
    scaleWrap.appendChild(scaleOut);
    const scaleRow = el('div', 'gfx-row');
    const scaleLab = el('label', 'gfx-label', T.renderScale);
    scaleLab.htmlFor = 'gfx-scale';
    scaleRow.appendChild(scaleLab);
    scaleRow.appendChild(scaleWrap);
    root.appendChild(scaleRow);

    // one select per category
    const catSelects = {};
    Object.keys(G.CATEGORIES).forEach((cat) => {
      const s = el('select', 'gfx-select');
      s.dataset.gfx = cat;
      catSelects[cat] = s;
      row(T.cats[cat], s, 'gfx-cat-' + cat);
    });

    function toggle(text, id, key) {
      const r = el('label', 'setting-row gfx-toggle');
      const c = el('input');
      c.type = 'checkbox';
      c.id = id;
      c.dataset.gfx = key;
      r.appendChild(c);
      r.appendChild(el('span', '', text));
      root.appendChild(r);
      return c;
    }
    const adaptive = toggle(T.adaptive, 'gfx-adaptive', 'adaptive');
    const fps = toggle(T.showFps, 'gfx-fps', 'show_fps');

    const summary = el('p', 'gfx-summary');
    summary.id = 'gfx-summary';
    summary.setAttribute('aria-live', 'polite');
    root.appendChild(summary);
    const note = el('p', 'gfx-note hidden');
    note.id = 'gfx-note';
    root.appendChild(note);

    function fill(select, options, value) {
      const key = JSON.stringify(options);
      if (select._gfxKey === key) { if (select.value !== value) select.value = value; return; }
      select._gfxKey = key;
      select.innerHTML = '';
      options.forEach((o) => {
        const opt = el('option', '', o[1]);
        opt.value = o[0];
        select.appendChild(opt);
      });
      select.value = value;
    }

    function refresh() {
      const inf = Fx.info();
      const s = inf.saved;
      const r = inf.resolved;
      const presetVal = G.PRESETS.indexOf(s.preset) !== -1 ? s.preset : 'auto';
      fill(preset, [['auto', fmt(T.auto, T.presets[inf.detected])]].concat(G.PRESETS.map((p) => [p, T.presets[p]])), presetVal);
      const pct = Math.round(G.clamp(Number(s.render_scale) || 1, 0.5, 2) * 100);
      scale.value = String(pct);
      scaleOut.textContent = pct + '%';
      Object.keys(catSelects).forEach((cat) => {
        const tiers = G.CATEGORIES[cat];
        const from = G.presetTier(r.preset, cat);
        fill(catSelects[cat],
          [['preset', fmt(T.fromPreset, T.tiers[from])]].concat(tiers.map((t) => [t, T.tiers[t]])),
          tiers.indexOf(s[cat]) !== -1 ? s[cat] : 'preset');
      });
      adaptive.checked = s.adaptive !== false;
      fps.checked = !!s.show_fps;
      const gpu = inf.gpu || T.unknownGpu;
      summary.textContent = gpu + ' · ' + G.describe(r, inf.pixels, T.words);
      const reduced = document.body.dataset.gfxMotion === 'reduced';
      const msg = inf.unavailable ? T.unavailable : (reduced ? T.reduced : '');
      note.textContent = msg;
      note.classList.toggle('hidden', !msg);
    }

    function set(mutator) {
      const next = Object.assign({}, Fx.info().saved);
      mutator(next);
      Fx.setGraphics(next);
    }

    preset.addEventListener('change', () => Fx.setGraphics(G.choosePreset(Fx.info().saved, preset.value)));
    scale.addEventListener('input', () => { scaleOut.textContent = scale.value + '%'; });
    scale.addEventListener('change', () => set((n) => { n.render_scale = Number(scale.value) / 100; }));
    Object.keys(catSelects).forEach((cat) => {
      catSelects[cat].addEventListener('change', () => set((n) => {
        if (catSelects[cat].value === 'preset') delete n[cat];
        else n[cat] = catSelects[cat].value;
      }));
    });
    adaptive.addEventListener('change', () => set((n) => { n.adaptive = adaptive.checked; }));
    fps.addEventListener('change', () => set((n) => { n.show_fps = fps.checked; }));

    Fx.onChange(refresh);
    refresh();
    return root;
  }

  return { build, pickLocale, STRINGS, locale };
})();
