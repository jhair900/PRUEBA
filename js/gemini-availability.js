/* Selección inicial por carga de página. Sólo estados y diagnósticos sin documentos. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AutoCorGeminiAvailability=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Únicos modelos autorizados. La selección no cambia durante esta carga de página.
  const catalog=Object.freeze([
    Object.freeze({id:'gemini-3.5-flash-lite',label:'Gemini 3.5 Flash Lite'}),
    Object.freeze({id:'gemini-3.1-flash-lite',label:'Gemini 3.1 Flash Lite'})
  ]);
  const allowedModels=new Set(catalog.map(m=>m.id));
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
  function safeDiagnostic(value,secrets){
    let text=String(value||'');
    for(const secret of secrets||[])if(secret)text=text.split(String(secret)).join('[oculto]');
    return text.replace(/AIza[\w-]+/g,'[clave omitida]')
      .replace(/(Bearer\s+)[^\s"'<>]+/gi,'$1[oculto]')
      .replace(/((?:sessionToken|password|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi,'$1[oculto]')
      .replace(/https?:\/\/[^\s"'<>]+/gi,'[URL omitida]')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[correo omitido]')
      .replace(/\b(?:projects|consumers)\/[\w.-]+/gi,'[proyecto omitido]')
      .replace(/\b\d{6,}\b/g,'[identificador omitido]').slice(0,900);
  }
  function classify(status,data,trace){
    if(data?.error?.status==='CONFIG_ERROR')return 'AI_BACKEND_CONFIG_ERROR';
    if(data?.error?.status==='FETCH_ERROR')return 'AI_BACKEND_CONNECTION_ERROR';
    if((status===401||status===403)&&trace?.statusOrigin==='apps-script-http')return 'AI_BACKEND_ACCESS_ERROR';
    return status===401||status===403?'AI_PROVIDER_AUTH_ERROR':status===429?'AI_QUOTA_EXHAUSTED':status===404||status===410?'AI_MODEL_UNAVAILABLE':status>=500?'AI_UPSTREAM_ERROR':status===0?'AI_NETWORK_ERROR':'AI_REQUEST_REJECTED';
  }
  // Sólo para la comprobación ficticia: conserva imagen + esquema, sin criterios documentales.
  function buildProbe(dataUrl){
    const match=/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl||'');
    if(!match)throw error('AI_INVALID_RESPONSE');
    return {contents:[{role:'user',parts:[
      {text:'Lee PLACA y COLOR visibles en esta imagen ficticia. Devuelve sólo el JSON del esquema, sin explicaciones. Usa _reviewKeys sólo si la lectura es ambigua.'},
      {inline_data:{mime_type:'image/png',data:match[1]}}
    ]}],generationConfig:{temperature:0,maxOutputTokens:256,responseMimeType:'application/json',responseSchema:{
      type:'OBJECT',properties:{placa:{type:'STRING'},color:{type:'STRING'},_reviewKeys:{type:'ARRAY',items:{type:'STRING',enum:['placa','color']}}},required:['placa','color','_reviewKeys']
    }}};
  }
  function create(options){
    const now=options.now||Date.now,config={checkMs:45000,maxGenerateAttempts:3,maxRecoveryRequests:5,retryBaseMs:1000,retryMaxMs:5000,...options.config};
    let context='',epoch=0,active='',checkPromise=null,lastCode='',checkRuns=0;
    let initialTrace=null,initialUnknown=false;
    const proofs=new Map(),states=new Map(),controllers=new Set();
    // Cambiar sesión invalida respuestas anteriores, no la selección ni su ronda inicial.
    function reset(){
      const interrupted=!active&&!!checkPromise;
      epoch++;checkPromise=null;
      // La ronda interrumpida por autenticación no puede dejar bloqueada la sesión recuperada.
      if(interrupted){
        if(initialTrace&&initialTrace.remoteState!=='not_sent'&&initialTrace.remoteState!=='complete')initialUnknown=true;
        checkRuns=initialUnknown?1:0;lastCode=initialUnknown?'AI_INITIAL_RESULT_UNKNOWN':'';states.clear();
      }
      else if(initialUnknown&&!active)lastCode='AI_INITIAL_RESULT_UNKNOWN';
      else if(checkRuns&&!active)lastCode='AI_CONTEXT_CHANGED';
      else if(active&&lastCode==='AI_AUTH_ERROR')lastCode='';
      for(const c of controllers)c.abort(error('AI_CONTEXT_CHANGED'));controllers.clear();
    }
    function sync(){const next=options.getContext();if(next!==context){reset();context=next;}return !!context;}
    function valid(model){return allowedModels.has(model)&&proofs.has(model);}
    function snapshot(){
      sync();const ready=!!context&&!!active&&valid(active),entry=proofs.get(active);
      return {model:active,ready,checkedAt:entry?.at||0,expiresAt:0,checking:!!checkPromise,code:context?lastCode:'AI_AUTH_ERROR',nextCheckAt:0,selectionStarted:checkRuns>0,retryExhausted:!active&&!checkPromise&&checkRuns>0,remoteUnconfirmed:initialUnknown,
        models:catalog.map(m=>({...m,...states.get(m.id),status:states.get(m.id)?.status||'unchecked'}))};
    }
    const emit=()=>options.onState?.(snapshot());
    function guard(tipo){sync();if(tipo==='cuv')return true;if(!context)throw error('AI_AUTH_ERROR');if(!active||!valid(active))throw error('AI_PRECHECK_REQUIRED');return {epoch,context,model:active};}
    function checkTicket(ticket){sync();if(!ticket||ticket.epoch!==epoch||ticket.context!==context)throw error('AI_CONTEXT_CHANGED');if(ticket.model&&(!allowedModels.has(ticket.model)||ticket.model!==active))throw error('AI_MODEL_UNAVAILABLE');}
    async function call(model,body,signal,timeoutMs,stage,ticket,meta){
      if(!allowedModels.has(model))throw error('AI_MODEL_UNAVAILABLE');
      const start=now(),trace=stage==='ai-precheck'?{selectionRun:checkRuns,attemptBudgetMs:timeoutMs,diagnosticProbe:true,remoteState:'not_sent'}:{};let code='',status;
      if(stage==='ai-precheck')initialTrace=trace;
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
          if(stage==='ai-precheck')trace.remoteState='dispatched';
          return options.request(model,body,controller.signal,timeoutMs,trace);
        },controller.signal,timeoutMs);status=response.status;
        checkTicket(ticket);
        const data=await wait(()=>response.json(),controller.signal,Math.max(1,timeoutMs-(now()-start)));
        if(stage==='ai-precheck'&&!response.trace?.remoteState)trace.remoteState='complete';
        checkTicket(ticket);
        if(!response.ok){
          if(typeof data?.error?.code==='number')trace.serviceCode=data.error.code;
          if(/^[A-Z_]{1,64}$/.test(data?.error?.status||''))trace.serviceStatus=data.error.status;
          if(stage==='ai-precheck'&&data?.error?.message&&!trace.serviceMessage)trace.serviceMessage=safeDiagnostic(data.error.message);
          const e=error(classify(status,data,trace));e.retryMs=retryDelay(response,data,now(),status>=500?0:60000);e.status=status;throw e;
        }
        const validationStarted=now();
        try{return options.validate(data,body,stage);}
        finally{trace.resultValidationMs=now()-validationStarted;}
      }catch(e){
        const causeMessage=e.message;
        if(controller.signal.aborted)e=controller.signal.reason||e;
        code=e.code||'AI_INVALID_RESPONSE';
        if(stage==='ai-precheck'&&!trace.serviceMessage)trace.serviceMessage=code==='AI_TIMEOUT'
          ?'Se agotó el límite de '+timeoutMs+' ms del intento inicial sin recibir una respuesta completa; no se recibió un motivo del proveedor.'
          :safeDiagnostic(causeMessage);
        throw Object.assign(e,{code});
      }
      finally{
        if(stage==='ai-precheck'&&trace.remoteState!=='complete'&&trace.remoteState!=='not_sent'){
          trace.remoteState='unknown';
          initialUnknown=true;
        }
        clearTimeout(timer);signal?.removeEventListener('abort',cancel);controllers.delete(controller);
        options.onTiming?.({stage,model,elapsedMs:now()-start,outcome:code?'failed':'success',code,httpStatus:status,...trace});
        if(initialTrace===trace)initialTrace=null;
      }
    }
    function failed(model,e){lastCode=e.code;states.set(model,{status:['AI_QUOTA_EXHAUSTED','AI_UPSTREAM_ERROR','AI_NETWORK_ERROR','AI_TIMEOUT'].includes(e.code)?'limited':'unavailable',code:e.code});emit();}
    function ensure(opts){
      opts=opts||{};sync();
      if(opts.signal?.aborted)return Promise.reject(error(opts.signal.reason?.code==='AI_TIMEOUT'?'AI_TIMEOUT':'AI_CANCELLED'));
      if(!context){lastCode='AI_AUTH_ERROR';emit();return Promise.reject(error(lastCode));}
      if(active&&valid(active))return Promise.resolve(guard());
      if(checkPromise)return opts.signal?wait(()=>checkPromise,opts.signal,opts.timeoutMs||config.checkMs):checkPromise;
      // Sólo una ronda inicial; ni el reloj, las interacciones ni los errores la reinician.
      if(checkRuns>0)return Promise.reject(error(lastCode||'AI_MODEL_UNAVAILABLE'));
      checkRuns++;
      const ticket={epoch,context},controller=new AbortController();controllers.add(controller);
      const cancel=()=>controller.abort(error(opts.signal.reason?.code==='AI_TIMEOUT'?'AI_TIMEOUT':'AI_CANCELLED'));
      opts.signal?.addEventListener('abort',cancel,{once:true});
      const budget=Math.max(1,Math.min(45000,config.checkMs,opts.timeoutMs||config.checkMs));
      const start=now(),timer=setTimeout(()=>controller.abort(error('AI_TIMEOUT')),budget);
      const promise=Promise.resolve().then(async()=>{
        try{
          checkTicket(ticket);
          const candidates=catalog.map(m=>m.id);
          // Una generación válida acredita soporte y cuota; listar modelos antes no lo acredita.
          const body=options.probeBody();
          let requests=0,previousError;
          for(const model of candidates){
            checkTicket(ticket);
            if(initialUnknown)throw Object.assign(error('AI_INITIAL_RESULT_UNKNOWN'),{causeCode:previousError?.code,remoteUnconfirmed:true});
            if(previousError&&['AI_UPSTREAM_ERROR'].includes(previousError.code)){
              const waitMs=Math.max(previousError.retryMs||0,config.retryBaseMs);
              if(waitMs>=budget-(now()-start)){
                options.onTiming?.({stage:'ai-precheck-retry',model,elapsedMs:0,outcome:'skipped',waitMs,code:previousError.code,recoveryReason:'service-wait-exceeds-budget'});throw previousError;
              }
              const waitStarted=now();await pause(waitMs,controller.signal);checkTicket(ticket);
              options.onTiming?.({stage:'ai-precheck-retry',model,elapsedMs:now()-waitStarted,outcome:'waited',waitMs,attempt:requests+1,code:previousError.code});
            }
            const remaining=budget-(now()-start);if(remaining<=0||controller.signal.aborted)throw error('AI_TIMEOUT');
            if(opts.requestBudget&&opts.requestBudget.used>=opts.requestLimit)throw error('AI_RECOVERY_LIMIT');
            states.set(model,{status:'checking'});emit();
            try{
              requests++;
              // Un presupuesto compartido, sin cortes de 10 s que lancen otra solicitud a ciegas.
              await call(model,body,controller.signal,remaining,'ai-precheck',ticket,{budget:opts.requestBudget,limit:opts.requestLimit,attempt:requests});
              checkTicket(ticket);if(controller.signal.aborted)throw error('AI_TIMEOUT');
              proofs.set(model,{at:now()});active=model;lastCode='';states.set(model,{status:'available'});emit();return guard();
            }catch(e){
              checkTicket(ticket);if(controller.signal.aborted&&opts.signal?.aborted)throw controller.signal.reason;
              if(e.code==='AI_RECOVERY_LIMIT')throw e;
              if(initialUnknown)throw Object.assign(error('AI_INITIAL_RESULT_UNKNOWN'),{causeCode:e.code,remoteUnconfirmed:true});
              failed(model,e);previousError=e;
              if(controller.signal.aborted||!['AI_QUOTA_EXHAUSTED','AI_MODEL_UNAVAILABLE','AI_UPSTREAM_ERROR','AI_INVALID_RESPONSE','AI_REQUEST_REJECTED'].includes(e.code))throw e;
            }
          }
          throw error(lastCode||'AI_MODEL_UNAVAILABLE');
        }catch(e){
          // Una promesa de la sesión anterior no modifica ni cancela la ronda nueva.
          checkTicket(ticket);
          if(['AUTH_REQUIRED','AUTH_EXPIRED','AUTH_CONTEXT_CHANGED','AI_CONTEXT_CHANGED'].includes(e.code)&&!active&&!initialUnknown)checkRuns=0;
          lastCode=e.code||'AI_INVALID_RESPONSE';
          emit();throw e;
        }
        finally{clearTimeout(timer);opts.signal?.removeEventListener('abort',cancel);controllers.delete(controller);}
      });
      checkPromise=promise;emit();promise.then(()=>{if(checkPromise===promise){checkPromise=null;emit();}},()=>{if(checkPromise===promise){checkPromise=null;emit();}});
      return promise;
    }
    async function generate(body,opts){
      opts=opts||{};
      sync();
      const start=now(),duration=opts.timeoutMs||45000,attempts=[],budget={used:0};
      const maxAttempts=Math.max(1,Math.min(5,opts.maxAttempts||config.maxGenerateAttempts));
      const maxRequests=Math.max(1,Math.min(8,config.maxRecoveryRequests));
      const controller=new AbortController(),cancel=()=>controller.abort(error('AI_CANCELLED'));
      controllers.add(controller);
      if(opts.signal?.aborted)cancel();else opts.signal?.addEventListener('abort',cancel,{once:true});
      const timer=setTimeout(()=>controller.abort(error('AI_TIMEOUT')),duration);
      let ticket,lastError,documentRequests=0;
      const remaining=()=>duration-(now()-start);
      try{
        if(controller.signal.aborted)throw error('AI_CANCELLED');
        ticket=opts.ticket||guard();
        checkTicket(ticket);
        if(!valid(ticket.model))throw error('AI_PRECHECK_REQUIRED');
        for(let attempt=1;attempt<=maxAttempts;attempt++){
          checkTicket(ticket);if(controller.signal.aborted)throw controller.signal.reason;
          if(remaining()<=0)throw error('AI_TIMEOUT');
          if(budget.used>=maxRequests)throw error('AI_RECOVERY_LIMIT');
          let sent=false;
          try{
            // Los reintentos comparten el plazo de lectura; no amplían su timeout.
            const result=await call(ticket.model,body,controller.signal,Math.min(remaining(),opts.attemptMs||remaining()),'ai-response',ticket,{budget,limit:maxRequests,attempt,onSend:meta=>{sent=true;documentRequests++;opts.onAttempt?.(meta);}});
            checkTicket(ticket);if(controller.signal.aborted)throw controller.signal.reason;
            lastCode='';states.set(ticket.model,{status:'available'});emit();
            attempts.push({model:ticket.model,outcome:'success'});return {data:result,model:ticket.model,attempts,requests:budget.used};
          }catch(e){
            checkTicket(ticket);if(controller.signal.aborted){if(sent)attempts.push({model:ticket.model,outcome:'failed',code:controller.signal.reason.code});throw controller.signal.reason;}
            lastError=e;attempts.push({model:ticket.model,outcome:'failed',code:e.code,httpStatus:e.status});failed(ticket.model,e);
            const retryable=['AI_UPSTREAM_ERROR','AI_QUOTA_EXHAUSTED','AI_NETWORK_ERROR','AI_BACKEND_CONNECTION_ERROR','AI_TIMEOUT','AI_INVALID_RESPONSE','AI_RESPONSE_INCOMPLETE'].includes(e.code);
            if(attempt>=maxAttempts||!retryable)throw e;
            const waitMs=Math.max(e.retryMs||0,Math.min(config.retryMaxMs,config.retryBaseMs*2**(attempt-1)));
            if(waitMs>=remaining()){e.recoveryReason='service-wait-exceeds-budget';throw e;}
            opts.onRetry?.({attempt:attempt+1,model:ticket.model,waitMs,code:e.code,httpStatus:e.status});
            await pause(waitMs,controller.signal);checkTicket(ticket);
          }
        }
        throw error('AI_RECOVERY_LIMIT');
      }catch(e){
        if(opts.signal?.aborted)e=error('AI_CANCELLED');
        else if(controller.signal.aborted)e=controller.signal.reason;
        e.analysisAttempts=attempts;e.recoveryRequests=budget.used;
        e.requestAttempted=documentRequests>0;
        if(lastError&&e!==lastError)e.causeCode=lastError.code;
        e.recoveryExhausted=['AI_UPSTREAM_ERROR','AI_RECOVERY_LIMIT','AI_TIMEOUT','AI_NETWORK_ERROR','AI_BACKEND_CONNECTION_ERROR','AI_INVALID_RESPONSE','AI_RESPONSE_INCOMPLETE'].includes(e.code);
        // El presupuesto agotado pertenece a este documento. Sólo un impedimento
        // común a los siguientes documentos detiene el lote completo.
        e.stopBatch=['AUTH_REQUIRED','AUTH_EXPIRED','AUTH_CONTEXT_CHANGED','SESSION_SERVICE_ERROR','AI_AUTH_ERROR','AI_PROVIDER_AUTH_ERROR','AI_BACKEND_CONFIG_ERROR','AI_BACKEND_ACCESS_ERROR','AI_CONTEXT_CHANGED','AI_MODEL_UNAVAILABLE','AI_QUOTA_EXHAUSTED','AI_PRECHECK_REQUIRED'].includes(e.code)||
          (e.recoveryReason==='service-wait-exceeds-budget'&&e.retryMs>0);
        if(!['AI_CANCELLED','AI_CONTEXT_CHANGED'].includes(e.code)&&ticket?.model===active)failed(active,e);
        throw e;
      }finally{
        clearTimeout(timer);opts.signal?.removeEventListener('abort',cancel);controllers.delete(controller);
      }
    }
    return {snapshot,guard,ensure,generate,invalidate:()=>{reset();emit();},checkTicket};
  }
  return {catalog,create,classify,retryDelay,safeDiagnostic,buildProbe};
});
