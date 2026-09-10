// Cliente autenticado del proxy de IA. La credencial viaja solo en el cuerpo POST.
(function(global){
  'use strict';
async function fetchProxy(url, init, timeoutMs){
  var auth;
  try { auth = JSON.parse(localStorage.getItem('autocor_auth') || 'null'); } catch (_) {}
  if (!auth || !auth.token) throw new Error('Inicia sesion para utilizar la extraccion con IA.');
  var request = init && init.body ? JSON.parse(init.body) : {};
  init = Object.assign({}, init || {}, { method: 'POST', body: JSON.stringify({ sessionToken: auth.token, request: request }) });

  /* Forzamos text/plain para evitar el preflight CORS (OPTIONS) que
     Apps Script no responde. El body sigue siendo JSON y GAS lo lee
     desde e.postData.contents sin importar el Content-Type. */
  if(init && (init.method||'GET').toUpperCase() !== 'GET'){
    init = Object.assign({}, init, { headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
  }
  init = init ? Object.assign({}, init) : {};
  var controller = null;
  var timeoutId = null;
  if(!init.signal && typeof AbortController !== 'undefined'){
    controller = new AbortController();
    init.signal = controller.signal;
    timeoutId = setTimeout(function(){ controller.abort(); }, (timeoutMs || 25000));
  }
  var resp;
  try{
    resp = await fetch(url, init);
  }finally{
    if(timeoutId) clearTimeout(timeoutId);
  }
  let env = null;
  try { env = await resp.json(); } catch(_){ env = null; }
  const hasProxy = env && env._proxy && typeof env._proxy === 'object';
  const ok = hasProxy ? !!env._proxy.ok : resp.ok;
  const status = hasProxy ? (env._proxy.status|0) : resp.status;
  const data = (env && Object.prototype.hasOwnProperty.call(env,'data')) ? env.data : env;
  return {
    ok: ok,
    status: status,
    json: async function(){ return data; },
    text: async function(){ return typeof data === 'string' ? data : JSON.stringify(data); }
  };
}
  global.AutoCorGemini = { fetch: fetchProxy };
})(window);
