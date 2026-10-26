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
  await assert.rejects(t.controller.generate({document:true},{timeoutMs:100}),e=>e.code==='AI_UPSTREAM_ERROR'&&e.analysisAttempts.length===3&&e.recoveryRequests===3);
  assert.equal(t.controller.snapshot().model,A);
  assert.deepEqual(t.calls.map(c=>(c.probe?'probe:':'doc:')+c.model),['probe:'+A,'doc:'+A,'doc:'+A,'doc:'+A]);
  console.log('OK dos 503 mantienen A en el tercer intento; no se comprueba ni utiliza B');

  t=setup(async(model,body)=>body.probe?ok():service());await t.controller.ensure();
  await assert.rejects(t.controller.generate({document:true},{timeoutMs:100}),e=>e.code==='AI_UPSTREAM_ERROR'&&e.recoveryExhausted&&e.analysisAttempts.length===3&&e.recoveryRequests===3);
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
  assert.equal(t.controller.snapshot().model,A);assert.equal(t.controller.snapshot().code,'AI_TIMEOUT');
  console.log('OK el plazo acumulado incluye la recuperación y aborta un reintento atascado sin ampliarse');

  t=setup(async(model,body)=>body.probe?ok():service(),{maxRecoveryRequests:2});
  await t.controller.ensure();
  await assert.rejects(t.controller.generate({document:true},{timeoutMs:100}),e=>e.code==='AI_RECOVERY_LIMIT'&&e.recoveryRequests===2&&e.causeCode==='AI_UPSTREAM_ERROR');
  assert.equal(t.calls.length,3,'Comprobación inicial aparte; sólo dos solicitudes dentro de esta lectura');
  console.log('OK el presupuesto de solicitudes se respeta sin comprobar alternativas');

  const cancel=new AbortController();
  t=setup(async(model,body)=>body.probe?ok():service());await t.controller.ensure();
  await assert.rejects(t.controller.generate({document:true},{timeoutMs:100,signal:cancel.signal,onRetry:()=>cancel.abort()}),e=>e.code==='AI_CANCELLED');
  await tick();assert.equal(t.calls.filter(c=>!c.probe).length,1);assert.equal(t.controller.snapshot().nextCheckAt,0);
  console.log('OK cancelar durante la espera detiene reintentos y no programa una recuperación duplicada');

  let thirdSent,thirdStopped=false,documentAttempt=0;
  const duringProbe=new AbortController();
  t=setup((model,body,signal)=>!body.probe&&++documentAttempt===3?new Promise(()=>{thirdSent=true;signal.addEventListener('abort',()=>thirdStopped=true,{once:true});}):Promise.resolve(body.probe?ok():service()));
  await t.controller.ensure();const pending=t.controller.generate({document:true},{timeoutMs:200,signal:duringProbe.signal});
  while(!thirdSent)await tick();duringProbe.abort();
  await assert.rejects(pending,e=>e.code==='AI_CANCELLED');assert.equal(thirdStopped,true);assert.equal(t.calls.filter(c=>!c.probe).length,3);
  assert.ok(t.calls.every(c=>c.model===A));assert.equal(t.calls.filter(c=>c.probe).length,1);
  console.log('OK cancelar el tercer intento aborta el canal y conserva la selección, sin comprobaciones adicionales');

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
