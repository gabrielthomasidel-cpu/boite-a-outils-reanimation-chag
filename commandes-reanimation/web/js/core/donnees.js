/* ============================================================
   Données : références, quantités, formats d'échange et catalogue
   ============================================================
   Code commun aux trois modules. La configuration du module courant est
   disponible dans MODULE (voir js/modules.js et js/app-shell.js).
   ============================================================ */

const CSV_MODULE = MODULE.id;
const CSV_SEPARATOR = ';';
const CSV_VERSION = '1';
const CSV_MIME = 'text/csv;charset=utf-8';

/* ============ Références et quantités ============ */
/* La référence de commande du module Solutés est préfixée dans la base pour ne
   pas se confondre avec celle d'une autre application. Le préfixe est retiré
   des documents de commande. Les autres modules n'ont pas de préfixe. */
const PREFIXE_REFERENCE = MODULE.prefixeReference || '';
function referenceSansPrefixe(value){
  const ref = String(value == null ? '' : value).trim();
  if(!PREFIXE_REFERENCE) return ref;
  return ref.toLowerCase().startsWith(PREFIXE_REFERENCE) ? ref.slice(PREFIXE_REFERENCE.length) : ref;
}
function referenceInterne(value){
  const brute = referenceSansPrefixe(value);
  if(!PREFIXE_REFERENCE) return brute;
  return brute ? PREFIXE_REFERENCE + brute : '';
}
function codeBarresNormalise(value){
  return String(value == null ? '' : value).trim();
}
function cleReference(value){
  return String(value === null || value === undefined ? '' : value).trim().toLocaleLowerCase('fr');
}

/* Une douchette configurée en clavier français peut être interprétée comme un
   clavier américain : les chiffres deviennent alors !, $, &, etc. La référence
   brute reste prioritaire ; cette traduction ne sert que de repli. */
const DOUCHETTE_FR_SUR_CLAVIER_US = Object.freeze({
  '!':'1', '"':'2', '/':'3', '$':'4', '%':'5', '?':'6',
  '&':'7', '*':'8', '(':'9', ')':'0',
  '@':'2', '#':'3', '^':'6',
  'q':'a', 'Q':'A', 'a':'q', 'A':'Q',
  'w':'z', 'W':'Z', 'z':'w', 'Z':'W', ';':'m', ':':'M'
});
function corrigerSaisieDouchette(value){
  const traduit = Array.from(String(value == null ? '' : value), ch=>
    Object.prototype.hasOwnProperty.call(DOUCHETTE_FR_SUR_CLAVIER_US, ch)
      ? DOUCHETTE_FR_SUR_CLAVIER_US[ch] : ch
  ).join('');
  return traduit.replace(/[\s\u200B-\u200D\u2060\uFEFF]+/g, '');
}

/* Toutes les quantités sont des unités entières, bornées : une saisie
   décimale, infinie ou aberrante ne doit jamais produire de commande. */
const QUANTITE_MAX = 9999;
function quantiteEntiere(value, valeurVide = null){
  if(value === null || value === undefined || value === '') return valeurVide;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(QUANTITE_MAX, Math.max(0, Math.round(n))) : valeurVide;
}

/* Identifiant stable par article. Plusieurs articles peuvent partager une
   référence encore inconnue (« ?????? ») : la dénomination sert alors de
   discriminant. */
function assignUids(list){
  const refCount = new Map();
  list.forEach(it=>{
    const r = String(it.ref||'').trim() || '?';
    refCount.set(r, (refCount.get(r)||0) + 1);
  });
  const used = new Set();
  list.forEach((it, idx)=>{
    const r = String(it.ref||'').trim() || '?';
    let uid = refCount.get(r) > 1 ? r + '#' + (String(it.denom||'').trim() || idx) : r;
    if(used.has(uid)) uid = uid + '#' + idx;
    used.add(uid);
    it.uid = uid;
  });
  return list;
}

function isPlaceholderRef(r){
  const brute = referenceSansPrefixe(r);
  return !brute || /^[?\-–—.0\s]+$/.test(brute);
}

function escapeHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });
const cmp = (a,b) => collator.compare(String(a == null ? '' : a), String(b == null ? '' : b));

