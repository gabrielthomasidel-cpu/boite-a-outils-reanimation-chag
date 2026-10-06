/* ============================================================
   Comptage : calculs, liste, scan, vues et sauvegarde automatique
   ============================================================ */

let items = assignUids(catalogueEffectif().map(articleNormalise));
let idCounter = items.length;
let searchTerm = '';
/* Articles verrouillés par un scan : un code désigne un article précis. */
let refScannee = null;
/* Échec de lecture ou référence absente : la liste est remplacée par un
   bandeau visible, pour qu'aucun article précédent ne soit compté à tort. */
let erreurScan = null;
let typeFilterVal = '';
let locFilterVal = '';
/* Vue : « tous », « aCompter » (non comptés) ou « aCommander ». */
let vueListe = 'tous';
let lastArchive = null; // dernier instantané avant réinitialisation
/* Affichage simplifié (smartphone, édition Android) : pas de filtres de
   zone, de type ni de dotation, ni de rangée de zones ; toutes les
   références sont proposées d'emblée. */
const AFFICHAGE_SIMPLIFIE = Boolean(window.AndroidBridge);
if(AFFICHAGE_SIMPLIFIE) document.documentElement.classList.add('affichage-simplifie');
/* Matériel : les articles sans dotation sont masqués au démarrage (sauf affichage simplifié). */
let afficherSansDotation = AFFICHAGE_SIMPLIFIE || !MODULE.masquerSansDotation;

/* ============ Règles de calcul ============ */
function qteCommandeDe(it){ return quantiteEntiere(it.qteCommande, null); }
function seuilDe(it){ return quantiteEntiere(it.seuil, null); }

function commandeOf(it){
  if(it.dotation === 0){
    return quantiteEntiere(it.commandeLibre, 0); // sans dotation : quantité saisie librement
  }
  const inv = quantiteEntiere(it.inventaire, null);
  if(inv === null) return 0;                     // non compté : rien n'est commandé
  const seuil = seuilDe(it);
  if(seuil !== null && inv > seuil) return 0;    // au-dessus du seuil : rien
  if(seuil !== null){
    const fixe = qteCommandeDe(it);
    if(fixe !== null){
      // Matériel : une rupture complète double la quantité imposée.
      return MODULE.doublerQuantiteSiRupture && inv === 0 ? fixe * 2 : fixe;
    }
    if(isHorsStock(it)) return it.dotation;      // Hors Stock : la dotation entière
  }
  return Math.max(0, it.dotation - inv);         // sinon : le complément jusqu'à la dotation
}
function isCounted(it){
  const v = it.dotation === 0 ? it.commandeLibre : it.inventaire;
  return quantiteEntiere(v, null) !== null;
}
function isHorsStock(it){
  if(!MODULE.type) return false;
  const v = String(it && (it.type||'') || '').trim().toLowerCase();
  const v2 = String(it && (it.loc||'') || '').trim().toLowerCase();
  return v === 'hors stock' || v2 === 'hors stock';
}
function isHorsStockStr(s){ return MODULE.type && String(s||'').trim().toLowerCase() === 'hors stock'; }
function laboratoireDe(it){ return String(it && it.laboratoire || '').trim(); }
function comparerLaboratoires(a, b){
  const la = laboratoireDe(a), lb = laboratoireDe(b);
  if(!la && lb) return 1;
  if(la && !lb) return -1;
  return cmp(la, lb);
}
function aUneDotation(it){ return Number(it && it.dotation) > 0; }
function articlesDuParcours(){
  return afficherSansDotation ? items : items.filter(aUneDotation);
}

/* ============ Garde-fous de saisie ============
   Une quantité très supérieure à la dotation trahit souvent une erreur de
   frappe (un zéro de trop, une référence tapée dans la case quantité). On ne
   bloque pas le comptage — la douchette doit pouvoir enchaîner — mais
   l'article est signalé, et l'anomalie est rappelée avant l'impression. */
function anomalieDe(it){
  if(!isCounted(it)) return null;
  if(it.dotation === 0){
    const q = quantiteEntiere(it.commandeLibre, 0);
    return q > 50 ? `${q} à commander sans dotation : vérifiez la quantité.` : null;
  }
  const inv = quantiteEntiere(it.inventaire, 0);
  if(inv > it.dotation * 3 && inv - it.dotation >= 5){
    return `${inv} en stock pour une dotation de ${it.dotation} : vérifiez la saisie.`;
  }
  const cmd = commandeOf(it);
  if(cmd > 0 && cmd > Math.max(it.dotation * 2, 20)){
    return `${cmd} à commander : quantité inhabituelle, vérifiez.`;
  }
  return null;
}

