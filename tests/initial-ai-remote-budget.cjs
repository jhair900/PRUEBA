// Transporte HTTP real sólo en loopback. No usa Google, documentos ni credenciales.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const current=require('../js/gemini-availability.js');
const previous=require('./fixtures/initial-ai-before-remote-budget.cjs');
const extraction=require('../js/document-extraction.js');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 let ledger,delay=120;
 const server=http.createServer((req,res)=>{
  if(req.method==='GET'){res.end('ready');return;}
  req.resume();req.on('end',()=>{
   const item=ledger;item.sent++;item.active++;item.maxActive=Math.max(item.maxActive,item.active);let done=false;
   res.on('close',()=>{if(!done)item.closedBeforeCompletion++;});
   setTimeout(()=>{done=true;item.active--;item.completed++;if(!res.destroyed){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({valid:true}));}},delay);
  });
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{
  await (await fetch(url)).text();
  const run=async api=>{
   ledger={sent:0,active:0,maxActive:0,closedBeforeCompletion:0,completed:0};const mine=ledger;
   const controller=api.create({getContext:()=> 'fixture-only',config:{attemptMs:30,checkMs:220,retryBaseMs:1,retryMaxMs:2},probeBody:()=>({probe:true}),validate:d=>d,request:async(m,body,signal,timeout,trace)=>{
    trace.remoteState='dispatched';const response=await fetch(url,{method:'POST',body:JSON.stringify(body),signal});
    return {ok:true,status:200,trace,json:async()=>{const data=await response.json();trace.remoteState='complete';return data;}};
   }});
   let code='success';try{await controller.ensure();}catch(e){code=e.code;}
   while(mine.active)await pause(5);return {...mine,code};
  };
  const before=await run(previous);assert.ok(before.maxActive>=2,'El servidor simulado continúa procesando solicitudes después del corte local');assert.ok(before.closedBeforeCompletion>=1);
  const after=await run(current);assert.equal(after.sent,1);assert.equal(after.maxActive,1);assert.equal(after.closedBeforeCompletion,0);assert.equal(after.code,'success');
  delay=200;
  ledger={sent:0,active:0,maxActive:0,closedBeforeCompletion:0,completed:0};let context='fixture-initial';
  const stopped=current.create({getContext:()=>context,config:{checkMs:60},probeBody:()=>({probe:true}),validate:d=>d,request:async(m,b,signal,ms,trace)=>{trace.remoteState='dispatched';const response=await fetch(url,{method:'POST',body:JSON.stringify(b),signal});return {ok:true,status:200,trace,json:async()=>{const d=await response.json();trace.remoteState='complete';return d;}};}});
  await assert.rejects(stopped.ensure(),e=>e.code==='AI_INITIAL_RESULT_UNKNOWN'&&e.causeCode==='AI_TIMEOUT');
  assert.equal(ledger.sent,1);context='fixture-renewed';stopped.invalidate();await assert.rejects(stopped.ensure(),e=>e.code==='AI_INITIAL_RESULT_UNKNOWN');assert.equal(ledger.sent,1);
  while(ledger.active)await pause(5);
  const dataUrl='data:image/png;base64,'+Buffer.from('synthetic unchanged pixels').toString('base64');
  const oldProbe=extraction.buildRequest('matricula',dataUrl,['placa','color'],{availabilityProbe:true}),newProbe=current.buildProbe(dataUrl);
  assert.equal(oldProbe.contents[0].parts.find(p=>p.inline_data).inline_data.data,newProbe.contents[0].parts.find(p=>p.inline_data).inline_data.data);
  const probe={beforeBytes:Buffer.byteLength(JSON.stringify(oldProbe)),afterBytes:Buffer.byteLength(JSON.stringify(newProbe)),beforeMaxOutputTokens:oldProbe.generationConfig.maxOutputTokens,afterMaxOutputTokens:newProbe.generationConfig.maxOutputTokens,imageUnchanged:true};
  assert.ok(probe.afterBytes<probe.beforeBytes);
  const result={synthetic:true,realGoogleRequests:0,before,after,unknownResult:{...ledger,code:stopped.snapshot().code,remoteUnconfirmed:stopped.snapshot().remoteUnconfirmed},probe,limitation:'Loopback reproduce el riesgo y el control local; no acredita que las solicitudes de producción concretas se solaparan.'};
  fs.writeFileSync(path.join(__dirname,'../entrega/presupuesto-ia-local-20261028.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
 }finally{await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

