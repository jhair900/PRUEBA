// Pruebas locales: sin red, documentos reales ni credenciales.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const api=require('../js/gemini-availability.js'),[A,B]=api.catalog.map(m=>m.id);
const ok=()=>({ok:true,status:200,json:async()=>({valid:true})});
const service=(retryAfter='0')=>({ok:false,status:503,retryAfter,json:async()=>({error:{status:'UNAVAILABLE'}})});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(request,config={}){
 const calls=[],trace=[];
 const controller=api.create({getContext:()=> 'fixture',config:{retryBaseMs:1,retryMaxMs:10,...config},probeBody:()=>({probe:true}),
  request:(model,body,signal)=>{calls.push({model,probe:!!body.probe,body,at:Date.now()});return request(model,body,signal);},
  validate:data=>data,onTiming:detail=>trace.push(detail)});
 return {controller,calls,trace};
}
(async()=>{
 const unhandled=[],onUnhandled=e=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
 try{
  let failures=1;
  let t=setup(async(model,body)=>body.probe?ok():failures-->0?service('0.005'):ok());
  await t.controller.ensure();const body={document:'ficticio'},waits=[];
  let result=await t.controller.generate(body,{timeoutMs:100,onRetry:d=>waits.push(d.waitMs)});
  assert.equal(result.model,A);assert.deepEqual(t.calls.map(c=>c.probe),[true,false,false]);
  assert.equal(t.calls[1].body,t.calls[2].body);assert.ok(t.calls[2].at-t.calls[1].at>=4);assert.equal(waits[0],5);
  assert.equal(t.trace.find(d=>d.code==='AI_UPSTREAM_ERROR').httpStatus,503);assert.equal(t.controller.snapshot().ready,true);
  console.log('OK 503 es fallo temporal del servicio; espera indicada y reintento de la misma solicitud sin otra preparación/comprobación');

  t=setup(async(model,body)=>body.probe||model===B?ok():service());await t.controller.ensure();
  result=await t.controller.generate({document:true},{timeoutMs:100});
  assert.equal(result.model,B);assert.equal(result.attempts.length,3);assert.equal(result.requests,4);
  assert.deepEqual(t.calls.map(c=>(c.probe?'probe:':'doc:')+c.model),['probe:'+A,'doc:'+A,'doc:'+A,'probe:'+B,'doc:'+B]);
  console.log('OK dos 503 permiten alternativa comprobada; comparte límite de intentos y solicitudes');

  t=setup(async(model,body)=>body.probe?ok():service());await t.controller.ensure();
  await assert.rejects(t.controller.generate({document:true},{timeoutMs:100}),e=>e.code==='AI_UPSTREAM_ERROR'&&e.recoveryExhausted&&e.analysisAttempts.length===3&&e.recoveryRequests===4);
  assert.equal(t.calls.filter(c=>!c.probe).length,3);assert.equal(t.controller.snapshot().code,'AI_UPSTREAM_ERROR');
  console.log('OK 503 persistente se detiene con tres envíos documentales y conserva la causa, sin llamarlo cuota o conexión');

  t=setup(async(model,body)=>body.probe?ok():service('60'));await t.controller.ensure();
  await assert.rejects(t.controller.generate({document:true},{timeoutMs:100}),e=>e.code==='AI_UPSTREAM_ERROR'&&e.recoveryReason==='service-wait-exceeds-budget');
  assert.equal(t.calls.filter(c=>!c.probe).length,1);
  console.log('OK Retry-After mayor que el presupuesto no se ignora ni prolonga la operación');

  let reads=0,stopped=false;
  t=setup((model,body,signal)=>body.probe?Promise.resolve(ok()):++reads===1?Promise.resolve(service()):new Promise(()=>signal.addEventListener('abort',()=>stopped=true,{once:true})));
  await t.controller.ensure();const deadlineStarted=Date.now();
  await assert.rejects(t.controller.generate({document:true},{timeoutMs:25}),e=>e.code==='AI_TIMEOUT'&&e.recoveryExhausted&&e.analysisAttempts.length===2);
  assert.equal(stopped,true);assert.ok(Date.now()-deadlineStarted<500);assert.equal(reads,2);
  console.log('OK el plazo acumulado incluye la recuperación y aborta un reintento atascado sin ampliarse');

  let probing=true;
  t=setup(async(model,body)=>!body.probe?service():probing?ok():{ok:false,status:429,retryAfter:'1',json:async()=>({})});
  await t.controller.ensure();probing=false;
  await assert.rejects(t.controller.generate({document:true},{timeoutMs:100}),e=>e.code==='AI_RECOVERY_LIMIT'&&e.recoveryRequests===4&&e.causeCode==='AI_UPSTREAM_ERROR');
  assert.equal(t.calls.length,5,'Comprobación inicial aparte; sólo cuatro solicitudes dentro de esta lectura');
  console.log('OK alternativas sin cuota no multiplican comprobaciones; presupuesto acumulado reserva un envío documental');

  const cancel=new AbortController();
  t=setup(async(model,body)=>body.probe?ok():service());await t.controller.ensure();
  await assert.rejects(t.controller.generate({document:true},{timeoutMs:100,signal:cancel.signal,onRetry:()=>cancel.abort()}),e=>e.code==='AI_CANCELLED');
  await tick();assert.equal(t.calls.filter(c=>!c.probe).length,1);assert.equal(t.controller.snapshot().nextCheckAt,0);
  console.log('OK cancelar durante la espera detiene reintentos y no programa una recuperación duplicada');

  let probeSent,probeStopped=false;
  const duringProbe=new AbortController();
  t=setup((model,body,signal)=>body.probe&&model===B?new Promise(()=>{probeSent=true;signal.addEventListener('abort',()=>probeStopped=true,{once:true});}):Promise.resolve(body.probe?ok():service()));
  await t.controller.ensure();const pending=t.controller.generate({document:true},{timeoutMs:200,signal:duringProbe.signal});
  while(!probeSent)await tick();duringProbe.abort();
  await assert.rejects(pending,e=>e.code==='AI_CANCELLED');assert.equal(probeStopped,true);assert.equal(t.calls.filter(c=>!c.probe).length,2);
  console.log('OK cancelar durante la comprobación de alternativa aborta el canal y no envía el documento a B');

  const app={AutoCorTransport:{request:async()=>null}},storage={getItem:()=>JSON.stringify({token:'fixture'})};
  let response={ok:true,status:200,json:async()=>({_proxy:{ok:false,status:503},data:{error:{status:'UNAVAILABLE'}}})};
  const context=vm.createContext({window:app,localStorage:storage,URL,Date,AbortController,TextEncoder,setTimeout,clearTimeout,fetch:async()=>response});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/gemini-client.js'),'utf8'),context);
  const inner={},outer={};
  assert.equal((await app.AutoCorGemini.fetch('https://fixture.test/exec',{request:{}},100,inner)).status,503);
  assert.equal(inner.transportHttpStatus,200);assert.equal(inner.proxyHttpStatus,503);assert.equal(inner.statusOrigin,'proxy');assert.equal(inner.serviceStatus,'UNAVAILABLE');
  response={ok:false,status:503,headers:{get:()=> '2'},json:async()=>{throw SyntaxError('HTML de error');}};
  const http=await app.AutoCorGemini.fetch('https://fixture.test/exec',{request:{}},100,outer);
  assert.equal(http.status,503);assert.equal(http.retryAfter,'2');assert.equal(outer.transportHttpStatus,503);assert.equal(outer.statusOrigin,'apps-script-http');
  assert.equal(api.classify(http.status),'AI_UPSTREAM_ERROR');
  await tick();assert.deepEqual(unhandled,[]);
  console.log('OK se distinguen HTTP 200/proxy 503 y HTTP 503 externo, incluso HTML; sin datos documentales en el diagnóstico');
 }finally{process.removeListener('unhandledRejection',onUnhandled);}
})().catch(e=>{console.error(e);process.exitCode=1;});
