// Autenticación comprobada por el backend. Sin sondeos periódicos ni repetición de operaciones.
(function(global){
  'use strict';
  const KEY='autocor_auth';
  const user=a=>String(a?.user||a?.username||'').trim().toUpperCase();
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch(_){return null;}};
  let stored=read(),phase=stored?.token?'checking':'signedout',verified=null,revision=0,pending=null,expiryTimer,lastMessage='';
  // El trabajo abierto pertenece a esta cuenta, incluso mientras se renueva su acceso.
  let workOwner=user(stored);
  function error(code,message){return Object.assign(new Error(message),{code,isSessionError:true,isNonRetryable:true});}
  function snapshot(){return {phase,generation:revision,authenticated:phase==='authenticated',user:verified?.user||'',workOwner,auth:phase==='authenticated'?verified:null};}
  function publish(){
    if(typeof global.saveAuthState==='function')global.saveAuthState(phase==='authenticated'?verified:null,false);
    global.dispatchEvent(new CustomEvent('autocor-session-state',{detail:snapshot()}));
    global.dispatchEvent(new Event('autocor-auth-changed'));
  }
  function prompt(){global.AutoCorAuthUI?.openLogin(lastMessage||message());}
  function message(){return lastMessage|| (phase==='mismatch'?'El trabajo abierto pertenece a '+workOwner+'. Inicia sesión con esa cuenta para continuar sin mezclar datos.':phase==='unknown'?'No se pudo comprobar la sesión. Revisa la conexión y vuelve a intentar la operación.':phase==='checking'?'Comprobando sesión…':'Tu sesión no está activa. Inicia sesión aquí para continuar; tu trabajo se conserva.');}
  function changed(){
    const next=read();
    if((next?.token||'')===(stored?.token||'')&&user(next)===user(stored))return false;
    stored=next;revision++;verified=null;pending=null;lastMessage='';clearTimeout(expiryTimer);phase=stored?.token?'checking':'signedout';
    publish();return true;
  }
  function scheduleExpiry(){
    clearTimeout(expiryTimer);
    const remaining=Number(verified?.expiresAt)-Date.now();
    if(Number.isFinite(remaining))expiryTimer=setTimeout(()=>{
      // Un único límite local conocido. Nunca se presenta un token vencido como activo.
      if(Number(verified?.expiresAt)<=Date.now())invalidate('AUTH_EXPIRED');else scheduleExpiry();
    },Math.max(1,Math.min(remaining,2147483647)));
  }
  function apply(auth,persist){
    if(!auth?.token||!user(auth)||!Number.isFinite(Number(auth.expiresAt)))throw error('SESSION_PROTOCOL_ERROR','Actualiza Apps Script para comprobar la sesión de esta versión.');
    const previous=stored?.token;
    lastMessage='';
    stored={...auth,user:user(auth)};
    if(previous!==stored.token)revision++;
    if(persist)localStorage.setItem(KEY,JSON.stringify(stored));
    if(!workOwner)workOwner=stored.user;
    verified=stored;phase=stored.user===workOwner?'authenticated':'mismatch';
    if(phase==='authenticated')scheduleExpiry();else clearTimeout(expiryTimer);
    publish();if(phase==='mismatch')prompt();
    return verified;
  }
  function capture(){changed();if(phase==='authenticated'&&Number(verified.expiresAt)<=Date.now())invalidate('AUTH_EXPIRED');if(phase!=='authenticated'){prompt();throw error(phase==='mismatch'?'AUTH_ACCOUNT_MISMATCH':'AUTH_REQUIRED',message());}return {revision,token:verified.token,user:verified.user};}
  function assert(ticket){changed();if(phase==='authenticated'&&Number(verified.expiresAt)<=Date.now())invalidate('AUTH_EXPIRED');if(!ticket||ticket.revision!==revision||ticket.token!==stored?.token||phase!=='authenticated')throw error('AUTH_CONTEXT_CHANGED','La sesión cambió. Se conservó el trabajo y se descartó la respuesta anterior.');}
  function invalidate(code,ticket){
    if(ticket&&(ticket.revision!==revision||ticket.token!==stored?.token))return;
    revision++;verified=null;pending=null;clearTimeout(expiryTimer);stored=null;phase='expired';
    lastMessage=code==='AUTH_EXPIRED'?'Tu sesión venció. Inicia sesión aquí para continuar; tu trabajo se conserva.':'';
    localStorage.removeItem(KEY);publish();prompt();
  }
  async function ensure(){
    changed();
    if(phase==='authenticated')return capture();
    if(phase==='mismatch'||!stored?.token){prompt();throw error(phase==='mismatch'?'AUTH_ACCOUNT_MISMATCH':'AUTH_REQUIRED',message());}
    if(pending)return pending;
    const token=stored.token,at=revision;
    phase='checking';publish();
    const task=(async()=>{
      try{
        const response=await global.AutoCorApi.postJson(global.AutoCorConfig.apiUrl,{action:'validateSession',sessionToken:token},{sessionBypass:true,retries:0,timeoutMs:15000,totalTimeoutMs:15000});
        changed();if(at!==revision||stored?.token!==token)throw error('AUTH_CONTEXT_CHANGED','La sesión cambió durante la comprobación.');
        if(response.ok!==true)throw error(response.code||'SESSION_SERVICE_ERROR',response.message||'No se pudo comprobar la sesión.');
        apply({...response.session,token},true);return capture();
      }catch(e){
        if(at===revision){if(['AUTH_REQUIRED','AUTH_EXPIRED'].includes(e.code))invalidate(e.code);else {verified=null;phase='unknown';lastMessage=e.code==='SESSION_PROTOCOL_ERROR'?e.message:'';publish();}}
        throw e;
      }finally{if(pending===task)pending=null;}
    })();
    pending=task;return task;
  }
  function consume(response,ticket){
    assert(ticket);
    if(response?.ok===false&&['AUTH_REQUIRED','AUTH_EXPIRED'].includes(response.code)){
      invalidate(response.code,ticket);throw error(response.code,response.message||'La sesión venció. Inicia sesión para continuar.');
    }
    if(response?.session){
      if(user(response.session)!==ticket.user)throw error('AUTH_CONTEXT_CHANGED','La respuesta corresponde a otra cuenta.');
      const permissionsChanged=verified.isAdmin!==response.session.isAdmin||verified.displayName!==response.session.displayName;
      verified={...verified,...response.session,token:ticket.token};stored=verified;
      localStorage.setItem(KEY,JSON.stringify(stored));scheduleExpiry();
      if(permissionsChanged)publish();
    }
  }
  function login(response,at){changed();if(at!==undefined&&at!==revision)throw error('AUTH_CONTEXT_CHANGED','La sesión cambió mientras ingresabas. Vuelve a intentarlo.');return apply({...response.user,user:response.user?.username,token:response.sessionToken,expiresAt:response.expiresAt},true);}
  function logout(){
    const token=stored?.token;invalidate('AUTH_REQUIRED');
    const at=revision;
    if(token)global.AutoCorApi.postJson(global.AutoCorConfig.apiUrl,{action:'logout',sessionToken:token},{sessionBypass:true,retries:0,timeoutMs:15000,totalTimeoutMs:15000}).catch(()=>{
      if(at!==revision)return;
      lastMessage='Se cerró el acceso local, pero no se pudo confirmar el cierre en el servidor por un problema de conexión. Tu trabajo sigue en esta pestaña.';publish();prompt();
    });
  }
  function requireCurrent(){return capture();}
  global.AutoCorSession={snapshot,ensure,capture,assert,consume,login,loginRevision:()=>{changed();return revision;},logout,invalidate,requireCurrent,message};
  global.addEventListener('storage',event=>{
    if(event.key!==KEY&&event.key!==null)return;
    if(changed()){if(stored?.token)ensure().catch(()=>prompt());else prompt();}
  });
  function start(){if(!stored?.token&&/\/(?:index\.html)?$/.test(location.pathname))return;ensure().catch(()=>{if(!/\/(?:index\.html)?$/.test(location.pathname))prompt();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})(window);