/* ============ Affichage des noms ============
   Les catalogues sont saisis en MAJUSCULES, plus lentes à lire. La casse
   adaptée met les mots courants en minuscules tout en conservant sigles,
   unités et dosages. La référence et les documents imprimés restent
   identiques au catalogue ; le choix est mémorisé sur le poste. */
const SIGLES = new Map(Object.entries({
  NACL:'NaCl', KCL:'KCl', CACL:'CaCl', MGSO4:'MgSO4', EPPI:'EPPI', PVC:'PVC', PE:'PE', PU:'PU',
  CVC:'CVC', VVP:'VVP', PICC:'PICC', ECG:'ECG', EEG:'EEG', SPO2:'SpO2', PNI:'PNI', PA:'PA',
  USB:'USB', ID:'ID', IV:'IV', IM:'IM', SC:'SC', SNG:'SNG', CH:'CH', FR:'Fr', G:'G',
  ML:'mL', L:'L', CM:'cm', MM:'mm', MG:'mg', UI:'UI', XL:'XL', XS:'XS', S:'S', M:'M',
  LUER:'Luer', LOCK:'Lock',
  EMIC2:'EMiC2', CADDERA:'Caddera', CIVARON:'Civaron', RINGER:'Ringer', ISOFUNDINE:'Isofundine',
  YANKAUER:'Yankauer', ECOFLAC:'Ecoflac', REF:'réf'
}));
let casseAdaptee = (function(){
  try{ return localStorage.getItem(window.CommandesModules.CLE_CASSE) !== 'origine'; }catch(e){ return true; }
})();
function motAffiche(mot, premier){
  const lettres = mot.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9]/g, '');
  if(!lettres) return mot;
  const cle = lettres.toUpperCase();
  if(SIGLES.has(cle)) return mot.replace(lettres, SIGLES.get(cle));
  if(/\d/.test(lettres)){
    // dosage ou volume : « 500ML » → « 500 mL », le reste inchangé
    return mot.replace(/(\d)(ML|L|CM|MM|MG|G|UI)\b/g, (m, chiffre, unite)=> chiffre + ' ' + SIGLES.get(unite));
  }
  if(lettres.length <= 3 && !/[AEIOUYÀ-Ý]/i.test(lettres)) return mot; // sigle probable (« PVC »)
  const bas = mot.toLocaleLowerCase('fr');
  return premier ? bas.charAt(0).toLocaleUpperCase('fr') + bas.slice(1) : bas;
}
function nomAffiche(texte){
  const brut = String(texte == null ? '' : texte);
  if(!casseAdaptee || /[a-zà-ÿ]/.test(brut)) return brut; // déjà en casse mixte : on n'y touche pas
  let premier = true;
  return brut.split(/(\s+)/).map(part=>{
    if(/^\s+$/.test(part) || !part) return part;
    const r = motAffiche(part, premier);
    premier = false;
    return r;
  }).join('');
}

/* ---------- en-tête ---------- */
function fmtDate(d){
  return d.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
}
document.getElementById('todayMeta').textContent = fmtDate(new Date());

/* ---------- zones et types ---------- */
function getLocations(){ return [...new Set(articlesDuParcours().map(i=>String(i.loc||'').trim()))].sort(cmp); }
function getTypes(){ return MODULE.type ? [...new Set(articlesDuParcours().map(i=>String(i.type||'').trim()).filter(Boolean))].sort(cmp) : []; }

const typeFilterEl = document.getElementById('typeFilter');
const locFilterEl = document.getElementById('locFilter');

function fillSelect(el, values, allLabel){
  const current = el.value;
  el.innerHTML = `<option value="">${allLabel}</option>`;
  values.forEach(v=>{
    const o = document.createElement('option'); o.value = v; o.textContent = v || 'Sans localisation'; el.appendChild(o);
  });
  el.value = values.includes(current) ? current : '';
  return el.value;
}
function refreshFilterOptions(){
  const types = getTypes();
  const locations = getLocations();
  typeFilterVal = fillSelect(typeFilterEl, types, 'Tous les types');
  locFilterVal = fillSelect(locFilterEl, locations, 'Toutes les zones');
  typeFilterEl.classList.toggle('is-hidden', types.length === 0);
  locFilterEl.classList.toggle('is-hidden', locations.length <= 1);
  document.getElementById('filterSelectRow').classList.toggle('is-hidden', types.length === 0 && locations.length <= 1);
}

