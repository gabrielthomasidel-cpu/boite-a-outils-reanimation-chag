/* Pont Android autonome : dossiers SAF, téléchargements, impression et viseur. */
(function (global) {
  'use strict';

  if (!global.AndroidBridge) return;

  var pageName = decodeURIComponent(String(global.location && global.location.pathname || '')).toLowerCase();
  var MODULE = pageName.indexOf('commande_solutes') >= 0
    ? 'solutes'
    : pageName.indexOf('commande_aide_soignant') >= 0
      ? 'aide_soignant'
      : 'materiel_reanimation';
  var VALID_FOLDERS = new Set(['Sauvegardes', 'PDF', 'Etiquettes', 'Archives', 'Application', 'Divers']);
  var pending = Object.create(null);
  var requestSequence = 0;

  function parseBridge(value) {
    try { return JSON.parse(String(value || '{}')); }
    catch (error) { return { ok: false, message: 'Réponse Android illisible.' }; }
  }

  function mimeFor(filename, fallback) {
    if (fallback && String(fallback).indexOf('/') > 0) return String(fallback).split(';')[0];
    var extension = String(filename || '').split('.').pop().toLowerCase();
    return ({
      json: 'application/json', csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf', html: 'text/html', htm: 'text/html', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg'
    })[extension] || 'application/octet-stream';
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var value = String(reader.result || '');
        resolve(value.slice(value.indexOf(',') + 1));
      };
      reader.onerror = function () { reject(reader.error || new Error('Lecture du fichier impossible.')); };
      reader.readAsDataURL(blob);
    });
  }

  function base64ToBytes(value) {
    var binary = global.atob(String(value || ''));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function NativeFileHandle(rootName, folders, filename) {
    this.kind = 'file';
    this.name = filename;
    this._rootName = rootName;
    this._folders = folders.slice();
  }

  NativeFileHandle.prototype.createWritable = function () {
    var handle = this;
    var chunks = [];
    var closed = false;
    return Promise.resolve({
      write: function (value) {
        if (closed) return Promise.reject(new Error('Le fichier est déjà fermé.'));
        if (value && typeof value === 'object' && value.type === 'write' && 'data' in value) value = value.data;
        chunks.push(value instanceof Blob ? value : new Blob([value]));
        return Promise.resolve();
      },
      close: function () {
        if (closed) return Promise.resolve();
        closed = true;
        var blob = new Blob(chunks, { type: mimeFor(handle.name, chunks[0] && chunks[0].type) });
        return blobToBase64(blob).then(function (base64) {
          var folder = handle._folders.length ? handle._folders[0] : '';
          var result = parseBridge(global.AndroidBridge.writeFile(
            MODULE, folder, handle.name, blob.type || mimeFor(handle.name), base64));
          if (!result.ok) throw new Error(result.message || 'Écriture Android impossible.');
          return result;
        });
      },
      abort: function () { closed = true; chunks = []; return Promise.resolve(); }
    });
  };

  NativeFileHandle.prototype.getFile = function () {
    var folder = this._folders.length ? this._folders[0] : '';
    var result = parseBridge(global.AndroidBridge.readFile(MODULE, folder, this.name));
    if (!result.ok) return Promise.reject(new DOMException(result.message || 'Fichier absent', 'NotFoundError'));
    var bytes = base64ToBytes(result.data);
    try {
      return Promise.resolve(new File([bytes], this.name, { type: result.mime || mimeFor(this.name) }));
    } catch (error) {
      var blob = new Blob([bytes], { type: result.mime || mimeFor(this.name) });
      blob.name = this.name;
      return Promise.resolve(blob);
    }
  };

  function NativeDirectoryHandle(name, folders) {
    this.kind = 'directory';
    this.name = name || 'Dossier choisi';
    this._folders = folders ? folders.slice() : [];
  }

  NativeDirectoryHandle.prototype.queryPermission = function () {
    return Promise.resolve(parseBridge(global.AndroidBridge.getDirectory(MODULE)).ok ? 'granted' : 'prompt');
  };
  NativeDirectoryHandle.prototype.requestPermission = NativeDirectoryHandle.prototype.queryPermission;
  NativeDirectoryHandle.prototype.getDirectoryHandle = function (name) {
    var folder = String(name || '').trim();
    if (!this._folders.length && !VALID_FOLDERS.has(folder)) {
      return Promise.reject(new DOMException('Dossier non autorisé', 'NotAllowedError'));
    }
    return Promise.resolve(new NativeDirectoryHandle(folder, this._folders.concat([folder])));
  };
  NativeDirectoryHandle.prototype.getFileHandle = function (name) {
    return Promise.resolve(new NativeFileHandle(this.name, this._folders, String(name || 'fichier')));
  };

  function handleFromResult(result) {
    return result && result.ok ? new NativeDirectoryHandle(result.name || 'Dossier choisi', []) : null;
  }

  global.AndroidStorage = {
    restore: function () {
      return Promise.resolve(handleFromResult(parseBridge(global.AndroidBridge.getDirectory(MODULE))));
    },
    remember: function () {
      // Le système Android conserve déjà l'autorisation au moment du choix.
      return Promise.resolve(true);
    },
    forget: function () {
      global.AndroidBridge.forgetDirectory(MODULE);
      return Promise.resolve(true);
    },
    download: function (blob, filename) {
      return blobToBase64(blob).then(function (base64) {
        var result = parseBridge(global.AndroidBridge.saveDownload(
          String(filename || 'fichier'), blob.type || mimeFor(filename), base64));
        if (!result.ok) throw new Error(result.message || 'Enregistrement impossible.');
        return result;
      });
    },
    _resolve: function (requestId, result) {
      var item = pending[requestId];
      if (!item) return;
      delete pending[requestId];
      if (result && result.ok) item.resolve(handleFromResult(result));
      else if (result && result.cancelled) item.reject(new DOMException('Sélection annulée', 'AbortError'));
      else item.reject(new Error((result && result.message) || 'Sélection du dossier impossible.'));
    }
  };

  global.showDirectoryPicker = function () {
    return new Promise(function (resolve, reject) {
      var requestId = 'tree-' + Date.now() + '-' + (++requestSequence);
      pending[requestId] = { resolve: resolve, reject: reject };
      global.AndroidBridge.chooseDirectory(MODULE, requestId);
    });
  };

  // Demande à l'application d'archiver aussi le PDF lorsque l'impression est lancée.
  global.__androidAutoFolder = true;
  global.__androidPrintManaged = true;

  global.print = function () {
    global.AndroidBridge.printPage(document.title || 'Commande Réanimation');
  };

  /* ============ Viseur caméra direct ============
     Le flux vidéo reste décodé hors connexion avec ZXing. Android/WebView ne
     sélectionne pas toujours l'objectif principal et n'active pas toujours le
     focus continu de lui-même : le viseur choisit donc en priorité la caméra
     arrière principale, demande explicitement l'autofocus et permet de refaire
     le point ou de changer d'objectif sans quitter le scan. */
  const LIVE_FORMAT_NAMES = [
    'QR_CODE', 'DATA_MATRIX', 'AZTEC', 'PDF_417',
    'CODE_128', 'CODE_39', 'CODE_93', 'CODABAR', 'ITF',
    'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E'
  ];
  const LIVE_READER_ID = 'android-live-reader';
  const LIVE_REAR_PATTERN = /back|rear|environment|arrière|arriere|trasera|rück|后置/i;
  const LIVE_FRONT_PATTERN = /front|user|avant|frontal|前置/i;
  const LIVE_SECONDARY_LENS_PATTERN = /ultra|tele|télé|macro|0[.,]5|zoom/i;
  let liveState = null;

  function installLiveScannerUi() {
    if(document.getElementById('android-live-overlay')) return;
    const style = document.createElement('style');
    style.textContent = `
      #android-live-overlay{position:fixed;inset:0;z-index:2147483647;display:none;
        flex-direction:column;background:#071817;color:#fff;padding:var(--inset-haut, env(safe-area-inset-top, 0px)) 14px var(--inset-bas, env(safe-area-inset-bottom, 0px))}
      #android-live-overlay.open{display:flex}
      #android-live-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 0 10px}
      #android-live-head strong{font:700 18px/1.2 system-ui,sans-serif}
      #android-live-close{border:1px solid #8fb5b1;background:#143b38;color:#fff;border-radius:9px;padding:10px 14px;font-weight:700}
      #android-live-view{position:relative;flex:1;min-height:260px;overflow:hidden;border-radius:14px;background:#000;touch-action:manipulation}
      #android-live-reader{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;background:#000}
      #android-live-reader video{width:100%!important;height:100%!important;object-fit:cover}
      #android-live-reader canvas{max-width:100%;max-height:100%}
      #android-live-focus-ring{position:absolute;z-index:8;left:50%;top:50%;width:82px;height:82px;
        margin:-41px 0 0 -41px;border:3px solid #8ff5df;border-radius:12px;pointer-events:none;
        opacity:0;transform:scale(1.25);box-shadow:0 0 0 9999px rgba(0,0,0,.04)}
      #android-live-focus-ring.pulse{animation:android-focus-pulse .7s ease-out}
      @keyframes android-focus-pulse{0%{opacity:1;transform:scale(1.25)}65%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.92)}}
      #android-live-status{margin:12px 2px 8px;text-align:center;font:600 14px/1.35 system-ui,sans-serif;color:#d9ece9}
      #android-live-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;padding:4px 0 14px}
      #android-live-actions button{border:1px solid #8fb5b1;background:#143b38;color:#fff;border-radius:9px;padding:11px 14px;font-weight:700}
      #android-live-retry,#android-live-camera{display:none}
      #android-live-actions button:disabled{opacity:.55}
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.id = 'android-live-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div id="android-live-head"><strong>Scanner un QR ou un code-barres</strong>
        <button type="button" id="android-live-close">Fermer</button></div>
      <div id="android-live-view"><div id="${LIVE_READER_ID}"></div>
        <span id="android-live-focus-ring" aria-hidden="true"></span></div>
      <p id="android-live-status">Autorisez la caméra si Android le demande, puis placez le code dans le cadre.</p>
      <div id="android-live-actions">
        <button type="button" id="android-live-retry">Réessayer la caméra</button>
        <button type="button" id="android-live-focus">🎯 Faire le point</button>
        <button type="button" id="android-live-camera">🔄 Changer d’objectif</button>
        <button type="button" id="android-live-photo">📸 Photo autofocus</button>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('android-live-close').addEventListener('click', ()=> closeLiveScanner(null));
    document.getElementById('android-live-retry').addEventListener('click', ()=>{
      const index = liveState ? liveState.cameraIndex : 0;
      startLiveCamera(index);
    });
    document.getElementById('android-live-focus').addEventListener('click', ()=> refocusLiveCamera());
    document.getElementById('android-live-camera').addEventListener('click', ()=> switchLiveCamera());
    document.getElementById('android-live-view').addEventListener('click', ()=> refocusLiveCamera());
    document.getElementById('android-live-photo').addEventListener('click', async ()=>{
      const inputId = liveState && liveState.photoInputId;
      await closeLiveScanner(null);
      const input = inputId ? document.getElementById(inputId) : null;
      if(input) setTimeout(()=> input.click(), 80);
    });
  }

  function liveFormats() {
    const formats = window.Html5QrcodeSupportedFormats || {};
    return LIVE_FORMAT_NAMES.map(name=>formats[name]).filter(value=>value !== undefined);
  }

  function orderedCameras(cameras) {
    return cameras.map((camera, index)=>{
      const label = String(camera.label || '');
      let score = 0;
      if(LIVE_REAR_PATTERN.test(label)) score += 100;
      if(LIVE_FRONT_PATTERN.test(label)) score -= 100;
      if(LIVE_SECONDARY_LENS_PATTERN.test(label)) score -= 25;
      if(/principal|main|camera\s*0\b|caméra\s*0\b/i.test(label)) score += 12;
      if(/wide|grand.angle/i.test(label) && !/ultra/i.test(label)) score += 6;
      return { camera, index, score };
    }).sort((a, b)=> b.score - a.score || a.index - b.index)
      .map(entry=>entry.camera);
  }

  function clearLiveFocusTimers(state) {
    if(!state) return;
    if(state.focusTimer) clearInterval(state.focusTimer);
    if(state.focusRestoreTimer) clearTimeout(state.focusRestoreTimer);
    state.focusTimer = null;
    state.focusRestoreTimer = null;
  }

  function runningVideoTrack() {
    const reader = document.getElementById(LIVE_READER_ID);
    const video = reader && reader.querySelector('video');
    const stream = video && video.srcObject;
    const tracks = stream && typeof stream.getVideoTracks === 'function'
      ? stream.getVideoTracks() : [];
    return tracks && tracks.length ? tracks[0] : null;
  }

  function focusModesFor(track) {
    if(!track || typeof track.getCapabilities !== 'function') return [];
    try{
      const capabilities = track.getCapabilities() || {};
      const modes = capabilities.focusMode;
      if(Array.isArray(modes)) return modes.map(String);
      return modes ? [String(modes)] : [];
    }catch(error){
      return [];
    }
  }

  async function applyFocusMode(track, mode, advertisedModes) {
    if(!track || typeof track.applyConstraints !== 'function') return false;
    if(advertisedModes.length && advertisedModes.indexOf(mode) === -1) return false;
    try{
      await track.applyConstraints({ advanced: [{ focusMode: mode }] });
      return true;
    }catch(error){
      console.warn(`Mode de mise au point ${mode} indisponible :`, error);
      return false;
    }
  }

  function pulseFocusRing() {
    const ring = document.getElementById('android-live-focus-ring');
    if(!ring) return;
    ring.classList.remove('pulse');
    void ring.offsetWidth;
    ring.classList.add('pulse');
  }

  async function configureLiveFocus() {
    const state = liveState;
    if(!state || state.finishing) return 'none';
    clearLiveFocusTimers(state);
    const track = runningVideoTrack();
    const modes = focusModesFor(track);
    state.focusModes = modes;
    state.focusTrack = track;

    if(modes.indexOf('continuous') !== -1){
      return await applyFocusMode(track, 'continuous', modes) ? 'continuous' : 'none';
    }
    if(modes.indexOf('single-shot') !== -1){
      await applyFocusMode(track, 'single-shot', modes);
      state.focusTimer = setInterval(()=>{
        if(liveState === state && !state.finishing){
          applyFocusMode(track, 'single-shot', modes);
        }
      }, 2600);
      return 'single-shot';
    }

    /* Certains WebView savent appliquer focusMode sans le publier dans
       getCapabilities(). Une contrainte avancée est ignorée sans échec sur les
       appareils qui ne la connaissent pas. */
    await applyFocusMode(track, 'continuous', modes);
    return 'unknown';
  }

  async function refocusLiveCamera() {
    const state = liveState;
    if(!state || state.finishing || state.opening || state.refocusing) return;
    state.refocusing = true;
    pulseFocusRing();
    const status = document.getElementById('android-live-status');
    const modes = state.focusModes || [];
    const track = runningVideoTrack() || state.focusTrack;
    try{
      if(modes.indexOf('single-shot') !== -1){
        status.textContent = 'Mise au point en cours… gardez le code au centre.';
        await applyFocusMode(track, 'single-shot', modes);
        if(modes.indexOf('continuous') !== -1){
          state.focusRestoreTimer = setTimeout(()=>{
            if(liveState === state && !state.finishing){
              applyFocusMode(track, 'continuous', modes);
            }
          }, 900);
        }
        status.textContent = 'Point effectué. Gardez le code au centre : la lecture est automatique.';
      }else if(modes.indexOf('continuous') !== -1){
        status.textContent = 'Réactivation de la mise au point automatique…';
        await applyFocusMode(track, 'continuous', modes);
        status.textContent = 'Autofocus actif. Gardez le code au centre : la lecture est automatique.';
      }else{
        /* Réouvrir le flux force une nouvelle recherche de netteté sur les
           WebView qui ne donnent aucune commande de focus à JavaScript. */
        status.textContent = 'Relance de la mise au point…';
        const index = state.cameraIndex;
        state.refocusing = false;
        await startLiveCamera(index);
        return;
      }
    }finally{
      if(liveState === state) state.refocusing = false;
    }
  }

  async function switchLiveCamera() {
    const state = liveState;
    if(!state || state.finishing || state.opening || !state.cameras.length) return;
    const next = (state.cameraIndex + 1) % state.cameras.length;
    await startLiveCamera(next);
  }

  async function stopDecoder(scanner) {
    if(!scanner) return;
    try{ if(scanner.isScanning) await scanner.stop(); }catch(error){ console.warn(error); }
    try{ scanner.clear(); }catch(error){ console.warn(error); }
  }

  async function closeLiveScanner(value, error) {
    const state = liveState;
    if(!state || state.finishing) return;
    state.finishing = true;
    clearLiveFocusTimers(state);
    await stopDecoder(state.scanner);
    const overlay = document.getElementById('android-live-overlay');
    if(overlay) overlay.classList.remove('open');
    const reader = document.getElementById(LIVE_READER_ID);
    if(reader) reader.innerHTML = '';
    liveState = null;
    if(error) state.reject(error);
    else state.resolve(value || null);
  }

  async function startLiveCamera(requestedIndex) {
    const state = liveState;
    if(!state || state.finishing || state.opening) return;
    state.opening = true;
    clearLiveFocusTimers(state);
    const status = document.getElementById('android-live-status');
    const retry = document.getElementById('android-live-retry');
    const focusButton = document.getElementById('android-live-focus');
    const cameraButton = document.getElementById('android-live-camera');
    retry.style.display = 'none';
    focusButton.disabled = true;
    cameraButton.disabled = true;
    status.textContent = 'Ouverture de la caméra et réglage de l’autofocus…';
    await stopDecoder(state.scanner);
    if(liveState !== state || state.finishing) return;
    document.getElementById(LIVE_READER_ID).innerHTML = '';

    try{
      if(typeof window.chargerVendor === 'function'){
        try{ await window.chargerVendor('scanner'); }
        catch(err){ console.warn('Décodeur non chargé :', err); }
      }
      if(typeof window.Html5Qrcode !== 'function'){
        throw new Error('Décodeur embarqué indisponible.');
      }
      if(!state.cameras.length){
        const cameras = await window.Html5Qrcode.getCameras();
        if(!cameras || !cameras.length) throw new Error('Aucune caméra détectée.');
        state.cameras = orderedCameras(cameras);
      }
      if(liveState !== state || state.finishing) return;
      const normalizedIndex = Number.isInteger(requestedIndex) ? requestedIndex : state.cameraIndex;
      state.cameraIndex = ((normalizedIndex % state.cameras.length) + state.cameras.length)
        % state.cameras.length;
      const camera = state.cameras[state.cameraIndex];
      cameraButton.style.display = state.cameras.length > 1 ? 'inline-block' : 'none';
      cameraButton.title = camera.label
        ? `Objectif actuel : ${camera.label}` : 'Changer d’objectif caméra';

      const scanner = new window.Html5Qrcode(LIVE_READER_ID, {
        formatsToSupport: liveFormats(),
        useBarCodeDetectorIfSupported: false,
        verbose: false
      });
      state.scanner = scanner;
      const scanConfig = {
        fps: 15,
        disableFlip: false,
        videoConstraints: {
          deviceId: { exact: camera.id },
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
          advanced: [{ focusMode: 'continuous' }]
        },
        qrbox: (width, height)=>{
          const boxWidth = Math.max(220, Math.floor(Math.min(width * .94, 720)));
          const boxHeight = Math.max(170, Math.floor(Math.min(height * .62, 380)));
          return { width: boxWidth, height: boxHeight };
        }
      };
      await scanner.start(camera.id, scanConfig, decodedText=>{
        const value = String(decodedText || '').trim();
        if(!value || liveState !== state || state.finishing) return;
        if(navigator.vibrate) navigator.vibrate(80);
        closeLiveScanner(value);
      }, ()=>{});
      if(liveState !== state || state.finishing){
        await stopDecoder(scanner);
        return;
      }
      const focusMode = await configureLiveFocus();
      focusButton.disabled = false;
      cameraButton.disabled = false;
      pulseFocusRing();
      if(focusMode === 'continuous'){
        status.textContent = 'Autofocus continu actif. Placez le code au centre ; touchez l’image pour refaire le point.';
      }else if(focusMode === 'single-shot'){
        status.textContent = 'Autofocus périodique actif. Placez le code au centre ; touchez l’image si nécessaire.';
      }else{
        status.textContent = 'Placez le code au centre. Si l’image reste floue, touchez « Faire le point » ou changez d’objectif.';
      }
    }catch(error){
      console.error('Viseur Android indisponible :', error);
      if(liveState === state && !state.finishing){
        status.textContent = 'Impossible d’ouvrir le viseur. Vérifiez l’autorisation Caméra, puis réessayez ou utilisez « Photo autofocus ».';
        retry.style.display = 'inline-block';
        focusButton.disabled = true;
      }
    }finally{
      if(liveState === state){
        state.opening = false;
        cameraButton.disabled = false;
      }
    }
  }

  window.AndroidLiveScanner = {
    isAvailable: ()=> !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    scan: function(options) {
      installLiveScannerUi();
      if(liveState) return Promise.reject(new Error('Un scan est déjà en cours.'));
      const overlay = document.getElementById('android-live-overlay');
      overlay.classList.add('open');
      return new Promise((resolve, reject)=>{
        liveState = {
          resolve, reject, scanner: null, finishing: false, opening: false,
          refocusing: false, cameras: [], cameraIndex: 0,
          focusModes: [], focusTrack: null, focusTimer: null, focusRestoreTimer: null,
          photoInputId: options && options.photoInputId
        };
        startLiveCamera(0);
      });
    },
    cancel: ()=> closeLiveScanner(null)
  };

  ['btnScan', 'fRefScanBtn', 'itemRefScanBtn'].forEach(id=>{
    const button = document.getElementById(id);
    if(button) button.classList.remove('is-hidden');
  });

  window.addEventListener('pagehide', ()=>{
    if(liveState) closeLiveScanner(null);
  });

})(window);
