/* ============================================================
   Impression de la commande, PDF, étiquettes et historique
   ============================================================ */

/* ============ Groupes d'impression ============
   Commande courante : par TYPE (ou par LOCALISATION pour le Magasin), comme
   la macro « impression » du classeur d'origine. Hors Stock : feuille ou
   travail séparé, par LABORATOIRE lorsque le module le gère. */
function trierImpression(a, b){
  if(MODULE.regroupementImpression === 'localisation') return cmp(a.loc, b.loc) || cmp(a.denom, b.denom);
  return cmp(a.type, b.type) || cmp(a.loc, b.loc) || cmp(a.denom, b.denom);
}
function buildPrintGroups(){
  const aCommander = items.filter(it => commandeOf(it) > 0);
  return {
    normal: aCommander.filter(it => !isHorsStock(it)).sort(trierImpression),
    horsStock: aCommander.filter(it => isHorsStock(it)).sort(MODULE.laboratoire
      ? (a,b)=> comparerLaboratoires(a,b) || cmp(a.denom,b.denom) || cmp(a.ref,b.ref)
      : trierImpression)
  };
}
function buildPrintOrder(){
  const { normal, horsStock } = buildPrintGroups();
  return normal.concat(horsStock);
}
function regroupementHorsStock(){ return MODULE.laboratoire ? 'laboratoire' : MODULE.regroupementImpression; }
function libelleGroupeImpression(it, groupBy){
  if(groupBy === 'laboratoire') return laboratoireDe(it) || 'Laboratoire non renseigné';
  if(groupBy === 'localisation') return String(it.loc || '').trim() || 'Sans localisation';
  return String(it.type || '').trim() || 'Sans type';
}
function nomImprime(it){ return it.nom || it.denom; }

const TITRE_NORMAL = `${MODULE.titreImpression} — Service Réanimation`;
const TITRE_HORS_STOCK = `${MODULE.titreImpressionHorsStock || MODULE.titreImpression + ' — Hors Stock'} — Service Réanimation`;
const NOTE_NORMAL = MODULE.regroupementImpression === 'localisation'
  ? 'Tri d\'impression : par LOCALISATION puis désignation'
  : 'Tri d\'impression : par TYPE (ordre croissant), conforme à la macro « impression » du classeur d\'origine';
const NOTE_HORS_STOCK = MODULE.laboratoire
  ? 'Tri d\'impression : par LABORATOIRE (ordre croissant), laboratoires non renseignés en dernier'
  : 'Feuille séparée : articles de type/localisation « Hors Stock »';

function lotsDemandes(lot){
  const { normal, horsStock } = buildPrintGroups();
  const lots = [];
  if((lot === 'tous' || lot === 'dispositifs') && normal.length) lots.push({ liste: normal, titre: TITRE_NORMAL, note: NOTE_NORMAL, groupBy: MODULE.regroupementImpression });
  if((lot === 'tous' || lot === 'hors-stock') && horsStock.length) lots.push({ liste: horsStock, titre: TITRE_HORS_STOCK, note: NOTE_HORS_STOCK, groupBy: regroupementHorsStock() });
  return lots;
}

function buildSheetRowsHtml(list, groupBy){
  let html = '';
  let groupeCourant = null;
  list.forEach(it=>{
    const groupe = libelleGroupeImpression(it, groupBy);
    if(groupe !== groupeCourant){
      groupeCourant = groupe;
      html += `<tr class="p-type-row"><td colspan="6">${escapeHtml(groupe)}</td></tr>`;
    }
    const hs = isHorsStock(it);
    html += `<tr>
      <td>${escapeHtml(referenceSansPrefixe(it.ref))}</td>
      <td${hs ? ' style="color:#C62828; font-weight:700;"' : ''}>${escapeHtml(nomImprime(it))}</td>
      <td>${it.dotation === 0 ? '—' : it.dotation}</td>
      <td>${commandeOf(it)}</td>
      <td></td><td></td>
    </tr>`;
  });
  return html;
}

function buildSheetHtml(lot){
  const sign = signatureEl.value || '—';
  const dateStr = 'Le ' + new Date().toLocaleDateString('fr-FR');
  return `
    <div class="p-sheet">
      <div class="p-head">
        <h1>${escapeHtml(lot.titre)}</h1>
        <div class="p-meta"><span>Rempli par : ${escapeHtml(sign)}</span><span>${dateStr}</span></div>
      </div>
      <table class="p-table">
        <thead><tr><th>Réf</th><th>Désignation</th><th>Dotation</th><th>À commander</th><th class="p-check">Visa</th><th class="p-check">Visa</th></tr></thead>
        <tbody>${buildSheetRowsHtml(lot.liste, lot.groupBy)}</tbody>
      </table>
      <div class="p-foot">${escapeHtml(lot.note)} · ${lot.liste.length} article(s) à commander</div>
    </div>`;
}

