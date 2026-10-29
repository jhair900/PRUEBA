// Reloj determinista: separa contenedores/subetapas sin atribuir tiempos ficticios a Google.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../js/gemini-client.js'),'utf8');
const availability=require('../js/gemini-availability.js');
async function run(mode,legacy=false){
  let now=1000,sends=0;const traces=[];
  class Clock extends Date{static now(){return now;}}
  const reply={_proxy:{ok:true,status:200,origin:'provider',upstreamMs:8,...(!legacy?{timing:{version:1,inputDecodeMs:0,sessionMs:1,requestBuildMs:1,providerFetchMs:6,providerDecodeMs:2,otherMs:0,serverMs:10,contents:'PRIVATE'}}:{})},
    data:{candidates:[],usageMetadata:{promptTokenCount:12,candidatesTokenCount:4,thoughtsTokenCount:0,totalTokenCount:16,notAllowed:'PRIVATE'}}};
  const session={ensure:async()=>{now+=3;return {};},assert(){},consume(){now+=2;}};
  const localStorage={getItem:()=>JSON.stringify({token:'SECRET'})};
  const app={AutoCorSession:session};
  if(mode==='rpc')app.AutoCorTransport={request:async()=>{sends++;now+=16;return reply;}};
  const ctx=vm.createContext({window:app,localStorage,URL,Date:Clock,AbortController,TextEncoder,setTimeout,clearTimeout,
    fetch:async()=>{sends++;now+=11;return {ok:true,status:200,json:async()=>{now+=5;return reply;}};}});
  vm.runInContext(source,ctx);
  const trace={},result=await app.AutoCorGemini.fetch('https://script.google.com/macros/s/test/exec?op=generate&model=gemini-3.5-flash-lite',{request:{contents:[]}},1000,trace);
  assert.equal(result.ok,true);assert.equal(sends,1);assert.equal(trace.sessionWaitMs,3);assert.equal(trace.sessionApplyMs,2);
  assert.equal(trace.responseCompleteMs,16);assert.equal(trace.transportMs,8);assert.equal(trace.bodyMs,mode==='rpc'?0:5);
  if(legacy){assert.equal(trace.backendTiming,undefined);assert.equal(trace.outsideBackendMs,undefined);}else{
    assert.equal(trace.backendTiming.providerFetchMs,6);assert.equal(trace.backendTiming.providerDecodeMs,2);assert.equal(trace.outsideBackendMs,6);
  }
  assert.equal(trace.usage.totalTokenCount,16);assert.ok(!/SECRET|PRIVATE|candidates":/.test(JSON.stringify(trace)));
  const controller=availability.create({now:()=>now,getContext:()=> 'fixture',probeBody:()=>({}),request:async(model,body,signal,ms,trace)=>{Object.assign(trace,result.trace);return result;},
    validate(){now+=4;return {};},onTiming:t=>traces.push(t)});
  await controller.ensure();assert.equal(traces.length,1);assert.equal(traces[0].resultValidationMs,4);assert.ok(controller.snapshot().ready);
  for(let i=0;i<3;i++)await controller.ensure();assert.equal(traces.length,1);
  return trace;
}
(async()=>{
  await run('fetch');await run('rpc');await run('fetch',true);
  console.log('OK HTTP/RPC: recepción completa, sesión, parseo/validación y etapas backend separadas; sin duplicar selección ni diagnósticos personales');
  console.log('OK backend anterior compatible: nuevas etapas ausentes se mantienen sin medición; nunca se inventan tiempos');
})().catch(e=>{console.error(e);process.exitCode=1;});
