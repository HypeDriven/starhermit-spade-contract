'use strict';

/* Spade Contract — localized strings for the StarHermit account controls
 * (sign-in, invite link, sign-out notice), keyed by the Settings panel's
 * locale. Browser global: window.ShStrings. */
(function (global) {
  const EN = {
    signIn: 'Sign in with StarHermit',
    invite: 'Invite a friend',
    copied: 'Invite link copied',
    copyFailed: 'Could not copy the invite link',
    signedOut: 'Signed out of StarHermit — progress stays on this device',
  };
  const ES = {
    signIn: 'Iniciar sesión con StarHermit',
    invite: 'Invitar a un amigo',
    copied: 'Enlace de invitación copiado',
    copyFailed: 'No se pudo copiar el enlace de invitación',
    signedOut: 'Sesión de StarHermit cerrada: el progreso se queda en este dispositivo',
  };
  const FR = {
    signIn: 'Se connecter avec StarHermit',
    invite: 'Inviter un ami',
    copied: 'Lien d’invitation copié',
    copyFailed: 'Impossible de copier le lien d’invitation',
    signedOut: 'Déconnecté de StarHermit — la progression reste sur cet appareil',
  };
  const STRINGS = {
    'en-US': EN, 'en-GB': EN, 'es-419': ES, 'es-ES': ES,
    'de-DE': {
      signIn: 'Mit StarHermit anmelden',
      invite: 'Freund einladen',
      copied: 'Einladungslink kopiert',
      copyFailed: 'Einladungslink konnte nicht kopiert werden',
      signedOut: 'Von StarHermit abgemeldet – der Fortschritt bleibt auf diesem Gerät',
    },
    'fr-FR': FR,
    'fr-CA': Object.assign({}, FR, { invite: 'Inviter un ami ou une amie' }),
    'pt-BR': {
      signIn: 'Entrar com StarHermit',
      invite: 'Convidar um amigo',
      copied: 'Link de convite copiado',
      copyFailed: 'Não foi possível copiar o link de convite',
      signedOut: 'Sessão do StarHermit encerrada — o progresso fica neste dispositivo',
    },
    'it-IT': {
      signIn: 'Accedi con StarHermit',
      invite: 'Invita un amico',
      copied: 'Link di invito copiato',
      copyFailed: 'Impossibile copiare il link di invito',
      signedOut: 'Disconnesso da StarHermit: i progressi restano su questo dispositivo',
    },
  };
  const api = { STRINGS: STRINGS, strings: (locale) => STRINGS[locale] || EN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ShStrings = api;
})(typeof window !== 'undefined' ? window : globalThis);
