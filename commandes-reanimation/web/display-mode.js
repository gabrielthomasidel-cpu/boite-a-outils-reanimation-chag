(function (global) {
  'use strict';

  const isShell = global.document.documentElement.hasAttribute('data-commandes-shell');
  const isFramed = global.top !== global;
  let nativeKiosk = false;

  const fullscreenIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>';
  const windowedIcon = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="7" width="13" height="12" rx="1.5"/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H17"/></svg>';

  function currentMode() {
    if (isFramed) {
      try {
        if (global.top.CommandesDisplayMode) return global.top.CommandesDisplayMode.currentMode();
      } catch (error) {}
    }
    return nativeKiosk || !!global.document.fullscreenElement ? 'fullscreen' : 'windowed';
  }

  function syncButton(mode) {
    const button = global.document.getElementById('btnDisplayMode');
    if (!button) return;
    const fullscreen = (mode || currentMode()) === 'fullscreen';
    const label = fullscreen ? 'Passer en mode fenêtré' : 'Passer en plein écran';
    button.innerHTML = fullscreen ? windowedIcon : fullscreenIcon;
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(fullscreen));
  }

  function syncChildren() {
    syncButton(currentMode());
    const frame = global.document.getElementById('commandesAppFrame');
    try {
      if (frame && frame.contentWindow && frame.contentWindow.CommandesDisplayMode) {
        frame.contentWindow.CommandesDisplayMode.syncButton(currentMode());
      }
    } catch (error) {}
  }

  function popupUrl() {
    const url = new URL('index.html', global.location.href);
    const params = new URLSearchParams();
    params.set('windowed', '1');
    const connection = global.sessionStorage.getItem('windows-storage');
    if (connection) params.set('storage', connection);
    url.hash = params.toString();
    return url.href;
  }

  async function leaveNativeKiosk() {
    const width = Math.max(960, Math.min(1440, Math.round((global.screen.availWidth || 1360) * 0.86)));
    const height = Math.max(700, Math.min(960, Math.round((global.screen.availHeight || 900) * 0.86)));
    const left = Math.max(0, Math.round(((global.screen.availWidth || width) - width) / 2));
    const top = Math.max(0, Math.round(((global.screen.availHeight || height) - height) / 2));
    const features = `popup=yes,resizable=yes,scrollbars=no,width=${width},height=${height},left=${left},top=${top}`;
    /* L’ouverture doit rester dans le geste utilisateur ; les sauvegardes sont
       ensuite vidées avant de fermer la fenêtre kiosque d’origine. */
    const nextWindow = global.open('about:blank', 'CommandesReanimationWindowed', features);
    if (!nextWindow) throw new Error('La fenêtre n’a pas pu être ouverte. Autorisez les fenêtres de cette application.');
    try {
      nextWindow.document.title = 'Commandes Réanimation — préparation';
      nextWindow.document.body.textContent = 'Sauvegarde en cours…';
      if (global.CommandesCloseGuard) await global.CommandesCloseGuard.flushHierarchy();
      nextWindow.location.replace(popupUrl());
      nativeKiosk = false;
      global.setTimeout(function () {
        if (global.CommandesNativeApplication && typeof global.CommandesNativeApplication.close === 'function') {
          global.CommandesNativeApplication.close('display-transition');
        } else {
          global.close();
        }
      }, 180);
      return true;
    } catch (error) {
      try { nextWindow.close(); } catch (closeError) {}
      throw error;
    }
  }

  async function toggle() {
    if (isFramed) {
      try {
        if (global.top.CommandesDisplayMode) return await global.top.CommandesDisplayMode.toggle();
      } catch (error) {}
    }
    if (global.document.fullscreenElement) {
      await global.document.exitFullscreen();
      syncChildren();
      return true;
    }
    if (!global.document.documentElement.requestFullscreen) {
      throw new Error('Le plein écran n’est pas disponible dans cette fenêtre.');
    }
    await global.document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    syncChildren();
    return true;
  }

  function installButton() {
    /* Windows est désormais lancé dans une fenêtre maximisée classique,
       avec barre des tâches accessible. Aucun second mode d'affichage n'est
       créé et aucun bouton de bascule n'est ajouté. */
    return;
    const moduleGroup = global.document.querySelector('.meta-group');
    const menuBanner = global.document.querySelector('.masthead-inner.menu-banner');
    const container = moduleGroup || menuBanner;
    if (!container) return;
    const button = global.document.createElement('button');
    button.type = 'button';
    button.id = 'btnDisplayMode';
    button.className = moduleGroup ? 'admin-btn display-mode-toggle' : 'display-mode-toggle';
    if (moduleGroup) moduleGroup.insertBefore(button, moduleGroup.firstElementChild);
    else container.appendChild(button);
    button.addEventListener('click', async function () {
      button.disabled = true;
      try {
        await toggle();
      } catch (error) {
        if (typeof global.toast === 'function') global.toast(error.message || 'Changement d’affichage impossible.');
        else if (typeof global.alert === 'function') global.alert(error.message || 'Changement d’affichage impossible.');
      } finally {
        button.disabled = false;
        syncButton();
      }
    });
    syncButton();
  }

  global.CommandesDisplayMode = { toggle, currentMode, syncButton, syncChildren };
  global.document.addEventListener('fullscreenchange', syncChildren);
  global.document.addEventListener('DOMContentLoaded', installButton);
  global.addEventListener('pageshow', function () { syncButton(); });
})(window);