/* Recherche identique quels que soient casse et accents. */
function normaliserRecherche(value){
  const texte = String(value === null || value === undefined ? '' : value);
  const normalise = texte.normalize ? texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : texte;
  return normalise.toLocaleLowerCase('fr').trim();
}

/* Horodatage AAAAMMJJ_hhmmss, à l'heure du poste. */
function horodatage(d){
  const t = d || new Date();
  const nn = n => String(n).padStart(2, '0');
  return `${t.getFullYear()}${nn(t.getMonth()+1)}${nn(t.getDate())}`
       + `_${nn(t.getHours())}${nn(t.getMinutes())}${nn(t.getSeconds())}`;
}

/* ============ Normalisation d'un article de catalogue ============ */
function articleNormalise(c, idx){
  const article = {
    ...c,
    ref: referenceInterne(c.ref),
    id: idx,
    nom: String(c.nom||'').trim(),
    denom: String(c.denom||'').trim(),
    loc: String(c.loc||'').trim(),
    type: MODULE.type ? String(c.type||'').trim() : '',
    dotation: quantiteEntiere(c.dotation, 0),
    seuil: quantiteEntiere(c.seuil, null),
    qteCommande: quantiteEntiere(c.qteCommande, null),
    inventaire: null,
    commandeLibre: null
  };
  if(MODULE.codeBarres) article.codeBarres = codeBarresNormalise(c.codeBarres);
  else delete article.codeBarres;
  if(MODULE.laboratoire) article.laboratoire = String(c.laboratoire || '').trim();
  return article;
}

/* ============ Stockage local ============ */
function stockageLocal(){
  try{
    const sonde = '__sonde__';
    window.localStorage.setItem(sonde, '1');
    window.localStorage.removeItem(sonde);
    return window.localStorage;
  }catch(err){
    return null; // stockage refusé : l'application fonctionne en mémoire
  }
}
const localStore = stockageLocal();

function lireJsonLocal(cle, defaut){
  if(!localStore) return defaut;
  try{
    const brut = localStore.getItem(cle);
    return brut ? JSON.parse(brut) : defaut;
  }catch(err){ return defaut; }
}
function ecrireJsonLocal(cle, valeur){
  if(!localStore) return false;
  try{ localStore.setItem(cle, JSON.stringify(valeur)); return true; }
  catch(err){ console.warn('Écriture locale impossible :', cle, err); return false; }
}

/* ============ Catalogue : livré, local et publié sur le poste ============
   Trois sources possibles :
   - le catalogue livré (catalogues/<module>.js), qui ne change qu'avec une
     nouvelle version de l'installateur ;
   - le catalogue modifié sur ce poste (stockage local du profil Edge) ;
   - le catalogue publié dans C:\commandes\<module>\Application, partagé par
     tous les comptes Windows du poste et relu à chaque ouverture.
   Entre le local et le publié, le plus récent l'emporte. Si une nouvelle
   version apporte un catalogue livré différent, c'est lui qui reprend la
   main ; la version locale est archivée et reste réimportable. */
const CATALOGUE = (window.CommandesCatalogues && window.CommandesCatalogues[CSV_MODULE]) || [];
const DONNEES_POSTE = (window.CommandesDonneesPoste && window.CommandesDonneesPoste[CSV_MODULE]) || null;
const CATALOGUE_KEY = `commande-${CSV_MODULE}:catalogue:v1`;
const CATALOGUE_ARCHIVE_KEY = `commande-${CSV_MODULE}:catalogue:precedent`;
const CHAMPS_HORS_CATALOGUE = ['id', 'uid', 'inventaire', 'commandeLibre'];

/* Empreinte courte et stable du catalogue livré. */
function empreinteCatalogue(liste){
  const texte = JSON.stringify(liste);
  let h = 5381;
  for(let i = 0; i < texte.length; i++) h = ((h * 33) ^ texte.charCodeAt(i)) >>> 0;
  return `${liste.length}-${h.toString(36)}`;
}
const EMPREINTE_LIVREE = empreinteCatalogue(CATALOGUE);

function catalogueSansChampsRuntime(liste){
  return liste.map(article=>{
    const copie = { ...article };
    CHAMPS_HORS_CATALOGUE.forEach(champ=> delete copie[champ]);
    if(!MODULE.type) delete copie.type;
    if(!MODULE.codeBarres) delete copie.codeBarres;
    if(!MODULE.laboratoire) delete copie.laboratoire;
    return copie;
  });
}

