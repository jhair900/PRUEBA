
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ex=require('../js/document-extraction.js');
const html=fs.readFileSync(require('path').join(__dirname,'../contratos.html'),'utf8');
const fn=n=>html.match(new RegExp('(?:async )?function '+n+'\\([^]*?\\n\\}'))[0];
(async()=>{
 const item=(str,x,y)=>({str,transform:[10,0,0,10,x,y],height:10});
 assert.equal(ex.pdfItemsToText([item('MUÑOZ',90,100),item('NOMBRES',0,80),item('APELLIDOS',0,100),item('ANA',90,80)]),'APELLIDOS MUÑOZ\nNOMBRES ANA');
 let cleaned=0,destroyed=0,renders=0;const text='PLACA ABC1234\nMOTOR AB12345678',records=[];
 const pdf={numPages:2,getPage:async n=>({getTextContent:async()=>({items:n===1?text.split('\n').map((s,i)=>item(s,0,100-i*15)):[]}),getViewport:()=>({width:100,height:100}),render:()=>{renders++;return {promise:Promise.resolve()};},cleanup(){cleaned++;}}),destroy:async()=>destroyed++};
 const ctx=vm.createContext({performance,requireDocumentAccess(){},AutoCorDocumentExtraction:ex,awaitDocumentTask:(op,p)=>p,
  pdfjsLib:{getDocument:()=>({promise:Promise.resolve(pdf)})},document:{createElement:()=>({getContext:()=>({}),toDataURL:()=> 'data:image/png;base64,AA=='})},
  fileToDataUrl:async()=> 'data:application/pdf;base64,AA==',spinnerMsg(){}});
 vm.runInContext(fn('prepararImagenParaIA'),ctx);
 const op={check(){},update(){},wait:p=>typeof p==='function'?p():p,record:(stage,meta)=>records.push({stage,...meta})};
 const file={name:'mixto.pdf',size:4,arrayBuffer:async()=>new ArrayBuffer(0)};
 let result=await ctx.prepararImagenParaIA(file,'matricula',op);assert.equal(result.length,1);assert.equal(result[0].dataUrl,'data:application/pdf;base64,AA==');assert.equal(op.nativeText,text+'\n\n');assert.equal(cleaned,2);assert.equal(destroyed,1);assert.equal(renders,0);
 console.log('OK PDF mixto simulado: texto nativo preservado y PDF COMPLETO enviado, incluida página escaneada, sin reconocimiento local');
 result=await ctx.prepararImagenParaIA({...file,size:11*1024*1024},'matricula',op);assert.equal(result.length,2);assert.equal(renders,2);assert.equal(destroyed,2);
 pdf.numPages=7;await assert.rejects(()=>ctx.prepararImagenParaIA(file,'matricula',op),e=>e.code==='DOCUMENT_PAGE_LIMIT');assert.equal(destroyed,3);
 const diag=JSON.stringify(records);for(const v of ['ABC1234','AB12345678','data:'])assert.ok(!diag.includes(v));
 console.log('OK PDF grande conserva todas las páginas visuales; límite explícito y diagnóstico sin contenido');
 const cuvContext=vm.createContext({window:{leerPdfTexto:async()=> 'CUV DE PRUEBA '.repeat(5),parseCUV:()=>({placa:'ABC1234',motor:'AB12345678'})},spinnerMsg(){},setSpinnerBar(){},sanitizeCuvData:d=>d,camposCuv:()=>[{key:'placa'},{key:'motor'}],isFieldEmpty:v=>!v,getMissingFields:()=>[],console:{log(){}},datos:{},setStatus(){},document:{getElementById:()=>null}});
 vm.runInContext('let cuvDatosCompleto;'+fn('procesarCUV'),cuvContext);await cuvContext.procesarCUV({name:'cuv.pdf'},'cuv');assert.equal(cuvContext.datos.cuv._source,'cuv');assert.equal(cuvContext.datos.cuv.placa,'ABC1234');
 console.log('OK CUV conserva extracción y parser local sin dependencia de Gemini ni Tesseract');
})().catch(e=>{console.error(e);process.exitCode=1;});