/* ============ Liste ============ */
function trierParcours(a, b){
  return cmp(a.loc, b.loc) || (MODULE.type ? cmp(a.type, b.type) : 0) || cmp(a.denom, b.denom);
}

function articleCorrespond(i, recherche){
  const hay = normaliserRecherche(i.denom+' '+i.nom+' '+i.ref+' '+(i.codeBarres || '')+' '+nomAffiche(i.denom));
  return hay.includes(recherche);
}

function filteredItems(){
  if(refScannee){
    return items.filter(i => refScannee.includes(i.uid)).sort(trierParcours);
  }
  const recherche = normaliserRecherche(searchTerm);
  return items.filter(i=>{
    if(!afficherSansDotation && !aUneDotation(i)) return false;
    if(locFilterVal && i.loc !== locFilterVal) return false;
    if(typeFilterVal && i.type !== typeFilterVal) return false;
    if(vueListe === 'aCompter' && isCounted(i)) return false;
    if(vueListe === 'aCommander' && commandeOf(i) <= 0) return false;
    if(recherche && !articleCorrespond(i, recherche)) return false;
    return true;
  }).sort(trierParcours);
}

function etatArticle(it){
  const libre = it.dotation === 0;
  const cmd = commandeOf(it);
  if(!isCounted(it)) return { classe:'uncounted', libelle: libre ? 'Sans dotation' : 'À compter' };
  if(cmd === 0) return { classe:'zero', libelle: libre ? 'Aucune commande' : 'Stock OK' };
  return { classe:'some', libelle:`Commander ${cmd}` };
}

function statsZones(){
  const stats = new Map();
  articlesDuParcours().forEach(it=>{
    const s = stats.get(it.loc) || { total:0, comptes:0, aCommander:0 };
    s.total++;
    if(isCounted(it)) s.comptes++;
    if(commandeOf(it) > 0) s.aCommander++;
    stats.set(it.loc, s);
  });
  return stats;
}

function idZone(loc){ return 'zone-' + encodeURIComponent(loc || '_').replace(/%/g, '_'); }

function htmlArticle(it){
  const libre = it.dotation === 0;
  const fieldVal = libre ? it.commandeLibre : it.inventaire;
  const hs = isHorsStock(it);
  const etat = etatArticle(it);
  const anomalie = anomalieDe(it);
  const sous = [];
  sous.push(`réf ${escapeHtml(referenceSansPrefixe(it.ref))}`);
  if(it.codeBarres && it.codeBarres !== referenceSansPrefixe(it.ref)) sous.push(`code-barres ${escapeHtml(it.codeBarres)}`);
  if(hs && laboratoireDe(it)) sous.push(escapeHtml(laboratoireDe(it)));
  const nom = nomAffiche(it.denom);
  return `
      <div class="item etat-${etat.classe}${isCounted(it) ? ' counted' : ''}${hs ? ' hors-stock' : ''}${anomalie ? ' has-warning' : ''}" data-id="${it.id}">
        <div class="item-top">
          <div class="item-ident">
            <div class="item-name${hs ? ' hors-stock-name' : ''}" title="${escapeHtml(it.denom)}">${escapeHtml(nom)}</div>
            <div class="item-sub">${sous.join(' · ')}</div>
          </div>
          ${hs ? '<div class="item-type-tag hors-stock-tag">Hors Stock</div>' : ''}
        </div>
        <div class="item-controls">
          <div class="dotation-note">${libre ? '<span class="free-tag">Sans dotation · saisie libre</span>' : `Dotation <b>${it.dotation}</b>`}</div>
          <div class="stepper">
            <button type="button" data-act="dec" data-id="${it.id}" aria-label="Retirer une unité">−</button>
            <input type="number" inputmode="numeric" enterkeyhint="done" autocomplete="off"
                   min="0" max="${QUANTITE_MAX}" step="1" data-id="${it.id}" value="${fieldVal === null ? '' : fieldVal}" placeholder="—"
                   aria-label="${libre ? 'Quantité à commander' : 'Quantité en stock'} — ${escapeHtml(it.denom)}">
            <button type="button" data-act="inc" data-id="${it.id}" aria-label="Ajouter une unité">+</button>
          </div>
          <div class="commande-badge ${etat.classe}">${etat.libelle}</div>
        </div>
        <div class="item-warning" role="note">${anomalie ? '⚠ ' + escapeHtml(anomalie) : ''}</div>
      </div>`;
}