function catalogueValide(source){
  return source && Array.isArray(source.articles) && source.articles.length > 0;
}
function dateDe(source){
  const t = Date.parse(source && source.enregistreLe);
  return Number.isFinite(t) ? t : 0;
}

/* Origine du catalogue retenu au démarrage, affichée dans l'administration. */
let origineCatalogue = 'livre';

function catalogueEffectif(){
  const local = lireJsonLocal(CATALOGUE_KEY, null);
  const poste = DONNEES_POSTE && DONNEES_POSTE.catalogue;
  const candidats = [];
  if(catalogueValide(local)){
    if(local.empreinteEmbarquee === EMPREINTE_LIVREE) candidats.push({ source:'local', data:local });
    else{
      ecrireJsonLocal(CATALOGUE_ARCHIVE_KEY, local);
      if(localStore) try{ localStore.removeItem(CATALOGUE_KEY); }catch(err){}
    }
  }
  if(catalogueValide(poste) && poste.empreinteEmbarquee === EMPREINTE_LIVREE){
    candidats.push({ source:'poste', data:poste });
  }
  if(!candidats.length){ origineCatalogue = 'livre'; return CATALOGUE; }
  candidats.sort((a,b)=> dateDe(b.data) - dateDe(a.data));
  const retenu = candidats[0];
  origineCatalogue = retenu.source;
  if(retenu.source === 'poste' && (!local || dateDe(local) !== dateDe(retenu.data))){
    ecrireJsonLocal(CATALOGUE_KEY, retenu.data);
    origineCatalogue = 'poste-repris';
  }
  return retenu.data.articles;
}

function enregistrerCatalogue(){
  const ok = ecrireJsonLocal(CATALOGUE_KEY, {
    version: 1,
    enregistreLe: new Date().toISOString(),
    empreinteEmbarquee: EMPREINTE_LIVREE,
    articles: catalogueSansChampsRuntime(items)
  });
  if(!ok && typeof toast === 'function') toast('Le catalogue n’a pas pu être conservé sur le poste.');
  planifierPublicationPoste();
}

/* ============ Publication des données sur le poste ============
   Écrit C:\commandes\<module>\Application\donnees-<module>.js via le lanceur
   Windows. Le lanceur copie la version précédente dans Archives : les
   publications sont donc regroupées (délai, fermeture du panneau, fin
   d'impression) pour ne pas multiplier les copies. */
let publicationTimer = null;
let publicationEnAttente = false;

function empreinteMotDePassePersonnalisee(){
  const poste = DONNEES_POSTE && DONNEES_POSTE.motDePasse;
  const local = lireJsonLocal(`commande-${CSV_MODULE}:mot-de-passe`, null);
  const choix = [poste, local].filter(v=>v && v.empreinte && v.enregistreLe)
    .sort((a,b)=> Date.parse(b.enregistreLe) - Date.parse(a.enregistreLe));
  return choix[0] || null;
}

function donneesPoste(){
  const local = lireJsonLocal(CATALOGUE_KEY, null);
  return {
    format: 'donnees-poste',
    version: 1,
    module: CSV_MODULE,
    application: window.CommandesModules.VERSION,
    enregistreLe: new Date().toISOString(),
    catalogue: catalogueValide(local) && local.empreinteEmbarquee === EMPREINTE_LIVREE ? local : null,
    motDePasse: empreinteMotDePassePersonnalisee(),
    historique: typeof historiqueCommandes === 'function' ? historiqueCommandes() : [],
    historiqueRemisAZeroLe: typeof dateRemiseAZeroHistorique === 'function' ? dateRemiseAZeroHistorique() : null
  };
}

function scriptDonneesPoste(donnees){
  const json = JSON.stringify(donnees)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return '/* Données Commandes Réanimation publiées sur ce poste — fichier généré, ne pas modifier à la main. */\n'
    + 'window.CommandesDonneesPoste = window.CommandesDonneesPoste || {};\n'
    + `window.CommandesDonneesPoste[${JSON.stringify(CSV_MODULE)}] = ${json};\n`;
}

