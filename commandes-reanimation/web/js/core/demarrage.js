/* ============================================================
   Démarrage du module
   ============================================================ */

/* Une molette ou un pavé tactile peut modifier silencieusement un champ
   numérique actif : on retire le focus avant l'action du navigateur. */
document.addEventListener('wheel', ()=>{
  const actif = document.activeElement;
  if(actif && actif.tagName === 'INPUT' && actif.type === 'number') actif.blur();
}, { capture:true, passive:true });

/* En-tête collant et barre d'actions fixe : leurs hauteurs varient avec la
   largeur de l'écran ; on les mesure plutôt que de les figer. */
const mastheadEl = document.querySelector('header.masthead');
const actionBarEl = document.querySelector('.action-bar');
const panelFooterEls = [...document.querySelectorAll('.admin-panel-footer')];
function syncChromeSizes(){
  const style = document.documentElement.style;
  style.setProperty('--header-h', mastheadEl.offsetHeight + 'px');
  style.setProperty('--actionbar-h', actionBarEl.offsetHeight + 'px');
  panelFooterEls.forEach(footer=>{
    const h = footer.offsetHeight;
    if(h > 0) footer.closest('.admin-panel').style.setProperty('--adminbar-h', h + 'px');
  });
}
let chromeSizeFrame = 0;
function planifierChromeSizes(){
  if(chromeSizeFrame) return;
  chromeSizeFrame = requestAnimationFrame(()=>{ chromeSizeFrame = 0; syncChromeSizes(); });
}
window.addEventListener('resize', planifierChromeSizes);
if(window.ResizeObserver){
  const observateur = new ResizeObserver(planifierChromeSizes);
  observateur.observe(mastheadEl);
  observateur.observe(actionBarEl);
  panelFooterEls.forEach(footer=> observateur.observe(footer));
}

/* Échap ferme le menu ou le panneau du dessus. */
document.addEventListener('keydown', e=>{
  if(e.key !== 'Escape') return;
  if(document.querySelector('dialog[open]')) return;
  if(headerTools.classList.contains('is-open')){ fermerMenu(); menuBtn.focus(); return; }
  const ouvert = [aidePanel, etiqPanel, histPanel, adminPanel].find(p => p && !p.classList.contains('hidden'));
  if(!ouvert) return;
  e.preventDefault();
  fermerPanneau(ouvert);
});

signatureEl.addEventListener('input', scheduleSave);
signatureEl.addEventListener('change', ()=>{ if(signatureEl.value.trim()) retenirSignataire(signatureEl.value); });
window.addEventListener('pagehide', ()=>{ persistState(); });
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'hidden') persistState(); });

bindListEvents();
remplirSignataires();
majBoutonCasse();
majBoutonSansDotation();
refreshFilterOptions();
appliquerVue('tous', false);
restorePersistedState();
renderList();
syncChromeSizes();
initDestDir();

if(origineCatalogue === 'poste-repris'){
  toast(`Catalogue repris automatiquement depuis ${window.CommandesModules.libelleDossier(MODULE)} (version la plus récente).`);
}
/* Les données publiées sont rafraîchies au démarrage si le poste ne possède
   pas encore de fichier (première ouverture de la version 2.7) ou si
   l'historique local est plus riche que le fichier. */
if(window.WindowsStorage && window.WindowsStorage.hash && (!window.WindowsStorage.android || window.WindowsStorage.dossier())){
  const historiquePoste = DONNEES_POSTE && Array.isArray(DONNEES_POSTE.historique) ? DONNEES_POSTE.historique.length : 0;
  if(!DONNEES_POSTE || historiqueCommandes().length > historiquePoste) planifierPublicationPoste(4000);
}