function renderList(){
  const list = document.getElementById('list');
  if(erreurScan){
    list.innerHTML = `
      <div class="scan-error" role="alert">
        <div class="scan-error-icon">⚠️</div>
        <div class="scan-error-title">${escapeHtml(erreurScan.titre)}</div>
        <div class="scan-error-text">${escapeHtml(erreurScan.detail)}</div>
        <button type="button" id="scanErrorClose">Fermer</button>
      </div>`;
    document.getElementById('scanErrorClose').addEventListener('click', ()=>{
      erreurScan = null;
      refScannee = null;
      const champ = document.getElementById('search');
      champ.value = ''; searchTerm = '';
      renderList();
      champ.focus();
    });
    updateSummary();
    return;
  }
  const data = filteredItems();
  if(data.length === 0){
    const messages = {
      aCommander: ['Aucun article à commander', 'Comptez des articles, ou revenez à l\'affichage complet.'],
      aCompter:   ['Tout est compté', 'Passez à la vue « À commander » pour relire la commande avant de l\'imprimer.'],
      tous:       ['Aucun article', 'Ajustez la recherche ou le filtre.']
    };
    const [titre, detail] = messages[vueListe] || messages.tous;
    list.innerHTML = `<div class="empty-state"><div class="big">${titre}</div>${detail}</div>`;
    updateSummary();
    return;
  }
  const stats = statsZones();
  const sousGroupe = MODULE.type && getTypes().length > 0;
  let html = '';
  let curLoc = null, curType = null;
  data.forEach(it=>{
    if(it.loc !== curLoc){
      curLoc = it.loc; curType = null;
      const s = stats.get(curLoc) || { total:0, comptes:0 };
      const fini = s.total > 0 && s.comptes === s.total;
      html += `<h2 class="group-title${isHorsStockStr(curLoc) ? ' hors-stock-title' : ''}${fini ? ' is-done' : ''}" id="${idZone(curLoc)}" data-loc="${escapeHtml(curLoc)}">${escapeHtml(curLoc || 'Sans localisation')} <span class="count">${s.comptes}/${s.total}</span></h2>`;
    }
    if(sousGroupe && it.type !== curType){
      curType = it.type;
      html += `<div class="group-title subgroup-title${isHorsStockStr(curType) ? ' hors-stock-title' : ''}">${escapeHtml(curType || 'Sans type')}</div>`;
    }
    html += htmlArticle(it);
  });
  list.innerHTML = html;
  updateSummary();
}

/* Une frappe peut déclencher plusieurs événements pendant la même image : on
   ne reconstruit la liste qu'une fois par rafraîchissement d'écran. */