async function publierDonneesPoste(){
  clearTimeout(publicationTimer);
  publicationTimer = null;
  publicationEnAttente = false;
  if(!window.WindowsStorage || !window.WindowsStorage.hash) return null;
  // Android : rien n'est publié tant que le dossier de l'appareil n'est pas choisi.
  if(window.WindowsStorage.android && !window.WindowsStorage.dossier()) return null;
  const blob = new Blob([scriptDonneesPoste(donneesPoste())], { type:'text/javascript' });
  const resultat = await window.WindowsStorage.save('Application', window.CommandesModules.fichierPoste(CSV_MODULE), blob);
  return resultat && resultat.path;
}

function planifierPublicationPoste(delai){
  publicationEnAttente = true;
  clearTimeout(publicationTimer);
  publicationTimer = setTimeout(()=>{
    publierDonneesPoste().catch(err=> console.warn('Publication sur le poste impossible :', err));
  }, delai == null ? 20000 : delai);
}

async function publierSiEnAttente(){
  if(!publicationEnAttente) return true;
  try{ await publierDonneesPoste(); }
  catch(err){ console.warn('Publication sur le poste impossible :', err); }
  return true;
}

if(window.CommandesCloseGuard) window.CommandesCloseGuard.registerSave(publierSiEnAttente);

