(function(global){
  'use strict';
  const current=document.querySelector('meta[name="autocor-version"]')?.content;
  if(!current || !/^https?:$/.test(location.protocol))return;
  let interacted=false,checking=false;
  // Una sesión de trabajo iniciada nunca se interrumpe por una publicación.
  ['pointerdown','keydown','input','change','paste','drop','submit'].forEach(type=>document.addEventListener(type,()=>{interacted=true;},true));
  global.addEventListener('autocor-draft-changed',()=>{interacted=true;});
  function safe(){
    return !interacted && !document.hidden && !global.AutoCorWork?.busy &&
      !document.querySelector('#spinnerOverlay.open,[data-workflow-overlay]');
  }
  async function get(url){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try{const r=await fetch(url,{cache:'no-store',credentials:'same-origin',signal:controller.signal});if(!r.ok)throw Error('Actualización no disponible');return await r.text();}
    finally{clearTimeout(timer);}
  }
  async function check(){
    if(checking || document.hidden || !navigator.onLine)return;
    checking=true;
    try{
      const url=new URL('version.json',location.href);url.searchParams.set('_check',Date.now());
      const version=JSON.parse(await get(url)).version;
      if(typeof version!=='string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(version) || version===current)return;
      if(!safe())return;
      // Esperar a que GitHub publique también la página; evita recargas en bucle.
      const page=new URL(location.href);page.searchParams.set('_autocorVersion',version);
      if(new URL(location.href).searchParams.get('_autocorVersion')===version)return;
      const html=await get(page);
      const remote=new DOMParser().parseFromString(html,'text/html').querySelector('meta[name="autocor-version"]')?.content;
      if(remote!==version)return;
      if(safe())location.replace(page.href);
    }catch(_){/* Un fallo de conexión nunca impide trabajar. */}
    finally{checking=false;}
  }
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  global.addEventListener('online',check);
  global.addEventListener('pageshow',check);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check,{once:true});else check();
  setInterval(check,5*60*1000);
})(window);