function renduAuProchainCadre(fn){
  let frame = 0;
  const planifier = ()=>{
    if(frame) return;
    frame = requestAnimationFrame(()=>{ frame = 0; fn(); });
  };
  planifier.annuler = ()=>{
    if(!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
  };
  return planifier;
}
const renderListDiffere = renduAuProchainCadre(renderList);
const attendreAffichage = ()=> new Promise(resolve=>requestAnimationFrame(()=>resolve()));

function renderAll(){ renderList(); }

/* ---------- mise à jour ciblée d'une carte ---------- */
function majCarte(it){
  const row = document.querySelector(`#list .item[data-id="${it.id}"]`);
  if(!row) return;
  const libre = it.dotation === 0;
  const etat = etatArticle(it);
  const anomalie = anomalieDe(it);
  row.classList.toggle('counted', isCounted(it));
  row.classList.remove('etat-uncounted', 'etat-zero', 'etat-some');
  row.classList.add('etat-' + etat.classe);
  row.classList.toggle('has-warning', Boolean(anomalie));
  const inp = row.querySelector('input[type=number]');
  const fieldVal = libre ? it.commandeLibre : it.inventaire;
  const fieldStr = fieldVal === null ? '' : String(fieldVal);
  if(inp.value !== fieldStr) inp.value = fieldStr;
  const badge = row.querySelector('.commande-badge');
  badge.className = 'commande-badge ' + etat.classe;
  badge.textContent = etat.libelle;
  row.querySelector('.item-warning').textContent = anomalie ? '⚠ ' + anomalie : '';
}

function setInventaire(id, val){
  const it = items.find(i=>i.id === id);
  if(!it) return;
  const quantite = quantiteEntiere(val, null);
  if(it.dotation === 0) it.commandeLibre = quantite; else it.inventaire = quantite;
  majCarte(it);
  updateGroupCounters();
  updateSummary();
  scheduleSave();
}

function updateGroupCounters(){
  const stats = statsZones();
  document.querySelectorAll('#list .group-title[data-loc]').forEach(el=>{
    const s = stats.get(el.dataset.loc) || { total:0, comptes:0 };
    const c = el.querySelector('span.count');
    if(c) c.textContent = `${s.comptes}/${s.total}`;
    el.classList.toggle('is-done', s.total > 0 && s.comptes === s.total);
  });
}

/* ============ Récapitulatif, vues et navigation par zone ============ */
function compteurs(){
  const parcours = articlesDuParcours();
  let comptes = 0, aCompter = 0, aCommanderParcours = 0;
  parcours.forEach(it=>{
    if(isCounted(it)) comptes++; else aCompter++;
    if(commandeOf(it) > 0) aCommanderParcours++;
  });
  /* Le nombre à commander correspond au document imprimé : une quantité libre
     déjà saisie reste comptée même si son article a été remasqué. */
  const aCommander = items.filter(it=>commandeOf(it) > 0).length;
  return { total: parcours.length, comptes, aCompter, aCommander, aCommanderParcours };
}

function updateSummary(){
  const c = compteurs();
  document.getElementById('sumCounted').textContent = `${c.comptes} / ${c.total} comptés`;
  document.getElementById('sumFill').style.width = c.total ? (c.comptes / c.total * 100).toFixed(1) + '%' : '0%';
  const el = document.getElementById('sumOrder');
  el.textContent = `${c.aCommander} à commander`;
  el.classList.toggle('none', c.aCommander === 0);
  document.getElementById('vueCountTous').textContent = c.total;
  document.getElementById('vueCountACompter').textContent = c.aCompter;
  document.getElementById('vueCountACommander').textContent = c.aCommander;
  document.getElementById('btnNextUncounted').disabled = c.aCompter === 0;
  if(!AFFICHAGE_SIMPLIFIE) renderZoneNav();
  majSignatureRequise();
  ecrireResume(c);
}

let zoneNavSignature = '';
function renderZoneNav(){
  const nav = document.getElementById('zoneNav');
  const stats = statsZones();
  const zones = [...stats.keys()].sort(cmp);
  const signature = zones.map(z=>{ const s = stats.get(z); return `${z}:${s.comptes}/${s.total}`; }).join('|');
  if(signature === zoneNavSignature) return;
  zoneNavSignature = signature;
  if(zones.length <= 1){ nav.innerHTML = ''; nav.hidden = true; return; }
  nav.hidden = false;
  nav.innerHTML = zones.map(z=>{
    const s = stats.get(z);
    const fini = s.comptes === s.total;
    return `<button type="button" class="zone-chip${fini ? ' is-done' : ''}${isHorsStockStr(z) ? ' hors-stock' : ''}" data-zone="${escapeHtml(z)}" title="Aller à la zone ${escapeHtml(z || 'Sans localisation')}">`
      + `${fini ? '✓ ' : ''}${escapeHtml(z || 'Sans localisation')} <span class="zone-count">${s.comptes}/${s.total}</span></button>`;
  }).join('');
}

function allerAZone(zone){
  let cible = document.getElementById(idZone(zone));
  if(!cible){
    // La zone est masquée par un filtre : on revient sur toutes les zones.
    locFilterVal = ''; locFilterEl.value = '';
    if(searchTerm){ searchTerm = ''; document.getElementById('search').value = ''; }
    refScannee = null; erreurScan = null;
    renderList();
    cible = document.getElementById(idZone(zone));
  }
  if(!cible) { toast('Aucun article de cette zone dans la vue actuelle.'); return; }
  const marge = (document.querySelector('.masthead').offsetHeight || 0) + (document.querySelector('.filter-row').offsetHeight || 0) + 8;
  window.scrollTo({ top: cible.getBoundingClientRect().top + window.scrollY - marge, behavior: 'smooth' });
}

document.getElementById('zoneNav').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-zone]');
  if(btn) allerAZone(btn.dataset.zone);
});

/* Prochain article non compté, dans l'ordre du parcours, après l'article
   actuellement sélectionné (ou depuis le début). */
function allerAuProchainNonCompte(){
  const parcours = articlesDuParcours().slice().sort(trierParcours);
  const actif = document.activeElement && document.activeElement.closest ? document.activeElement.closest('#list .item') : null;
  const depuis = actif ? parcours.findIndex(it=>it.id === Number(actif.dataset.id)) : -1;
  const suivant = parcours.slice(depuis + 1).find(it=>!isCounted(it)) || parcours.find(it=>!isCounted(it));
  if(!suivant){ toast('Tous les articles sont comptés.'); return; }
  if(!document.querySelector(`#list .item[data-id="${suivant.id}"]`)){
    refScannee = null; erreurScan = null;
    searchTerm = ''; document.getElementById('search').value = '';
    locFilterVal = ''; locFilterEl.value = '';
    typeFilterVal = ''; typeFilterEl.value = '';
    if(vueListe === 'aCommander') appliquerVue('tous', false);
    renderList();
  }
  focaliserArticle(suivant);
}
document.getElementById('btnNextUncounted').addEventListener('click', allerAuProchainNonCompte);

