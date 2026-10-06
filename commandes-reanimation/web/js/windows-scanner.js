/* Harmonisation des douchettes clavier sous Windows (USB et Bluetooth).
   Le module métier reste inchangé : ce correctif normalise uniquement les
   rafales HID, leurs terminateurs et le focus de la quantité. */
(function(){
  'use strict';

  const MAX_GAP_MS = 140;
  const FOCUS_GUARD_MS = 320;
  let focusGuardUntil = 0;
  let burst = null;
  let burstTimer = 0;

  function now(){
    return (window.performance && typeof window.performance.now === 'function')
      ? window.performance.now() : Date.now();
  }

  function isTerminator(event){
    return event.key === 'Enter' || event.key === 'Tab' ||
           event.code === 'NumpadEnter' || event.keyCode === 13 || event.keyCode === 9;
  }

  function isQuantity(target){
    return !!(target && target.matches &&
      target.matches('#list input[type="number"][data-id]'));
  }

  function focusQuantity(field){
    if(!field || !field.isConnected) return;
    try{ field.focus({ preventScroll:true }); }catch(error){ field.focus(); }
    try{ field.select(); }catch(error){}
  }

  /* Le rendu de la liste est synchrone, mais WebView2 peut encore appliquer
     le second caractère de fin envoyé par l'USB. Le focus est donc protégé
     pendant quelques millisecondes et confirmé dans la tâche suivante. */
  if(typeof focaliserArticle === 'function'){
    focaliserArticle = function(item){
      const card = document.querySelector(`#list .item[data-id="${item.id}"]`);
      if(!card) return false;
      const field = card.querySelector('input[type="number"]');
      if(!field) return false;
      card.scrollIntoView({ block:'center' });
      focusGuardUntil = now() + FOCUS_GUARD_MS;
      focusQuantity(field);
      setTimeout(()=>focusQuantity(field), 0);
      return true;
    };
  }

  function resetBurst(){
    clearTimeout(burstTimer);
    burstTimer = 0;
    burst = null;
  }

  function armBurstTimeout(){
    clearTimeout(burstTimer);
    burstTimer = setTimeout(resetBurst, MAX_GAP_MS + 80);
  }

  function matchesExactReference(value){
    const raw = String(value == null ? '' : value).trim();
    if(!raw || typeof items === 'undefined' || !Array.isArray(items)) return false;
    const corrected = typeof corrigerSaisieDouchette === 'function'
      ? String(corrigerSaisieDouchette(raw)).trim() : raw;
    const candidates = corrected && corrected !== raw ? [raw, corrected] : [raw];
    return candidates.some(candidate=>{
      const key = candidate.toLocaleLowerCase('fr');
      return items.some(item=>String(item.ref).trim().toLocaleLowerCase('fr') === key);
    });
  }

  function restoreQuantity(snapshot){
    if(!snapshot || typeof items === 'undefined' || !Array.isArray(items)) return;
    const item = items.find(entry=>entry.id === snapshot.id);
    if(!item) return;
    if(Number(item.dotation) === 0) item.commandeLibre = snapshot.value;
    else item.inventaire = snapshot.value;
    if(typeof scheduleSave === 'function') scheduleSave();
  }

  document.addEventListener('keydown', function(event){
    if(event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    if(document.querySelector('dialog[open], .admin-panel:not(.hidden)')){
      resetBurst();
      return;
    }

    const time = now();

    /* CR+LF ou Entrée+Tabulation : le terminateur supplémentaire ne doit pas
       déclencher la validation de la quantité tout juste focalisée. */
    if(isTerminator(event) && time <= focusGuardUntil && isQuantity(event.target)){
      event.preventDefault();
      event.stopImmediatePropagation();
      resetBurst();
      focusQuantity(event.target);
      return;
    }

    if(burst && time - burst.last > MAX_GAP_MS) resetBurst();

    if(event.key && event.key.length === 1){
      if(!burst){
        const target = event.target;
        const search = document.getElementById('search');
        const editable = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
                                    target.tagName === 'SELECT' || target.isContentEditable);
        if(editable && target !== search && !isQuantity(target)) return;

        let quantitySnapshot = null;
        if(isQuantity(target)){
          const item = items.find(entry=>entry.id === Number(target.dataset.id));
          if(item){
            quantitySnapshot = {
              id: item.id,
              value: Number(item.dotation) === 0 ? item.commandeLibre : item.inventaire
            };
          }
        }
        burst = { text:'', first:time, last:time, quantitySnapshot };
      }

      burst.text += event.key;
      burst.last = time;
      armBurstTimeout();
      return;
    }

    if(!isTerminator(event) || !burst) return;

    const completed = burst;
    const text = completed.text;
    const elapsed = Math.max(0, completed.last - completed.first);
    const scannerSpeed = text.length >= 4 && elapsed <= Math.max(500, text.length * 120);
    const validSource = !completed.quantitySnapshot || scannerSpeed;
    resetBurst();

    if(!validSource || !matchesExactReference(text)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    restoreQuantity(completed.quantitySnapshot);
    if(typeof allerVersCode === 'function') allerVersCode(text);
  }, true);
})();