/* ============ Formats portables : JSON (par défaut), CSV et XLSX ============ */
function csvCell(value){
  const text = value === null || value === undefined ? '' : String(value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function csvDocument(headers, rows){
  const lines = [headers.map(csvCell).join(CSV_SEPARATOR)];
  rows.forEach(row=> lines.push(headers.map(header=>csvCell(row[header])).join(CSV_SEPARATOR)));
  /* BOM UTF-8 + indication du séparateur : Excel français ouvre directement
     le fichier en colonnes et conserve les accents. */
  return '\uFEFFsep=' + CSV_SEPARATOR + '\r\n' + lines.join('\r\n') + '\r\n';
}

function csvHeaderKey(value){
  return String(value || '').trim().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function csvSeparatorFor(text){
  const firstLine = String(text || '').split(/\r?\n/, 1)[0];
  let best = ';', bestCount = -1;
  [';', ',', '\t'].forEach(separator=>{
    let quoted = false, count = 0;
    for(let i=0;i<firstLine.length;i++){
      const char = firstLine[i];
      if(char === '"'){
        if(quoted && firstLine[i+1] === '"') i++;
        else quoted = !quoted;
      }else if(!quoted && char === separator){
        count++;
      }
    }
    if(count > bestCount){ best = separator; bestCount = count; }
  });
  return best;
}

function parseCsvDocument(source){
  let text = String(source || '').replace(/^\uFEFF/, '');
  let separator;
  const sepLine = text.match(/^sep=([;,\t])\r?\n/i);
  if(sepLine){ separator = sepLine[1]; text = text.slice(sepLine[0].length); }
  else separator = csvSeparatorFor(text);

  const matrix = [];
  let row = [], cell = '', quoted = false;
  for(let i=0;i<text.length;i++){
    const char = text[i];
    if(quoted){
      if(char === '"'){
        if(text[i+1] === '"'){ cell += '"'; i++; }
        else quoted = false;
      }else cell += char;
    }else if(char === '"') quoted = true;
    else if(char === separator){ row.push(cell); cell = ''; }
    else if(char === '\n'){
      row.push(cell); cell = '';
      if(row.some(value=>String(value).trim() !== '')) matrix.push(row);
      row = [];
    }else if(char !== '\r') cell += char;
  }
  if(quoted) throw new Error('guillemet non fermé');
  if(cell !== '' || row.length){
    row.push(cell);
    if(row.some(value=>String(value).trim() !== '')) matrix.push(row);
  }
  return tableFromMatrix(matrix);
}

function tableFromMatrix(matrix){
  const rows = (Array.isArray(matrix) ? matrix : [])
    .filter(row=>Array.isArray(row) && row.some(value=>String(value == null ? '' : value).trim() !== ''));
  if(rows.length < 2) throw new Error('le fichier ne contient aucune donnée');
  const headers = rows.shift().map(csvHeaderKey);
  if(headers.some(header=>!header)) throw new Error('un nom de colonne est vide');
  if(new Set(headers).size !== headers.length) throw new Error('des colonnes portent le même nom');
  return {
    headers,
    rows: rows.map(cells=>{
      const result = {};
      headers.forEach((header,index)=>{
        const value = cells[index];
        result[header] = value === undefined || value === null ? '' : String(value);
      });
      return result;
    })
  };
}

function csvQuantity(value, fallback, label){
  const text = String(value === null || value === undefined ? '' : value).trim();
  if(!text) return fallback;
  const number = Number(text.replace(/\s/g, '').replace(',', '.'));
  if(!Number.isFinite(number) || number < 0) throw new Error(`${label} invalide : « ${text} »`);
  return Math.min(QUANTITE_MAX, Math.round(number));
}

const DATA_VERSION = CSV_VERSION;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DATA_FORMATS = Object.freeze({
  json: {
    label: 'JSON', extension: 'json', mime: 'application/json;charset=utf-8',
    accept: '.json,application/json',
    help: 'JSON est sélectionné par défaut et conserve toutes les informations nécessaires à la restauration.'
  },
  csv: {
    label: 'CSV', extension: 'csv', mime: CSV_MIME,
    accept: '.csv,text/csv',
    help: 'CSV est un tableau texte universel, pratique pour échanger avec de nombreux logiciels.'
  },
  xlsx: {
    label: 'XLSX', extension: 'xlsx', mime: XLSX_MIME,
    accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    help: 'XLSX s’ouvre directement dans Excel ou LibreOffice et conserve les références avec leurs zéros initiaux.'
  }
});

const PORTABLE_MODULE_CONFIG = Object.freeze({
  catalogStem: MODULE.racineCatalogue
});

const CATALOG_HEADERS = Object.freeze([
  'format', 'version', 'module', 'exporte_le', 'reference', 'code_barres',
  'nom', 'denomination', 'localisation', ...(MODULE.type ? ['type'] : []), 'laboratoire', 'dotation',
  'seuil', 'quantite_commande'
]);

function dataFormatInfo(format){
  return DATA_FORMATS[format] || DATA_FORMATS.json;
}
function formatLabel(format){
  return dataFormatInfo(format).label;
}

function readDataFile(file, format){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(reader.error || new Error('fichier illisible'));
    if(format === 'xlsx') reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  });
}

function ensureXlsxLibrary(){
  if(typeof XLSX === 'undefined' || !XLSX.utils){
    throw new Error('le composant XLSX embarqué n’est pas disponible');
  }
}

function xlsxDocument(headers, rows, sheetName){
  ensureXlsxLibrary();
  const matrix = [headers, ...rows.map(row=>headers.map(header=>row[header] == null ? '' : row[header]))];
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const textColumns = new Set(['uid', 'reference', 'code_barres']);
  headers.forEach((header, column)=>{
    if(!textColumns.has(header)) return;
    for(let row=1; row<matrix.length; row++){
      const address = XLSX.utils.encode_cell({r:row, c:column});
      const cell = sheet[address];
      if(!cell) continue;
      cell.t = 's';
      cell.v = String(cell.v == null ? '' : cell.v);
      cell.z = '@';
    }
  });
  sheet['!cols'] = headers.map(header=>({
    wch: Math.min(42, Math.max(11, header.length + 2,
      ...rows.slice(0, 80).map(row=>String(row[header] == null ? '' : row[header]).length + 1)))
  }));
  if(sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: sheetName,
    Subject: 'Commandes Réanimation — export portable',
    Author: 'Commandes Réanimation',
    CreatedDate: new Date()
  };
  XLSX.utils.book_append_sheet(workbook, sheet, String(sheetName || 'Données').slice(0, 31));
  return XLSX.write(workbook, { bookType:'xlsx', type:'array', compression:true });
}

function parseXlsxDocument(source){
  ensureXlsxLibrary();
  const workbook = XLSX.read(source, { type:'array', cellDates:false, cellText:true });
  if(!workbook.SheetNames || !workbook.SheetNames.length) throw new Error('le classeur ne contient aucune feuille');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false, blankrows:false });
  return tableFromMatrix(matrix);
}

