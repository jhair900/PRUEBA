(function(global){
  'use strict';
  const TTL = 24 * 60 * 60 * 1000;
  const EPOCH = 'autocor_draft_epoch';
  let adapter, database, panel, status, dirty = false, timer, locked = false;
  let lastFingerprint = '', generation = 0, operationSnapshot = '', operationConfirmed = false;
  const pendingDrive = new Map();
  const measurements = [];
  function auth(){ try { return JSON.parse(localStorage.getItem('autocor_auth') || 'null'); } catch(_) { return null; } }
  function owner(){ const a=auth(); return a && a.token ? String(a.user || '').toUpperCase() : ''; }
  function isAdmin(){const a=auth();return !!(a && a.token && a.isAdmin === true);}
  function refreshControls(){
    document.querySelectorAll('[data-work-admin]').forEach(el=>el.hidden=!isAdmin());
    document.querySelectorAll('[data-work-drafts],[data-work-user]').forEach(el=>el.hidden=!owner());
    if(panel && ((panel.dataset.adminOnly && !isAdmin()) || (panel.dataset.userOnly && !owner()))){panel.remove();panel=null;}
  }
  function epoch(){ return localStorage.getItem(EPOCH) || '0'; }
  function clone(value){ return structuredClone(value); }
  function formFingerprint(){
    const state=adapter.capture();
    delete state.pending;
    if(state.data) ['asesor','asesorCreador','asesorEditor','historialUsuarios'].forEach(k=>delete state.data[k]);
    return JSON.stringify(state,function(key,value){
      if(typeof value!=='string')return value;
      const text=value.trim();
      return /placa/i.test(key)?text.toUpperCase():text;
    });
  }
  function assertSnapshot(){
    if(locked && operationSnapshot && formFingerprint()!==operationSnapshot){
      throw new Error('Los datos cambiaron durante el guardado. No se exportó un documento diferente. Revisa la placa y vuelve a generar con los datos actuales.');
    }
  }
  function openDb(){
    if(!database) database = new Promise((resolve,reject)=>{
      const request=indexedDB.open('autocor-work',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    return database;
  }
  async function store(mode, operation){
    const db=await openDb();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('drafts',mode);
      const request=operation(tx.objectStore('drafts'));
      tx.oncomplete=()=>resolve(request && request.result);
      tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
    });
  }
  function tell(message){ if(status) status.textContent=message; }
  async function drafts(){
    const list=await store('readonly',s=>s.getAll());
    const expired=list.filter(r=>r.expiresAt<=Date.now() || r.epoch!==epoch());
    if(expired.length) await store('readwrite',s=>{ expired.forEach(r=>s.delete(r.id)); });
    return list.filter(r=>r.expiresAt>Date.now() && r.epoch===epoch() && r.user===owner() && r.module===adapter.module).sort((a,b)=>b.savedAt-a.savedAt);
  }
  async function persist(){
    clearTimeout(timer);
    if(!adapter || !owner()) return;
    const user=owner(), version=generation, savedEpoch=epoch();
    const data=clone(adapter.capture());
    const plate=String(adapter.plate(data)||'SIN PLACA').trim().toUpperCase();
    const fingerprint=JSON.stringify(data);
    if(fingerprint===lastFingerprint) return;
    let tab=sessionStorage.getItem('autocor_draft_tab');
    if(!tab){tab=crypto.randomUUID();sessionStorage.setItem('autocor_draft_tab',tab);}
    const id=JSON.stringify([user,adapter.module,plate,tab]);
    const record={id,user,module:adapter.module,plate,data,epoch:savedEpoch,savedAt:Date.now(),expiresAt:Date.now()+TTL};
    await store('readwrite',s=>{ if(owner()===user && generation===version && epoch()===savedEpoch) return s.put(record); });
    if(owner()!==user || generation!==version) return;
    lastFingerprint=fingerprint;
    tell('Borrador local actualizado · '+plate);
  }
  function schedule(event){
    if(locked || !owner()) return;
    if(event && (event.target.closest('[data-workflow-ui],#autocorAccountControls,.auth-ui-modal-backdrop,#modalUsuario,#modalCambioClave,#modalAdminUsuarios') || event.target.type==='password')) return;
    dirty=true; clearTimeout(timer);
    timer=setTimeout(()=>persist().catch(()=>tell('No se pudo guardar el borrador local. Conserva esta pestaña abierta.')),600);
  }
  function forget(){
    generation++; clearTimeout(timer);dirty=false;lastFingerprint='';pendingDrive.clear();
    localStorage.setItem(EPOCH,String(Date.now())+'-'+Math.random());
    if(panel) panel.remove();panel=null;
    store('readwrite',s=>s.clear()).catch(()=>{});
    tell('Borradores eliminados al cerrar o cambiar sesión.');
  }
  function button(label, action, host){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.style.cssText='padding:7px 11px;margin:4px;border:1px solid #64748b;border-radius:7px;background:#fff;color:#17212f;cursor:pointer';
    b.onclick=action;host.appendChild(b);return b;
  }
  function showPanel(title){
    if(panel) panel.remove();
    panel=document.createElement('section');panel.dataset.workflowUi='true';
    panel.setAttribute('role','dialog');panel.setAttribute('aria-label',title);
    panel.style.cssText='position:fixed;right:16px;top:80px;z-index:22000;width:min(540px,calc(100vw - 32px));max-height:75vh;overflow:auto;background:white;color:#17212f;border:1px solid #cbd5e1;border-radius:12px;padding:16px;box-sizing:border-box;box-shadow:0 8px 40px #0004;font:14px Arial';
    const heading=document.createElement('h3');heading.textContent=title;panel.appendChild(heading);
    button('Cerrar',()=>{panel.remove();panel=null;},panel);
    document.body.appendChild(panel);return panel;
  }
  async function showDrafts(){
    const host=showPanel('Borradores recuperables');
    const note=document.createElement('p');note.textContent='Solo en este navegador. Caducan a las 24 horas y se eliminan al cerrar sesión. Recuperar no guarda ni reemplaza registros en el servidor.';host.appendChild(note);
    try{
      const list=await drafts();
      if(!list.length){note.textContent+=' No hay borradores disponibles.';return;}
      list.forEach(record=>{
        const row=document.createElement('div');row.style.borderTop='1px solid #ddd';
        const label=document.createElement('p');label.textContent=record.plate+' · '+new Date(record.savedAt).toLocaleString();row.appendChild(label);
        button('Recuperar',async()=>{
          if(locked || record.user!==owner() || record.epoch!==epoch() || record.expiresAt<=Date.now()) return;
          if(dirty && !confirm('¿Reemplazar el formulario actual con este borrador?')) return;
          try{await adapter.restore(clone(record.data));dirty=true;lastFingerprint='';await persist();host.remove();if(panel===host)panel=null;}catch(e){tell('No se pudo recuperar el borrador: '+e.message);}
        },row);
        button('Eliminar',async()=>{await store('readwrite',s=>s.delete(record.id));row.remove();},row);
        host.appendChild(row);
      });
    }catch(_){note.textContent='El navegador no permite acceder a los borradores locales.';}
  }
  async function run(label, operation){
    if(locked) return;
    if(document.querySelector('#spinnerOverlay.open')){alert('Espera a que termine la lectura de documentos antes de guardar.');return;}
    locked=true;
    ['pagos','ventas','liquidacion'].forEach(m=>{const key='__'+m+'PlateSearchId';global[key]=(global[key]||0)+1;});
    const nodes=[...document.body.children].map(el=>[el,el.inert]);
    nodes.forEach(([el])=>el.inert=true);
    const overlay=document.createElement('div');overlay.dataset.workflowUi='true';
    overlay.style.cssText='position:fixed;inset:0;z-index:20900;cursor:wait;background:#0001;display:flex;align-items:flex-end;justify-content:center;padding:70px 20px;pointer-events:auto';
    const message=document.createElement('div');message.setAttribute('role','status');message.textContent=label+' · Mantén abierta esta página.';
    message.style.cssText='padding:12px;background:#17212f;color:white;border-radius:8px;font:14px Arial';overlay.appendChild(message);document.body.appendChild(overlay);
    const started=performance.now();
    try{
      operationSnapshot=formFingerprint();
      operationConfirmed=false;
      await persist().catch(()=>tell('No se pudo actualizar el borrador local.'));
      return await operation();
    }finally{
      measurements.push({action:label,elapsedMs:Math.round(performance.now()-started),local:true});
      if(measurements.length>50)measurements.shift();
      try{if(operationConfirmed && formFingerprint()===operationSnapshot)dirty=false;}catch(_){}
      nodes.forEach(([el,inert])=>el.inert=inert);overlay.remove();locked=false;
      operationSnapshot='';
      global.dispatchEvent(new Event('autocor-operation-end'));
    }
  }
  function wrap(name,label){
    const original=global[name];if(typeof original!=='function')return;
    global[name]=function(){const args=arguments,self=this;return run(label,()=>original.apply(self,args));};
  }
  function timings(){
    if(!isAdmin())return;
    const host=showPanel('Tiempos de las operaciones');
    host.dataset.adminOnly='true';
    const seconds=value=>Number.isFinite(value)?(value/1000).toFixed(2)+' s':'sin medición';
    const note=document.createElement('p');note.textContent='Mediciones de esta pestaña. El tiempo fuera del servidor incluye conexión, cola y transferencia; no permite atribuir todo el retraso a Google o a tu red.';host.appendChild(note);
    measurements.slice(-20).reverse().forEach(t=>{
      const row=document.createElement('p');
      const server=t.server && t.server.serverMs;
      row.textContent=t.action+': '+(t.elapsedMs/1000).toFixed(1)+' s'+(server!=null?' · servidor: '+(server/1000).toFixed(2)+' s':'')+(t.attempts?' · intentos: '+t.attempts:'')+(t.outcome?' · '+t.outcome:'');host.appendChild(row);
      if(t.details){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Ver etapas';details.appendChild(summary);t.details.forEach(d=>{const p=document.createElement('p');p.textContent=(d.kind==='verification'?'Verificación':'Solicitud')+': conexión/respuesta '+seconds(d.headersMs)+'; lectura '+seconds(d.bodyMs)+'; bloqueo servidor '+seconds(d.server&&d.server.lockWaitMs)+'; proceso '+seconds(d.server&&d.server.processingMs)+'; escritura '+seconds(d.server&&d.server.flushMs)+(d.errorType?' · '+d.errorType:'');details.appendChild(p);});host.appendChild(details);}
    });
  }
  async function sendDrive(plate, files){
    const user=owner();if(!user)throw new Error('Inicia sesión para subir los archivos.');
    const entry={user,plate,files:clone(files)};pendingDrive.set(plate,entry);
    let result;
    if(adapter)await persist().catch(()=>tell('Archivos pendientes solo en memoria: conserva esta pestaña.'));
    try{
      result=await global.AutoCorApi.postJson(global.AutoCorConfig.apiUrl,{action:'subirExpedienteDrive',sessionToken:auth().token,placa:plate,archivos:entry.files},{context:'subirExpedienteDrive',throwOnApiError:false});
      const done=new Set((result.archivos||[]).filter(f=>f.ok).map(f=>f.nombre));
      entry.files=entry.files.filter(f=>!done.has(f.nombre));
      if(!entry.files.length)pendingDrive.delete(plate);
      else result=Object.assign({},result,{pendingCount:entry.files.length});
    }catch(e){result={ok:false,message:e.message,pendingCount:entry.files.length};}
    if(owner()!==user)pendingDrive.delete(plate);
    if(adapter && owner()===user)await persist().catch(()=>tell('Archivos pendientes solo en memoria: conserva esta pestaña.'));
    return result;
  }
  function showDrive(){
    if(!owner())return;
    const host=showPanel('Archivos pendientes de Drive');
    host.dataset.userOnly='true';
    const note=document.createElement('p');note.textContent='Se reenvían solo los archivos sin confirmación. No se vuelven a generar contratos ni a guardar sus datos. Si se perdió la respuesta, el servidor reemplaza el archivo del mismo nombre.';host.appendChild(note);
    const entries=[...pendingDrive.values()].filter(e=>e.user===owner());
    if(!entries.length){note.textContent+=' No hay archivos pendientes.';return;}
    entries.forEach(e=>{const row=document.createElement('p');row.textContent=e.plate+' · '+e.files.map(f=>f.nombre).join(', ');host.appendChild(row);button('Reintentar '+e.plate,async()=>{if(e.user!==owner())return;await run('Subiendo archivos pendientes',()=>sendDrive(e.plate,e.files));showDrive();},host);});
  }
  function register(config){
    adapter=config;
    const host=document.querySelector('.toolbar-wrap');if(!host)return;
    const controls=document.createElement('span');controls.dataset.workflowUi='true';controls.className='autocor-work-controls';
    button('Borradores',showDrafts,controls).dataset.workDrafts='true';
    button('Tiempos',timings,controls).dataset.workAdmin='true';
    if(config.module==='contratos')button('Pendientes Drive',showDrive,controls).dataset.workUser='true';
    const saveButton=host.querySelector('#btnGuardarImprimir,button[onclick*="guardarYExportarTodo"]');
    host.insertBefore(controls,saveButton ? saveButton.nextSibling : host.firstElementChild?.nextSibling || null);
    status=document.createElement('span');status.dataset.workflowUi='true';status.setAttribute('role','status');status.style.cssText='font:11px Arial;color:#cbd5e1;margin:6px';host.appendChild(status);
    const style=document.createElement('style');style.textContent='.autocor-work-controls{display:inline-flex;align-items:center;flex-wrap:wrap;box-sizing:border-box;gap:7px;max-width:100%}.autocor-work-controls>button{background:rgba(255,255,255,.08)!important;color:#fff!important;font-family:inherit;font-size:12px!important;font-weight:700;padding:7px 13px!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:8px!important;margin:0!important;cursor:pointer;transition:background .15s,transform .1s}.autocor-work-controls>button:hover{background:rgba(255,255,255,.16)!important;transform:translateY(-1px)}.autocor-work-controls>button:focus-visible{outline:2px solid #93c5fd;outline-offset:2px}.autocor-work-controls>button[hidden]{display:none!important}@media print{[data-workflow-ui]{display:none!important}}';document.head.appendChild(style);
    refreshControls();
    ['input','change','click'].forEach(type=>document.addEventListener(type,schedule));
    global.addEventListener('autocor-draft-changed',()=>schedule());
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty)persist().catch(()=>{});});
    global.addEventListener('beforeunload',e=>{if(locked || dirty){e.preventDefault();e.returnValue='';}});
    global.addEventListener('storage',e=>{if(e.key==='autocor_auth' || e.key===null){let before;try{before=JSON.parse(e.oldValue||'null');}catch(_){}if(!owner() || (before&&before.user!==owner()))forget();refreshControls();}});
    const originalSave=global.saveAuthState;
    if(originalSave)global.saveAuthState=function(a,p){const before=owner();if(!a || (before && before!==String(a.user||'').toUpperCase()))forget();const result=originalSave(a,p);refreshControls();return result;};
    const logout=global.cerrarSesion;
    if(logout)global.cerrarSesion=function(){forget();return logout.apply(this,arguments);};
    config.saves.forEach(pair=>wrap(pair[0],pair[1]));
    drafts().then(list=>{if(list.length)tell(list.length+' borrador(es) disponibles.');}).catch(()=>tell('Borradores locales no disponibles.'));
  }
  global.addEventListener('autocor-timing',e=>{
    measurements.push(e.detail);if(measurements.length>50)measurements.shift();
    if(locked && /^(save|savePago|saveVenta|saveContrato)$/.test(e.detail.action) && /^(success|confirmed_after_error)$/.test(e.detail.outcome))operationConfirmed=true;
  });
  global.AutoCorWork={register,run,persist,forget,sendDrive,assertSnapshot,refreshControls,
    captureDrive:()=>clone([...pendingDrive.values()].filter(e=>e.user===owner())),
    restoreDrive:entries=>{pendingDrive.clear();(entries||[]).filter(e=>e.user===owner()).forEach(e=>pendingDrive.set(e.plate,clone(e)));},
    get busy(){return locked;}
  };
})(window);
