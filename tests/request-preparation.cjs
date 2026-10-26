// Preparación/deduplicación sintética: no decodifica documentos ni consulta Gemini.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks'),extraction=require('../js/document-extraction.js');
const root=path.resolve(__dirname,'..');
(async()=>{
 let token='fixture-A';const win={localStorage:{getItem:()=>JSON.stringify({token})}};
 vm.runInContext(fs.readFileSync(path.join(root,'js/document-analysis.js'),'utf8'),vm.createContext({window:win,Map,Promise,structuredClone,AbortController}));
 const api=win.AutoCorDocumentAnalysis,model='gemini-3.5-flash-lite';
 const a='data:image/png;base64,'+'A'.repeat(2*1024*1024),b='data:image/png;base64,'+'B'.repeat(2*1024*1024);
 const body=extraction.buildRequest('cedula',[{dataUrl:a,label:'Frontal'},{dataUrl:b,label:'Reverso'}],['apellidos','nombres','numeroCedula']);
 const original=JSON.stringify(body),firstStarted=performance.now(),key=api.requestKey(model,body),firstKeyMs=performance.now()-firstStarted;
 assert.equal(api.requestKey(model,structuredClone(body)),key);assert.equal(JSON.stringify(body),original);
 assert.ok(key.length<original.length/50);assert.ok(!key.includes('A'.repeat(100)));assert.ok(!key.includes(token));
 const different=structuredClone(body);different.contents[0].parts[2].inline_data.data+='C';assert.notEqual(api.requestKey(model,different),key);
 const criteria=structuredClone(body);criteria.generationConfig.temperature=1;assert.notEqual(api.requestKey(model,criteria),key);
 assert.notEqual(api.requestKey('gemini-3.1-flash-lite',body),key);
 console.log('OK clave compacta conserva identidad exacta de adjuntos, modelo y criterios; cuerpo e imágenes intactos');

 const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)],before=[],after=[];
 for(let i=0;i<3;i++){JSON.stringify(body);api.requestKey(model,body);}
 for(let i=0;i<12;i++){
  let start=performance.now();JSON.stringify(body);before.push(performance.now()-start);
  start=performance.now();api.requestKey(model,body);after.push(performance.now()-start);
 }
 const report={synthetic:true,realGeminiCalls:0,iterations:12,attachmentBytes:4*1024*1024*3/4,
  beforeKeyCharacters:original.length,afterKeyCharacters:key.length,firstCompactKeyMs:+firstKeyMs.toFixed(3),
  beforeMedianMs:+median(before).toFixed(3),afterMedianMs:+median(after).toFixed(3),
  unchangedRequest:true,scope:'Sólo preparación local de la clave; no mide backend, Gemini ni el tiempo completo de validación.'};
 fs.writeFileSync(path.join(root,'entrega/preparacion-solicitud-sintetica-20261026.json'),JSON.stringify(report,null,2));
 console.log('Medición sintética: clave anterior '+report.beforeMedianMs+' ms; compacta '+report.afterMedianMs+' ms; primera compacta '+report.firstCompactKeyMs+' ms');

 let calls=0,release;const gate=new Promise(resolve=>release=resolve),work=async()=>{calls++;await gate;return {ok:true};};
 const first=api.share(key,work),second=api.share(api.requestKey(model,structuredClone(body)),work);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls,1);release();await Promise.all([first,second]);
  assert.notEqual(api.requestKey(model,body),key,'Al terminar se liberan las referencias usadas para identificar adjuntos');
 await api.share(key,async()=>{calls++;return {ok:true};});assert.equal(calls,2,'Un reintento explícito no recibe una lectura antigua');
 token='fixture-B';assert.notEqual(api.requestKey(model,body),key);
 console.log('OK solicitudes simultáneas sin duplicados; reintentos y sesiones independientes, sin caché de respuestas antiguas');
})().catch(e=>{console.error(e);process.exitCode=1;});
