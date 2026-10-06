/* Impression indépendante : aucune écriture dans le comptage ou le stockage. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const compare = (a,b) => String(a || '').localeCompare(String(b || ''),'fr',{numeric:true});
  const title = document.querySelector('.masthead h1').textContent.trim();
  function buildDocument(zone = '', list = 'pharmacie') {
    if (typeof window.materielPapier === 'function') return window.materielPapier(zone, list === 'hors-stock');
    const selected = items.filter(it => !zone || (it.loc || 'Sans localisation') === zone)
      .slice().sort((a,b) => compare(a.loc,b.loc) || compare(a.type,b.type) || compare(a.denom || a.nom,b.denom || b.nom));
    const stamp = new Date().toLocaleString('fr-FR');
    let lastGroup = null;
    const rows = selected.map(it => {
      const group = `${it.loc || 'Sans localisation'}${it.type ? ' / '+it.type : ''}`;
      const heading = group !== lastGroup ? `<tr class="group"><th colspan="6">${esc(group)}</th></tr>` : '';
      lastGroup = group;
      const reference = typeof referenceSansPrefixe === 'function' ? referenceSansPrefixe(it.ref) : it.ref;
      return heading + `<tr class="article"><td>${esc(reference)}</td><td><strong>${esc(it.denom || it.nom)}</strong>${it.nom && it.nom !== it.denom ? `<small>Nom pharmacie : ${esc(it.nom)}</small>` : ''}</td><td class="number">${it.dotation === 0 ? 'Libre' : esc(it.dotation)}</td><td class="blank"></td><td class="blank"></td><td class="blank"></td></tr>`;
    }).join('');
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} - Liste manuelle</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#edf2f7;color:#172d40;font:14px 'Segoe UI',Arial,sans-serif}main{max-width:794px;margin:24px auto;padding:28px;background:white}h1{font-size:24px;margin:6px 0 12px}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.4px;color:#125365;font-weight:700}.toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;max-width:794px;margin:20px auto;padding:0 16px}.toolbar button,.toolbar a{border:1px solid #087e8b;padding:12px 18px;border-radius:8px;background:#087e8b;color:white;font:inherit;text-decoration:none;cursor:pointer}.toolbar a{background:white;color:#125365}.toolbar p{flex:1 1 100%;margin:0}.metadata{display:flex;gap:15px;flex-wrap:wrap;line-height:2.3;margin:12px 0}.note{font-size:12px;line-height:1.5;margin:10px 0 16px}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:12px;min-width:0}th,td{border:1px solid #8998a5;padding:7px;overflow-wrap:anywhere;text-align:left}thead th{background:#e9eff4;color:#172d40}td{height:42px;vertical-align:middle}small{display:block;font-size:10px;font-weight:normal;margin-top:3px}.group th{background:#f2f5f7;padding:6px;font-size:12px}.number{text-align:center}.foot{font-size:11px;line-height:1.6;margin-top:14px}.blank{background:white}button:focus-visible,a:focus-visible{outline:3px solid #172d40;outline-offset:3px}
@page{size:A4 portrait;margin:10mm}
@media print{body{background:white;color:black;font-size:10pt}main{margin:0;padding:0;max-width:none}.toolbar{display:none}h1{font-size:13pt}.eyebrow{color:black}.metadata{margin:2mm 0;line-height:2;font-size:10pt}.note{font-size:8.5pt;margin:2mm 0 4mm}.table-wrap{overflow:visible}table{min-width:0;font-size:8pt}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.group{break-after:avoid;page-break-after:avoid}th,td{padding:1mm;border-color:#666}td{height:6.5mm}small{font-size:8pt}.group th{font-size:8pt}.foot{font-size:8pt;break-before:avoid;page-break-before:avoid}thead th,.group th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><div class="toolbar"><button type="button" onclick="window.print()">Imprimer / enregistrer en PDF</button><a id="download" download="Liste_papier_${esc(window.MODULE && MODULE.nomFichier || 'module')}.html">Conserver cette liste hors ligne</a><p>Liste vierge : compléter à la main les colonnes Stock compté, À commander et Visa. Impression A4 portrait.</p></div><main><div class="eyebrow">Service Réanimation · Mode dégradé</div><h1>${esc(title)} - Commande manuelle</h1><div>Zone : <b>${esc(zone || 'Toutes les zones')}</b> · ${selected.length} articles · Liste éditée le ${esc(stamp)}</div><div class="metadata"><span>Date de commande : ____ / ____ / ________</span><span>Rempli par : __________________________</span><span>Commande n° : ______________</span></div><p class="note">Renseigner les quantités manuellement. Les dotations ci-dessous proviennent du catalogue à la date d'édition ; aucune quantité à commander n'est préremplie. Une case vide signifie « non renseigné » ; écrire 0 si aucune commande n'est nécessaire.</p><div class="table-wrap"><table><colgroup><col style="width:11%"><col style="width:45%"><col style="width:10%"><col style="width:12%"><col style="width:14%"><col style="width:8%"></colgroup><thead><tr><th>Référence</th><th>Désignation</th><th>Dotation</th><th>Stock compté</th><th>À commander</th><th>Visa</th></tr></thead><tbody>${rows}</tbody></table></div><p class="foot">Observations : ____________________________________________________________________________________________________<br>Commande transmise le : ____ / ____ / ________ à ______ h ______ · Par : ____________________ · Contrôlée par : ____________________<br>Rééditer cette liste après toute modification du catalogue. Document de saisie manuelle, sans synchronisation automatique avec l'application.</p></main><script>document.getElementById('download').href=URL.createObjectURL(new Blob(['<!doctype html>'+document.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));<\/script></body></html>`;
  }
  window.modeDegradeDocument = buildDocument;
  const button = document.createElement('button');
  button.type='button'; button.id='btnModeDegrade';
  button.innerHTML=(window.CommandesShell ? window.CommandesShell.icone('papier', 18) : '')+'<span>Liste papier</span>';
  button.title='Mode dégradé : imprimer une liste vierge pour commander à la main';
  document.querySelector('.action-bar').insertBefore(button,document.getElementById('btnPrint'));
  const dialog=document.createElement('dialog');
  dialog.id='modeDegradeDlg'; dialog.setAttribute('aria-labelledby','modeDegradeTitle');
  dialog.innerHTML='<div class="dlg-body"><h2 id="modeDegradeTitle">Commande manuelle sur papier</h2><p>Imprimez une liste vierge ou conservez-la en PDF avant une panne. Les quantités et la signature seront remplies à la main.</p><div class="form-grid"><label class="full">Zone à imprimer<select id="paperZone"></select></label></div><p id="paperCount" aria-live="polite"></p><p>La liste inclut tous les articles de la zone, même ceux déjà comptés ou masqués par une recherche. La commande en cours reste conservée.</p><div class="dlg-actions"><button type="button" class="ghost" id="paperCancel">Annuler</button><button type="button" id="paperOpen" class="primary">Ouvrir la liste</button></div><p id="paperError" role="alert"></p></div>';
  document.body.append(dialog);
  const select=dialog.querySelector('select');
  const material = typeof window.materielPapier === 'function';
  if(material) {
    select.closest('.form-grid').insertAdjacentHTML('afterbegin','<label class="full">Liste à imprimer<select id="paperList"><option value="pharmacie">1. Pharmacie — hors stock exclu</option><option value="hors-stock">2. Hors stock — par laboratoire</option></select></label>');
    dialog.querySelector('#paperCount').nextElementSibling.textContent='Deux listes A4 portrait avec les noms pharmacie. Le filtre de zone reste applicable. Les articles masqués ou déjà comptés sont inclus dans la liste choisie.';
  }
  const listSelect=dialog.querySelector('#paperList');
  const update=()=> { const n=items.filter(it=>(!select.value || (it.loc || 'Sans localisation')===select.value) && (!material || isHorsStock(it)===(listSelect.value==='hors-stock'))).length; document.getElementById('paperCount').textContent=n+' article(s) dans la liste vierge.'; document.getElementById('paperOpen').disabled=n===0; };
  button.addEventListener('click',()=>{
    select.innerHTML='<option value="">Toutes les zones</option>'+[...new Set(items.map(it=>it.loc || 'Sans localisation'))].sort(compare).map(loc=>`<option value="${esc(loc)}">${esc(loc)}</option>`).join('');
    document.getElementById('paperError').textContent=''; update(); dialog.showModal();
  });
  select.addEventListener('change',update);
  if(listSelect) listSelect.addEventListener('change',update);
  document.getElementById('paperCancel').addEventListener('click',()=>dialog.close());
  document.getElementById('paperOpen').addEventListener('click',()=>{
    const html=buildDocument(select.value, listSelect ? listSelect.value : 'pharmacie');
    const preview=window.open('','_blank');
    if(!preview){document.getElementById('paperError').textContent='Le navigateur a bloqué la fenêtre. Autorisez les fenêtres pour cette application puis réessayez.';return;}
    preview.opener=null; preview.document.open(); preview.document.write(html); preview.document.close(); dialog.close();
  });
})();