function appliquerVue(cle, rendre){
  vueListe = ['tous', 'aCompter', 'aCommander'].includes(cle) ? cle : 'tous';
  document.querySelectorAll('#vueSelecteur [data-vue]').forEach(b=>{
    b.setAttribute('aria-checked', String(b.dataset.vue === vueListe));
    b.tabIndex = b.dataset.vue === vueListe ? 0 : -1;
  });
  if(rendre !== false) renderList();
}
document.getElementById('vueSelecteur').addEventListener('click', e=>{
  const b = e.target.closest('[data-vue]');
  if(b) appliquerVue(b.dataset.vue);
});
document.getElementById('vueSelecteur').addEventListener('keydown', e=>{
  if(e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const ordre = ['tous', 'aCompter', 'aCommander'];
  const i = (ordre.indexOf(vueListe) + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
  appliquerVue(ordre[i]);
  document.querySelector(`#vueSelecteur [data-vue="${ordre[i]}"]`).focus();
  e.preventDefault();
});

const sansDotationBtn = document.getElementById('btnSansDotation');
function majBoutonSansDotation(){
  if(!sansDotationBtn) return;
  const n = items.filter(it=>!aUneDotation(it)).length;
  sansDotationBtn.textContent = `${afficherSansDotation ? 'Masquer' : 'Afficher'} sans dotation (${n})`;
  sansDotationBtn.setAttribute('aria-pressed', String(afficherSansDotation));
  sansDotationBtn.hidden = n === 0;
}
if(sansDotationBtn){
  sansDotationBtn.addEventListener('click', ()=>{
    afficherSansDotation = !afficherSansDotation;
    majBoutonSansDotation();
    refreshFilterOptions();
    renderList();
  });
}

/* ============ Saisie : boutons, clavier et douchette ============ */
function bindListEvents(){
  const list = document.getElementById('list');
  const onField = e=>{
    const inp = e.target.closest('input[type=number][data-id]');
    if(!inp) return;
    const v = inp.value;
    setInventaire(Number(inp.dataset.id), v === '' ? null : Math.max(0, Number(v)));
  };
  list.addEventListener('input', onField);
  list.addEventListener('change', onField);
  list.addEventListener('click', e=>{
    const btn = e.target.closest('button[data-act]');
    if(!btn) return;
    const it = items.find(i=>i.id === Number(btn.dataset.id));
    if(!it) return;
    const curField = it.dotation === 0 ? it.commandeLibre : it.inventaire;
    const cur = curField === null ? 0 : Number(curField);
    /* « − » sur un article non compté le marque compté à 0 : c'est explicite. */
    const next = btn.dataset.act === 'inc' ? (curField === null ? 1 : cur + 1) : Math.max(0, cur - 1);
    setInventaire(it.id, next);
  });

  /* Douchette : la quantité validée par « Entrée » rend la main à la
     recherche, prête pour le scan suivant. */
  list.addEventListener('keydown', e=>{
    if(e.key !== 'Enter') return;
    const inp = e.target.closest('input[type=number][data-id]');
    if(!inp) return;
    e.preventDefault();
    inp.blur();
    const search = document.getElementById('search');
    refScannee = null;
    erreurScan = null;
    search.value = '';
    searchTerm = '';
    renderList();
    search.focus();
  });
}

function focaliserArticle(it){
  const carte = document.querySelector(`#list .item[data-id="${it.id}"]`);
  if(!carte) return false;
  const champ = carte.querySelector('input[type=number]');
  if(!champ) return false;
  carte.scrollIntoView({ block: 'center' });
  champ.focus();
  champ.select();
  return true;
}

/* Un code scanné désigne une référence précise : on privilégie la
   correspondance exacte (code-barres, puis référence) et on lève au besoin
   les filtres qui masqueraient l'article visé. */
function allerVersCode(code){
  const brut = String(code == null ? '' : code).trim();
  if(!brut) return false;
  if(typeof renderListDiffere.annuler === 'function') renderListDiffere.annuler();

  const corrige = corrigerSaisieDouchette(brut).trim();
  const candidats = corrige && corrige !== brut ? [brut, corrige] : [brut];
  let codeUtilise = brut;
  let exacts = [];
  for(const candidat of candidats){
    if(MODULE.codeBarres){
      const cible = codeBarresNormalise(candidat).toLowerCase();
      exacts = cible ? items.filter(i => codeBarresNormalise(i.codeBarres).toLowerCase() === cible) : [];
    }
    if(exacts.length === 0){
      const cibleReference = cleReference(referenceInterne(candidat));
      exacts = items.filter(i => cleReference(i.ref) === cibleReference);
    }
    if(exacts.length){ codeUtilise = candidat; break; }
  }
  const champRecherche = document.getElementById('search');

  if(exacts.length === 0){
    const interpretation = corrige && corrige !== brut ? ` (interprété « ${corrige} »)` : '';
    erreurScan = {
      titre: 'Référence inconnue',
      detail: `Le code « ${brut} »${interpretation} ne correspond à aucun${MODULE.codeBarres ? ' code-barres ni à aucune' : 'e'} référence du catalogue. Vérifiez l'étiquette, ou saisissez le nom de l'article dans la recherche.`
    };
    refScannee = null;
    champRecherche.value = '';
    searchTerm = '';
    renderList();
    return false;
  }

  erreurScan = null;
  refScannee = exacts.map(i=>i.uid);
  champRecherche.value = codeUtilise;
  searchTerm = codeUtilise;
  renderList();

  if(exacts.length === 1) return focaliserArticle(exacts[0]);
  toast(`${exacts.length} articles portent la référence « ${codeUtilise} » : choisissez le bon.`);
  return true;
}

document.getElementById('search').addEventListener('input', e=>{
  refScannee = null; erreurScan = null; searchTerm = e.target.value; renderListDiffere();
});
document.getElementById('search').addEventListener('keydown', e=>{
  if(e.key !== 'Enter') return;
  e.preventDefault();
  allerVersCode(e.target.value);
});

/* Une douchette tape comme un clavier : si aucune zone de saisie n'est active,
   le premier caractère bascule dans la recherche. */
document.addEventListener('keydown', e=>{
  if(e.ctrlKey || e.altKey || e.metaKey) return;
  if(e.key.length !== 1) return;
  const cible = e.target;
  if(cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' ||
               cible.tagName === 'SELECT' || cible.isContentEditable)) return;
  if(document.querySelector('dialog[open]')) return;
  if(document.querySelector('.admin-panel:not(.hidden)')) return;
  if(e.key === ' ' && cible && cible.tagName === 'BUTTON') return;
  e.preventDefault();
  const champ = document.getElementById('search');
  refScannee = null;
  erreurScan = null;
  champ.value = e.key;
  searchTerm = champ.value;
  renderList();
  champ.focus();
  champ.setSelectionRange(champ.value.length, champ.value.length);
});
typeFilterEl.addEventListener('change', e=>{ typeFilterVal = e.target.value; renderList(); });
locFilterEl.addEventListener('change', e=>{ locFilterVal = e.target.value; renderList(); });

/* ============ « Rempli par » ============
   Champ obligatoire pour imprimer : il est signalé tant qu'il est vide. Les
   derniers noms saisis sur le poste sont proposés (partagés entre modules). */
const signatureEl = document.getElementById('signature');
function signataires(){
  const liste = lireJsonLocal(window.CommandesModules.CLE_SIGNATAIRES, []);
  return Array.isArray(liste) ? liste.filter(n=>typeof n === 'string' && n.trim()) : [];
}
function retenirSignataire(nom){
  const propre = String(nom || '').trim().replace(/\s+/g, ' ');
  if(!propre) return;
  const liste = [propre, ...signataires().filter(n=>n.toLocaleLowerCase('fr') !== propre.toLocaleLowerCase('fr'))].slice(0, 10);
  ecrireJsonLocal(window.CommandesModules.CLE_SIGNATAIRES, liste);
  remplirSignataires();
}
function remplirSignataires(){
  document.getElementById('signatureList').innerHTML = signataires().map(n=>`<option value="${escapeHtml(n)}">`).join('');
}
function majSignatureRequise(){
  document.getElementById('sigRow').classList.toggle('is-required', !signatureEl.value.trim());
}
signatureEl.addEventListener('input', majSignatureRequise);

/* ============ Sauvegarde automatique sur le poste ============ */
const STORAGE_KEY = MODULE.cleStockage;

let saveTimer = null;
function scheduleSave(){
  if(!localStore) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{ saveTimer = null; persistState(false); }, 400);
}