function validatedTableRowsFor(table, expectedFormat, sourceLabel){
  const label = sourceLabel || 'fichier';
  ['format', 'version', 'module'].forEach(header=>{
    if(!table.headers.includes(header)) throw new Error(`colonne « ${header} » absente`);
  });
  const marker = table.rows.find(row=>row.format || row.module) || {};
  if(String(marker.format || '').trim() !== expectedFormat) throw new Error(`type de fichier ${label} incorrect`);
  if(String(marker.module || '').trim() !== CSV_MODULE) throw new Error(`ce ${label} appartient à un autre module`);
  if(String(marker.version || '').trim() !== DATA_VERSION) throw new Error(`version de ${label} non prise en charge`);
  if(table.rows.some(row=>row.format && String(row.format).trim() !== expectedFormat)){
    throw new Error(`le ${label} mélange plusieurs types de données`);
  }
  if(table.rows.some(row=>row.module && String(row.module).trim() !== CSV_MODULE)){
    throw new Error(`le ${label} mélange plusieurs modules`);
  }
  return table;
}

function tabularRowsFor(source, format, expectedFormat){
  if(format === 'csv') return validatedTableRowsFor(parseCsvDocument(source), expectedFormat, 'CSV');
  if(format === 'xlsx') return validatedTableRowsFor(parseXlsxDocument(source), expectedFormat, 'XLSX');
  throw new Error('format tabulaire inconnu');
}

function ownValue(source, names, fallback){
  if(!source || typeof source !== 'object') return fallback;
  for(const name of names){
    if(Object.prototype.hasOwnProperty.call(source, name)) return source[name];
  }
  return fallback;
}

function validateJsonMarker(data, expectedFormat){
  if(!data || typeof data !== 'object' || Array.isArray(data)) return;
  if(data.format != null && String(data.format).trim() !== expectedFormat){
    throw new Error('type de fichier JSON incorrect');
  }
  if(data.module != null && String(data.module).trim() !== CSV_MODULE){
    throw new Error('ce JSON appartient à un autre module');
  }
  if(data.version != null && String(data.version).trim() !== DATA_VERSION){
    throw new Error('version de JSON non prise en charge');
  }
}

function parseJsonText(source){
  try{
    return JSON.parse(String(source || '').replace(/^\uFEFF/, ''));
  }catch(error){
    throw new Error('le fichier JSON est illisible');
  }
}

function catalogRows(exportedAt){
  return items.map(item=>{
    const row = {
      format: 'catalogue', version: DATA_VERSION, module: CSV_MODULE, exporte_le: exportedAt,
      reference: referenceSansPrefixe(item.ref),
      code_barres: MODULE.codeBarres ? codeBarresNormalise(item.codeBarres) : '',
      nom: item.nom || '', denomination: item.denom || '', localisation: item.loc || '',
      laboratoire: MODULE.laboratoire ? String(item.laboratoire || '').trim() : '',
      dotation: item.dotation == null ? 0 : item.dotation,
      seuil: item.seuil == null ? '' : item.seuil,
      quantite_commande: item.qteCommande == null ? '' : item.qteCommande
    };
    if(MODULE.type) row.type = item.type || '';
    return row;
  });
}

function catalogJsonData(exportedAt){
  return {
    format: 'catalogue', version: DATA_VERSION, module: CSV_MODULE, exportedAt,
    items: items.map(item=>{
      const article = {
        ref: referenceSansPrefixe(item.ref),
        codeBarres: MODULE.codeBarres ? codeBarresNormalise(item.codeBarres) : '',
        nom: item.nom || '', denom: item.denom || '', loc: item.loc || '',
        laboratoire: MODULE.laboratoire ? String(item.laboratoire || '').trim() : '',
        dotation: item.dotation == null ? 0 : item.dotation,
        seuil: item.seuil == null ? null : item.seuil,
        qteCommande: item.qteCommande == null ? null : item.qteCommande
      };
      if(MODULE.type) article.type = item.type || '';
      return article;
    })
  };
}

/* Lecture tolérante d'un article importé. Les erreurs bloquantes (valeur non
   numérique) arrêtent l'import ; les incohérences (doublons, champs vides)
   sont signalées par le contrôle du catalogue avant confirmation. */
