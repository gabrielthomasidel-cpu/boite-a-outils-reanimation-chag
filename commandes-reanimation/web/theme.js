(() => {
 const key='commandes-theme';
 const root=document.documentElement;
 const read=()=>{try{return localStorage.getItem(key)==='light'?'light':'dark';}catch(e){return 'dark';}};
 function apply(theme){root.dataset.theme=theme;const b=document.getElementById('btnTheme');if(b){const label=theme==='dark'?'Activer le mode clair':'Activer le mode sombre';
 b.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(theme==='dark'?'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>':'<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>')+'</svg>';b.setAttribute('aria-label',label);b.title=label;}}
 apply(read());
 document.addEventListener('DOMContentLoaded',()=>{
  const b=document.createElement('button');b.id='btnTheme';b.type='button';b.className='theme-toggle';
  const date=document.getElementById('todayMeta');
  if(date){const group=document.createElement('div');group.className='date-theme-group';date.before(group);group.append(date,b);}
  else (document.querySelector('.masthead-inner') || document.querySelector('header.masthead')).appendChild(b);
  b.addEventListener('click',()=>{const theme=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(key,theme);}catch(e){}apply(theme);});apply(read());
 });
 window.addEventListener('pageshow',()=>apply(read()));
 window.addEventListener('storage',e=>{if(e.key===key)apply(read());});
})();
