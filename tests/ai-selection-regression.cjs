// Concurrencia, selección inicial acotada y cancelación; sin red real.
const assert=require('node:assert/strict'),api=require('../js/gemini-availability.js');
const [A,B]=api.catalog.map(m=>m.id),pause=ms=>new Promise(r=>setTimeout(r,ms));
const ok=()=>({ok:true,status:200,json:async()=>({valid:true})});
function setup(request,config={}){
 let clock=1000;const calls=[],timings=[];
 const controller=api.create({now:()=>clock,getContext:()=> 'fixture-session',config:{attemptMs:15,checkMs:100,...config},probeBody:()=>({probe:true}),
  validate:data=>data,request:(model,body,signal)=>{calls.push({model,probe:!!body.probe});return request(model,signal);},onTiming:t=>timings.push(t)});
 return {controller,calls,timings,advance:n=>clock+=n};
}
(async()=>{
 const unhandled=[],handler=e=>unhandled.push(e);process.on('unhandledRejection',handler);
 try{
  let alive=0,max=0,abortedCount=0,release;
  const t=setup((model,signal)=>{
   max=Math.max(max,++alive);
   if(model===A)return new Promise(resolve=>{release=()=>resolve(ok());signal.addEventListener('abort',()=>{alive--;abortedCount++;},{once:true});});
   alive--;return Promise.resolve(ok());
  });
  const tickets=await Promise.all(Array.from({length:12},()=>t.controller.ensure()));
  assert.deepEqual(t.calls.map(c=>c.model),[A,B]);assert.ok(tickets.every(v=>v.model===B));assert.equal(max,1);assert.equal(alive,0);assert.equal(abortedCount,1);
  release();await pause(1);assert.equal(t.controller.snapshot().model,B);
  t.advance(86400000);for(let i=0;i<12;i++)await t.controller.ensure();assert.equal(t.calls.length,2);
  console.log('OK solicitudes iniciales agrupadas; A atascado se cancela antes de B y su respuesta tardía no cambia la selección');

  let pending=0;
  const stuck=setup((model,signal)=>{pending++;signal.addEventListener('abort',()=>pending--,{once:true});return new Promise(()=>{});},{attemptMs:10,checkMs:25});
  await assert.rejects(stuck.controller.ensure(),e=>e.code==='AI_TIMEOUT');assert.equal(pending,0);assert.equal(stuck.controller.snapshot().checking,false);
  const count=stuck.calls.length;stuck.advance(86400000);await assert.rejects(stuck.controller.ensure());assert.equal(stuck.calls.length,count);
  console.log('OK el plazo inicial termina y no programa comprobaciones nuevas aunque pase el tiempo');

  const aborted=new AbortController();aborted.abort();const cancelled=setup(async()=>ok());
  await assert.rejects(cancelled.controller.ensure({signal:aborted.signal}),e=>e.code==='AI_CANCELLED');assert.equal(cancelled.calls.length,0);
  await cancelled.controller.ensure();await assert.rejects(cancelled.controller.generate({},{signal:aborted.signal}),e=>e.code==='AI_CANCELLED');assert.equal(cancelled.calls.length,1);
  await pause(1);assert.deepEqual(unhandled,[]);
  assert.ok(!JSON.stringify(t.timings).includes('fixture-session'));
  console.log('OK cancelación sin envíos, sin rechazos sin manejar y sin credenciales en diagnósticos');
 }finally{process.removeListener('unhandledRejection',handler);}
})().catch(e=>{console.error(e);process.exitCode=1;});