function catalogItemFromObject(source, index){
  const ref = referenceInterne(ownValue(source, ['reference', 'ref'], ''));
  const nom = String(ownValue(source, ['nom', 'name'], '') || '').trim();
  const denom = String(ownValue(source, ['denomination', 'denom'], nom) || '').trim();
  const item = {
    id: index, ref, nom, denom,
    loc: String(ownValue(source, ['localisation', 'loc'], '') || '').trim(),
    type: MODULE.type ? String(ownValue(source, ['type'], '') || '').trim() : '',
    dotation: csvQuantity(ownValue(source, ['dotation'], 0), 0, `Dotation (ligne ${index + 1})`),
    seuil: csvQuantity(ownValue(source, ['seuil'], null), null, `Seuil (ligne ${index + 1})`),
    qteCommande: csvQuantity(ownValue(source, ['quantite_commande', 'qteCommande'], null), null, `Quantité de commande (ligne ${index + 1})`),
    inventaire: null,
    commandeLibre: null
  };
  if(MODULE.codeBarres) item.codeBarres = codeBarresNormalise(ownValue(source, ['code_barres', 'codeBarres', 'barcode'], ''));
  if(MODULE.laboratoire) item.laboratoire = String(ownValue(source, ['laboratoire'], '') || '').trim();
  return item;
}

function catalogueFromJson(source){
  const data = parseJsonText(source);
  let rawItems;
  if(Array.isArray(data)){
    rawItems = data; // ancien format : tableau direct du catalogue
  }else{
    validateJsonMarker(data, 'catalogue');
    rawItems = data && Array.isArray(data.items) ? data.items
      : (data && Array.isArray(data.catalogue) ? data.catalogue : null);
  }
  if(!rawItems || !rawItems.length) throw new Error('aucun article à importer');
  return rawItems.map(catalogItemFromObject);
}

function catalogueFromTable(table){
  const required = ['reference', 'nom', 'denomination', 'dotation'];
  if(MODULE.codeBarres) required.push('code_barres');
  required.forEach(header=>{
    if(!table.headers.includes(header)) throw new Error(`colonne « ${header} » absente`);
  });
  if(!table.rows.length) throw new Error('aucun article à importer');
  return table.rows.map(catalogItemFromObject);
}

/* ============ Contrôle d'intégrité du catalogue ============
   Renvoie une liste de constats classés par gravité :
   - erreur : empêche un fonctionnement correct (référence vide ou en double,
     code-barres en double, dénomination vide…) ;
   - alerte : réglage probablement incohérent ;
   - info : particularité à connaître. */
