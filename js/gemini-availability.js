/* Disponibilidad activa. Sólo conserva estados y diagnósticos sin documentos. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AutoCorGeminiAvailability=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // IDs contrastados con las fichas oficiales el 22-10-2026. La cuenta se consulta aparte.
  const catalog=Object.freeze([
    {id:'gemini-3.5-flash-lite',label:'Gemini 3.5 Flash Lite'},
    {id:'gemini-3.1-flash-lite',label:'Gemini 3.1 Flash Lite'},
    {id:'gemini-3.8-flash',label:'Gemini 3.8 Flash'},
    {id:'gemini-3-flash-preview',label:'Gemini 3 Flash (Preview)'},
    {id:'gemini-3.6-flash',label:'Gemini 3.6 Flash'},
    {id:'gemini-2.5-flash-lite',label:'Gemini 2.5 Flash Lite'}
  ]);
  const error=code=>Object.assign(new Error(code),{code});
  function wait(work,signal,ms){
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(fn,v)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);fn(v);};
      const cancel=()=>finish(reject,error(signal.reason?.code||'AI_CANCELLED'));
      const timer=setTimeout(()=>finish(reject,error('AI_TIMEOUT')),ms);
      if(signal?.aborted){cancel();return;}
      signal?.addEventListener('abort',cancel,{once:true});
      Promise.resolve().then(work).then(v=>finish(resolve,v),e=>finish(reject,e));
    });
  }
  function pause(ms,signal){
    return new Promise((resolve,reject)=>{
      const cancel=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);reject(error(signal.reason?.code||'AI_CANCELLED'));};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},ms);
      if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
    });
  }
  function retryDelay(response,data,now,fallback){
    const header=response.retryAfter;
    const seconds=Number(header);
    if(header&&Number.isFinite(seconds))return Math.max(0,seconds*1000);
    if(header&&Number.isFinite(Date.parse(header)))return Math.max(0,Date.parse(header)-now);
    for(const detail of data?.error?.details||[]){
      const match=/^(\d+(?:\.\d+)?)s$/.exec(String(detail.retryDelay||''));
      if(match)return Number(match[1])*1000;
    }
    return fallback??60000;
  }
  function classify(status){return status===401||status===403?'AI_AUTH_ERROR':status===429?'AI_QUOTA_EXHAUSTED':status===404||status===410?'AI_MODEL_UNAVAILABLE':status>=500?'AI_UPSTREAM_ERROR':status===0?'AI_NETWORK_ERROR':'AI_REQUEST_REJECTED';}
  function create(options){
    const now=options.now||Date.now,config={ttlMs:120000,checkMs:45000,attemptMs:10000,maxCandidates:catalog.length,maxCheckRuns:2,retryMs:60000,maxGenerateAttempts:3,maxRecoveryRequests:5,retryBaseMs:1000,retryMaxMs:5000,...options.config};
    config.ttlMs=Math.max(1000,Math.min(300000,config.ttlMs));
    config.maxCandidates=Math.max(1,Math.min(catalog.length,config.maxCandidates));
    config.maxCheckRuns=Math.max(1,Math.min(3,config.maxCheckRuns));
    let context='',epoch=0,active='',lastGood='',checkPromise=null,lastCode='',checkRuns=0,retryAt=0;
    const proofs=new Map(),states=new Map(),controllers=new Set();
    function reset(){epoch++;active=lastGood='';proofs.clear();states.clear();checkPromise=null;lastCode='';checkRuns=retryAt=0;for(const c of controllers)c.abort(error('AI_CONTEXT_CHANGED'));controllers.clear();}
    function sync(){const next=options.getContext();if(next!==context){reset();context=next;}return !!context;}
    function valid(model){const proof=proofs.get(model);return !!proof&&proof.epoch===epoch&&now()<proof.until;}
    function snapshot(){
      sync();const ready=!!active&&valid(active),entry=ready?proofs.get(active):null;
      return {model:ready?active:'',ready,checkedAt:entry?.at||0,expiresAt:entry?.until||0,checking:!!checkPromise,code:lastCode,nextCheckAt:retryAt,retryExhausted:!ready&&!checkPromise&&checkRuns>=config.maxCheckRuns,
        models:catalog.map(m=>({...m,...states.get(m.id),status:valid(m.id)?'available':states.get(m.id)?.status==='available'?'unchecked':states.get(m.id)?.status||'unchecked'}))};
    }
    const emit=()=>options.onState?.(snapshot());
    function guard(tipo){sync();if(tipo==='cuv')return true;if(!active||!valid(active)){emit();throw error('AI_PRECHECK_REQUIRED');}return {epoch,context,model:active};}
    function checkTicket(ticket){sync();if(ticket.epoch!==epoch||ticket.context!==context)throw error('AI_CONTEXT_CHANGED');}
    async function call(model,body,signal,timeoutMs,stage,ticket,meta){
      const start=now(),trace=stage==='ai-precheck'?{selectionRun:checkRuns,attemptBudgetMs:timeoutMs}:{};let code='',status;
      // Cada intento cancela también su transporte; no basta con abandonar su promesa.
      const controller=new AbortController(),cancel=()=>controller.abort(signal.reason||error('AI_CANCELLED'));
      controllers.add(controller);
      if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
      const timer=setTimeout(()=>controller.abort(error('AI_TIMEOUT')),timeoutMs);
      try{
        checkTicket(ticket);
        const response=await wait(()=>{
          if(controller.signal.aborted)throw controller.signal.reason;
          if(meta?.budget){if(meta.budget.used>=meta.limit)throw error('AI_RECOVERY_LIMIT');meta.budget.used++;trace.requestAttempt=meta.budget.used;}
          if(meta?.attempt)trace.attempt=meta.attempt;
          meta?.onSend?.({model,attempt:meta.attempt});
          return options.request(model,body,controller.signal,timeoutMs,trace);
        },controller.signal,timeoutMs);status=response.status;
        checkTicket(ticket);
        const data=await wait(()=>response.json(),controller.signal,Math.max(1,timeoutMs-(now()-start)));
        checkTicket(ticket);
        if(!response.ok){const e=error(classify(status));e.retryMs=retryDelay(response,data,now(),status>=500?0:60000);e.status=status;throw e;}
        return options.validate(data,body,stage);
      }catch(e){if(controller.signal.aborted)e=controller.signal.reason||e;code=e.code||'AI_INVALID_RESPONSE';throw Object.assign(e,{code});}
      finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);controllers.delete(controller);options.onTiming?.({stage,model,elapsedMs:now()-start,outcome:code?'failed':'success',code,httpStatus:status,...trace});}
    }
    function failed(model,e){proofs.delete(model);if(active===model)active='';lastCode=e.code;states.set(model,{status:['AI_QUOTA_EXHAUSTED','AI_UPSTREAM_ERROR','AI_NETWORK_ERROR','AI_TIMEOUT'].includes(e.code)?'limited':'unavailable',code:e.code,until:now()+(e.retryMs||60000)});emit();}
    function scheduleRetry(){
      retryAt=0;
      if(checkRuns<config.maxCheckRuns&&lastCode!=='AI_AUTH_ERROR'){
        const waiting=[...states.values()].map(s=>s.until).filter(until=>until>now());
        retryAt=Math.max(now()+config.retryMs,waiting.length?Math.min(...waiting):0);
      }
    }
    function ensure(opts){
      opts=opts||{};sync();
      if(opts.signal?.aborted)return Promise.reject(error(opts.signal.reason?.code==='AI_TIMEOUT'?'AI_TIMEOUT':'AI_CANCELLED'));
      if(!context){lastCode='AI_AUTH_ERROR';emit();return Promise.reject(error(lastCode));}
      if(active&&valid(active)&&!opts.exclude?.has(active))return Promise.resolve(guard());
      if(checkPromise)return opts.signal?wait(()=>checkPromise,opts.signal,opts.timeoutMs||config.checkMs):checkPromise;
      // Las interacciones de pantalla no pueden saltarse la pausa ni reiniciar el ciclo agotado.
      if(now()<retryAt||checkRuns>=config.maxCheckRuns){emit();return Promise.reject(error(lastCode||'AI_MODEL_UNAVAILABLE'));}
      checkRuns++;retryAt=0;
      const ticket={epoch,context},controller=new AbortController();controllers.add(controller);
      const cancel=()=>controller.abort(error(opts.signal.reason?.code==='AI_TIMEOUT'?'AI_TIMEOUT':'AI_CANCELLED'));
      opts.signal?.addEventListener('abort',cancel,{once:true});
      const budget=Math.min(config.checkMs,opts.timeoutMs||config.checkMs);
      const start=now(),timer=setTimeout(()=>controller.abort(error('AI_TIMEOUT')),budget);
      const promise=Promise.resolve().then(async()=>{
        try{
          checkTicket(ticket);
          const others=catalog.map(m=>m.id).filter(id=>id!==lastGood);
          // Si se acabó el presupuesto, la siguiente ronda alcanza los modelos aún no probados.
          let candidates=[lastGood,...others.filter(id=>!states.has(id)),...others.filter(id=>states.has(id))].filter(Boolean);
          candidates=candidates.filter(id=>!opts.exclude?.has(id)&&(states.get(id)?.until||0)<=now()).slice(0,config.maxCandidates);
          if(!candidates.length)throw error(lastCode||'AI_MODEL_UNAVAILABLE');
          // Una generación válida acredita soporte y cuota; listar modelos antes no lo acredita.
          const body=options.probeBody();
          for(const model of candidates){
            const remaining=budget-(now()-start);if(remaining<=0||controller.signal.aborted)throw error('AI_TIMEOUT');
            if(opts.requestBudget&&opts.requestBudget.used>=opts.requestLimit)throw error('AI_RECOVERY_LIMIT');
            states.set(model,{status:'checking'});emit();
            try{
              await call(model,body,controller.signal,Math.min(config.attemptMs,remaining),'ai-precheck',ticket,{budget:opts.requestBudget,limit:opts.requestLimit});
              checkTicket(ticket);if(controller.signal.aborted)throw error('AI_TIMEOUT');
              const at=now();proofs.set(model,{at,until:at+config.ttlMs,epoch});active=lastGood=model;lastCode='';checkRuns=retryAt=0;states.set(model,{status:'available'});emit();return guard();
            }catch(e){
              checkTicket(ticket);if(controller.signal.aborted&&opts.signal?.aborted)throw controller.signal.reason;
              if(e.code==='AI_RECOVERY_LIMIT')throw e;
              failed(model,e);
              if(controller.signal.aborted||!['AI_QUOTA_EXHAUSTED','AI_MODEL_UNAVAILABLE','AI_UPSTREAM_ERROR','AI_TIMEOUT','AI_NETWORK_ERROR','AI_INVALID_RESPONSE','AI_REQUEST_REJECTED'].includes(e.code))throw e;
            }
          }
          throw error(lastCode||'AI_MODEL_UNAVAILABLE');
        }catch(e){
          checkTicket(ticket);lastCode=e.code||'AI_INVALID_RESPONSE';
          if(e.code==='AI_CANCELLED'){checkRuns=Math.max(0,checkRuns-1);retryAt=0;}else scheduleRetry();
          emit();throw e;
        }
        finally{clearTimeout(timer);opts.signal?.removeEventListener('abort',cancel);controllers.delete(controller);}
      });
      checkPromise=promise;emit();promise.then(()=>{if(checkPromise===promise){checkPromise=null;emit();}},()=>{if(checkPromise===promise){checkPromise=null;emit();}});
      return promise;
    }
    async function generate(body,opts){
      opts=opts||{};
      const start=now(),duration=opts.timeoutMs||45000,excluded=new Set(),triedModels=new Set(),attempts=[],budget={used:0};
      const maxAttempts=Math.max(1,Math.min(5,opts.maxAttempts||config.maxGenerateAttempts));
      const maxRequests=Math.max(1,Math.min(8,config.maxRecoveryRequests));
      const controller=new AbortController(),cancel=()=>controller.abort(error('AI_CANCELLED'));
      controllers.add(controller);
      if(opts.signal?.aborted)cancel();else opts.signal?.addEventListener('abort',cancel,{once:true});
      const timer=setTimeout(()=>controller.abort(error('AI_TIMEOUT')),duration);
      let ticket,lastError,sameModelFailures=0,documentRequests=0;
      const remaining=()=>duration-(now()-start);
      try{
        if(controller.signal.aborted)throw error('AI_CANCELLED');
        ticket=opts.ticket||await ensure({signal:controller.signal,timeoutMs:remaining(),requestBudget:budget,requestLimit:maxRequests-1});
        checkTicket(ticket);
        if(!valid(ticket.model))ticket=await ensure({signal:controller.signal,timeoutMs:remaining(),requestBudget:budget,requestLimit:maxRequests-1});
        triedModels.add(ticket.model);
        for(let attempt=1;attempt<=maxAttempts;attempt++){
          checkTicket(ticket);if(controller.signal.aborted)throw controller.signal.reason;
          if(remaining()<=0)throw error('AI_TIMEOUT');
          if(budget.used>=maxRequests)throw error('AI_RECOVERY_LIMIT');
          let sent=false;
          try{
            // Los reintentos comparten el plazo de lectura; no amplían su timeout.
            const result=await call(ticket.model,body,controller.signal,remaining(),'ai-response',ticket,{budget,limit:maxRequests,attempt,onSend:meta=>{sent=true;documentRequests++;opts.onAttempt?.(meta);}});
            checkTicket(ticket);if(controller.signal.aborted)throw controller.signal.reason;
            const at=now();proofs.set(ticket.model,{at,until:at+config.ttlMs,epoch});active=lastGood=ticket.model;lastCode='';checkRuns=retryAt=0;states.set(ticket.model,{status:'available'});emit();
            attempts.push({model:ticket.model,outcome:'success'});return {data:result,model:ticket.model,attempts,requests:budget.used};
          }catch(e){
            checkTicket(ticket);if(controller.signal.aborted){if(sent)attempts.push({model:ticket.model,outcome:'failed',code:controller.signal.reason.code});throw controller.signal.reason;}
            lastError=e;attempts.push({model:ticket.model,outcome:'failed',code:e.code,httpStatus:e.status});failed(ticket.model,e);
            const temporary=e.code==='AI_UPSTREAM_ERROR';
            const switchable=['AI_QUOTA_EXHAUSTED','AI_MODEL_UNAVAILABLE'].includes(e.code);
            if(attempt>=maxAttempts||(!temporary&&!switchable))throw e;
            if(temporary){
              sameModelFailures++;
              const waitMs=Math.max(e.retryMs||0,Math.min(config.retryMaxMs,config.retryBaseMs*2**(attempt-1)));
              if(waitMs>=remaining()){e.recoveryReason='service-wait-exceeds-budget';throw e;}
              opts.onRetry?.({attempt:attempt+1,model:ticket.model,waitMs,code:e.code,httpStatus:e.status});
              await pause(waitMs,controller.signal);checkTicket(ticket);
              if(sameModelFailures<2)continue;
            }
            if(triedModels.size>=config.maxCandidates)throw e;
            excluded.add(ticket.model);
            if(budget.used>=maxRequests-1)throw error('AI_RECOVERY_LIMIT');
            ticket=await ensure({exclude:excluded,timeoutMs:remaining(),signal:controller.signal,requestBudget:budget,requestLimit:maxRequests-1});
            triedModels.add(ticket.model);
            sameModelFailures=0;options.onSwitch?.(ticket.model);
          }
        }
        throw error('AI_RECOVERY_LIMIT');
      }catch(e){
        if(opts.signal?.aborted)e=error('AI_CANCELLED');
        else if(controller.signal.aborted)e=controller.signal.reason;
        e.analysisAttempts=attempts;e.recoveryRequests=budget.used;
        e.requestAttempted=documentRequests>0;
        if(lastError&&e!==lastError)e.causeCode=lastError.code;
        e.recoveryExhausted=['AI_UPSTREAM_ERROR','AI_RECOVERY_LIMIT','AI_TIMEOUT'].includes(e.code);
        if(!['AI_CANCELLED','AI_CONTEXT_CHANGED'].includes(e.code)){scheduleRetry();emit();}
        throw e;
      }finally{
        clearTimeout(timer);opts.signal?.removeEventListener('abort',cancel);controllers.delete(controller);
      }
    }
    return {snapshot,guard,ensure,generate,invalidate:()=>{reset();emit();},checkTicket};
  }
  return {catalog,create,classify,retryDelay};
});
