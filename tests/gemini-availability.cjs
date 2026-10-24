const assert=require('node:assert/strict'),api=require('../js/gemini-availability.js');
const tick=()=>new Promise(r=>setImmediate(r));
const [A,B]=api.catalog.map(m=>m.id);
function setup(extra={}){
 let context='session-A|backend-A',clock=1000;const calls=[],timings=[];
 const options={now:()=>clock,getContext:()=>context,config:{ttlMs:1000,maxCandidates:2,checkMs:2000},
  list:async()=>api.catalog.map(m=>({name:'models/'+m.id,supportedGenerationMethods:['generateContent']})),probeBody:()=>({probe:true}),
  validate:(data,body,stage)=>{if(!data.valid)throw Object.assign(new Error('invalid'),{code:'AI_INVALID_RESPONSE'});return data;},
  request:async(model,body,signal,timeout)=>{calls.push({model,probe:!!body.probe,timeout});return {status:200,ok:true,json:async()=>({valid:true})};},onTiming:t=>timings.push(t),...extra};
 const controller=api.create(options);
 return {controller,calls,timings,options,context:v=>context=v,advance:n=>clock+=n};
}
(async()=>{
 const budgetCalls=[];
 let budget=setup({config:{ttlMs:1000,attemptMs:10,checkMs:100,maxCandidates:1},request:async(model,body,signal,timeout)=>{
  budgetCalls.push({probe:!!body.probe,timeout});if(!body.probe)await new Promise(r=>setTimeout(r,25));return {ok:true,status:200,json:async()=>({valid:true})};
 }});
 await budget.controller.ensure();await budget.controller.generate({document:true},{timeoutMs:90});
 assert.equal(budgetCalls[0].timeout,10);assert.ok(budgetCalls[1].timeout>10);
 console.log('OK la lectura usa su presupuesto completo y no el límite corto de la comprobación');
 let list=0,probe=0;
 const onlyA={exclude:new Set(api.catalog.slice(1).map(m=>m.id))};
 let t=setup({config:{ttlMs:1000,maxCandidates:1,checkMs:2000,retryMs:1},list:async()=>{list++;throw Error('No listar antes de comprobar capacidad real');},request:async()=>{probe++;return {status:429,ok:false,retryAfter:'5',json:async()=>({error:{status:'RESOURCE_EXHAUSTED'}})};}});
 await assert.rejects(t.controller.ensure(onlyA),e=>e.code==='AI_QUOTA_EXHAUSTED');assert.equal(list,0);assert.equal(probe,1);assert.throws(()=>t.controller.guard(),e=>e.code==='AI_PRECHECK_REQUIRED');assert.equal(t.controller.guard('cuv'),true);
 await assert.rejects(t.controller.ensure(onlyA));assert.equal(probe,1,'Retry-After evita repetir el modelo limitado');t.advance(5100);await assert.rejects(t.controller.ensure(onlyA));assert.equal(probe,2);
 console.log('OK sin consulta redundante de catálogo; generación 429 bloquea, CUV local y Retry-After conservados');
 t=setup({request:async(model,body)=>{
   t.calls.push({model,probe:!!body.probe});
   return model===A?{status:429,ok:false,json:async()=>({})}:{status:200,ok:true,json:async()=>({valid:true})};
 }});const ticket=await t.controller.ensure();assert.equal(ticket.model,B);
 const result=await t.controller.generate({document:true},{ticket});assert.equal(result.model,B);
 assert.deepEqual(t.calls.map(x=>x.model),[A,B,B]);assert.equal(t.calls[2].probe,false);
 console.log('OK alternativa B elegida automáticamente al agotar A; el documento usa realmente B');
 let releases=[],n=0;t=setup({request:async()=>{n++;await new Promise(r=>releases.push(r));return {status:200,ok:true,json:async()=>({valid:true})};}});
 const first=t.controller.ensure(),duplicate=t.controller.ensure();await tick();assert.equal(n,1);releases.shift()();await Promise.all([first,duplicate]);assert.equal(n,1);
 t.advance(1100);assert.throws(()=>t.controller.guard());const refreshed=t.controller.ensure();await tick();releases.shift()();await refreshed;assert.equal(n,2);
 console.log('OK pruebas concurrentes agrupadas, caché corta caduca y necesita nueva generación');
 t.advance(1100);const stale=t.controller.ensure();await tick();t.context('session-A|backend-B');t.controller.invalidate();releases.shift()();await assert.rejects(stale,e=>e.code==='AI_CONTEXT_CHANGED');assert.equal(t.controller.snapshot().ready,false);
 const fresh=t.controller.ensure();await tick();releases.shift()();await fresh;t.context('session-B|backend-A');assert.throws(()=>t.controller.guard());assert.equal(t.controller.snapshot().ready,false);
 console.log('OK respuesta tardía no habilita otro contexto ni sesión/backend');
 let sends=[];t=setup({request:async(model,body)=>{sends.push({model,probe:!!body.probe});return body.probe?{status:200,ok:true,json:async()=>({valid:true})}:{status:429,ok:false,json:async()=>({error:{details:[{retryDelay:'12s'}]}})};},config:{ttlMs:1000,maxCandidates:1,checkMs:2000}});await t.controller.ensure();
 await assert.rejects(t.controller.generate({document:true}),e=>e.code==='AI_QUOTA_EXHAUSTED');assert.equal(sends.length,2);assert.equal(t.controller.snapshot().ready,false);
 console.log('OK cuota posterior invalida aprobación sin borrar los documentos del llamador');
 sends=[];t=setup({request:async(model,body)=>{sends.push({model,probe:!!body.probe});return !body.probe&&model===A?{status:429,ok:false,json:async()=>({})}:{status:200,ok:true,json:async()=>({valid:true})};}});await t.controller.ensure();assert.equal((await t.controller.generate({document:true})).model,B);
 assert.deepEqual(sends,[{model:A,probe:true},{model:A,probe:false},{model:B,probe:true},{model:B,probe:false}]);
 console.log('OK automático sólo cambia a una alternativa comprobada activamente, secuencial y sin fanout');
 for(const [status,code] of [[401,'AI_AUTH_ERROR'],[403,'AI_AUTH_ERROR'],[400,'AI_REQUEST_REJECTED'],[404,'AI_MODEL_UNAVAILABLE'],[500,'AI_UPSTREAM_ERROR'],[0,'AI_NETWORK_ERROR']]){
  t=setup({config:{ttlMs:1000,maxCandidates:1,checkMs:2000},request:async()=>({status,ok:false,json:async()=>({})})});await assert.rejects(t.controller.ensure(),e=>e.code===code);assert.equal(t.controller.snapshot().ready,false);
 }
 t=setup({validate:()=>{throw Object.assign(new Error('bad schema'),{code:'AI_INVALID_RESPONSE'});}});await assert.rejects(t.controller.ensure(),e=>e.code==='AI_INVALID_RESPONSE');assert.throws(()=>t.controller.guard());
 console.log('OK 200 inválido no acredita funcionamiento; errores distinguen autorización/solicitud/modelo/servicio/red');
 t=setup();await t.controller.ensure();const abort=new AbortController();abort.abort();await assert.rejects(t.controller.generate({},{signal:abort.signal}),e=>e.code==='AI_CANCELLED');assert.equal(t.calls.length,1);
 for(const secret of ['session-A','backend-A','document:true'])assert.ok(!JSON.stringify(t.timings).includes(secret));
 assert.equal(api.retryDelay({},{error:{details:[{retryDelay:'1.5s'}]}},0),1500);
 console.log('OK cancelación evita envíos y diagnósticos excluyen sesión y documentos');
 const fullCalls=[];t=setup({config:{ttlMs:1000},request:async(model)=>{
  fullCalls.push(model);return model===api.catalog.at(-1).id?{status:200,ok:true,json:async()=>({valid:true})}:{status:429,ok:false,json:async()=>({})};
 }});assert.equal((await t.controller.ensure()).model,api.catalog.at(-1).id);assert.equal(fullCalls.length,6);
 console.log('OK los seis candidatos se comprueban secuencialmente hasta encontrar cuota, sin límite artificial de tres');
 const unhandled=[];const handler=e=>unhandled.push(e);process.on('unhandledRejection',handler);
 t=setup({config:{ttlMs:1000,maxCandidates:1,checkMs:20,attemptMs:10},request:()=>new Promise(()=>{})});
 await assert.rejects(t.controller.ensure(),e=>e.code==='AI_TIMEOUT');assert.equal(t.controller.snapshot().ready,false);
 await tick();assert.equal(unhandled.length,0);process.removeListener('unhandledRejection',handler);
 console.log('OK comprobación atascada termina en plazo sin habilitar entradas ni rechazos sin manejar');
})().catch(e=>{console.error(e);process.exitCode=1;});