function persistState(strict){
  if(!localStore){
    if(strict === true) throw new Error('La sauvegarde automatique est indisponible : fermeture annulée.');
    return false;
  }
  try{
    localStore.setItem(STORAGE_KEY, JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      signature: signatureEl.value,
      entries: items.filter(isCounted).map(({uid, ref, inventaire, commandeLibre})=>({uid, ref, inventaire, commandeLibre})),
      lastArchive
    }));
    ecrireResume(compteurs());
    return true;
  }catch(err){
    console.warn('Sauvegarde automatique impossible :', err);
    if(strict === true) throw new Error('La sauvegarde automatique a échoué : fermeture annulée.');
    return false;
  }
}

function clearPersistedState(){
  if(!localStore) return;
  try{ localStore.removeItem(STORAGE_KEY); }catch(err){}
}

if(window.CommandesCloseGuard){
  window.CommandesCloseGuard.registerSave(()=>{
    if(saveTimer !== null){ clearTimeout(saveTimer); saveTimer = null; }
    return persistState(true);
  });
}

/* Résumé lu par l'écran d'accueil (état de chaque commande en cours). */
function ecrireResume(c){
  const precedent = lireJsonLocal(window.CommandesModules.cleResume(CSV_MODULE), {}) || {};
  const resume = {
    module: CSV_MODULE,
    majLe: new Date().toISOString(),
    comptes: c.comptes,
    total: c.total,
    aCommander: c.aCommander,
    signature: signatureEl.value.trim(),
    derniereCommande: precedent.derniereCommande || null
  };
  if(precedent.comptes === resume.comptes && precedent.aCommander === resume.aCommander
     && precedent.total === resume.total && precedent.signature === resume.signature) return;
  ecrireJsonLocal(window.CommandesModules.cleResume(CSV_MODULE), resume);
}

