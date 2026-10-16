const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'contratos.html'),'utf8');
(async()=>{
 const dataUrl='data:application/octet-stream;base64,JVBERi0xLjc=';
 let renders=0,destroyed=0;
 const pdf={numPages:2,getPage(){renders++;throw Error('No rasterizar PDF pequeño');},destroy:async()=>destroyed++};
 const ctx=vm.createContext({pdfjsLib:{getDocument:()=>({promise:Promise.resolve(pdf)})},fileToDataUrl:async()=>dataUrl,spinnerMsg(){},setSpinnerBar(){}});
 const start=html.indexOf('async function prepararImagenParaIA('),end=html.indexOf('/* ── Convertir compradores',start);
 vm.runInContext(html.slice(start,end),ctx);
 const doc=await ctx.prepararImagenParaIA({name:'prueba.pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(0)},'notaria');
 assert.equal(doc.length,1);assert.equal(doc[0].dataUrl,'data:application/pdf;base64,JVBERi0xLjc=');assert.match(doc[0].label,/2 páginas/);assert.equal(renders,0);assert.equal(destroyed,1);
 const extraction=require('../js/document-extraction.js');
 const body=extraction.buildRequest('notaria',doc,['placa','compradores','vendedores']);
 assert.equal(body.contents[0].parts[2].inline_data.mime_type,'application/pdf');
 assert.equal(body.contents[0].parts[2].inline_data.data,'JVBERi0xLjc=');
 pdf.numPages=7;
 await assert.rejects(()=>ctx.prepararImagenParaIA({name:'extenso.pdf',size:10,arrayBuffer:async()=>new ArrayBuffer(0)},'notaria'),e=>e.code==='DOCUMENT_PAGE_LIMIT');
 assert.equal(destroyed,2);
 console.log('OK PDF original completo, sin rasterización ni pérdida de bytes; mantiene límite y esquema de validación');
 let token='A',calls=0,release;
 const win={crypto:webcrypto,localStorage:{getItem:()=>JSON.stringify({token})}};
 const runtime=vm.createContext({window:win,Map,Promise,TextEncoder,Uint8Array,structuredClone});
 vm.runInContext(fs.readFileSync(path.join(root,'js/document-analysis.js'),'utf8'),runtime);
 const gate=new Promise(r=>release=r),work=async()=>{calls++;await gate;return {placa:'ABC1234',_reviewKeys:[]};};
 const a=win.AutoCorDocumentAnalysis.share('mismo cuerpo',work),b=win.AutoCorDocumentAnalysis.share('mismo cuerpo',work);
 await new Promise(r=>setTimeout(r,30));assert.equal(calls,1);release();
 const results=await Promise.all([a,b]);results[0].placa='EDITADO';assert.equal(results[1].placa,'ABC1234');
 await win.AutoCorDocumentAnalysis.share('mismo cuerpo',work);assert.equal(calls,2,'Reintento manual debe consultar nuevamente');
 await assert.rejects(()=>win.AutoCorDocumentAnalysis.share('fallo',async()=>{throw Error('fallo');}));
 assert.equal(await win.AutoCorDocumentAnalysis.share('fallo',async()=>'nuevo'),'nuevo');
 let count=0,unlock;const wait=new Promise(r=>unlock=r);
 const one=win.AutoCorDocumentAnalysis.share('otro',async()=>{count++;await wait;return 1;});
 await new Promise(r=>setTimeout(r,20));token='B';
 const two=win.AutoCorDocumentAnalysis.share('otro',async()=>{count++;await wait;return 2;});
 await new Promise(r=>setTimeout(r,20));assert.equal(count,2);unlock();assert.deepEqual(await Promise.all([one,two]),[1,2]);
 console.log('OK solicitudes simultáneas se comparten, resultados independientes, reintentos y sesiones aislados');
 let clock=0;const measured=[];
 win.dispatchEvent=e=>measured.push(e.detail);
 const timingCtx=vm.createContext({window:win,localStorage:win.localStorage,performance:{now:()=>clock},
  AutoCorDocumentExtraction:{buildRequest:()=>({doc:true}),parseResponse:json=>extraction.parseResponse(json,['placa'])},
  geminiGenerateWithFallback:async()=>{clock=23000;return {model:'modelo-prueba',json:{candidates:[{finishReason:'MAX_TOKENS'}]}};},
  spinnerMsg(){},setSpinnerBar(){},setGeminiReadyModel(){},
  CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail;}}
 });
 const first=html.indexOf('async function ejecutarSolicitudIA('),last=html.indexOf('function validDate',first);
 vm.runInContext(html.slice(first,last),timingCtx);
 const batch=win.AutoCorDocumentAnalysis.beginBatch();
 win.AutoCorDocumentAnalysis.prefetch('{"doc":true}',()=>timingCtx.ejecutarSolicitudIA({doc:true},'{"doc":true}',['placa'],true),batch);
 await new Promise(r=>setImmediate(r));clock=80000;
 await assert.rejects(()=>timingCtx.analizarConGeminiCampos('matricula','unused',['placa']),e=>e.finishReason==='MAX_TOKENS');
 assert.equal(measured[0].elapsedMs,23000);assert.equal(measured[0].details[0].error.code,'AI_RESPONSE_INCOMPLETE');
 assert.ok(measured[0].details[0].error.message.includes('MAX_TOKENS'));
 win.AutoCorDocumentAnalysis.endBatch(batch);
 console.log('OK tiempo y razón original de fallo anticipado conservados al consumir el resultado después');
})().catch(e=>{console.error(e);process.exitCode=1;});
