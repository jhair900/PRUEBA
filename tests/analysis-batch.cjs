const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const win={localStorage:{getItem:()=>'{"token":"A"}'}};
 vm.runInContext(fs.readFileSync(path.join(root,'js/document-analysis.js'),'utf8'),vm.createContext({window:win,Map,Promise,structuredClone}));
 const api=win.AutoCorDocumentAnalysis;
 const events=[],releaseAI={},releaseOCR={};let active=0,max=0;
 const aiGates=Object.fromEntries(['A','B','C'].map(d=>[d,new Promise(r=>releaseAI[d]=r)]));
 const ocrGates=Object.fromEntries(['A','B','C'].map(d=>[d,new Promise(r=>releaseOCR[d]=r)]));
 const work=d=>async()=>{events.push('ia-'+d);max=Math.max(max,++active);await aiGates[d];active--;return {doc:d};};
 const ctx=vm.createContext({window:win,allowDocumentInput:()=>true,console:{log(){}},_pendientesDeProcesar:()=>['A','B','C'],
 prepararSiguienteAnalisis:(d,batch)=>api.prefetch(d,work(d),batch),
 _procesarUnPendiente:async d=>{const response=await api.share(d,work(d));assert.equal(response.doc,d);events.push('ocr-'+d);await ocrGates[d];events.push('fin-'+d);return {ok:true};},
 renderResultsSection(){},_docsCargadosCount:()=>0,_mostrarValidateToast(){}
 });
 const html=fs.readFileSync(path.join(root,'contratos.html'),'utf8');
 const start=html.indexOf('async function validarTodoEnConjunto()'),end=html.indexOf('/* Registrar listeners del botón',start);
 vm.runInContext(html.slice(start,end),ctx);
 const processing=ctx.validarTodoEnConjunto();await tick();
 assert.equal(max,2);assert.ok(events.includes('ia-A')&&events.includes('ia-B'));
 releaseAI.A();await tick();assert.ok(events.includes('ocr-A'));assert.ok(!events.includes('ocr-B'));
 releaseAI.B();releaseOCR.A();await tick();assert.ok(events.includes('ia-C'));assert.ok(events.includes('ocr-B'));assert.ok(!events.includes('ocr-C'));
 releaseAI.C();releaseOCR.B();await tick();releaseOCR.C();await processing;
 assert.deepEqual(events.filter(e=>e.startsWith('ia-')).sort(),['ia-A','ia-B','ia-C']);
 assert.deepEqual(events.filter(e=>e.startsWith('ocr-')),['ocr-A','ocr-B','ocr-C']);
 assert.deepEqual(events.filter(e=>e.startsWith('fin-')),['fin-A','fin-B','fin-C']);
 assert.equal(max,2);
 let retried=0;await api.share('B',async()=>{retried++;return {};});assert.equal(retried,1);
 console.log('OK lote: consultas IA solapadas (máximo dos), una por documento, OCR y resultados en orden, sin reutilizar lecturas al reintentar');
 const batch=api.beginBatch();let failed=0;
 api.prefetch('fallo',async()=>{failed++;throw Error('red');},batch);await tick();
 await assert.rejects(()=>api.share('fallo',async()=>{throw Error('no reenviar');}),/red/);
 api.endBatch(batch);assert.equal(failed,1);
 assert.equal(await api.share('fallo',async()=>'nuevo'),'nuevo');
 const stale=api.beginBatch();api.prefetch('original',async()=>({valor:'viejo'}),stale);await tick();
 assert.equal((await api.share('editado',async()=>({valor:'nuevo'}))).valor,'nuevo');api.endBatch(stale);
 console.log('OK fallo anticipado usa respaldo sin reenvío oculto; cambios de imagen no consumen resultado anterior');
})().catch(e=>{console.error(e);process.exitCode=1;});
