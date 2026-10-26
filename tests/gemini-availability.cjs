// Política por carga de página: servicios, credenciales y documentos ficticios.
const assert=require('node:assert/strict'),api=require('../js/gemini-availability.js');
const [A,B]=api.catalog.map(m=>m.id),ok=()=>({ok:true,status:200,json:async()=>({valid:true})});
const failure=status=>({ok:false,status,retryAfter:'0',json:async()=>({})});
function setup(request,extra={}){
 let context='fixture-A',clock=1000;const calls=[],timings=[];
 const controller=api.create({now:()=>clock,getContext:()=>context,config:{ttlMs:1000,retryBaseMs:1,retryMaxMs:2,...extra},
  probeBody:()=>({probe:true}),validate:data=>{if(!data.valid)throw Object.assign(Error('schema'),{code:'AI_INVALID_RESPONSE'});return data;},
  request:(model,body,signal)=>{calls.push({model,probe:!!body.probe});return request(model,body,signal);},onTiming:t=>timings.push(t),onSwitch:()=>{throw Error('No cambiar de modelo');}});
 return {controller,calls,timings,advance:n=>clock+=n,context:value=>context=value};
}
(async()=>{
 assert.deepEqual(api.catalog.map(m=>m.id),['gemini-3.5-flash-lite','gemini-3.1-flash-lite']);
 let t=setup(async()=>ok());
 await assert.rejects(t.controller.generate({document:true}),e=>e.code==='AI_PRECHECK_REQUIRED');assert.equal(t.calls.length,0,'Generar no inicia una selección');
 const ticket=await t.controller.ensure(),checkedAt=t.controller.snapshot().checkedAt;
 t.advance(86400000);
 for(let i=0;i<5;i++){assert.equal((await t.controller.ensure()).model,A);assert.equal((await t.controller.generate({document:true},{ticket})).model,A);}
 assert.equal(t.calls.filter(c=>c.probe).length,1);assert.ok(t.calls.every(c=>c.model===A));
 assert.equal(t.controller.snapshot().checkedAt,checkedAt);assert.equal(t.controller.snapshot().expiresAt,0);assert.equal(t.controller.snapshot().nextCheckAt,0);
 console.log('OK sólo dos modelos; una selección inicial, sin caducidad ni comprobación previa a cada documento');

 t=setup(async(model,body)=>body.probe&&model===A?failure(429):ok(),{maxCandidates:99,maxCheckRuns:99});
 assert.equal((await t.controller.ensure()).model,B);
 for(let i=0;i<3;i++)assert.equal((await t.controller.generate({document:true})).model,B);
 assert.deepEqual(t.calls.filter(c=>c.probe).map(c=>c.model),[A,B]);
 assert.ok(t.calls.filter(c=>!c.probe).every(c=>c.model===B));
 console.log('OK la alternativa B sólo se elige en la ronda inicial y se conserva para todos los documentos');

 t=setup(async()=>failure(429),{maxCandidates:99,maxCheckRuns:99});
 await assert.rejects(t.controller.ensure(),e=>e.code==='AI_QUOTA_EXHAUSTED');
 t.advance(86400000);
 for(let i=0;i<8;i++)await assert.rejects(t.controller.ensure());
 await assert.rejects(t.controller.generate({document:true}),e=>e.code==='AI_PRECHECK_REQUIRED');
 t.controller.invalidate();await assert.rejects(t.controller.ensure());
 assert.deepEqual(t.calls,[{model:A,probe:true},{model:B,probe:true}]);
 assert.equal(t.controller.snapshot().ready,false);assert.equal(t.controller.snapshot().retryExhausted,true);assert.equal(t.controller.guard('cuv'),true);
 console.log('OK ambos agotados: entradas bloqueadas, CUV local y sin rondas adicionales por reloj, reintento o invalidación');

 t=setup(async(model,body)=>body.probe?ok():failure(429));await t.controller.ensure();
 await assert.rejects(t.controller.generate({document:true},{timeoutMs:100}),e=>e.code==='AI_QUOTA_EXHAUSTED'&&e.stopBatch);
 assert.equal(t.controller.snapshot().model,A);assert.equal(t.controller.snapshot().ready,true);
 assert.equal((await t.controller.ensure({exclude:new Set([A])})).model,A,'Una exclusión no cambia una selección ya fijada');
 assert.ok(t.calls.every(c=>c.model===A));assert.equal(t.calls.filter(c=>c.probe).length,1);
 console.log('OK cuota posterior conserva el modelo seleccionado y los errores no activan otra selección');

 t=setup(async()=>ok());const selected=await t.controller.ensure(),before=t.calls.length;
 for(const model of [B,'gemini-2.5-flash-lite','test'])await assert.rejects(t.controller.generate({document:true},{ticket:{...selected,model}}),e=>e.code==='AI_MODEL_UNAVAILABLE');
 assert.equal(t.calls.length,before);
 t.context('');assert.equal(t.controller.snapshot().ready,false);assert.equal(t.controller.snapshot().model,A);
 assert.throws(()=>t.controller.guard(),e=>e.code==='AI_AUTH_ERROR');
 t.context('fixture-B');t.controller.invalidate();assert.equal((await t.controller.ensure()).model,A);
 await assert.rejects(t.controller.generate({document:true},{ticket:selected}),e=>e.code==='AI_CONTEXT_CHANGED');
 assert.equal(t.calls.length,before);
 console.log('OK ninguna ruta admite un modelo distinto; cambiar sesión invalida respuestas anteriores sin cambiar la selección');

 for(const status of [401,403,404,500,0,400]){
  t=setup(async()=>failure(status));await assert.rejects(t.controller.ensure());assert.equal(t.controller.snapshot().ready,false);
  const count=t.calls.length;await assert.rejects(t.controller.ensure());assert.equal(t.calls.length,count);
 }
 t=setup(async()=>({ok:true,status:200,json:async()=>({valid:false})}));await assert.rejects(t.controller.ensure(),e=>e.code==='AI_INVALID_RESPONSE');assert.equal(t.controller.snapshot().model,'');
 assert.equal(api.retryDelay({},{error:{details:[{retryDelay:'1.5s'}]}},0),1500);
 assert.ok(!JSON.stringify(t.timings).includes('fixture-A'));
 console.log('OK una respuesta inválida no acredita disponibilidad; clasificación, espera indicada y privacidad conservadas');
})().catch(e=>{console.error(e);process.exitCode=1;});
