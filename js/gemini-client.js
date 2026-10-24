// Cliente autenticado del proxy de IA. La credencial viaja solo en el cuerpo POST.
(function(global){
  'use strict';
async function fetchProxy(url, init, timeoutMs, trace){
  trace=trace||{};
  var auth;
  try { auth = JSON.parse(localStorage.getItem('autocor_auth') || 'null'); } catch (_) {}
  if (!auth || !auth.token){const e=new Error('Inicia sesion para utilizar la extraccion con IA.');e.code='AI_AUTH_ERROR';throw e;}
  const buildStarted=Date.now();
  var request = init && init.request ? init.request : init && init.body ? JSON.parse(init.body) : {};
  init = Object.assign({}, init || {}, { method: 'POST' });
  delete init.request;
  trace.requestBuildMs=Date.now()-buildStarted;

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
  const cancel = function(){ controller.abort({code:'AI_CANCELLED'}); };
  if(callerSignal){
    if(callerSignal.aborted) cancel();
    else callerSignal.addEventListener('abort', cancel, {once:true});
  }
  init.signal = controller.signal;
  const timeoutId = setTimeout(function(){ timedOut = true; controller.abort(); }, timeoutMs || 60000);
  let resp, env,bodyStarted,httpStarted;
  const started=Date.now();
  trace.failedStage='connection';
  try {
    if(controller.signal.aborted)throw new Error('AI_CANCELLED');
    const endpoint = global.AutoCorTransport ? new URL(url) : null;
    const rpc = global.AutoCorTransport ? await global.AutoCorTransport.request(url, {action:'geminiProxy', op:endpoint.searchParams.get('op'), model:endpoint.searchParams.get('model'), sessionToken:auth.token, request:request}, init.signal,trace) : null;
    if(controller.signal.aborted)throw new Error('AI_CANCELLED');
    if(rpc !== null){ resp = {ok:true, status:200, json:async function(){return rpc;}}; }
    else {
      trace.transport='fetch';trace.failedStage='request-build';
      const encodingStarted=Date.now();
      init.body=JSON.stringify({sessionToken:auth.token,request});
      if(typeof TextEncoder==='function')trace.requestBytes=new TextEncoder().encode(init.body).byteLength;
      trace.requestBuildMs+=Date.now()-encodingStarted;
      trace.failedStage='connection';httpStarted=Date.now();resp = await fetch(url, init);
    }
    trace.headersMs=Date.now()-started;
    trace.httpStatus=resp.status;
    if(httpStarted!=null)trace.transportHttpStatus=resp.status;
    if(!resp.ok){
      trace.statusOrigin='apps-script-http';delete trace.failedStage;
      if(httpStarted!=null)trace.httpResponseMs=Date.now()-httpStarted;
      const retryAfter=resp.headers?.get?.('Retry-After')||'';
      if(resp.body?.cancel)resp.body.cancel().catch(()=>{});
      return {ok:false,status:resp.status,retryAfter,trace,json:async()=>({})};
    }
    trace.failedStage='response-body';
    bodyStarted=Date.now();
    // El plazo incluye recibir el cuerpo; una respuesta incompleta no es exito.
    env = await resp.json();
    trace.bodyMs=Date.now()-bodyStarted;
    if(httpStarted!=null)trace.httpResponseMs=Date.now()-httpStarted;
    if(controller.signal.aborted)throw new Error('AI_CANCELLED');
  } catch(cause) {
    if(bodyStarted!=null)trace.bodyMs=Date.now()-bodyStarted;
    const callerTimedOut=callerSignal?.aborted&&callerSignal.reason?.code==='AI_TIMEOUT';
    const cancelled = callerSignal && callerSignal.aborted&&!callerTimedOut;
    const err = new Error(cancelled ? 'La consulta a la IA fue cancelada.' : timedOut||callerTimedOut
      ? 'La IA no respondio dentro del tiempo de espera. Puedes reintentar o revisar manualmente.'
      : cause instanceof SyntaxError ? 'El servicio de IA devolvio una respuesta no valida. Reintenta.'
      : 'No se pudo conectar con el servicio de IA. Comprueba la conexion y reintenta.');
    err.code = cancelled ? 'AI_CANCELLED' : timedOut||callerTimedOut ? 'AI_TIMEOUT' : cause instanceof SyntaxError ? 'AI_INVALID_RESPONSE' : 'AI_NETWORK_ERROR';
    err.trace=trace;
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
  trace.httpStatus=status;
  trace.proxyHttpStatus=Number(env._proxy.status);
  trace.statusOrigin='proxy';
  const serviceStatus=data?.error?.status;
  if(['UNAVAILABLE','INTERNAL','RESOURCE_EXHAUSTED','INVALID_ARGUMENT','PERMISSION_DENIED','UNAUTHENTICATED','NOT_FOUND','DEADLINE_EXCEEDED','CONFIG_ERROR','BAD_REQUEST','FETCH_ERROR'].includes(serviceStatus))trace.serviceStatus=serviceStatus;
  if(Number.isFinite(env._proxy.upstreamMs)){
    trace.upstreamMs=env._proxy.upstreamMs;
    trace.transportMs=Math.max(0,Date.now()-started-env._proxy.upstreamMs);
  }
  delete trace.failedStage;
  return {
    ok: ok,
    status: status,
    trace: trace,
    retryAfter: env._proxy.retryAfter,
    json: async function(){ return data; },
    text: async function(){ return typeof data === 'string' ? data : JSON.stringify(data); }
  };
}
  global.AutoCorGemini = { fetch: fetchProxy };
})(window);
