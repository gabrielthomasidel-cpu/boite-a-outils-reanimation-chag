/* ============================================================
   Fenêtres, fichiers, en-tête, historique et étiquettes
   ============================================================ */

/* ============ Fenêtres génériques ============ */
function confirmDialog(title, text, okLabel, options){
  return new Promise(resolve=>{
    const dlg = document.getElementById('confirmDlg');
    const corps = document.getElementById('dlgText');
    document.getElementById('dlgTitle').textContent = title;
    if(options && options.html) corps.innerHTML = text; else corps.innerHTML = `<p>${escapeHtml(text)}</p>`;
    const okBtn = document.getElementById('dlgOk');
    okBtn.textContent = okLabel || 'Confirmer';
    okBtn.classList.toggle('danger', Boolean(options && options.danger));
    const cancelBtn = document.getElementById('dlgCancel');
    let termine = false;
    const finir = valeur=>{
      if(termine) return;
      termine = true;
      cleanup();
      if(dlg.open) dlg.close();
      resolve(valeur);
    };
    const onOk = ()=> finir(true);
    const onCancel = e=>{ if(e && e.type === 'cancel') e.preventDefault(); finir(false); };
    const onClose = ()=> finir(false);
    /* Lien « Voir la liste » du récapitulatif : ferme et affiche la vue. */
    const onLien = e=>{
      const lien = e.target.closest('[data-recap]');
      if(!lien) return;
      finir(false);
      appliquerVue(lien.dataset.recap);
    };
    function cleanup(){
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      dlg.removeEventListener('cancel', onCancel);
      dlg.removeEventListener('close', onClose);
      corps.removeEventListener('click', onLien);
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    dlg.addEventListener('cancel', onCancel);
    dlg.addEventListener('close', onClose);
    corps.addEventListener('click', onLien);
    dlg.showModal();
    setTimeout(()=> okBtn.focus(), 0);
  });
}

function chooseDataFormat(title, actionLabel){
  return new Promise(resolve=>{
    const dlg = document.getElementById('formatDlg');
    const select = document.getElementById('formatSelect');
    const help = document.getElementById('formatHelp');
    const okBtn = document.getElementById('formatOk');
    const cancelBtn = document.getElementById('formatCancel');
    document.getElementById('formatDlgTitle').textContent = title;
    document.getElementById('formatDlgText').textContent = 'JSON est le format recommandé et reste sélectionné par défaut.';
    okBtn.textContent = actionLabel || 'Continuer';
    select.value = 'json';
    const updateHelp = ()=>{ help.textContent = dataFormatInfo(select.value).help; };
    updateHelp();
    let settled = false;
    const finish = value=>{
      if(settled) return;
      settled = true;
      cleanup();
      if(dlg.open) dlg.close();
      resolve(value);
    };
    const onOk = ()=>finish(select.value || 'json');
    const onCancel = event=>{ if(event && event.type === 'cancel') event.preventDefault(); finish(null); };
    const onClose = ()=>finish(null);
    function cleanup(){
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      select.removeEventListener('change', updateHelp);
      dlg.removeEventListener('cancel', onCancel);
      dlg.removeEventListener('close', onClose);
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    select.addEventListener('change', updateHelp);
    dlg.addEventListener('cancel', onCancel);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
    setTimeout(()=>select.focus(), 0);
  });
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove('show'), Math.min(7000, 2600 + String(msg).length * 25));
}

function setFormFeedback(id, message, kind){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = message || '';
  el.className = 'form-feedback' + (kind ? ' ' + kind : '');
}

/* ============ Enregistrement des fichiers ============
   Sous Windows (lanceur), tout part dans C:\commandes\<module>. Hors du
   lanceur : dossier choisi (Chrome / Edge) ou téléchargement classique. */
const FOLDER_SUPPORTED = (typeof window.showDirectoryPicker === 'function');
const FS_DB = MODULE.baseDossier, FS_STORE = 'handles', FS_KEY = 'destDir';
let destDirHandle = null;

function fsOpenDb(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(FS_DB, 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore(FS_STORE); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
function fsTx(mode, fn){
  return fsOpenDb().then(db => new Promise((resolve, reject)=>{
    const tx = db.transaction(FS_STORE, mode);
    const req = fn(tx.objectStore(FS_STORE));
    let result;
    req.onsuccess = ()=>{ result = req.result; };
    req.onerror = ()=>{};
    tx.oncomplete = ()=>{ db.close(); resolve(result); };
    tx.onerror = ()=>{ const err = tx.error || req.error; db.close(); reject(err); };
    tx.onabort = ()=>{ const err = tx.error || req.error; db.close(); reject(err); };
  }));
}
const fsGet = ()=> fsTx('readonly', s => s.get(FS_KEY));
const fsSet = h => fsTx('readwrite', s => s.put(h, FS_KEY));
const fsDel = ()=> fsTx('readwrite', s => s.delete(FS_KEY));

function withTimeout(promise, ms, fallbackValue){
  return new Promise(resolve=>{
    let done = false;
    const timer = setTimeout(()=>{ if(!done){ done = true; resolve(fallbackValue); } }, ms);
    promise.then(
      v => { if(!done){ done = true; clearTimeout(timer); resolve(v); } },
      () => { if(!done){ done = true; clearTimeout(timer); resolve(fallbackValue); } }
    );
  });
}

async function destPermission(interactive){
  if(!destDirHandle) return false;
  try{
    const opts = { mode: 'readwrite' };
    let state = await withTimeout(destDirHandle.queryPermission(opts), 4000, 'prompt');
    if(state === 'granted') return true;
    if(!interactive) return false;
    state = await withTimeout(destDirHandle.requestPermission(opts), 4000, 'prompt');
    return state === 'granted';
  }catch(err){ return false; }
}

async function writeToDest(subfolder, filename, blob){
  if(!destDirHandle) return null;
  if(!await destPermission(true)) return null;
  try{
    let dir = destDirHandle;
    if(subfolder) dir = await dir.getDirectoryHandle(subfolder, { create: true });
    const fh = await dir.getFileHandle(filename, { create: true });
    const writable = await fh.createWritable();
    await writable.write(blob);
    await writable.close();
    return `${destDirHandle.name}/${subfolder ? subfolder + '/' : ''}${filename}`;
  }catch(err){
    console.error('Écriture dans le dossier impossible :', err);
    return null;
  }
}

async function downloadBlob(blob, filename){
  if(window.WindowsStorage && window.WindowsStorage.hash){ await window.WindowsStorage.save('Archives', filename, blob); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 5000);
}

async function saveFile(subfolder, filename, blob){
  if(window.WindowsStorage && window.WindowsStorage.hash) return await window.WindowsStorage.save(subfolder, filename, blob);
  const path = await writeToDest(subfolder, filename, blob);
  if(path) return { path, downloaded: false };
  await downloadBlob(blob, filename);
  return { path: filename, downloaded: true };
}

async function renderFolderDialog(){
  const status = document.getElementById('folderStatus');
  const pathEl = document.getElementById('folderPath');
  const forget = document.getElementById('folderForget');
  if(destDirHandle){
    const granted = await destPermission(false);
    status.textContent = granted
      ? 'Les sauvegardes et les PDF sont enregistrés automatiquement dans ce dossier :'
      : 'Dossier configuré. L\'autorisation d\'écriture vous sera redemandée au premier enregistrement :';
    pathEl.textContent = `${destDirHandle.name}/  →  Sauvegardes/ · PDF/ · Etiquettes/ · Archives/ · Application/`;
    pathEl.classList.remove('is-hidden');
    forget.classList.remove('is-hidden');
  }else{
    status.textContent = 'Aucun dossier choisi : les fichiers partent dans le dossier de téléchargement du navigateur.';
    pathEl.textContent = '';
    pathEl.classList.add('is-hidden');
    forget.classList.add('is-hidden');
  }
}

async function initDestDir(){
  if(window.WindowsStorage && window.WindowsStorage.hash){ destDirHandle = null; return; }
  if(!FOLDER_SUPPORTED) return;
  try{ destDirHandle = (await fsGet()) || null; }catch(err){ destDirHandle = null; }
}

document.getElementById('folderClose').addEventListener('click', ()=> document.getElementById('folderDlg').close());
document.getElementById('folderChoose').addEventListener('click', async ()=>{
  try{
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    destDirHandle = handle;
    let memorise = true;
    try{ await fsSet(handle); }catch(err){ memorise = false; }
    await renderFolderDialog();
    toast(memorise ? `Dossier « ${handle.name} » enregistré.` : `Dossier « ${handle.name} » actif pour cette session seulement.`);
  }catch(err){
    if(err && err.name === 'AbortError'){ toast('Sélection annulée — ou dossier refusé par le navigateur.'); return; }
    toast('Ce dossier n\'a pas pu être utilisé.');
  }
});
document.getElementById('folderForget').addEventListener('click', async ()=>{
  destDirHandle = null;
  try{ await fsDel(); }catch(err){}
  await renderFolderDialog();
  toast('Les fichiers repartiront dans le dossier de téléchargement du navigateur.');
});

/* ============ En-tête : navigation, menu compact, affichage ============ */
document.querySelectorAll('.tabs a[data-module]').forEach(lien=>{
  lien.addEventListener('click', e=>{
    e.preventDefault();
    const id = lien.dataset.module;
    if(id === CSV_MODULE) return;
    persistState();
    location.href = window.CommandesModules.lienModule(id);
  });
});

const headerTools = document.getElementById('headerTools');
const menuBtn = document.getElementById('btnMenu');
function fermerMenu(){
  headerTools.classList.remove('is-open');
  menuBtn.setAttribute('aria-expanded', 'false');
}
menuBtn.addEventListener('click', e=>{
  e.stopPropagation();
  const ouvert = headerTools.classList.toggle('is-open');
  menuBtn.setAttribute('aria-expanded', String(ouvert));
});
document.addEventListener('click', e=>{ if(!headerTools.contains(e.target)) fermerMenu(); });
document.getElementById('headerToolsList').addEventListener('click', e=>{ if(e.target.closest('button')) fermerMenu(); });

const casseBtn = document.getElementById('btnCasse');
function majBoutonCasse(){
  casseBtn.setAttribute('aria-pressed', String(casseAdaptee));
  const libelle = casseAdaptee ? 'Noms en casse adaptée (cliquer pour la casse d’origine)' : 'Noms en casse d’origine (cliquer pour la casse adaptée)';
  casseBtn.title = libelle;
  casseBtn.querySelector('.tool-label').textContent = casseAdaptee ? 'Noms : casse adaptée' : 'Noms : casse d’origine';
}
casseBtn.addEventListener('click', ()=>{
  casseAdaptee = !casseAdaptee;
  try{ localStorage.setItem(window.CommandesModules.CLE_CASSE, casseAdaptee ? 'adaptee' : 'origine'); }catch(e){}
  majBoutonCasse();
  renderList();
});

/* ============ Mode d'emploi ============ */
const aidePanel = document.getElementById('aidePanel');
let adminUnlocked = false;

function rendreCodesConfig(){
  document.querySelectorAll('.qr-config[data-code]').forEach(el=>{
    if(el.dataset.rendu) return;
    try{
      const m = QR.encode(el.dataset.code);
      const n = m.length, marge = 2, cote = n + 2*marge;
      let carres = '';
      for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(m[r][c]) carres += `M${c+marge} ${r+marge}h1v1h-1z`;
      el.innerHTML = `<svg viewBox="0 0 ${cote} ${cote}" shape-rendering="crispEdges" role="img" aria-label="Code de configuration">`
        + `<rect width="${cote}" height="${cote}" fill="#ffffff"/><path fill="#000000" d="${carres}"/></svg>`;
      el.dataset.rendu = '1';
    }catch(err){ console.error('Code de configuration illisible :', el.dataset.code, err); }
  });
}

function ouvrirPanneau(panneau){
  panneau.classList.remove('hidden');
  document.body.classList.add('panel-open');
  requestAnimationFrame(syncChromeSizes);
}
function fermerPanneau(panneau){
  panneau.classList.add('hidden');
  if(!document.querySelector('.admin-panel:not(.hidden)')) document.body.classList.remove('panel-open');
  if(panneau === adminPanel) publierSiEnAttente();
}

function ouvrirAide(){
  document.getElementById('aideAdmin').classList.toggle('is-hidden', !adminUnlocked);
  rendreCodesConfig();
  ouvrirPanneau(aidePanel);
  aidePanel.querySelector('.aide-contenu').scrollTop = 0;
}
document.getElementById('btnAide').addEventListener('click', ouvrirAide);
document.getElementById('btnAideAdmin').addEventListener('click', ouvrirAide);
document.getElementById('aideClose').addEventListener('click', ()=> fermerPanneau(aidePanel));

/* ============ Mot de passe administrateur ============
   Seule une empreinte est conservée. C'est une protection contre les
   manipulations involontaires, pas un secret cryptographique. */
function hashPwd(s){
  let h = 5381;
  const sel = MODULE.selMotDePasse;
  const str = sel + String(s) + sel;
  for(let i = 0; i < str.length; i++){
    h = (((h * 33) >>> 0) ^ str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
function empreinteAdminActive(){
  const perso = empreinteMotDePassePersonnalisee();
  return perso ? perso.empreinte : MODULE.empreinteMotDePasse;
}

document.getElementById('pwdApply').addEventListener('click', async ()=>{
  const etat = document.getElementById('pwdState');
  const a = document.getElementById('pwdNew');
  const b = document.getElementById('pwdNew2');
  const dire = (texte, classe)=>{ etat.textContent = texte; etat.className = 'aide-outil-etat ' + (classe||''); };
  if(a.value.length < 6){ dire('Six caractères minimum.', 'ko'); a.focus(); return; }
  if(a.value !== b.value){ dire('Les deux saisies diffèrent.', 'ko'); b.focus(); return; }
  const ok = await confirmDialog('Changer le mot de passe',
    'Vous êtes sur le point de modifier le mot de passe administrateur de ce module. L\'ancien cessera aussitôt de fonctionner sur ce poste.',
    'Oui, changer', { danger: true });
  if(!ok){ dire('Changement annulé : le mot de passe reste inchangé.'); return; }
  ecrireJsonLocal(`commande-${CSV_MODULE}:mot-de-passe`, { empreinte: hashPwd(a.value), enregistreLe: new Date().toISOString() });
  a.value = ''; b.value = '';
  planifierPublicationPoste(500);
  dire('Mot de passe changé et publié sur le poste.', 'ok');
  toast('Nouveau mot de passe actif.');
});

const adminPanel = document.getElementById('adminPanel');
const pwdDlg = document.getElementById('pwdDlg');
const itemFormDlg = document.getElementById('itemFormDlg');
let editingItemId = null;
let adminSearchTerm = '';

document.getElementById('btnAdmin').addEventListener('click', ()=>{
  if(adminUnlocked){ openAdminPanel(); return; }
  document.getElementById('pwdInput').value = '';
  setFormFeedback('pwdFeedback', '');
  pwdDlg.showModal();
  setTimeout(()=>document.getElementById('pwdInput').focus(), 50);
});
document.getElementById('pwdCancel').addEventListener('click', ()=>{ setFormFeedback('pwdFeedback', ''); pwdDlg.close(); });
function tryUnlock(){
  const val = document.getElementById('pwdInput').value;
  if(hashPwd(val) === empreinteAdminActive()){
    adminUnlocked = true;
    setFormFeedback('pwdFeedback', '');
    pwdDlg.close();
    openAdminPanel();
  }else{
    setFormFeedback('pwdFeedback', 'Mot de passe incorrect.', 'error');
    document.getElementById('pwdInput').value = '';
    document.getElementById('pwdInput').focus();
  }
}
document.getElementById('pwdOk').addEventListener('click', tryUnlock);
document.getElementById('pwdInput').addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); tryUnlock(); } });
document.getElementById('pwdInput').addEventListener('input', ()=> setFormFeedback('pwdFeedback', ''));

/* ============ Gestion du catalogue ============ */
function texteOrigineCatalogue(){
  const sources = {
    livre: 'catalogue livré avec l’application',
    local: 'catalogue modifié sur ce poste',
    poste: 'catalogue publié sur le poste (C:\\commandes)',
    'poste-repris': 'catalogue repris automatiquement depuis C:\\commandes'
  };
  const publie = window.WindowsStorage && window.WindowsStorage.hash
    ? `Les modifications sont enregistrées sur ce poste puis publiées automatiquement dans ${window.CommandesModules.libelleDossier(MODULE, 'Application')}.`
    : 'Hors du lanceur Windows, les modifications restent dans ce navigateur : exportez la base pour les conserver.';
  return `Source actuelle : ${sources[origineCatalogue] || sources.livre}. ${publie}`;
}

function majCompteurControle(){
  const r = resumeConstats(verifierCatalogue(items));
  const badge = document.getElementById('adminCheckCount');
  badge.textContent = r.erreurs ? `${r.erreurs}` : (r.alertes ? `${r.alertes}` : '');
  badge.className = 'badge-count' + (r.erreurs ? ' erreur' : (r.alertes ? ' alerte' : ''));
}

function openAdminPanel(){
  adminSearchTerm = '';
  document.getElementById('adminSearch').value = '';
  document.getElementById('adminPublication').textContent = texteOrigineCatalogue();
  document.getElementById('adminPublish').hidden = !(window.WindowsStorage && window.WindowsStorage.hash);
  renderAdminList();
  majCompteurControle();
  ouvrirPanneau(adminPanel);
  requestAnimationFrame(()=> document.getElementById('adminSearch').focus());
}
document.getElementById('adminClose').addEventListener('click', ()=> fermerPanneau(adminPanel));

function renderAdminList(){
  const listEl = document.getElementById('adminList');
  const recherche = normaliserRecherche(adminSearchTerm);
  const data = [...items]
    .filter(i=>{
      if(!recherche) return true;
      return normaliserRecherche([i.denom, i.nom, i.ref, i.codeBarres, i.loc, i.type, laboratoireDe(i)].join(' ')).includes(recherche);
    })
    .sort((a,b)=>{
      if(MODULE.laboratoire){
        const ha = isHorsStock(a), hb = isHorsStock(b);
        if(ha !== hb) return ha ? 1 : -1;
        if(ha) return comparerLaboratoires(a,b) || cmp(a.denom,b.denom);
      }
      return trierParcours(a, b);
    });
  document.getElementById('adminCount').textContent = items.length;
  if(data.length === 0){
    listEl.innerHTML = '<div class="empty-state"><div class="big">Aucun article</div>Ajustez la recherche.</div>';
    return;
  }
  listEl.innerHTML = data.map(it=>{
    const meta = [`réf ${escapeHtml(referenceSansPrefixe(it.ref))}`];
    if(MODULE.codeBarres) meta.push(`code-barres ${escapeHtml(it.codeBarres || 'non renseigné')}`);
    if(it.nom && it.nom !== it.denom) meta.push(escapeHtml(it.nom));
    meta.push(escapeHtml(it.loc || 'sans localisation'));
    if(MODULE.type && it.type) meta.push(escapeHtml(it.type));
    if(MODULE.laboratoire && laboratoireDe(it)) meta.push(`laboratoire ${escapeHtml(laboratoireDe(it))}`);
    meta.push(`dotation ${it.dotation}`);
    if(seuilDe(it) !== null) meta.push(`<span class="seuil-tag">seuil ${seuilDe(it)}</span>`);
    if(qteCommandeDe(it) !== null) meta.push(`<span class="seuil-tag">commande ${qteCommandeDe(it)}</span>`);
    return `
    <div class="admin-row" data-id="${it.id}">
      <div class="info">
        <div class="denom">${escapeHtml(it.denom || '(sans dénomination)')}</div>
        <div class="meta2">${meta.join(' · ')}</div>
      </div>
      <div class="row-actions">
        <button type="button" class="edit" data-action="edit" data-id="${it.id}" title="Modifier" aria-label="Modifier ${escapeHtml(it.denom)}">✎</button>
        <button type="button" class="del" data-action="delete" data-id="${it.id}" title="Supprimer" aria-label="Supprimer ${escapeHtml(it.denom)}">🗑</button>
      </div>
    </div>`;
  }).join('');
}
const renderAdminListDiffere = renduAuProchainCadre(renderAdminList);
document.getElementById('adminSearch').addEventListener('input', e=>{ adminSearchTerm = e.target.value; renderAdminListDiffere(); });

document.getElementById('adminList').addEventListener('click', e=>{
  const btn = e.target.closest('button[data-action][data-id]');
  if(!btn) return;
  const id = Number(btn.dataset.id);
  if(btn.dataset.action === 'edit') openItemForm(id);
  if(btn.dataset.action === 'delete') deleteItem(id);
});

function refreshDatalists(){
  document.getElementById('locList').innerHTML = [...new Set(items.map(i=>i.loc).filter(Boolean))].sort(cmp).map(l=>`<option value="${escapeHtml(l)}">`).join('');
  document.getElementById('typeList').innerHTML = [...new Set(items.map(i=>i.type).filter(Boolean))].sort(cmp).map(t=>`<option value="${escapeHtml(t)}">`).join('');
  document.getElementById('laboratoireList').innerHTML = [...new Set(items.map(laboratoireDe).filter(Boolean))].sort(cmp).map(l=>`<option value="${escapeHtml(l)}">`).join('');
}

const champ = id => document.getElementById(id);
function openItemForm(id){
  editingItemId = id;
  refreshDatalists();
  setFormFeedback('itemFormFeedback', '');
  const champs = ['fRef','fNom','fDenom','fLoc','fType','fSeuil','fQte', 'fCodeBarres', 'fLaboratoire'].filter(champ);
  if(id === null){
    champ('itemFormTitle').textContent = 'Ajouter un article';
    champs.forEach(f=> champ(f).value = '');
    champ('fDotation').value = 0;
  }else{
    const it = items.find(i=>i.id === id);
    champ('itemFormTitle').textContent = 'Modifier l\'article';
    champ('fRef').value = referenceSansPrefixe(it.ref);
    if(champ('fCodeBarres')) champ('fCodeBarres').value = it.codeBarres || '';
    champ('fNom').value = it.nom;
    champ('fDenom').value = it.denom;
    champ('fLoc').value = it.loc;
    champ('fType').value = it.type || '';
    if(champ('fLaboratoire')) champ('fLaboratoire').value = laboratoireDe(it);
    champ('fDotation').value = it.dotation;
    champ('fSeuil').value = it.seuil == null ? '' : it.seuil;
    champ('fQte').value = it.qteCommande == null ? '' : it.qteCommande;
  }
  itemFormDlg.showModal();
  /* Le premier champ reçoit le curseur dès l'ouverture, sans délai : un focus
     différé détournait une saisie déjà commencée dans un autre champ. */
  const premier = champ('fCodeBarres') || champ('fRef');
  premier.focus();
  premier.select();
}
document.getElementById('adminAddBtn').addEventListener('click', ()=> openItemForm(null));
itemFormDlg.addEventListener('input', ()=> setFormFeedback('itemFormFeedback', ''));
document.getElementById('itemFormCancel').addEventListener('click', ()=>{ setFormFeedback('itemFormFeedback', ''); itemFormDlg.close(); });

/* Douchette dans la fiche : l'Entrée finale confirme la lecture sans fermer
   ni enregistrer la fiche. */
function appliquerCodeScanne(champId, code){
  const brut = String(code == null ? '' : code).trim();
  const valeur = corrigerSaisieDouchette(brut).trim();
  if(!valeur){ setFormFeedback('itemFormFeedback', 'Aucun code exploitable n’a été lu.', 'error'); return; }
  const el = champ(champId);
  el.value = valeur;
  el.focus(); el.select();
  const doublon = champId === 'fCodeBarres'
    ? items.find(i=> codeBarresNormalise(i.codeBarres).toLowerCase() === valeur.toLowerCase() && i.id !== editingItemId)
    : items.find(i=> cleReference(referenceSansPrefixe(i.ref)) === cleReference(valeur) && i.id !== editingItemId);
  setFormFeedback('itemFormFeedback', doublon
    ? `Code lu, mais déjà utilisé par « ${doublon.denom} ».`
    : `Code lu : ${valeur}${valeur !== brut ? ` (corrigé depuis ${brut})` : ''}`, doublon ? 'error' : 'ok');
}
const champScan = MODULE.codeBarres ? 'fCodeBarres' : 'fRef';
champ(champScan).addEventListener('keydown', e=>{
  if(e.key !== 'Enter') return;
  e.preventDefault();
  appliquerCodeScanne(champScan, e.currentTarget.value);
});

document.getElementById('itemFormSave').addEventListener('click', ()=>{
  setFormFeedback('itemFormFeedback', '');
  const erreur = (message, focus)=>{ setFormFeedback('itemFormFeedback', message, 'error'); if(focus) champ(focus).focus(); };
  const ref = referenceInterne(champ('fRef').value);
  const codeBarres = MODULE.codeBarres ? codeBarresNormalise(champ('fCodeBarres').value) : undefined;
  const nom = champ('fNom').value.trim();
  const denom = champ('fDenom').value.trim();
  const loc = champ('fLoc').value.trim();
  const type = MODULE.type ? champ('fType').value.trim() : '';
  const laboratoire = MODULE.laboratoire ? champ('fLaboratoire').value.trim() : undefined;
  const lire = (id, vide)=>{ const brut = String(champ(id).value).trim(); return brut === '' ? vide : quantiteEntiere(brut, NaN); };
  const dotation = lire('fDotation', 0);
  const seuil = lire('fSeuil', null);
  const qteCommande = lire('fQte', null);

  if(!ref) return erreur('La référence est obligatoire.', 'fRef');
  if(MODULE.codeBarres && !codeBarres) return erreur('Le code-barres est obligatoire : il sert au scan et aux étiquettes.', 'fCodeBarres');
  if(MODULE.codeBarres && !/^[\x20-\x7E]+$/.test(codeBarres)) return erreur('Le code-barres doit contenir uniquement des caractères standards (sans accent).', 'fCodeBarres');
  if(!denom) return erreur('La dénomination est obligatoire.', 'fDenom');
  if(Number.isNaN(dotation)) return erreur('La dotation doit être un nombre.', 'fDotation');
  if(seuil !== null && Number.isNaN(seuil)) return erreur('Le seuil doit être un nombre, ou rester vide.', 'fSeuil');
  if(qteCommande !== null && Number.isNaN(qteCommande)) return erreur('La quantité à commander doit être un nombre, ou rester vide.', 'fQte');
  if(qteCommande !== null && seuil === null) return erreur('La quantité à commander n\'agit qu\'avec un seuil renseigné.', 'fSeuil');
  if(!isPlaceholderRef(ref)){
    const dup = items.find(i=> cleReference(i.ref) === cleReference(ref) && i.id !== editingItemId);
    if(dup) return erreur(`La référence ${referenceSansPrefixe(ref)} est déjà utilisée par « ${dup.denom} ».`, 'fRef');
  }
  if(MODULE.codeBarres){
    const dup = items.find(i=> codeBarresNormalise(i.codeBarres).toLowerCase() === codeBarres.toLowerCase() && i.id !== editingItemId);
    if(dup) return erreur(`Le code-barres ${codeBarres} est déjà lié à « ${dup.denom} ».`, 'fCodeBarres');
  }

  const champsArticle = { ref, nom, denom, loc, type, dotation, seuil, qteCommande };
  if(MODULE.codeBarres) champsArticle.codeBarres = codeBarres;
  if(MODULE.laboratoire) champsArticle.laboratoire = laboratoire;
  const avertissement = seuil !== null && dotation > 0 && seuil >= dotation
    ? ' Attention : seuil supérieur ou égal à la dotation, l’article sera toujours commandé.' : '';
  if(editingItemId === null){
    items.push({ id: idCounter++, ...champsArticle, inventaire: null, commandeLibre: null });
    toast('Article ajouté.' + avertissement);
  }else{
    Object.assign(items.find(i=>i.id === editingItemId), champsArticle);
    toast('Article modifié.' + avertissement);
  }
  itemFormDlg.close();
  apresModificationCatalogue();
});

function apresModificationCatalogue(){
  assignUids(items);
  enregistrerCatalogue();
  origineCatalogue = 'local';
  majBoutonSansDotation();
  refreshFilterOptions();
  renderAdminList();
  majCompteurControle();
  renderList();
  persistState();
}

async function deleteItem(id){
  const it = items.find(i=>i.id === id);
  if(!it) return;
  const ok = await confirmDialog('Supprimer cet article', `Confirmez-vous la suppression définitive de « ${it.denom} » (réf ${referenceSansPrefixe(it.ref)}) du catalogue ?`, 'Supprimer', { danger: true });
  if(!ok) return;
  items = items.filter(i=>i.id !== id);
  apresModificationCatalogue();
  toast('Article supprimé.');
}

/* ---------- contrôle d'intégrité ---------- */
document.getElementById('adminCheck').addEventListener('click', ()=>{
  document.getElementById('integriteTitle').textContent = `Contrôle du catalogue — ${items.length} article(s)`;
  document.getElementById('integriteContenu').innerHTML = constatsHtml(verifierCatalogue(items));
  document.getElementById('integriteDlg').showModal();
});
document.getElementById('integriteClose').addEventListener('click', ()=> document.getElementById('integriteDlg').close());

/* ---------- publication, import et export ---------- */
document.getElementById('adminPublish').addEventListener('click', async ()=>{
  try{
    const chemin = await publierDonneesPoste();
    toast(chemin ? `Données publiées dans ${chemin}` : 'Publication disponible uniquement depuis le lanceur Windows.');
  }catch(err){
    toast('Publication impossible : ' + (err.message || 'erreur inconnue'));
  }
});

async function writePortableExport(options){
  if(options.format === 'xlsx' && typeof chargerVendor === 'function') await chargerVendor('xlsx');
  const info = dataFormatInfo(options.format);
  let blob;
  if(options.format === 'json') blob = new Blob([JSON.stringify(options.jsonData, null, 2) + '\n'], {type:info.mime});
  else if(options.format === 'csv') blob = new Blob([csvDocument(options.headers, options.rows)], {type:info.mime});
  else if(options.format === 'xlsx') blob = new Blob([xlsxDocument(options.headers, options.rows, options.sheetName)], {type:info.mime});
  else throw new Error('format non pris en charge');
  const filename = `${options.stem}_${horodatage()}.${info.extension}`;
  const result = await saveFile(options.folder, filename, blob);
  const message = `${options.label} ${info.label} enregistrée`;
  toast(result.downloaded ? `${message}.` : `${message} dans ${result.path}`);
}

async function exportCommand(format){
  const exportedAt = new Date().toISOString();
  return writePortableExport({ format, folder:'Sauvegardes', stem:PORTABLE_MODULE_CONFIG.commandStem, label:'Commande', sheetName:'Commande',
    headers:COMMAND_HEADERS, rows:commandRows(exportedAt), jsonData:commandJsonData(exportedAt) });
}
async function exportCatalogue(format){
  const exportedAt = new Date().toISOString();
  return writePortableExport({ format, folder:'Application', stem:PORTABLE_MODULE_CONFIG.catalogStem, label:'Catalogue', sheetName:'Catalogue',
    headers:CATALOG_HEADERS, rows:catalogRows(exportedAt), jsonData:catalogJsonData(exportedAt) });
}

function prepareDataFileInput(input, format){
  const selected = DATA_FORMATS[format] ? format : 'json';
  input.value = '';
  input.dataset.dataFormat = selected;
  input.accept = dataFormatInfo(selected).accept;
  input.click();
}

async function replaceCatalogue(nextItems, format){
  const label = formatLabel(format);
  const constats = verifierCatalogue(nextItems);
  const r = resumeConstats(constats);
  const texte = `<p><b>${nextItems.length}</b> article(s) vont remplacer le catalogue actuel (${items.length} article(s)). Les comptages déjà saisis sont conservés lorsque la référence existe encore.</p>`
    + `<h3 class="dlg-sous-titre">Contrôle du fichier importé</h3>` + constatsHtml(constats)
    + (r.erreurs ? '<p class="recap-alerte">Ce catalogue comporte des erreurs. Corrigez le fichier si possible ; sinon, importez-le puis corrigez les articles signalés.</p>' : '');
  const ok = await confirmDialog(`Importer ce catalogue ${label}`, texte, r.erreurs ? 'Importer malgré les erreurs' : 'Remplacer le catalogue', { html: true, danger: r.erreurs > 0 });
  if(!ok) return false;
  const previous = items.filter(isCounted).map(({uid, ref, inventaire, commandeLibre})=>({uid, ref, inventaire, commandeLibre}));
  items = assignUids(nextItems.map((it, idx)=> articleNormalise(it, idx)));
  idCounter = items.length;
  const kept = applyEntries(previous);
  apresModificationCatalogue();
  toast(`Catalogue ${label} importé : ${items.length} article(s), ${kept} comptage(s) conservé(s).`);
  return true;
}

function applyCommandPayload(payload, format){
  const applied = applyEntries(payload.entries);
  if(applied === 0) throw new Error('aucun article du fichier ne correspond au catalogue actuel');
  signatureEl.value = payload.signature || '';
  lastArchive = payload.lastArchive || null;
  hideRestoreBanner();
  renderList();
  persistState();
  toast(`Commande ${formatLabel(format)} restaurée : ${applied} article(s).`);
}

async function importCommandFile(file, format){
  if(format === 'xlsx' && typeof chargerVendor === 'function') await chargerVendor('xlsx');
  const source = await readDataFile(file, format);
  const payload = format === 'json' ? commandPayloadFromJson(source) : commandPayloadFromTable(tabularRowsFor(source, format, 'commande'));
  applyCommandPayload(payload, format);
}

async function importCatalogueFile(file, format){
  if(format === 'xlsx' && typeof chargerVendor === 'function') await chargerVendor('xlsx');
  const source = await readDataFile(file, format);
  const nextItems = format === 'json' ? catalogueFromJson(source) : catalogueFromTable(tabularRowsFor(source, format, 'catalogue'));
  return replaceCatalogue(nextItems, format);
}

document.getElementById('adminExport').addEventListener('click', async ()=>{
  const format = await chooseDataFormat('Format d’export du catalogue', 'Exporter');
  if(!format) return;
  try{ await exportCatalogue(format); }
  catch(err){ console.error(err); toast(`Export ${formatLabel(format)} impossible : ${err.message || 'erreur inconnue'}.`); }
});
document.getElementById('adminImportBtn').addEventListener('click', async ()=>{
  const format = await chooseDataFormat('Format du catalogue à importer', 'Choisir le fichier');
  if(!format) return;
  prepareDataFileInput(document.getElementById('adminImportFile'), format);
});
document.getElementById('adminImportFile').addEventListener('change', async event=>{
  const input = event.target;
  const file = input.files && input.files[0];
  if(!file) return;
  const format = input.dataset.dataFormat || 'json';
  try{ await importCatalogueFile(file, format); }
  catch(err){ console.error(err); toast(`Import ${formatLabel(format)} impossible : ${err.message || 'fichier invalide'}.`); }
  finally{ input.value = ''; }
});
document.getElementById('btnSave').addEventListener('click', async ()=>{
  const format = await chooseDataFormat('Format de sauvegarde de la commande', 'Enregistrer');
  if(!format) return;
  try{ await exportCommand(format); }
  catch(err){ console.error(err); toast(`Sauvegarde ${formatLabel(format)} impossible : ${err.message || 'erreur inconnue'}.`); }
});
document.getElementById('btnLoad').addEventListener('click', async ()=>{
  if(window.WindowsStorage && window.WindowsStorage.hash){
    try{
      const saved = await window.WindowsStorage.loadCommand();
      if(saved.cancelled) return;
      const bytes = Uint8Array.from(atob(saved.data), c=>c.charCodeAt(0));
      await importCommandFile(new File([bytes], saved.name), saved.format);
    }catch(e){ toast(e.message || 'Chargement impossible.'); }
    return;
  }
  const format = await chooseDataFormat('Format de la commande à restaurer', 'Choisir le fichier');
  if(!format) return;
  prepareDataFileInput(document.getElementById('fileInput'), format);
});
document.getElementById('fileInput').addEventListener('change', async event=>{
  const input = event.target;
  const file = input.files && input.files[0];
  if(!file) return;
  const format = input.dataset.dataFormat || 'json';
  try{ await importCommandFile(file, format); }
  catch(err){ console.error(err); toast(`Restauration ${formatLabel(format)} impossible : ${err.message || 'fichier invalide'}.`); }
  finally{ input.value = ''; }
});

/* ============ Historique ============ */
const histPanel = document.getElementById('histPanel');
let histOnglet = 'commandes';

function dateCourte(iso){
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleString('fr-FR', { weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function commandesAnalysees(){
  const n = Number(document.getElementById('histPeriode').value);
  const toutes = historiqueCommandes();
  return n > 0 ? toutes.slice(0, n) : toutes;
}

function syntheseHistorique(commandes){
  const parArticle = new Map();
  commandes.forEach(cmd=>{
    cmd.lignes.forEach(l=>{
      const cle = l.uid || l.ref;
      const a = parArticle.get(cle) || { ref:l.ref, denom:l.denom, fois:0, total:0, max:0 };
      a.fois++; a.total += Number(l.commande) || 0; a.max = Math.max(a.max, Number(l.commande) || 0);
      a.denom = a.denom || l.denom;
      parArticle.set(cle, a);
    });
  });
  const actuels = new Map(items.map(it=>[it.uid, it]));
  return [...parArticle.entries()].map(([cle, a])=>{
    const article = actuels.get(cle) || items.find(it=>referenceSansPrefixe(it.ref) === a.ref);
    const dotation = article ? article.dotation : null;
    const frequence = commandes.length ? a.fois / commandes.length : 0;
    const moyenne = a.fois ? a.total / a.fois : 0;
    let conseil = '';
    if(commandes.length >= 3 && frequence >= 0.75 && dotation > 0 && moyenne >= dotation * 0.5) conseil = 'Commandé à presque chaque cycle, souvent en grande quantité : dotation peut-être insuffisante.';
    else if(commandes.length >= 3 && frequence >= 0.75) conseil = 'Commandé à presque chaque cycle.';
    return { ...a, dotation, frequence, moyenne, conseil };
  }).sort((x,y)=> y.fois - x.fois || y.total - x.total || cmp(x.denom, y.denom));
}

function renderHistorique(){
  const contenu = document.getElementById('histContenu');
  document.querySelectorAll('#histOnglets [data-hist]').forEach(b=> b.setAttribute('aria-selected', String(b.dataset.hist === histOnglet)));
  const commandes = commandesAnalysees();
  if(!historiqueCommandes().length){
    contenu.innerHTML = '<div class="empty-state"><div class="big">Aucune commande enregistrée</div>Les commandes s’ajoutent ici à chaque impression terminée.</div>';
    return;
  }
  if(histOnglet === 'synthese'){
    const lignes = syntheseHistorique(commandes);
    contenu.innerHTML = `<p class="hist-intro">Analyse de <b>${commandes.length}</b> commande(s), du ${escapeHtml(dateCourte(commandes[commandes.length-1].date))} au ${escapeHtml(dateCourte(commandes[0].date))}. Les articles commandés à presque chaque cycle sont signalés : leur dotation mérite peut-être d’être revue.</p>
      <div class="table-scroll"><table class="hist-table">
        <thead><tr><th>Article</th><th>Réf</th><th class="num">Commandé</th><th class="num">Qté moyenne</th><th class="num">Qté max</th><th class="num">Dotation</th><th>Remarque</th></tr></thead>
        <tbody>${lignes.map(l=>`<tr class="${l.conseil ? 'hist-signal' : ''}">
          <td>${escapeHtml(nomAffiche(l.denom))}</td><td>${escapeHtml(l.ref)}</td>
          <td class="num">${l.fois} / ${commandes.length}<span class="freq-bar" style="--f:${Math.round(l.frequence*100)}%"></span></td>
          <td class="num">${l.moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</td>
          <td class="num">${l.max}</td><td class="num">${l.dotation == null ? '—' : l.dotation}</td>
          <td>${escapeHtml(l.conseil)}</td></tr>`).join('')}</tbody>
      </table></div>`;
    return;
  }
  contenu.innerHTML = commandes.map((cmd, index)=>`
    <details class="hist-commande"${index === 0 ? ' open' : ''}>
      <summary><span class="hist-date">${escapeHtml(dateCourte(cmd.date))}</span>
        <span class="hist-meta">${escapeHtml(cmd.signature || '—')} · ${cmd.lignes.length} article(s) commandé(s)${cmd.total ? ` · ${cmd.comptes}/${cmd.total} comptés` : ''}</span></summary>
      <div class="table-scroll"><table class="hist-table">
        <thead><tr><th>Article</th><th>Réf</th><th>Zone</th><th class="num">Stock compté</th><th class="num">Dotation</th><th class="num">Commandé</th></tr></thead>
        <tbody>${cmd.lignes.map(l=>`<tr${l.horsStock ? ' class="hist-hs"' : ''}><td>${escapeHtml(nomAffiche(l.denom))}</td><td>${escapeHtml(l.ref)}</td><td>${escapeHtml(l.loc || '')}</td>
          <td class="num">${l.stock == null ? '—' : l.stock}</td><td class="num">${l.dotation === 0 ? 'libre' : l.dotation}</td><td class="num"><b>${l.commande}</b></td></tr>`).join('')}</tbody>
      </table></div>
    </details>`).join('');
}

document.getElementById('btnHistorique').addEventListener('click', ()=>{
  renderHistorique();
  ouvrirPanneau(histPanel);
});
document.getElementById('histClose').addEventListener('click', ()=> fermerPanneau(histPanel));
document.getElementById('histPeriode').addEventListener('change', renderHistorique);
document.getElementById('histOnglets').addEventListener('click', e=>{
  const b = e.target.closest('[data-hist]');
  if(!b) return;
  histOnglet = b.dataset.hist;
  renderHistorique();
});
document.getElementById('histExport').addEventListener('click', async ()=>{
  const commandes = commandesAnalysees();
  if(!commandes.length){ toast('Aucune commande à exporter.'); return; }
  const headers = ['date', 'rempli_par', 'reference', 'denomination', 'localisation', 'hors_stock', 'dotation', 'stock_compte', 'quantite_commandee'];
  const rows = [];
  commandes.forEach(cmd=> cmd.lignes.forEach(l=> rows.push({
    date: new Date(cmd.date).toLocaleString('fr-FR'), rempli_par: cmd.signature || '', reference: l.ref, denomination: l.denom,
    localisation: l.loc || '', hors_stock: l.horsStock ? 'oui' : '', dotation: l.dotation, stock_compte: l.stock == null ? '' : l.stock,
    quantite_commandee: l.commande
  })));
  try{
    const res = await saveFile('Sauvegardes', `Historique_${MODULE.racineFichiers}_${horodatage()}.csv`, new Blob([csvDocument(headers, rows)], { type: CSV_MIME }));
    toast(res.downloaded ? 'Historique exporté.' : `Historique exporté dans ${res.path}`);
  }catch(err){ toast('Export de l’historique impossible.'); }
});

/* ============ Étiquettes ============ */
const etiqPanel = document.getElementById('etiqPanel');
let etiqChoix = new Set();
let etiqRecherche = '';
let etiqZone = '';

function etiqFiltres(){
  const recherche = normaliserRecherche(etiqRecherche);
  return [...items].filter(it=>{
    if(etiqZone && it.loc !== etiqZone) return false;
    if(recherche && !articleCorrespond(it, recherche)) return false;
    return true;
  }).sort((a,b)=> cmp(a.loc,b.loc) || cmp(a.denom,b.denom));
}
function etiqMajNote(){
  const imprimables = new Set(items.filter(articleEtiquetable).map(i=>i.uid));
  etiqChoix = new Set([...etiqChoix].filter(uid=>imprimables.has(uid)));
  const n = etiqChoix.size;
  const labelFormat = window.CommandesLabelFormats.current();
  const pages = n ? Math.ceil(n / labelFormat.perPage) : 0;
  document.getElementById('etiqFormatNote').textContent = labelFormat.details;
  document.getElementById('etiqNote').innerHTML = n === 0
    ? 'Aucune étiquette sélectionnée. Cochez les articles à imprimer.'
    : `<span class="etiq-compteur">${n}</span> étiquette(s) sélectionnée(s) — ${pages} page(s) — ${labelFormat.name}.`;
  document.getElementById('etiqGenerate').disabled = n === 0;
  document.getElementById('etiqPrint').disabled = n === 0;
}
function etiqRendre(){
  const liste = etiqFiltres();
  document.getElementById('etiqList').innerHTML = liste.length === 0
    ? '<div class="empty-state"><div class="big">Aucun article</div>Ajustez la recherche ou le filtre.</div>'
    : liste.map(it=>{
      const ok = articleEtiquetable(it);
      const coche = etiqChoix.has(it.uid);
      const code = MODULE.codeBarres ? `code-barres ${escapeHtml(it.codeBarres || 'non renseigné')} · réf commande ${escapeHtml(referenceSansPrefixe(it.ref))}` : `réf ${escapeHtml(it.ref)}`;
      return `<div class="etiq-row${coche ? ' coche' : ''}${ok ? '' : ' indisponible'}" data-id="${it.id}" role="checkbox" aria-checked="${coche}" aria-disabled="${!ok}" tabindex="${ok ? '0' : '-1'}">
          <input type="checkbox" ${coche ? 'checked' : ''} ${ok ? '' : 'disabled'} tabindex="-1" aria-hidden="true">
          <span class="etiq-txt"><span class="etiq-nom">${escapeHtml(nomAffiche(it.denom))}</span>
          <span class="etiq-meta">${code} · ${escapeHtml(it.loc)}</span></span>
        </div>`;
    }).join('');
  etiqMajNote();
}
const etiqRendreDiffere = renduAuProchainCadre(etiqRendre);
function etiqBasculerLigne(row, nouvelEtat){
  if(!row || row.getAttribute('aria-disabled') === 'true') return;
  const it = items.find(i=>i.id === Number(row.dataset.id));
  const cb = row.querySelector('input[type=checkbox]');
  if(!it || !cb) return;
  cb.checked = Boolean(nouvelEtat);
  if(cb.checked) etiqChoix.add(it.uid); else etiqChoix.delete(it.uid);
  row.classList.toggle('coche', cb.checked);
  row.setAttribute('aria-checked', String(cb.checked));
  etiqMajNote();
}
document.getElementById('etiqList').addEventListener('click', e=>{
  const row = e.target.closest('.etiq-row[data-id]');
  if(!row) return;
  const cb = row.querySelector('input[type=checkbox]');
  if(e.target !== cb){ e.preventDefault(); etiqBasculerLigne(row, !cb.checked); }
  else etiqBasculerLigne(row, cb.checked);
});
document.getElementById('etiqList').addEventListener('keydown', e=>{
  if(e.key !== ' ' && e.key !== 'Enter') return;
  const row = e.target.closest('.etiq-row[data-id]');
  if(!row) return;
  e.preventDefault();
  const cb = row.querySelector('input[type=checkbox]');
  if(cb) etiqBasculerLigne(row, !cb.checked);
});
document.getElementById('etiqSearch').addEventListener('input', e=>{ etiqRecherche = e.target.value; etiqRendreDiffere(); });
document.getElementById('etiqLoc').addEventListener('change', e=>{ etiqZone = e.target.value; etiqRendre(); });
document.getElementById('etiqAll').addEventListener('click', ()=>{ items.filter(articleEtiquetable).forEach(i=>etiqChoix.add(i.uid)); etiqRendre(); });
document.getElementById('etiqNone').addEventListener('click', ()=>{ etiqChoix.clear(); etiqRendre(); });
document.getElementById('etiqVisible').addEventListener('click', ()=>{ etiqFiltres().filter(articleEtiquetable).forEach(i=>etiqChoix.add(i.uid)); etiqRendre(); });
document.getElementById('etiqFormat').addEventListener('change', etiqMajNote);
document.getElementById('etiqClose').addEventListener('click', ()=> fermerPanneau(etiqPanel));
document.getElementById('adminLabels').addEventListener('click', ()=>{
  const sel = document.getElementById('etiqLoc');
  const zones = [...new Set(items.map(i=>i.loc))].sort(cmp);
  sel.innerHTML = '<option value="">Toutes les zones</option>' + zones.map(z=>`<option value="${escapeHtml(z)}">${escapeHtml(z || 'Sans localisation')}</option>`).join('');
  etiqRecherche = ''; etiqZone = '';
  document.getElementById('etiqSearch').value = '';
  sel.value = '';
  etiqRendre();
  ouvrirPanneau(etiqPanel);
  document.getElementById('etiqList').scrollTop = 0;
});

function etiquettesChoisies(){
  return [...items].filter(i=>etiqChoix.has(i.uid) && articleEtiquetable(i)).sort((a,b)=> cmp(a.loc,b.loc) || cmp(a.denom,b.denom));
}
document.getElementById('etiqGenerate').addEventListener('click', async ()=>{
  const liste = etiquettesChoisies();
  if(liste.length === 0){ toast('Aucune étiquette sélectionnée.'); return; }
  const labelFormat = window.CommandesLabelFormats.current();
  const pages = Math.ceil(liste.length / labelFormat.perPage);
  const ok = await confirmDialog('Étiquettes', `${liste.length} étiquette(s) seront générées sur ${pages} page(s) au format ${labelFormat.name} (${labelFormat.shortDescription}), classées par zone de rangement.`, 'Générer le PDF');
  if(!ok) return;
  const btn = document.getElementById('etiqGenerate');
  const libelle = btn.textContent;
  btn.textContent = 'Génération…';
  btn.disabled = true;
  try{
    await attendreAffichage();
    const blob = await generateLabelsPdfBlob(liste, labelFormat);
    const nature = MODULE.codeBarres ? 'Code_Barres' : 'QR';
    const res = await saveFile('Etiquettes', `Etiquettes_${nature}_${labelFormat.fileSlug}_${horodatage()}.pdf`, blob);
    toast(res.downloaded ? `Planche de ${liste.length} étiquette(s) téléchargée.` : `Étiquettes enregistrées dans ${res.path}`);
  }catch(err){
    console.error(err);
    toast('Erreur lors de la génération des étiquettes.');
  }finally{
    btn.textContent = libelle;
    btn.disabled = false;
  }
});
document.getElementById('etiqPrint').addEventListener('click', async ()=>{
  const liste = etiquettesChoisies();
  if(liste.length === 0){ toast('Aucune étiquette sélectionnée.'); return; }
  const labelFormat = window.CommandesLabelFormats.current();
  const pages = Math.ceil(liste.length / labelFormat.perPage);
  const ok = await confirmDialog('Impression directe des étiquettes', `${liste.length} étiquette(s) seront imprimées sur ${pages} page(s) au format ${labelFormat.name}. Vérifiez le papier et l’échelle à 100 %.`, 'Imprimer');
  if(!ok) return;
  const btn = document.getElementById('etiqPrint');
  const libelle = btn.textContent;
  btn.textContent = 'Préparation…';
  btn.disabled = true;
  try{
    await window.CommandesLabelPrinter.print(MODULE.codeBarres
      ? { list:liste, format:labelFormat, kind:'barcode', orderReference:referenceSansPrefixe }
      : { list:liste, format:labelFormat, kind:'qr' });
    toast(`Impression directe préparée au format ${labelFormat.name}.`);
  }catch(err){
    console.error(err);
    toast('Erreur lors de la préparation de l’impression des étiquettes.');
  }finally{
    btn.textContent = libelle;
    btn.disabled = false;
  }
});

/* ============ Réinitialisation et reprise ============ */
document.getElementById('btnReset').addEventListener('click', async ()=>{
  const c = compteurs();
  if(c.comptes === 0 && !signatureEl.value.trim()){ toast('Aucun comptage à effacer.'); return; }
  const ok = await confirmDialog('Réinitialiser la commande',
    `${c.comptes} comptage(s) seront effacés pour démarrer un nouveau cycle. Cette commande n’ayant pas été imprimée, elle ne sera pas ajoutée à l’historique.`,
    'Réinitialiser', { danger: true });
  if(!ok) return;
  remettreAZero();
  toast('Commande réinitialisée.');
});
document.getElementById('restoreDismiss').addEventListener('click', hideRestoreBanner);
document.getElementById('restoreClear').addEventListener('click', async ()=>{
  const ok = await confirmDialog('Repartir de zéro', 'Le comptage restauré sera effacé et tous les compteurs remis à vide.', 'Effacer', { danger: true });
  if(!ok) return;
  items.forEach(i=>{ i.inventaire = null; i.commandeLibre = null; });
  signatureEl.value = '';
  refScannee = null; erreurScan = null;
  document.getElementById('search').value = '';
  searchTerm = '';
  clearPersistedState();
  hideRestoreBanner();
  appliquerVue('tous');
  toast('Comptage effacé.');
});