function verifierCatalogue(liste){
  const constats = [];
  const ajouter = (niveau, titre, articles, detail)=>{
    if(articles && articles.length) constats.push({ niveau, titre, detail: detail || '', articles });
  };
  const libelle = it => `${it.denom || it.nom || '(sans nom)'} — réf ${referenceSansPrefixe(it.ref) || '∅'}`;
  const doublons = (cleDe, filtre)=>{
    const groupes = new Map();
    liste.forEach(it=>{
      if(filtre && !filtre(it)) return;
      const cle = cleDe(it);
      if(!cle) return;
      if(!groupes.has(cle)) groupes.set(cle, []);
      groupes.get(cle).push(it);
    });
    return [...groupes.values()].filter(g=>g.length > 1);
  };

  ajouter('erreur', 'Référence vide', liste.filter(it=>!referenceSansPrefixe(it.ref)).map(libelle));
  doublons(it=>cleReference(referenceSansPrefixe(it.ref)), it=>!isPlaceholderRef(it.ref)).forEach(groupe=>{
    ajouter('erreur', `Référence ${referenceSansPrefixe(groupe[0].ref)} en double`, groupe.map(libelle),
      'Le scan et la reprise des comptages ne peuvent pas distinguer ces articles.');
  });
  ajouter('erreur', 'Dénomination vide', liste.filter(it=>!String(it.denom||'').trim()).map(libelle));
  if(MODULE.codeBarres){
    ajouter('erreur', 'Code-barres manquant', liste.filter(it=>!codeBarresNormalise(it.codeBarres)).map(libelle),
      'L’article ne peut pas être retrouvé au scan ni recevoir d’étiquette.');
    ajouter('erreur', 'Code-barres avec caractères non standards', liste.filter(it=>{
      const code = codeBarresNormalise(it.codeBarres);
      return code && !/^[\x20-\x7E]+$/.test(code);
    }).map(libelle), 'Le Code 128 n’accepte ni accents ni caractères spéciaux.');
    doublons(it=>codeBarresNormalise(it.codeBarres).toLowerCase()).forEach(groupe=>{
      ajouter('erreur', `Code-barres ${groupe[0].codeBarres} en double`, groupe.map(libelle));
    });
  }
  ajouter('erreur', 'Quantité imposée sans seuil', liste.filter(it=>it.qteCommande != null && it.seuil == null).map(libelle),
    'La quantité à commander n’agit qu’avec un seuil : elle est ignorée.');

  ajouter('alerte', 'Référence provisoire', liste.filter(it=>referenceSansPrefixe(it.ref) && isPlaceholderRef(it.ref)).map(libelle),
    'Référence du type « ?????? » : à compléter avant transmission à la pharmacie.');
  ajouter('alerte', 'Seuil supérieur ou égal à la dotation', liste.filter(it=>it.seuil != null && it.dotation > 0 && it.seuil >= it.dotation).map(libelle),
    'L’article sera commandé même lorsque le stock est complet.');
  ajouter('alerte', 'Seuil sur un article sans dotation', liste.filter(it=>it.seuil != null && !(it.dotation > 0)).map(libelle),
    'Le seuil n’a pas d’effet en saisie libre.');
  ajouter('alerte', 'Localisation vide', liste.filter(it=>!String(it.loc||'').trim()).map(libelle),
    'L’article apparaît dans une zone « Sans localisation ».');
  if(MODULE.nomPharmacieRequis){
    ajouter('alerte', 'Nom pharmacie vide', liste.filter(it=>!String(it.nom||'').trim()).map(libelle),
      'La commande imprimée affichera une désignation vide.');
  }
  doublons(it=>normaliserRecherche(it.denom)).forEach(groupe=>{
    ajouter('info', `Dénomination « ${groupe[0].denom} » portée par ${groupe.length} articles`, groupe.map(libelle));
  });
  if(MODULE.laboratoire){
    ajouter('info', 'Article Hors Stock sans laboratoire',
      liste.filter(it=>isHorsStock(it) && !String(it.laboratoire||'').trim()).map(libelle),
      'Il sera placé en fin de commande Hors Stock.');
  }
  const sansDotation = liste.filter(it=>!(it.dotation > 0));
  if(sansDotation.length){
    constats.push({ niveau:'info', titre:`${sansDotation.length} article(s) sans dotation (saisie libre)`, detail:'', articles:[] });
  }
  return constats;
}

function resumeConstats(constats){
  const n = niveau => constats.filter(c=>c.niveau === niveau).length;
  return { erreurs: n('erreur'), alertes: n('alerte'), infos: n('info') };
}

function constatsHtml(constats){
  if(!constats.length) return '<p class="integrite-ok">Aucune anomalie détectée.</p>';
  const ordre = { erreur:0, alerte:1, info:2 };
  const noms = { erreur:'Erreur', alerte:'Alerte', info:'Info' };
  const r = resumeConstats(constats);
  return `<p class="integrite-resume"><span class="pill erreur">${r.erreurs} erreur(s)</span> <span class="pill alerte">${r.alertes} alerte(s)</span> <span class="pill info">${r.infos} info(s)</span></p>`
    + '<ul class="integrite-liste">' + [...constats].sort((a,b)=>ordre[a.niveau]-ordre[b.niveau]).map(c=>{
      const articles = c.articles.length
        ? `<details><summary>${c.articles.length} article(s)</summary><ul>${c.articles.slice(0, 60).map(a=>`<li>${escapeHtml(a)}</li>`).join('')}${c.articles.length > 60 ? `<li>… et ${c.articles.length - 60} autre(s)</li>` : ''}</ul></details>` : '';
      return `<li class="integrite-${c.niveau}"><span class="pill ${c.niveau}">${noms[c.niveau]}</span> <b>${escapeHtml(c.titre)}</b>${c.detail ? `<div class="integrite-detail">${escapeHtml(c.detail)}</div>` : ''}${articles}</li>`;
    }).join('') + '</ul>';
}
