// Sin red ni documentos: tiempos cortos y respuestas sintéticas del selector real.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const api=require('../js/gemini-availability.js'),[A,B]=api.catalog.map(m=>m.id);
const good=()=>({ok:true,status:200,json:async()=>({valid:true})});
const failure=status=>({ok:false,status,retryAfter:'0.001',json:async()=>({})});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function setup(request,config={}){
 let clock=1000;const calls=[],timings=[];
 const controller=api.create({now:()=>clock,getContext:()=> 'fixture-session|fixture-backend',
  config:{ttlMs:1000,attemptMs:15,checkMs:100,maxCandidates:2,retryMs:1,...config},
  probeBody:()=>({probe:true}),validate:data=>{if(!data.valid)throw Object.assign(Error('schema'),{code:'AI_INVALID_RESPONSE'});return data;},
  request:(model,body,signal)=>{calls.push(model);return request(model,signal);},onTiming:detail=>timings.push(detail)});
 return {controller,calls,timings,advance:ms=>clock+=ms};
}
(async()=>{
 const unhandled=[],onUnhandled=error=>unhandled.push(error);process.on('unhandledRejection',onUnhandled);
 try{
  let inFlight=0,maxInFlight=0,aborted=0,release;
  const t=setup((model,signal)=>{
   inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
   if(model===A)return new Promise(resolve=>{release=()=>resolve(good());signal.addEventListener('abort',()=>{inFlight--;aborted++;},{once:true});});
   inFlight--;return Promise.resolve(good());
  });
  const pending=Array.from({length:12},()=>t.controller.ensure());
  const tickets=await Promise.all(pending);
  assert.deepEqual(t.calls,[A,B]);assert.ok(tickets.every(ticket=>ticket.model===B));
  assert.equal(aborted,1);assert.equal(maxInFlight,1);assert.equal(inFlight,0);
  assert.equal(t.timings[0].code,'AI_TIMEOUT');assert.equal(t.timings[1].outcome,'success');
  release();await pause(1);assert.equal(t.controller.snapshot().model,B);
  for(let i=0;i<12;i++)await t.controller.ensure();
  assert.deepEqual(t.calls,[A,B],'La prueba vigente se reutiliza sin otra generación');
  console.log('OK timeout cancela el intento antes de B; concurrencia agrupada, respuesta tardía ignorada y prueba vigente reutilizada');

  const preferred=setup(async model=>model===A?failure(429):good());
  await preferred.controller.ensure();preferred.advance(2000);await preferred.controller.ensure();
  assert.deepEqual(preferred.calls,[A,B,B],'Al renovar se prueba primero el último modelo que funcionó');
  console.log('OK renovación vuelve directamente al modelo comprobado, sin reiniciar el catálogo');

  for(const status of [429,404,500,0,400]){
   const alternative=setup(async model=>model===A?failure(status):good());
   assert.equal((await alternative.controller.ensure()).model,B);assert.deepEqual(alternative.calls,[A,B]);
  }
  console.log('OK alternativas automáticas ante cuota, modelo ausente, servicio, red y solicitud rechazada');

  const unavailable=setup(async()=>failure(429));
  await assert.rejects(unavailable.controller.ensure(),e=>e.code==='AI_QUOTA_EXHAUSTED');
  const next=unavailable.controller.snapshot().nextCheckAt;assert.ok(next>1000);
  for(let i=0;i<12;i++)await assert.rejects(unavailable.controller.ensure());
  assert.equal(unavailable.calls.length,2,'Las interacciones no evitan la pausa');
  unavailable.advance(1000);await assert.rejects(unavailable.controller.ensure());
  assert.equal(unavailable.calls.length,4);assert.equal(unavailable.controller.snapshot().retryExhausted,true);
  assert.equal(unavailable.controller.snapshot().nextCheckAt,0);
  unavailable.advance(3600000);for(let i=0;i<12;i++)await assert.rejects(unavailable.controller.ensure());
  assert.equal(unavailable.calls.length,4,'Dos rondas como máximo; sin reinicios indefinidos');
  assert.throws(()=>unavailable.controller.guard(),e=>e.code==='AI_PRECHECK_REQUIRED');
  assert.equal(unavailable.controller.guard('cuv'),true);
  console.log('OK pausa respetada, máximo dos rondas y carga bloqueada sin IA comprobada; CUV local intacto');

  let alive=0;
  const stuck=setup((model,signal)=>{alive++;signal.addEventListener('abort',()=>alive--,{once:true});return new Promise(()=>{});},{checkMs:25,attemptMs:20});
  const started=Date.now();await assert.rejects(stuck.controller.ensure(),e=>e.code==='AI_TIMEOUT');
  assert.ok(Date.now()-started<500);assert.equal(alive,0);assert.equal(stuck.controller.snapshot().checking,false);
  assert.ok(stuck.calls.length<=2);assert.equal(stuck.controller.snapshot().ready,false);
  console.log('OK límite total cancela solicitudes atascadas sin declarar disponible un modelo');

  const C=api.catalog[2].id;
  const resume=setup((model,signal)=>model===C?Promise.resolve(good()):new Promise(()=>{}),{checkMs:25,attemptMs:20,maxCandidates:6});
  await assert.rejects(resume.controller.ensure(),e=>e.code==='AI_TIMEOUT');
  assert.ok(!resume.calls.includes(C));resume.advance(61000);
  assert.equal((await resume.controller.ensure()).model,C);
  assert.equal(resume.calls.at(-1),C,'La siguiente ronda llega al candidato no comprobado antes de repetir los agotados');
  console.log('OK al terminar el presupuesto se continúan primero las alternativas no comprobadas, sin reiniciar siempre en A');

  const app={AutoCorTransport:{request:async()=>null}},storage={getItem:()=>JSON.stringify({token:'fixture'})};
  const context=vm.createContext({window:app,localStorage:storage,URL,Date,AbortController,TextEncoder,setTimeout,clearTimeout,
   fetch:async(url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Object.assign(Error('abort'),{name:'AbortError'})),{once:true}))});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/gemini-client.js'),'utf8'),context);
  const abort=new AbortController(),request=app.AutoCorGemini.fetch('https://fixture.test/exec',{request:{},signal:abort.signal},1000,{});
  await pause(1);abort.abort({code:'AI_TIMEOUT'});
  await assert.rejects(request,e=>e.code==='AI_TIMEOUT');
  await pause(1);assert.deepEqual(unhandled,[]);
  assert.ok(!JSON.stringify(t.timings).includes('fixture-session'));
  console.log('OK timeout del selector conserva su causa en el cliente; sin rechazos sin manejar ni credenciales en diagnósticos');
 }finally{process.removeListener('unhandledRejection',onUnhandled);}
})().catch(error=>{console.error(error);process.exitCode=1;});
