// Comparte solicitudes en curso y prepara solo el siguiente documento de una validación en lote.
(function(global){
  'use strict';
  const pending=new Map();
  let batch=null;
  function scope(){
    try{return JSON.stringify([JSON.parse(global.localStorage.getItem('autocor_auth')||'null')?.token||'',global.AutoCorConfig?.apiUrl||'']);}
    catch(_){return '';}
  }
  async function direct(serializedRequest,work,signal){
    if(signal&&signal.aborted)return consume(Promise.resolve(),signal);
    const session=scope();
    let requests=pending.get(session);
    if(!requests){requests=new Map();pending.set(session,requests);}
    let entry=requests.get(serializedRequest);
    if(!entry){
      const controller=typeof AbortController==='function'?new AbortController():null;
      entry={controller,users:0,promise:null};
      entry.promise=Promise.resolve().then(()=>work(controller && controller.signal));
      requests.set(serializedRequest,entry);
      const clear=()=>{if(requests.get(serializedRequest)===entry)requests.delete(serializedRequest);if(!requests.size&&pending.get(session)===requests)pending.delete(session);};
      entry.promise.then(clear,clear);
    }
    entry.users++;
    try{return structuredClone(await consume(entry.promise,signal));}
    finally{entry.users--;if(!entry.users && signal && signal.aborted){if(entry.controller)entry.controller.abort();if(requests.get(serializedRequest)===entry)requests.delete(serializedRequest);}}
  }
  function consume(promise,signal){
    if(!signal)return promise;
    return new Promise((resolve,reject)=>{
      const cancel=()=>{const e=new Error('Procesamiento cancelado');e.code='PROCESSING_CANCELLED';reject(e);};
      if(signal.aborted){cancel();return;}
      signal.addEventListener('abort',cancel,{once:true});
      promise.then(v=>{signal.removeEventListener('abort',cancel);resolve(v);},e=>{signal.removeEventListener('abort',cancel);reject(e);});
    });
  }
  async function share(serializedRequest,work,options){
    if(batch && batch.scope===scope() && batch.requests.has(serializedRequest)){
      const prepared=batch.requests.get(serializedRequest);
      batch.requests.delete(serializedRequest);
      return structuredClone(await consume(prepared,options && options.signal));
    }
    return direct(serializedRequest,work,options && options.signal);
  }
  function beginBatch(){
    if(batch)return null;
    const controller=typeof AbortController==='function'?new AbortController():null;
    batch={scope:scope(),requests:new Map(),controller,signal:controller && controller.signal};
    return batch;
  }
  function prefetch(serializedRequest,work,context){
    if(!context || context!==batch || context.scope!==scope() || context.requests.size>=2)return;
    if(context.requests.has(serializedRequest))return;
    if(context.signal && context.signal.aborted)return;
    const promise=direct(serializedRequest,work,context.signal);
    // Un fallo anticipado se entrega al procesar ese documento, sin rechazo sin manejar.
    promise.catch(function(){});
    context.requests.set(serializedRequest,promise);
  }
  function endBatch(context){
    if(!context)return;
    context.requests.clear();
    if(context.controller)context.controller.abort();
    if(batch===context)batch=null;
  }
  global.AutoCorDocumentAnalysis={share:share,beginBatch:beginBatch,prefetch:prefetch,endBatch:endBatch,cancelBatch:function(){endBatch(batch);}};
})(window);
