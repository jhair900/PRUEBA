const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto:crypto}=require('node:crypto');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
(async()=>{
 const listeners=new Set(),frames=[],sent=[];let nextTimer=0;
 const win={crypto,location:{origin:'https://autocor.test'},AutoCorConfig:{apiUrl:'https://script.google.com/macros/s/test/exec'},addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
 const ctx=vm.createContext({URL,Date,Map,clearTimeout(){},setTimeout(){return ++nextTimer;},window:win,document:{readyState:'complete',createElement:()=>({setAttribute(){},contentWindow:{},remove(){this.removed=true;}}),body:{appendChild:f=>frames.push(f)}}});
 vm.runInContext(read('js/apps-script-transport.js'),ctx);
 function emit(f,peer,data){for(const fn of [...listeners])fn({source:peer,origin:'https://test-script.googleusercontent.com',data:{channel:new URL(f.src).searchParams.get('channel'),...data}});}
 function ready(f){const peer={parent:f.contentWindow,postMessage:m=>sent.push({f,peer,message:m})};emit(f,peer,{type:'autocor-ready'});return peer;}
 const p0=ready(frames[0]);
 const trace={};const first=win.AutoCorTransport.request(win.AutoCorConfig.apiUrl,{action:'savePago'},null,trace);const rejected=assert.rejects(first,/RPC desconectado/);
 const other=win.AutoCorTransport.request(win.AutoCorConfig.apiUrl,{action:'getVentaByPlaca'});
 emit(frames[0],p0,{type:'autocor-response',id:sent[0].message.id,error:'RPC desconectado'});await rejected;
 assert.equal(frames.length,2);assert.ok(trace.channelRecovery);assert.ok(!frames[0].removed,'mantener peticiones concurrentes');
 const p1=ready(frames[1]);const renewed=win.AutoCorTransport.request(win.AutoCorConfig.apiUrl,{action:'getPagoByPlaca'});
 emit(frames[0],p0,{type:'autocor-response',id:sent[1].message.id,result:{ok:true,original:true}});assert.equal((await other).original,true);assert.ok(frames[0].removed);
 emit(frames[1],p1,{type:'autocor-response',id:sent[2].message.id,result:{ok:true,renewed:true}});assert.equal((await renewed).renewed,true);assert.equal(sent.length,3,'sin reenviar desde el transporte');
 const abort=new AbortController();const stopped=win.AutoCorTransport.request(win.AutoCorConfig.apiUrl,{action:'getPagoByPlaca'},abort.signal);const aborted=assert.rejects(stopped,e=>e.name==='AbortError');abort.abort();await aborted;assert.equal(frames.length,3);assert.ok(frames[1].removed);
 console.log('OK canal nuevo tras error y timeout, sin duplicar envío ni perder consultas concurrentes');
 const actions=[],logs=[];let requestId;
 const app={crypto,localStorage:{getItem:()=>JSON.stringify({user:'USUARIO',token:'SECRET-TOKEN',isAdmin:false})},console:{info:(...args)=>logs.push(args)},AutoCorTransport:{request:async(_,body,signal,trace)=>{actions.push(body.action);trace.transport='google.script.run';if(actions.length===1){requestId=body.requestId;trace.channelRecovery='Canal retirado';throw Error('RPC desconectado SECRET-TOKEN');}return {ok:true,data:{_requestId:requestId,placaValue:'AAA1111'}};}}};
 const api=vm.createContext({window:app,Date,Map,AbortController,setTimeout,clearTimeout,console:app.console});vm.runInContext(read('js/api-client.js'),api);
 assert.equal((await app.AutoCorApi.postJson(app.AutoCorConfig?.apiUrl||'https://example.test',{action:'savePago',data:{placaValue:'AAA1111'}})).ok,true);
 assert.deepEqual(actions,['savePago','getPagoByPlaca']);const failure=app.AutoCorApi.lastSaveTiming.details[0];assert.equal(failure.error.message,'RPC desconectado [oculto]');assert.ok(!JSON.stringify(logs).includes('RPC desconectado'));assert.ok(!JSON.stringify(app.AutoCorApi.lastSaveTiming).includes('SECRET-TOKEN'));
 app.AutoCorTransport.request=async()=>{throw new DOMException('signal is aborted without reason','AbortError');};
 await assert.rejects(app.AutoCorApi.postJson('https://example.test',{action:'getPagoByPlaca'},{retries:0}),e=>!e.message.includes('signal is aborted')&&/administrador/.test(e.message));
 const detail=app.AutoCorApi.lastTiming.details[0];assert.equal(detail.error.name,'AbortError');assert.equal(detail.error.code,20);assert.equal(detail.error.message,'signal is aborted without reason');
 console.log('OK verifica guardado antes de reenviar; error original conservado, credenciales ocultas y aviso público sencillo');
})().catch(e=>{console.error(e);process.exitCode=1;});
