/* Documents vierges : lecture seule du catalogue courant. */
window.materielPapier = function(zone = '', horsStock = false) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cmp = (a,b) => String(a || '').localeCompare(String(b || ''),'fr',{numeric:true});
  const name = it => it.nom || it.denom || '';
  const lab = it => String(it.laboratoire || '').trim();
  const selected = items.filter(it => isHorsStock(it) === horsStock && (!zone || (it.loc || 'Sans localisation') === zone)).slice().sort((a,b) =>
    (horsStock ? (Number(!lab(a))-Number(!lab(b)) || cmp(lab(a),lab(b))) : 0) || cmp(name(a),name(b)) || cmp(a.ref,b.ref));
  let last = null;
  const rows = selected.map(it => {
    const group = lab(it) || 'Laboratoire non renseigné';
    const heading = horsStock && group !== last ? `<tr class="group"><th colspan="6">${esc(group)}</th></tr>` : '';
    last = group;
    return heading + `<tr class="article" data-ref="${esc(it.ref)}"><td>${esc(it.ref)}</td><td class="name">${esc(name(it))}</td><td>${it.dotation === 0 ? 'Libre' : esc(it.dotation)}</td><td></td><td></td><td></td></tr>`;
  }).join('');
  const title = horsStock ? 'Matériel - Hors stock par laboratoire' : 'Matériel - Pharmacie (hors stock exclu)';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title><style>
  *{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#172d40;margin:0;background:#eef2f4}main{max-width:794px;padding:26px;margin:16px auto;background:white}h1{font-size:19px;margin:5px 0 8px}.toolbar{max-width:794px;margin:16px auto}.toolbar button,.toolbar a{display:inline-block;padding:10px;margin-right:8px;color:#fff;background:#0b6e6e;border:0;border-radius:5px;text-decoration:none;cursor:pointer}.meta{margin:10px 0}.note,footer{font-size:10px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}th,td{border:1px solid #8c969b;padding:4px;overflow-wrap:anywhere;text-align:left}td{height:25px}.name{font-weight:600}thead th,.group th{background:#eaf0f1}.group th{padding:4px}footer{margin-top:10px;line-height:1.7}
  @page{size:A4 portrait;margin:10mm}
  @media print{body{background:white;color:black}main{max-width:none;margin:0;padding:0}.toolbar{display:none}h1{font-size:13pt}.meta{font-size:9pt;margin:2mm 0}.note,footer{font-size:8pt}table{font-size:8pt}th,td{padding:1mm}td{height:6.5mm}thead{display:table-header-group}tr{break-inside:avoid}.group{break-after:avoid}thead th,.group th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><div class="toolbar"><button onclick="window.print()">Imprimer / enregistrer en PDF</button><a id="download" download="Liste_papier_DM_Pharmacie${horsStock ? '_Hors_Stock' : ''}.html">Conserver cette liste hors ligne</a></div><main><div>Service Réanimation · Mode dégradé · A4 portrait</div><h1>${title}</h1><div>${selected.length} articles · Zone : ${esc(zone || 'Toutes les zones')} · Édité le ${esc(new Date().toLocaleDateString('fr-FR'))}</div><div class="meta">Date : ____ / ____ / ________ &nbsp; Rempli par : ____________________ &nbsp; N° : __________</div><p class="note">Noms pharmacie du catalogue. Remplir les cases à la main ; écrire 0 si aucune commande n'est nécessaire. Libre = sans dotation.</p><table><colgroup><col style="width:11%"><col style="width:45%"><col style="width:10%"><col style="width:12%"><col style="width:14%"><col style="width:8%"></colgroup><thead><tr><th>Référence</th><th>Nom pharmacie</th><th>Dotation</th><th>Stock compté</th><th>À commander</th><th>Visa</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Aucun article dans cette sélection.</td></tr>'}</tbody></table><footer>Observations : ______________________________________________________________________<br>Transmise le : ____ / ____ / ________ &nbsp; Par : __________________ &nbsp; Contrôlée par : __________________<br>Rééditer après modification du catalogue. Aucune synchronisation automatique avec l'application.</footer></main><script>document.getElementById('download').href=URL.createObjectURL(new Blob(['<!doctype html>'+document.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));<\/script></body></html>`;
};

