(function(){
 const match=location.hash.match(/storage=(\d+):([a-f0-9]{64})/);
 const connection=match?match[1]+':'+match[2]:sessionStorage.getItem('windows-storage');
 if(match){sessionStorage.setItem('windows-storage',connection);history.replaceState(null,'',location.pathname);}
 const parts=(connection||'').split(':');
 const module=location.pathname.includes('Commande_Solutes')?'Solutés':location.pathname.includes('Commande_Aide_Soignant')?'Magasin':'DM_Pharmacie';
 async function request(path,data){
  if(!connection)throw new Error('Ouvrez l’application depuis le raccourci Windows pour enregistrer dans C:\\commandes.');
  const body=JSON.stringify(data||{}).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  const response=await fetch('http://127.0.0.1:'+parts[0]+'/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Commandes-Token':parts[1]},body});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Enregistrement impossible dans C:\\commandes');return result;
 }
 window.WindowsStorage={loadCommand:()=>request('load',{module}),openLastPdf:()=>request('open-last-pdf',{module}),hash:connection?'#storage='+connection:'',async save(folder,name,blob){const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});return {path:(await request('save',{module,folder:folder||'Application',name,data})).path,downloaded:false};}};
 function closeApplication(){
  try{ window.close(); }catch(error){}
  /* Chromium autorise parfois la fermeture uniquement si la fenêtre a été
     ouverte par script ; cette séquence rétablit ce contexte sans créer de
     seconde fenêtre visible. */
  try{ window.open('', '_self'); window.close(); }catch(error){}
  return true;
 }
 window.CommandesApplication={close:closeApplication};
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(a&&a.getAttribute('href').endsWith('.html'))a.hash=window.WindowsStorage.hash;},true);
 if(connection){request('ping').catch(()=>{});setInterval(()=>request('ping').catch(()=>{}),45000);}
})();
