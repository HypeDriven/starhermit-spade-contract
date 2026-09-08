'use strict';

/* Spade Contract — bootstrap: wires the menu actions declared in index.html,
 * opens the Help and Settings dialogs, and starts matches. */

(function () {

let openDialog = null;
let lastFocused = null;

function closeDialog() {
  if (openDialog) {
    openDialog.classList.add('hidden');
    openDialog = null;
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
  }
}

function showDialog(dialog) {
  const opener = document.activeElement;
  closeDialog();
  dialog.classList.remove('hidden');
  openDialog = dialog;
  lastFocused = opener;
  const close = dialog.querySelector('.dialog-head button');
  if (close) close.focus();
}

function makeDialog(title, bodyNode) {
  const wrap = document.createElement('div');
  wrap.className = 'dialog-backdrop hidden';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', title);

  const panel = document.createElement('div');
  panel.className = 'dialog-panel';

  const head = document.createElement('div');
  head.className = 'dialog-head';
  const h = document.createElement('h2');
  h.className = 'dialog-title';
  h.textContent = title;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn btn-secondary';
  close.textContent = 'Close';
  close.addEventListener('click', closeDialog);
  head.appendChild(h);
  head.appendChild(close);

  const body = document.createElement('div');
  body.className = 'dialog-body';
  body.appendChild(bodyNode);

  panel.appendChild(head);
  panel.appendChild(body);
  wrap.appendChild(panel);
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap) closeDialog();
  });
  document.body.appendChild(wrap);
  return wrap;
}

function buildHelpDialog() {
  const frag = document.createElement('div');
  frag.innerHTML =
    '<p><strong>Goal:</strong> across five rounds, your team (South and North) ' +
    'bids how many tricks it will take, then tries to make that contract.</p>' +
    '<ul>' +
    '<li>Each player bids 0–3 tricks. Your team\'s contract is the sum of its bids.</li>' +
    '<li>South leads the first trick; afterwards the winner of a trick leads the next one.</li>' +
    '<li>You must follow the led suit if you can.</li>' +
    '<li>Spades are always trump and beat every other suit.</li>' +
    '<li>Highest trump — or highest card of the led suit — wins the trick; the winner leads next.</li>' +
    '<li>Make your contract: +10 per trick bid, +1 per extra trick. Miss it: −10 per trick bid.</li>' +
    '<li>After five rounds the team with the higher score wins.</li>' +
    '</ul>';
  return makeDialog('How to play', frag);
}

function buildSettingsDialog() {
  const frag = document.createElement('div');

  const muteRow = document.createElement('label');
  muteRow.className = 'setting-row';
  const mute = document.createElement('input');
  mute.type = 'checkbox';
  const muteText = document.createElement('span');
  muteText.textContent = 'Mute sound effects';
  muteRow.appendChild(mute);
  muteRow.appendChild(muteText);

  const volRow = document.createElement('label');
  volRow.className = 'setting-row';
  const volText = document.createElement('span');
  volText.textContent = 'Volume';
  const vol = document.createElement('input');
  vol.type = 'range';
  vol.min = '0';
  vol.max = '100';
  vol.value = '80';
  vol.setAttribute('aria-label', 'Effects volume');

  // reflect the stored audio preferences so the controls match what is heard
  if (window.Sfx && typeof window.Sfx.getSettings === 'function') {
    const saved = window.Sfx.getSettings();
    mute.checked = saved.muted;
    vol.value = String(Math.round(saved.volume * 100));
  }
  volRow.appendChild(volText);
  volRow.appendChild(vol);

  mute.addEventListener('change', () => {
    if (window.Sfx) window.Sfx.setMuted(mute.checked);
  });
  vol.addEventListener('input', () => {
    if (window.Sfx) window.Sfx.setVolume(Number(vol.value) / 100);
  });

  frag.appendChild(muteRow);
  frag.appendChild(volRow);
  return makeDialog('Settings', frag);
}

function boot() {
  const helpDialog = buildHelpDialog();
  const settingsDialog = buildSettingsDialog();

  document.querySelectorAll('[data-action]').forEach((el) => {
    const action = el.dataset.action;
    if (action === 'new-game') {
      el.addEventListener('click', () => window.Game.newMatch());
    } else if (action === 'help') {
      el.addEventListener('click', () => showDialog(helpDialog));
    } else if (action === 'settings') {
      el.addEventListener('click', () => showDialog(settingsDialog));
    } else if (/^bid-\d$/.test(action)) {
      el.addEventListener('click', () => window.Game.onBid(Number(action.slice(4))));
    }
  });

  // The New Game button is the primary entry point — always visible.
  const newGameBtn = document.getElementById('btn-new-game');
  if (newGameBtn) newGameBtn.classList.remove('hidden');

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDialog();
  });

  window.Game.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
