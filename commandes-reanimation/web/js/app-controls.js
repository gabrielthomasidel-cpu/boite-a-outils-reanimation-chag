(function (global) {
  'use strict';

  const handlers = [];
  const previousClose = global.CommandesApplication && typeof global.CommandesApplication.close === 'function'
    ? global.CommandesApplication.close.bind(global.CommandesApplication)
    : null;
  let nativeClose = previousClose || function () {
    if (global.AndroidBridge && typeof global.AndroidBridge.showToast === 'function') {
      global.AndroidBridge.showToast('__COMMANDES_CLOSE_APPLICATION__');
      return true;
    }
    global.close();
    return true;
  };
  let closingPromise = null;

  function delay(milliseconds) {
    return new Promise(resolve => global.setTimeout(resolve, milliseconds));
  }

  function activeChildGuard() {
    if (global.top !== global) return null;
    const frame = global.document && global.document.getElementById('commandesAppFrame');
    try {
      const child = frame && frame.contentWindow;
      return child && child !== global && child.CommandesCloseGuard
        ? child.CommandesCloseGuard
        : null;
    } catch (error) {
      return null;
    }
  }

  async function flushLocal() {
    for (const handler of handlers.slice()) {
      const result = await handler();
      if (result === false) throw new Error('La sauvegarde programmée n’a pas pu être terminée.');
    }
    /* Laisse les écritures synchrones et les promesses déjà résolues rendre la
       main au moteur avant toute fermeture de fenêtre. */
    await delay(0);
    return true;
  }

  async function flushHierarchy() {
    await flushLocal();
    const childGuard = activeChildGuard();
    if (childGuard && typeof childGuard.flushLocal === 'function') {
      await childGuard.flushLocal();
    }
    return true;
  }

  function showFailure(error) {
    const message = error && error.message
      ? error.message
      : 'La fermeture a été annulée car la sauvegarde programmée n’a pas pu être terminée.';
    if (typeof global.toast === 'function') global.toast(message);
    else if (typeof global.alert === 'function') global.alert(message);
  }

  async function requestClose(reason) {
    try {
      if (global.top !== global && global.top.CommandesCloseGuard &&
          typeof global.top.CommandesCloseGuard.requestClose === 'function') {
        return global.top.CommandesCloseGuard.requestClose(reason || 'page');
      }
    } catch (error) {
      /* Un éventuel isolement de cadre ne doit jamais contourner la sauvegarde
         locale : la fermeture sera traitée dans la page courante. */
    }

    if (closingPromise) return closingPromise;
    closingPromise = (async function () {
      global.document && global.document.documentElement.setAttribute('data-commandes-closing', 'true');
      try {
        let timeout;
        try {
          await Promise.race([
            flushHierarchy(),
            new Promise((resolve, reject)=>{
              timeout = global.setTimeout(()=>reject(new Error('La sauvegarde ne répond pas. La fenêtre reste ouverte pour protéger vos données ; vous pouvez réessayer.')), 15000);
            })
          ]);
        } finally { global.clearTimeout(timeout); }
        await delay(40);
        const result = await nativeClose(reason || 'application');
        if (result === false) throw new Error('La fermeture de la fenêtre a été refusée.');
        closingPromise = null;
        return true;
      } catch (error) {
        global.document && global.document.documentElement.removeAttribute('data-commandes-closing');
        closingPromise = null;
        showFailure(error);
        return false;
      }
    })();
    return closingPromise;
  }

  const guard = {
    registerSave(handler) {
      if (typeof handler === 'function' && !handlers.includes(handler)) handlers.push(handler);
      return handler;
    },
    flushLocal,
    flushHierarchy,
    requestClose,
    setNativeClose(handler) {
      if (typeof handler !== 'function') throw new TypeError('Gestionnaire de fermeture invalide.');
      nativeClose = handler;
    }
  };

  global.CommandesCloseGuard = guard;
  global.CommandesApplication = { close: requestClose };
})(window);
