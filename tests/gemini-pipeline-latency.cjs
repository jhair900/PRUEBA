// Comparación local con solicitudes ficticias; no llama a Google ni lee documentos.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const oldSource=read('tests/fixtures/gemini-proxy-before-pipeline.cjs'),source=read('gas/script.gs');
const extraction=require('../js/document-extraction.js'),oldExtraction=require('./fixtures/document-extraction-before-pipeline.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
const response={candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({numeroCedula:'0123456789',apellidos:'MUÑOZ',nombres:'PRUEBA',_reviewKeys:[]})}]}}],usageMetadata:{promptTokenCount:800,candidatesTokenCount:45,thoughtsTokenCount:0,totalTokenCount:845}};
function backend(code,options={}){
  let now=10000,fetches=0,serializes=0,parses=0,inputChars=0,outputChars=0,textReads=0,sent;
  const json={stringify(...args){serializes++;const result=JSON.stringify(...args);inputChars+=result.length;now++;return result;},parse(text,...args){parses++;outputChars+=text.length;now+=2;return JSON.parse(text,...args);}};
  const text=JSON.stringify(options.reply??response);
  class Clock extends Date{static now(){return now;}}
  const context=vm.createContext({Date:Clock,console:{log(){}},JSON:json,
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>{now++;return options.noKey?'':'fictional-key';}})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,getContent(){return this.text;},setMimeType(){return this;}})},
    UrlFetchApp:{fetch(url,init){fetches++;sent={url,init};now+=8000;if(options.fetchFails)throw Error('synthetic-fetch-failed');return {
      getResponseCode:()=>{now++;return options.status||200;},getContentText:()=>{textReads++;now+=3;return options.malformed?'NOT_JSON':text;},getAllHeaders:()=>{now++;return {'Retry-After':'2'};}
    };}}
  });
  vm.runInContext(code,context);
  context.outputJson=v=>context.ContentService.createTextOutput(json.stringify(v)).setMimeType('json');
  context.validateSession_=token=>{now+=4;if(options.expired||token!=='fictional-session')return {ok:false,code:'AUTH_EXPIRED',message:'expired'};
    vm.runInContext('sessionForResponse_={user:"TEST",displayName:"Prueba",isAdmin:false,expiresAt:9999999999999}',context);return {ok:true};};
  return {context,counts:()=>({serializes,parses,inputChars,outputChars,textReads,fetches}),sent:()=>sent};
}
const attachment='data:image/png;base64,'+'A'.repeat(1200000),attachments=[{dataUrl:attachment,label:'Frontal'},{dataUrl:attachment,label:'Reverso'}];
const body=extraction.buildRequest('cedula',attachments,Object.keys(extraction.fields.cedula));
const payload={action:'geminiProxy',op:'generate',model:'gemini-3.5-flash-lite',sessionToken:'fictional-session',request:body};
const old=backend(oldSource),current=backend(source);
const before=old.context.autocorRpc(payload),after=current.context.autocorRpc(payload);
assert.equal(JSON.stringify(old.sent().init),JSON.stringify(current.sent().init),'Petición remitida a Gemini idéntica para la misma entrada');
assert.deepEqual(plain(after.data),plain(before.data));assert.deepEqual(plain(after.session),plain(before.session));
assert.equal(old.counts().serializes,4);assert.equal(old.counts().parses,4);
assert.equal(current.counts().serializes,1);assert.equal(current.counts().parses,1);assert.equal(current.counts().fetches,1);
assert.equal(current.counts().textReads,1);
console.log('OK RPC: JSON stringify/parse 4/4 → 1/1; una petición, mismo cuerpo Gemini, respuesta y sesión');
const timing=after._proxy.timing;
assert.equal(timing.version,1);assert.equal(timing.inputDecodeMs,0);assert.equal(timing.sessionMs,4);assert.equal(timing.providerFetchMs,8000);assert.equal(timing.providerDecodeMs,7);
assert.equal(after._proxy.upstreamMs,timing.providerFetchMs+timing.providerDecodeMs);
assert.equal(timing.serverMs,timing.inputDecodeMs+timing.sessionMs+timing.requestBuildMs+timing.providerFetchMs+timing.providerDecodeMs+timing.otherMs);
assert.equal(/fictional|TEST|MUÑOZ|data:/.test(JSON.stringify(timing)),false);
const http=backend(source),raw=JSON.stringify({sessionToken:payload.sessionToken,request:body});
const httpResult=JSON.parse(http.context.geminiProxy_({op:'generate',model:payload.model},raw).text);
assert.deepEqual(httpResult.data,plain(after.data));assert.equal(httpResult._proxy.timing.inputDecodeMs,2);assert.equal(http.counts().fetches,1);
assert.equal(http.counts().serializes,2);assert.equal(http.counts().parses,2);
console.log('OK HTTP y RPC equivalentes; etapas deterministas sin doble conteo; upstream conserva su alcance anterior');
for(const options of [{expired:true},{noKey:true},{status:503,reply:{error:{code:503,status:'UNAVAILABLE',message:'high demand'}}},{status:429,reply:{error:{code:429,status:'RESOURCE_EXHAUSTED'}}},{fetchFails:true},{malformed:true}]){
  const previous=backend(oldSource,options),next=backend(source,options);
  const a=previous.context.autocorRpc(payload),b=next.context.autocorRpc(payload);
  assert.deepEqual(plain(b.data),plain(a.data));assert.equal(b._proxy.status,a._proxy.status);assert.equal(b._proxy.origin,a._proxy.origin);
  assert.equal(b._proxy.authCode,a._proxy.authCode);assert.equal(b._proxy.retryAfter,a._proxy.retryAfter);
  assert.equal(previous.counts().fetches,next.counts().fetches);assert.ok(next.counts().fetches<=1);
  if(options.expired||options.noKey)assert.equal(next.counts().fetches,0);
  if(options.malformed)assert.equal(next.counts().textReads,1);
}
const invalid=backend(source);assert.equal(JSON.parse(invalid.context.geminiProxy_({},'{').text)._proxy.status,400);assert.equal(invalid.counts().fetches,0);
console.log('OK sesión, configuración, 503, cuota, error de transporte y respuesta malformada conservan semántica y límites');
const requestSizes=[];
for(const tipo of ['cedula','matricula','notaria','ruc']){
  const keys=Object.keys(extraction.fields[tipo]),a=oldExtraction.buildRequest(tipo,attachments,keys),b=extraction.buildRequest(tipo,attachments,keys);
  assert.deepEqual(b.generationConfig,a.generationConfig,'Esquema y criterios completos conservados');
  assert.deepEqual(b.contents[0].parts.slice(1),a.contents[0].parts.slice(1),'Imágenes/orden/calidad idénticos');
  for(const key of keys){const description=extraction.fields[tipo][key];assert.equal(b.generationConfig.responseSchema.properties[key].description,description);assert.equal(b.contents[0].parts[0].text.includes(description),false);}
  const promptBefore=Buffer.byteLength(a.contents[0].parts[0].text),promptAfter=Buffer.byteLength(b.contents[0].parts[0].text);
  assert.ok(promptAfter<promptBefore);
  requestSizes.push({tipo,promptBytesBefore:promptBefore,promptBytesAfter:promptAfter,removedBytes:promptBefore-promptAfter});
}
console.log('OK criterios íntegros una vez en el esquema, sin reducir resolución, campos, reglas ni tokens máximos');
// El tiempo sólo refleja CPU local Node, no Apps Script ni Gemini. Pares alternados.
function benchmark(code){const app=backend(code),samples=[];for(let i=0;i<12;i++){const start=performance.now();app.context.autocorRpc(payload);if(i>=2)samples.push(performance.now()-start);}return samples.sort((a,b)=>a-b)[Math.floor(samples.length/2)];}
const cpuBefore=[],cpuAfter=[];for(let i=0;i<3;i++){if(i%2){cpuAfter.push(benchmark(source));cpuBefore.push(benchmark(oldSource));}else{cpuBefore.push(benchmark(oldSource));cpuAfter.push(benchmark(source));}}
const report={date:'2026-10-28',kind:'synthetic-local-no-network',inputBase64Chars:2400000,requestCountBefore:old.counts().fetches,requestCountAfter:current.counts().fetches,jsonBefore:old.counts(),jsonAfter:current.counts(),requestSizes,localNodeMedianMsByRun:{before:cpuBefore.map(n=>+n.toFixed(3)),after:cpuAfter.map(n=>+n.toFixed(3))},limits:'CPU Node con entrada ficticia, servidor simulado y respuesta fija. No mide mejora en Apps Script/Gemini ni exactitud en documentos reales.'};
if(process.env.AUTOCOR_WRITE_PIPELINE_REPORT==='1')fs.writeFileSync(path.join(root,'entrega/recorrido-ia-local-20261028.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