/* Réapplique des comptages au catalogue courant. L'identifiant stable prime ;
   la référence ne sert que de repli, si elle ne désigne qu'un seul article. */
function applyEntries(entries){
  if(!Array.isArray(entries)) return 0;
  const byUid = new Map(items.map(i=>[i.uid, i]));
  const refCount = new Map();
  items.forEach(i=> refCount.set(i.ref, (refCount.get(i.ref)||0) + 1));
  const byRef = new Map(items.map(i=>[i.ref, i]));
  let applied = 0;
  entries.forEach(saved=>{
    if(!saved) return;
    let it = saved.uid ? byUid.get(saved.uid) : null;
    const savedRef = referenceInterne(saved.ref);
    if(!it && savedRef && refCount.get(savedRef) === 1) it = byRef.get(savedRef);
    if(!it) return;
    it.inventaire = quantiteEntiere(saved.inventaire, null);
    if('commandeLibre' in saved) it.commandeLibre = quantiteEntiere(saved.commandeLibre, null);
    applied++;
  });
  return applied;
}

function showRestoreBanner(text){
  document.getElementById('restoreText').textContent = text;
  document.getElementById('restoreBanner').classList.add('show');
}
function hideRestoreBanner(){
  document.getElementById('restoreBanner').classList.remove('show');
}

function restorePersistedState(){
  const data = lireJsonLocal(STORAGE_KEY, null);
  if(!data) return;
  const applied = applyEntries(data.entries);
  if(data.signature) signatureEl.value = data.signature;
  if(data.lastArchive) lastArchive = data.lastArchive;
  if(applied > 0){
    const when = new Date(data.savedAt);
    const stamp = isNaN(when) ? 'la session précédente'
      : when.toLocaleString('fr-FR', { weekday:'long', day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit' });
    showRestoreBanner(`Comptage restauré : ${applied} article(s) saisis, sauvegarde du ${stamp}.`);
  }
}

/* Remise à zéro des compteurs, après une impression ou une réinitialisation. */
function remettreAZero(){
  lastArchive = {
    archivedAt: new Date().toISOString(),
    signature: signatureEl.value,
    items: items.filter(i=>commandeOf(i) > 0).map(i=>({ref:i.ref, denom:i.denom, commande:commandeOf(i)}))
  };
  items.forEach(i=>{ i.inventaire = null; i.commandeLibre = null; });
  signatureEl.value = '';
  refScannee = null;
  erreurScan = null;
  document.getElementById('search').value = '';
  searchTerm = '';
  if(MODULE.masquerSansDotation && !AFFICHAGE_SIMPLIFIE){ afficherSansDotation = false; majBoutonSansDotation(); refreshFilterOptions(); }
  hideRestoreBanner();
  appliquerVue('tous');
  persistState();
}