function renderPrintTable(lot = 'tous'){
  document.getElementById('printSheets').innerHTML = lotsDemandes(lot).map(buildSheetHtml).join('');
}

/* Les polices standard d'un PDF n'acceptent que le jeu WinAnsi : un
   caractère hors de ce jeu est remplacé et signalé. */
const WINANSI_EXTRA = new Set([0x20AC,0x201A,0x0192,0x201E,0x2026,0x2020,0x2021,0x02C6,0x2030,
  0x0160,0x2039,0x0152,0x017D,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,0x02DC,0x2122,
  0x0161,0x203A,0x0153,0x017E,0x0178]);
function nettoyerWinAnsi(txt, inconnus){
  return Array.from(String(txt === null || txt === undefined ? '' : txt)).map(ch=>{
    const c = ch.codePointAt(0);
    if((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.has(c)) return ch;
    if(c === 9 || c === 10 || c === 13) return ' ';
    if(inconnus) inconnus.add(ch);
    return '?';
  }).join('');
}

/* ============ PDF de la commande (pdf-lib embarqué, hors connexion) ============ */
async function generatePdfBlob(lot = 'tous'){
  if(typeof chargerVendor === 'function') await chargerVendor('pdflib');
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const MM = 2.8346456693;
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const MARGIN_X = 18*MM, MARGIN_Y = 19*MM;
  const CONTENT_W = PAGE_W - 2*MARGIN_X;
  const COLS = [
    {key:'ref', label:'Réf', w:44},
    {key:'nom', label:'Désignation', w:0},
    {key:'dotation', label:'Dotation', w:52},
    {key:'commande', label:'À commander', w:68},
    {key:'visa1', label:'Visa', w:40},
    {key:'visa2', label:'Visa', w:40},
  ];
  const fixedW = COLS.reduce((s,c)=>s+(c.key!=='nom'?c.w:0),0);
  COLS.find(c=>c.key==='nom').w = CONTENT_W - fixedW;
  const ROW_H = 15, HEAD_H = 16, TYPE_ROW_H = 15;
  const signature = signatureEl.value;
  const unsupported = new Set();
  const safeText = txt => nettoyerWinAnsi(txt, unsupported);

  let page, y, sheetTitle, sheetPages;

  function newPage(){
    page = doc.addPage([PAGE_W, PAGE_H]);
    sheetPages.push(page);
    y = PAGE_H - MARGIN_Y;
    page.drawText(safeText(sheetTitle), { x: MARGIN_X, y: y-12, size: 13, font: bold, color: rgb(0.06,0.19,0.18) });
    page.drawText(safeText(`Rempli par : ${signature || '—'}`), { x: MARGIN_X, y: y-27, size: 8.5, font, color: rgb(0.3,0.3,0.3) });
    const dateStr = 'Le ' + new Date().toLocaleDateString('fr-FR');
    const dw = font.widthOfTextAtSize(dateStr, 8.5);
    page.drawText(safeText(dateStr), { x: PAGE_W-MARGIN_X-dw, y: y-27, size: 8.5, font, color: rgb(0.3,0.3,0.3) });
    y -= 38;
    drawTableHeader();
  }
  function drawColLines(yTop, yBottom){
    let cx = MARGIN_X;
    page.drawLine({ start:{x:MARGIN_X,y:yTop}, end:{x:MARGIN_X+CONTENT_W,y:yTop}, thickness:0.6, color: rgb(0.6,0.6,0.6)});
    COLS.forEach(c=>{
      page.drawLine({ start:{x:cx,y:yTop}, end:{x:cx,y:yBottom}, thickness:0.5, color: rgb(0.7,0.7,0.7)});
      cx += c.w;
    });
    page.drawLine({ start:{x:cx,y:yTop}, end:{x:cx,y:yBottom}, thickness:0.5, color: rgb(0.7,0.7,0.7)});
    page.drawLine({ start:{x:MARGIN_X,y:yBottom}, end:{x:MARGIN_X+CONTENT_W,y:yBottom}, thickness:0.6, color: rgb(0.6,0.6,0.6)});
  }
  function drawTableHeader(){
    page.drawRectangle({ x: MARGIN_X, y: y-HEAD_H, width: CONTENT_W, height: HEAD_H, color: rgb(0.89,0.89,0.89) });
    let cx = MARGIN_X;
    COLS.forEach(c=>{
      page.drawText(safeText(c.label), { x: cx+3, y: y-HEAD_H+4, size: 8.5, font: bold, color: rgb(0.1,0.1,0.1) });
      cx += c.w;
    });
    drawColLines(y, y-HEAD_H);
    y -= HEAD_H;
  }
  function ensureSpace(h){ if(y - h < MARGIN_Y + 12) newPage(); }
  function fitText(txt, colW, size){
    txt = safeText(txt);
    const maxW = colW - 6;
    if(font.widthOfTextAtSize(txt, size) <= maxW) return txt;
    while(txt.length > 1 && font.widthOfTextAtSize(txt + '…', size) > maxW){ txt = txt.slice(0, -1); }
    return txt + '…';
  }
  /* La désignation passe sur deux lignes plutôt que d'être coupée net. */
  function wrapText(txt, colW, size, maxLines){
    let rest = safeText(txt).trim();
    const maxW = colW - 6;
    const lines = [];
    while(rest && lines.length < maxLines){
      if(font.widthOfTextAtSize(rest, size) <= maxW){ lines.push(rest); rest = ''; break; }
      if(lines.length === maxLines - 1){ lines.push(fitText(rest, colW, size)); rest = ''; break; }
      let cut = rest.length;
      while(cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxW){ cut--; }
      let brk = rest.lastIndexOf(' ', cut);
      if(brk <= 0) brk = cut;
      lines.push(rest.slice(0, brk).trim());
      rest = rest.slice(brk).trim();
    }
    return lines.length ? lines : [''];
  }
  function drawSheet(l){
    sheetTitle = l.titre;
    sheetPages = [];
    newPage();
    let groupeCourant = null;
    l.liste.forEach(it=>{
      const groupe = libelleGroupeImpression(it, l.groupBy);
      if(groupe !== groupeCourant){
        groupeCourant = groupe;
        ensureSpace(TYPE_ROW_H);
        page.drawRectangle({ x: MARGIN_X, y: y-TYPE_ROW_H, width: CONTENT_W, height: TYPE_ROW_H, color: rgb(0.93,0.93,0.93) });
        page.drawText(safeText(groupe), { x: MARGIN_X+3, y: y-TYPE_ROW_H+4, size: 8.5, font: bold, color: rgb(0.04,0.31,0.31) });
        y -= TYPE_ROW_H;
      }
      const hsRow = isHorsStock(it);
      const nomCol = COLS.find(c=>c.key==='nom');
      const nomLines = wrapText(nomImprime(it), nomCol.w, 8, 2);
      const rowH = Math.max(ROW_H, nomLines.length * 9.5 + 6);
      ensureSpace(rowH);
      let cx = MARGIN_X;
      const rowTop = y;
      const vals = { ref: referenceSansPrefixe(it.ref), dotation: it.dotation===0 ? '—' : String(it.dotation), commande: String(commandeOf(it)), visa1:'', visa2:'' };
      COLS.forEach(c=>{
        if(c.key === 'nom'){
          nomLines.forEach((ln, li)=>{
            page.drawText(ln, { x: cx+3, y: rowTop - 10.5 - li*9.5, size: 8, font: hsRow ? bold : font,
              color: hsRow ? rgb(0.78, 0.16, 0.16) : rgb(0.1,0.1,0.1) });
          });
        }else{
          page.drawText(fitText(vals[c.key], c.w, 8), { x: cx+3, y: rowTop - 10.5, size: 8, font, color: rgb(0.1,0.1,0.1) });
        }
        cx += c.w;
      });
      drawColLines(rowTop, rowTop - rowH);
      y -= rowH;
    });
    sheetPages.forEach((p, i)=>{
      p.drawText(safeText(`Page ${i+1} / ${sheetPages.length} — ${l.note} — ${l.liste.length} article(s) à commander`),
        { x: MARGIN_X, y: MARGIN_Y-10, size: 7, font, color: rgb(0.4,0.4,0.4) });
    });
  }

  lotsDemandes(lot).forEach(drawSheet);
  if(unsupported.size) console.warn('Caractères non pris en charge par la police du PDF :', Array.from(unsupported).join(' '));
  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

/* ============ Étiquettes : Code 128 (Solutés) ou QR (autres modules) ============ */
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'
];
function code128B(value){
  const texte = codeBarresNormalise(value);
  if(!texte) throw new Error('Référence code-barres manquante.');
  const valeurs = Array.from(texte).map(ch=>{
    const n = ch.charCodeAt(0);
    if(n < 32 || n > 126) throw new Error(`Caractère non compatible Code 128 : ${ch}`);
    return n - 32;
  });
  let somme = 104;
  valeurs.forEach((v,i)=>{ somme += v * (i+1); });
  const codes = [104, ...valeurs, somme % 103, 106];
  const modules = [];
  for(let i=0;i<10;i++) modules.push(false);
  codes.forEach(code=>{
    let barre = true;
    for(const largeur of CODE128_PATTERNS[code]){
      for(let i=0;i<Number(largeur);i++) modules.push(barre);
      barre = !barre;
    }
  });
  for(let i=0;i<10;i++) modules.push(false);
  return modules;
}

function articleEtiquetable(it){ return MODULE.codeBarres ? Boolean(it.codeBarres) : Boolean(String(it.ref || '').trim()); }

async function generateLabelsPdfBlob(list, labelFormat){
  if(typeof chargerVendor === 'function') await chargerVendor('pdflib');
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const MM = 2.8346456693;
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const selectedFormat = labelFormat || window.CommandesLabelFormats.current();
  const { COLS, ROWS, MARGIN_X, MARGIN_Y, CELL_W, CELL_H, GAP_X, GAP_Y } =
    window.CommandesLabelFormats.geometry(selectedFormat, MM);
  const PAD = 2.5*MM;
  const nettoyer = t => nettoyerWinAnsi(t);
  const tronquer = (txt, taille, largeur, police) => {
    let t = nettoyer(txt);
    while(t.length > 1 && (police || font).widthOfTextAtSize(t, taille) > largeur) t = t.slice(0, -1);
    return t;
  };
  const envelopper = (txt, taille, largeur, police) => {
    const mots = nettoyer(txt).split(/\s+/).filter(Boolean);
    const lignes = [];
    let courante = '';
    mots.forEach(mot=>{
      const essai = courante ? courante + ' ' + mot : mot;
      if(police.widthOfTextAtSize(essai, taille) <= largeur){ courante = essai; return; }
      if(courante){ lignes.push(courante); courante = ''; }
      let reste = mot;
      while(police.widthOfTextAtSize(reste, taille) > largeur && reste.length > 1){
        let n = reste.length;
        while(n > 1 && police.widthOfTextAtSize(reste.slice(0,n), taille) > largeur) n--;
        lignes.push(reste.slice(0,n));
        reste = reste.slice(n);
      }
      courante = reste;
    });
    if(courante) lignes.push(courante);
    return lignes;
  };

  function dessinerCodeBarres(page, it, x0, yTop){
    const BAR_W = CELL_W - 2*PAD;
    const BAR_H = 10*MM;
    const modules = code128B(it.codeBarres);
    const moduleW = BAR_W / modules.length;
    const barX = x0 + PAD;
    const barY = yTop - PAD - BAR_H;
    let debut = -1;
    modules.forEach((noir, i)=>{
      if(noir && debut < 0) debut = i;
      if((!noir || i === modules.length-1) && debut >= 0){
        const fin = noir && i === modules.length-1 ? i+1 : i;
        page.drawRectangle({ x: barX + debut*moduleW, y: barY, width: (fin-debut)*moduleW, height: BAR_H, color: rgb(0,0,0) });
        debut = -1;
      }
    });
    const codeLisible = nettoyer(it.codeBarres);
    const codeLargeur = font.widthOfTextAtSize(codeLisible, 8);
    page.drawText(tronquer(codeLisible, 8, BAR_W, bold), { x: x0 + (CELL_W - Math.min(codeLargeur, BAR_W))/2, y: barY - 9, size: 8, font: bold, color: rgb(0,0,0) });
    page.drawText(tronquer(it.denom || it.nom, 6.5, BAR_W, bold), { x: x0 + PAD, y: barY - 18, size: 6.5, font: bold, color: rgb(.1,.1,.1) });
    page.drawText(tronquer('Réf. commande : ' + referenceSansPrefixe(it.ref), 5.5, BAR_W), { x: x0 + PAD, y: barY - 25, size: 5.5, font, color: rgb(.4,.4,.4) });
  }

  function dessinerQr(page, it, x0, yTop){
    const QR_SIDE = Math.min(CELL_H - 2*PAD, 18*MM);
    const qrX = x0 + PAD;
    const tx = qrX + QR_SIDE + 2.5*MM;
    const largeurTexte = CELL_W - (tx - x0) - PAD;
    const dispoH = CELL_H - 2*PAD;
    const memeTexte = nettoyer(it.nom).trim().toLowerCase() === nettoyer(it.denom).trim().toLowerCase();
    const lignesNom = (!it.nom || memeTexte) ? [] : envelopper(it.nom, 6, largeurTexte, font).slice(0, 3);
    const hauteurNom = lignesNom.length ? lignesNom.length * 7 + 2 : 0;
    let taille = 7, interligne = 8;
    let lignes = envelopper(it.denom || it.nom, taille, largeurTexte, bold);
    let maxLignes = Math.floor((dispoH - 11 - hauteurNom) / interligne);
    if(lignes.length > maxLignes){
      taille = 6; interligne = 7;
      lignes = envelopper(it.denom || it.nom, taille, largeurTexte, bold);
      maxLignes = Math.floor((dispoH - 11 - hauteurNom) / interligne);
    }
    lignes = lignes.slice(0, Math.max(maxLignes, 1));
    const hauteurTexte = 11 + lignes.length * interligne + hauteurNom;
    const qrY = yTop - (CELL_H - QR_SIDE)/2 - QR_SIDE;
    let ty = yTop - (CELL_H - hauteurTexte)/2 - 8;
    const matrice = QR.encode(String(it.ref));
    const n = matrice.length;
    const module = QR_SIDE / n;
    for(let r=0;r<n;r++){
      for(let c=0;c<n;c++){
        if(!matrice[r][c]) continue;
        page.drawRectangle({ x: qrX + c*module, y: qrY + (n-1-r)*module, width: module, height: module, color: rgb(0,0,0) });
      }
    }
    page.drawText(tronquer(it.ref, 11, largeurTexte, bold), { x: tx, y: ty, size: 11, font: bold, color: rgb(0,0,0) });
    ty -= 11;
    lignes.forEach(ligne=>{
      page.drawText(ligne, { x: tx, y: ty, size: taille, font: bold, color: rgb(.1,.1,.1) });
      ty -= interligne;
    });
    ty -= 2;
    lignesNom.forEach(ligne=>{
      page.drawText(ligne, { x: tx, y: ty, size: 6, font, color: rgb(.45,.45,.45) });
      ty -= 7;
    });
  }

  let page = null;
  list.forEach((it, index)=>{
    const posDansPage = index % (COLS*ROWS);
    if(posDansPage === 0) page = doc.addPage([PAGE_W, PAGE_H]);
    const col = posDansPage % COLS;
    const row = Math.floor(posDansPage / COLS);
    const x0 = MARGIN_X + col*(CELL_W + GAP_X);
    const yTop = PAGE_H - MARGIN_Y - row*(CELL_H + GAP_Y);
    if(MODULE.codeBarres) dessinerCodeBarres(page, it, x0, yTop);
    else dessinerQr(page, it, x0, yTop);
  });
  const bytes = await doc.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

/* ============ Historique des commandes ============
   Chaque impression terminée ajoute une entrée : date, auteur, articles
   commandés avec stock compté et quantité. L'historique est conservé sur le
   poste (100 dernières commandes par module) et publié avec les données du
   poste dans C:\commandes, ce qui le rend commun aux comptes Windows. */
const HISTORIQUE_MAX = 100;
const CLE_HISTORIQUE = window.CommandesModules.cleHistorique(CSV_MODULE);

function fusionnerHistoriques(...sources){
  const parId = new Map();
  sources.forEach(liste=>{
    (Array.isArray(liste) ? liste : []).forEach(entree=>{
      if(entree && entree.id && Array.isArray(entree.lignes)) parId.set(entree.id, entree);
    });
  });
  return [...parId.values()].sort((a,b)=> String(b.date).localeCompare(String(a.date))).slice(0, HISTORIQUE_MAX);
}

let historiqueMemoire = fusionnerHistoriques(lireJsonLocal(CLE_HISTORIQUE, []), DONNEES_POSTE && DONNEES_POSTE.historique);
ecrireJsonLocal(CLE_HISTORIQUE, historiqueMemoire);

function historiqueCommandes(){ return historiqueMemoire.slice(); }

function enregistrerCommandeHistorique(){
  const lignes = items.filter(it=>commandeOf(it) > 0).sort(trierImpression).map(it=>({
    ref: referenceSansPrefixe(it.ref),
    uid: it.uid,
    denom: it.denom,
    nom: it.nom,
    loc: it.loc,
    horsStock: isHorsStock(it),
    dotation: it.dotation,
    stock: it.dotation === 0 ? null : quantiteEntiere(it.inventaire, null),
    commande: commandeOf(it)
  }));
  const date = new Date().toISOString();
  const c = compteurs();
  const entree = { id: date + '-' + Math.random().toString(36).slice(2, 7), date, signature: signatureEl.value.trim(), comptes: c.comptes, total: c.total, lignes };
  historiqueMemoire = fusionnerHistoriques([entree], historiqueMemoire);
  ecrireJsonLocal(CLE_HISTORIQUE, historiqueMemoire);
  const resume = lireJsonLocal(window.CommandesModules.cleResume(CSV_MODULE), {}) || {};
  resume.derniereCommande = { date, signature: entree.signature, lignes: lignes.length };
  ecrireJsonLocal(window.CommandesModules.cleResume(CSV_MODULE), resume);
  planifierPublicationPoste(1500);
  return entree;
}

/* ============ Récapitulatif avant impression ============ */
function recapitulatifImpressionHtml(){
  const { normal, horsStock } = buildPrintGroups();
  const nonComptes = articlesDuParcours().filter(it=>!isCounted(it) && aUneDotation(it));
  const anomalies = items.filter(it=>anomalieDe(it));
  let html = `<p><b>${normal.length + horsStock.length}</b> article(s) à commander`
    + (horsStock.length ? ` dont <b>${horsStock.length}</b> Hors Stock` : '') + '.</p>';
  if(nonComptes.length){
    html += `<p class="recap-alerte">⚠ <b>${nonComptes.length}</b> article(s) avec dotation ne sont pas comptés : ils ne seront pas commandés.`
      + ` <button type="button" class="link-btn" data-recap="aCompter">Voir la liste</button></p>`;
  }
  if(anomalies.length){
    html += `<div class="recap-alerte">⚠ <b>${anomalies.length}</b> quantité(s) inhabituelle(s) à vérifier :<ul>`
      + anomalies.slice(0, 6).map(it=>`<li>${escapeHtml(nomAffiche(it.denom))} — ${escapeHtml(anomalieDe(it))}</li>`).join('')
      + (anomalies.length > 6 ? `<li>… et ${anomalies.length - 6} autre(s)</li>` : '') + '</ul></div>';
  }
  if(MODULE.impressionEnDeuxLots){
    html += normal.length && horsStock.length
      ? '<p>Deux validations d’impression seront demandées : <b>1/2</b> dispositifs médicaux, puis <b>2/2</b> Hors stock. Les deux travaux restent séparés et ne doivent pas être solidarisés.</p>'
      : '<p>Une seule fenêtre d’impression s’ouvrira : un seul des deux groupes contient des articles.</p>';
  }else{
    html += `<p>${MODULE.regroupementImpression === 'localisation' ? 'La liste sera classée par localisation.' : 'La liste sera triée par type (ordre du classeur d’origine).'}</p>`;
  }
  html += '<p>Une fois l’impression terminée, la commande est ajoutée à l’historique et <b>les compteurs sont remis à zéro</b>.</p>';
  return html;
}

/* ============ Impression : séquence et clôture du cycle ============ */
const TITRE_PAGE_AVANT_IMPRESSION = document.title;
let cycleImpression = null;
let sequenceImpressionEnCours = false;
let lotsImpression = [];
let indexLotImpression = -1;
let lotImpressionActif = null;

function lotsImpressionDisponibles(){
  const { normal, horsStock } = buildPrintGroups();
  if(!MODULE.impressionEnDeuxLots) return normal.length || horsStock.length ? [{ cle:'tous', titre: MODULE.titreImpression }] : [];
  const lots = [];
  if(normal.length) lots.push({ cle:'dispositifs', titre:'Commande — dispositifs médicaux' });
  if(horsStock.length) lots.push({ cle:'hors-stock', titre:'Commande — Hors stock' });
  return lots;
}
function restaurerContexteImpression(){
  document.title = TITRE_PAGE_AVANT_IMPRESSION;
  delete window.__printJobTitle;
  lotsImpression = [];
  indexLotImpression = -1;
  lotImpressionActif = null;
  sequenceImpressionEnCours = false;
}
function demarrerSequenceImpression(){
  if(sequenceImpressionEnCours) return;
  lotsImpression = lotsImpressionDisponibles();
  if(!lotsImpression.length) return;
  sequenceImpressionEnCours = true;
  indexLotImpression = -1;
  lancerLotImpressionSuivant();
}
function lancerLotImpressionSuivant(){
  indexLotImpression += 1;
  lotImpressionActif = lotsImpression[indexLotImpression] || null;
  if(!lotImpressionActif) return;
  renderPrintTable(lotImpressionActif.cle);
  if(MODULE.impressionEnDeuxLots){
    document.title = lotImpressionActif.titre;
    window.__printJobTitle = lotImpressionActif.titre;
  }
  setTimeout(lancerImpression, 80);
}
function lancerImpression(){
  if(!sequenceImpressionEnCours || !lotImpressionActif) return;
  if(cycleImpression !== null && cycleImpression !== 'android') clearTimeout(cycleImpression);
  cycleImpression = window.__androidPrintManaged ? 'android' : setTimeout(cloreCycleImpression, 60000);
  window.print();
}
function cloreCycleImpression(){
  if(cycleImpression === null || !sequenceImpressionEnCours) return;
  if(cycleImpression !== 'android') clearTimeout(cycleImpression);
  cycleImpression = null;
  const suivant = lotsImpression[indexLotImpression + 1];
  if(suivant){
    toast(`Impression « ${lotImpressionActif.titre} » terminée. Ouverture du travail « ${suivant.titre} »…`);
    setTimeout(lancerLotImpressionSuivant, 650);
    return;
  }
  const nombreLots = lotsImpression.length;
  restaurerContexteImpression();
  retenirSignataire(signatureEl.value);
  enregistrerCommandeHistorique();
  remettreAZero();
  toast(nombreLots > 1
    ? 'Les deux commandes ont été imprimées séparément et ajoutées à l’historique. Les compteurs sont remis à zéro.'
    : 'Commande imprimée et ajoutée à l’historique. Les compteurs sont remis à zéro.');
  if(MODULE.rappelApresImpression) ouvrirRappelPostImpression();
}
window.addEventListener('afterprint', ()=>{
  if(!window.__androidPrintManaged) cloreCycleImpression();
});
window.addEventListener('androidprintfinished', cloreCycleImpression);
window.addEventListener('androidprintcancelled', ()=>{
  if(cycleImpression !== 'android') return;
  cycleImpression = null;
  const titre = lotImpressionActif ? lotImpressionActif.titre : 'Commande';
  restaurerContexteImpression();
  toast(`Impression « ${titre} » annulée : les compteurs sont conservés.`);
});
/* Ctrl+P direct : on compose la feuille pour ne pas sortir une page
   blanche, sans toucher aux compteurs. Avec deux lots, le raccourci est
   redirigé vers le bouton qui sépare les deux travaux. */
window.addEventListener('keydown', event=>{
  if(!MODULE.impressionEnDeuxLots) return;
  if((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'p' && !sequenceImpressionEnCours){
    event.preventDefault();
    toast('Utilisez le bouton Imprimer pour lancer séparément dispositifs médicaux puis Hors stock.');
    document.getElementById('btnPrint').focus();
  }
}, true);
window.addEventListener('beforeprint', ()=>{
  if(sequenceImpressionEnCours || cycleImpression !== null) return;
  if(document.body.classList.contains('commandes-printing-labels')) return;
  if(MODULE.impressionEnDeuxLots){
    const { normal } = buildPrintGroups();
    renderPrintTable(normal.length ? 'dispositifs' : 'hors-stock');
  }else renderPrintTable();
});

/* ---------- rappel après impression (Matériel) ---------- */
let postPrintFermeture = false;
async function demanderFermeturePostImpression(){
  if(postPrintFermeture) return;
  postPrintFermeture = true;
  const bouton = document.getElementById('postPrintClose');
  bouton.disabled = true;
  document.getElementById('postPrintNote').textContent = 'Sauvegardes programmées en cours — fermeture de l’application ensuite…';
  try{
    if(!window.CommandesApplication || typeof window.CommandesApplication.close !== 'function'){
      throw new Error('La fermeture sécurisée de l’application est indisponible.');
    }
    const ok = await window.CommandesApplication.close('post-print');
    if(ok === false) throw new Error('La fermeture a été interrompue pour protéger la sauvegarde.');
    /* Edge peut ignorer window.close() : on libère alors la fenêtre. */
    setTimeout(()=>{
      const dlg = document.getElementById('postPrintDlg');
      if(dlg.open) dlg.close();
      postPrintFermeture = false;
      bouton.disabled = false;
      toast('Sauvegarde terminée. Si la fenêtre reste ouverte, fermez-la avec la croix Windows.');
    }, 500);
  }catch(err){
    console.error('Fermeture sécurisée impossible :', err);
    postPrintFermeture = false;
    bouton.disabled = false;
    document.getElementById('postPrintNote').textContent = 'Fermeture annulée : la sauvegarde n’a pas pu être confirmée. Corrigez le problème puis réessayez.';
  }
}
function ouvrirRappelPostImpression(){
  const dlg = document.getElementById('postPrintDlg');
  if(!dlg) return;
  postPrintFermeture = false;
  document.getElementById('postPrintClose').disabled = false;
  document.getElementById('postPrintNote').textContent = 'La fermeture attend la fin des sauvegardes programmées.';
  if(!dlg.open) dlg.showModal();
  document.getElementById('postPrintClose').focus();
}
if(MODULE.rappelApresImpression){
  document.getElementById('postPrintClose').addEventListener('click', demanderFermeturePostImpression);
  document.getElementById('postPrintStay').addEventListener('click', ()=> document.getElementById('postPrintDlg').close());
  document.getElementById('postPrintDlg').addEventListener('cancel', e=>{ if(postPrintFermeture) e.preventDefault(); });
}

/* ---------- bouton Imprimer ---------- */
async function archiverPdfCommande(blob){
  const filename = `${MODULE.racineFichiers}_${horodatage()}.pdf`;
  if((window.WindowsStorage && window.WindowsStorage.hash) || window.__androidAutoFolder){
    const result = await saveFile('PDF', filename, blob);
    return result.path;
  }
  if(!destDirHandle) return null;
  return await writeToDest('PDF', filename, blob);
}

document.getElementById('btnPrint').addEventListener('click', async ()=>{
  if(sequenceImpressionEnCours){
    toast('La séquence d’impression en cours doit être terminée ou annulée.');
    return;
  }
  if(!signatureEl.value.trim()){
    toast('Merci de renseigner « Rempli par » avant l\'impression.');
    majSignatureRequise();
    signatureEl.focus();
    return;
  }
  if(buildPrintOrder().length === 0){
    toast('Aucun article à commander pour le moment.');
    return;
  }
  const ok = await confirmDialog('Imprimer la commande', recapitulatifImpressionHtml(), 'Imprimer', { html: true });
  if(!ok) return;

  // archivage préalable : une panne d'imprimante ne doit pas faire perdre la trace
  const btn = document.getElementById('btnPrint');
  btn.disabled = true;
  try{
    await attendreAffichage();
    const pdf = await generatePdfBlob();
    await secoursCommande.save(CSV_MODULE, pdf);
    if((window.WindowsStorage && window.WindowsStorage.hash) || destDirHandle || window.__androidAutoFolder){
      try{ await archiverPdfCommande(pdf); }
      catch(err){ console.error(err); toast('Archivage externe impossible ; le PDF reste disponible dans Édition de secours.'); }
    }
  }catch(err){
    console.error(err);
    toast('Copie de secours impossible : impression suspendue, comptage conservé. Vérifiez le stockage puis réessayez.');
    return;
  }finally{ btn.disabled = false; }

  setTimeout(demarrerSequenceImpression, 80);
});

/* ---------- Édition de secours ---------- */
document.getElementById('btnEditionSecours').addEventListener('click', async ()=>{
  const button = document.getElementById('btnEditionSecours');
  if(window.WindowsStorage && window.WindowsStorage.hash){
    /* La fenêtre est réservée dans le clic, avant toute lecture asynchrone :
       Edge pourrait sinon l'ouvrir en arrière-plan. */
    const pdfWindow = window.open('about:blank', `Commande_${CSV_MODULE}_EditionSecours`, 'popup=yes,resizable=yes,scrollbars=yes,width=1100,height=850');
    if(!pdfWindow){ toast('Autorisez les fenêtres de cette application pour afficher le PDF de secours.'); return; }
    pdfWindow.document.title = `Édition de secours — ${MODULE.court}`;
    pdfWindow.document.body.textContent = 'Ouverture du PDF de secours…';
    pdfWindow.focus();
    button.disabled = true;
    try{
      const saved = await secoursCommande.read(CSV_MODULE);
      if(!saved || !saved.blob){
        pdfWindow.close();
        await window.WindowsStorage.openLastPdf();
        toast('Ancien PDF ouvert par Windows.');
        return;
      }
      const url = URL.createObjectURL(saved.blob);
      pdfWindow.location.replace(url);
      pdfWindow.focus();
      setTimeout(()=>{ try{ if(!pdfWindow.closed) pdfWindow.focus(); }catch(error){} }, 250);
      const cleanup = setInterval(()=>{ if(pdfWindow.closed){ clearInterval(cleanup); URL.revokeObjectURL(url); } }, 1000);
    }catch(e){
      try{ pdfWindow.close(); }catch(error){}
      toast(e.message || 'Impossible d’ouvrir le dernier PDF.');
    }finally{ button.disabled = false; }
    return;
  }
  button.disabled = true;
  try{
    const saved = await secoursCommande.read(CSV_MODULE);
    if(!saved){ toast('Aucun PDF de secours pour ce module. Une copie sera créée à la prochaine impression.'); return; }
    await downloadBlob(saved.blob, saved.filename);
    toast('PDF de la commande du ' + new Date(saved.date).toLocaleString('fr-FR') + ' récupéré.');
  }catch(err){
    console.error(err);
    toast('Lecture du PDF de secours impossible. Vérifiez le stockage de cet appareil.');
  }finally{ button.disabled = false; }
});
