/* Operaciones locales de extracción. Los diagnósticos nunca guardan contenido documental. */
(function(global){
  'use strict';
  const defaults=Object.freeze({aiMs:45000,aiAttemptMs:30000,totalMs:120000,slowMs:20000,maxModelAttempts:3});
  const now=()=>typeof performance!=='undefined'?performance.now():Date.now();
  function error(code){const e=new Error(code);e.code=code;return e;}
  function budgets(overrides){
    const out={...defaults};
    for(const key of Object.keys(out)){
      const n=Number(overrides && overrides[key]);
      if(Number.isFinite(n)&&n>0)out[key]=Math.min(n,key==='maxModelAttempts'?5:300000);
    }
    return out;
  }
  // Rechazar la espera no detiene por sí solo el trabajo. onStop libera el recurso propietario.
  function bounded(work,signal,ms,code,onStop){
    return new Promise((resolve,reject)=>{
      let done=false,timer;
      const finish=(fn,value)=>{if(done)return;done=true;clearTimeout(timer);if(signal)signal.removeEventListener('abort',cancel);fn(value);};
      const stop=e=>{if(done)return;try{if(onStop)Promise.resolve(onStop()).catch(()=>{});}catch(_){}finish(reject,e);};
      const cancel=()=>stop(signal.reason && signal.reason.code?signal.reason:error('PROCESSING_CANCELLED'));
      if(signal && signal.aborted){cancel();return;}
      if(signal)signal.addEventListener('abort',cancel,{once:true});
      if(ms)timer=setTimeout(()=>stop(error(code||'PROCESSING_TIMEOUT')),ms);
      Promise.resolve().then(()=>{if(done)return;return work();}).then(v=>finish(resolve,v),e=>finish(reject,e));
    });
  }
  const safeKeys=new Set(['page','pages','face','variant','psm','model','attempt','waitMs','inputBytes','preparedBytes','pixels','preparedPixels','optimizedImages','skippedImages','confidence','pending','requiredPending','optionalPending','pendingFields','passes','httpStatus','transport','headersMs','bodyMs','bridgeUnavailable','outcome','code','causeCode','causeName','elapsedMs','maxModelAttempts','failedStage']);
  function metadata(source){const out={};for(const key of Object.keys(source||{}))if(safeKeys.has(key)&&['string','number','boolean'].includes(typeof source[key]))out[key]=typeof source[key]==='string'?source[key].slice(0,key==='pendingFields'?1000:100):source[key];return out;}
  let serial=0;
  function createOperation(options){
    options=options||{};
    const limits=budgets(options.budgets),controller=new AbortController(),started=now(),details=[];
    const id='document-'+Date.now().toString(36)+'-'+(++serial);
    let closed=false;
    const op={id,signal:controller.signal,limits,details,partial:null,stage:'preparation',documentType:options.documentType||'document',
      elapsed:()=>Math.round(now()-started),
      check(){if(controller.signal.aborted)throw controller.signal.reason;if(closed)throw error('PROCESSING_STALE');},
      cancel(code){if(!closed&&!controller.signal.aborted)controller.abort(error(code||'PROCESSING_CANCELLED'));},
      record(stage,meta){if(closed)return;details.push({stage,...metadata(meta)});if(details.length>300)details.shift();},
      update(stage,meta){op.check();op.stage=stage;if(options.onStage)options.onStage(stage,metadata(meta));},
      wait(work){op.check();return bounded(typeof work==='function'?work:()=>work,controller.signal,0);},
      async measure(stage,work,meta){
        op.check();const start=now();op.update(stage,meta);
        try{const result=await op.wait(work);op.check();op.record(stage,{...meta,elapsedMs:Math.round(now()-start),outcome:'success'});return result;}
        catch(e){op.record(stage,{...meta,elapsedMs:Math.round(now()-start),outcome:'failed',code:e.code||'PROCESSING_ERROR'});throw e;}
      },
      finish(outcome){
        if(closed)return;closed=true;clearTimeout(totalTimer);
        const detail={action:'Procesamiento documental ('+op.documentType+')',operationId:id,elapsedMs:op.elapsed(),local:true,outcome:outcome||'success',version:options.version||'',details:details.slice()};
        if(options.onFinish)options.onFinish(detail);
        return detail;
      }
    };
    const totalTimer=setTimeout(()=>op.cancel('PROCESSING_TIMEOUT'),limits.totalMs);
    return op;
  }
  function preserveManual(result,current){
    const out={...result,_origins:{...result._origins}};
    for(const key of Object.keys(current&&current._origins||{})){
      if(current._origins[key]==='manual'){out[key]=current[key];out._origins[key]='manual';}
    }
    return out;
  }
  global.AutoCorDocumentProcessing={budgets,createOperation,bounded,preserveManual,error};
})(typeof window!=='undefined'?window:globalThis);
