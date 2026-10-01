const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path'),{webcrypto:crypto}=require('node:crypto');
(async()=>{
 let now=0,seq=0,requestId;const timers=new Map(),actions=[];
 const win={crypto,localStorage:{getItem:()=>'{"token":"test"}'}};
 const context=vm.createContext({window:win,Date:{now:()=>now},Map,AbortController,
 setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
 fetch:async(_,opts)=>{
  const body=JSON.parse(opts.body);actions.push(body.action);
  if(body.action==='savePago'){
   requestId=body.requestId;
   const timer=[...timers.values()][0];assert.equal(timer.ms,2000,'Reservar 1/3 del presupuesto para verificar');
   now+=timer.ms;timer.fn();throw opts.signal.reason;
  }
  return {ok:true,status:200,text:async()=>JSON.stringify({ok:true,data:{_requestId:requestId,placaValue:'TEST001'}})};
 }});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/api-client.js'),'utf8'),context);
 const result=await win.AutoCorApi.postJson('https://example.test',{action:'savePago',data:{placaValue:'TEST001'}},{timeoutMs:3000,totalTimeoutMs:3000});
 assert.equal(result.ok,true);assert.deepEqual(actions,['savePago','getPagoByPlaca']);
 const timing=win.AutoCorApi.lastSaveTiming;
 assert.equal(timing.outcome,'confirmed_after_error');assert.equal(timing.details[0].error.code,'CLIENT_TIMEOUT');
 assert.match(timing.details[0].error.message,/2000 ms/);assert.match(timing.details[0].error.message,/fetch/);
 assert.equal(timing.details[1].confirmed,true);assert.equal(timers.size,0);
 console.log('OK: escritura sin respuesta reserva verificacion, confirma mismo ID sin reenviar y registra limite/canal');
})().catch(e=>{console.error(e);process.exitCode=1;});
