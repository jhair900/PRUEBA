// Comparte solicitudes en curso y prepara solo el siguiente documento de una validación en lote.
(function(global){
  'use strict';
  const pending=new Map();
  let batch=null;
  function scope(){
    try{return JSON.stringify([JSON.parse(global.localStorage.getItem('autocor_auth')||'null')?.token||'',global.AutoCorConfig?.apiUrl||'']);}
    catch(_){return '';}
  }
  async function direct(serializedRequest,work){
    const session=scope();
    let requests=pending.get(session);
    if(!requests){requests=new Map();pending.set(session,requests);}
    let promise=requests.get(serializedRequest);
    if(!promise){promise=Promise.resolve().then(work);requests.set(serializedRequest,promise);}
    try{return structuredClone(await promise);}
    finally{
      if(requests.get(serializedRequest)===promise)requests.delete(serializedRequest);
      if(!requests.size && pending.get(session)===requests)pending.delete(session);
    }
  }
  async function share(serializedRequest,work){
    if(batch && batch.scope===scope() && batch.requests.has(serializedRequest)){
      const prepared=batch.requests.get(serializedRequest);
      batch.requests.delete(serializedRequest);
      return structuredClone(await prepared);
    }
    return direct(serializedRequest,work);
  }
  function beginBatch(){
    if(batch)return null;
    batch={scope:scope(),requests:new Map()};
    return batch;
  }
  function prefetch(serializedRequest,work,context){
    if(!context || context!==batch || context.scope!==scope() || context.requests.size>=2)return;
    if(context.requests.has(serializedRequest))return;
    const promise=direct(serializedRequest,work);
    // Un fallo anticipado se entrega al procesar ese documento, sin rechazo sin manejar.
    promise.catch(function(){});
    context.requests.set(serializedRequest,promise);
  }
  function endBatch(context){
    if(!context)return;
    context.requests.clear();
    if(batch===context)batch=null;
  }
  global.AutoCorDocumentAnalysis={share:share,beginBatch:beginBatch,prefetch:prefetch,endBatch:endBatch};
})(window);
