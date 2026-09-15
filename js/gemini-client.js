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
  const controller = new AbortController();
  const callerSignal = init.signal;
  let timedOut = false;
  const cancel = function(){ controller.abort(); };
  if(callerSignal){
    if(callerSignal.aborted) cancel();
    else callerSignal.addEventListener('abort', cancel, {once:true});
  }
  init.signal = controller.signal;
  const timeoutId = setTimeout(function(){ timedOut = true; controller.abort(); }, timeoutMs || 60000);
  let resp, env;
  try {
    const endpoint = global.AutoCorTransport ? new URL(url) : null;
    const rpc = global.AutoCorTransport ? await global.AutoCorTransport.request(url, {action:'geminiProxy', op:endpoint.searchParams.get('op'), model:endpoint.searchParams.get('model'), sessionToken:auth.token, request:request}, init.signal) : null;
    if(rpc !== null){ resp = {ok:true, status:200, json:async function(){return rpc;}}; }
    else resp = await fetch(url, init);
    // El plazo incluye recibir el cuerpo; una respuesta incompleta no es exito.
    env = await resp.json();
  } catch(cause) {
    const cancelled = callerSignal && callerSignal.aborted;
    const err = new Error(cancelled ? 'La consulta a la IA fue cancelada.' : timedOut
      ? 'La IA no respondio dentro del tiempo de espera. Puedes reintentar o continuar con OCR.'
      : cause instanceof SyntaxError ? 'El servicio de IA devolvio una respuesta no valida. Reintenta.'
      : 'No se pudo conectar con el servicio de IA. Comprueba la conexion y reintenta.');
    err.code = cancelled ? 'AI_CANCELLED' : timedOut ? 'AI_TIMEOUT' : 'AI_SERVICE_ERROR';
    err.cause = cause;
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if(callerSignal) callerSignal.removeEventListener('abort', cancel);
  }
  if(!env || !env._proxy || typeof env._proxy.ok !== 'boolean' || !Object.prototype.hasOwnProperty.call(env, 'data')){
    const err = new Error('El servicio de IA devolvio una respuesta inesperada. Comprueba el despliegue de Apps Script.');
    err.code = 'AI_SERVICE_ERROR';
    throw err;
  }
  const ok = resp.ok && env._proxy.ok;
  const status = resp.ok ? Number(env._proxy.status) : resp.status;
  const data = env.data;
  return {
    ok: ok,
    status: status,
    json: async function(){ return data; },
    text: async function(){ return typeof data === 'string' ? data : JSON.stringify(data); }
  };
}
  global.AutoCorGemini = { fetch: fetchProxy };
})(window);
