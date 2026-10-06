/* Copie indépendante et persistante du dernier PDF de commande par module. */
window.secoursCommande = (() => {
 const open = () => new Promise((resolve,reject) => {
  const req=indexedDB.open('commandes-reanimation-secours',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('pdfs');
  req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
 });
 async function save(module,blob){
  const db=await open();
  try { await new Promise((resolve,reject)=>{
   const tx=db.transaction('pdfs','readwrite');
   const m=window.CommandesModules&&window.CommandesModules.get(module);
   tx.objectStore('pdfs').put({blob,date:new Date().toISOString(),filename:'Commande_'+(m?m.nomFichier:module)+'_Edition_secours_'+new Date().toISOString().replace(/[:.]/g,'-')+'.pdf'},module);
   tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error || new Error('Sauvegarde interrompue'));
  }); } finally {db.close();}
 }
 async function read(module){
  const db=await open();
  try{return await new Promise((resolve,reject)=>{const req=db.transaction('pdfs').objectStore('pdfs').get(module);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}finally{db.close();}
 }
 return {save,read};
})();
