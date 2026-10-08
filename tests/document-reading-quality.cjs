const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ex=require('../js/document-extraction.js');
const html=fs.readFileSync(require('node:path').join(__dirname,'../contratos.html'),'utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
(async()=>{
 const item=(str,x,y)=>({str,transform:[10,0,0,10,x,y],height:10});
 assert.equal(ex.pdfItemsToText([item('MUÑOZ',90,100),item('NOMBRES',0,80),item('APELLIDOS',0,100),item('ANA',90,80)]),'APELLIDOS MUÑOZ\nNOMBRES ANA');
 assert.equal(ex.usablePdfText('CERTIFICADO '+ 'encabezado '.repeat(20)),false);
 const text='APELLIDOS MUÑOZ PEÑA\nNOMBRES MARIA ANA\nNACIONALIDAD ECUATORIANA\nCEDULA 0102030405\nEXPIRACION 01/01/2030';
 assert.equal(ex.usablePdfText(text),true);assert.equal(ex.usablePdfText(text+'\ufffd'.repeat(20)),false);
 console.log('OK PDF conserva filas, orden visual y Ñ; encabezado o capa dañada requieren OCR');
 let cleaned=0,destroyed=0,ocr=0,renders=0;
 const pages=[{items:text.split('\n').map((s,i)=>item(s,0,100-i*15))},{items:[item('CERTIFICADO',0,100)]}];
 const ctx=vm.createContext({AutoCorDocumentExtraction:ex,spinnerMsg(){},setSpinnerBar(){},console,
 OCR_MAX_PDF_PAGES:{default:6},normalizeOcrText:s=>s.trim(),
 pdfjsLib:{getDocument:()=>({promise:Promise.resolve({numPages:2,getPage:async n=>({getTextContent:async()=>pages[n-1],getViewport:()=>({width:200,height:100}),render:()=>{renders++;return {promise:Promise.resolve()};},cleanup(){cleaned++;}}),destroy:async()=>destroyed++})})},
 document:{createElement:()=>({getContext:()=>({})})},recognizeBestFromCanvas:async()=>{ocr++;return 'PLACA AAA1234\nMOTOR ORIGINAL';}
 });
 vm.runInContext(slice('async function ocrFilePotenciado','/* ── Render PDF page'),ctx);
 const result=await ctx.ocrFilePotenciado({name:'mixto.pdf',arrayBuffer:async()=>new ArrayBuffer(0)},'matricula');
 assert.ok(result.includes('MUÑOZ'));assert.ok(result.includes('MOTOR ORIGINAL'));assert.equal(ocr,1);assert.equal(renders,1);assert.equal(cleaned,2);assert.equal(destroyed,1);
 console.log('OK PDF mixto lee página digital y página escaneada sin perder la segunda; libera recursos');
 let attempts=0;
 const quality=vm.createContext({console:{table(){},log(){},warn(){}},spinnerMsg(){},normalizeOcrText:s=>s,scoreOcrText:()=>180,
 OCR_PROFILES:{default:{psms:['6','4']}},buildOcrCanvases:()=>[{name:'original',canvas:{}},{name:'contraste',canvas:{}}],
 getTesseractWorker:async()=>({setParameters:async()=>{},recognize:async()=>{attempts++;return {data:{text:'APELLIDOS MUÑOZ '.repeat(10),confidence:45}};}})});
 vm.runInContext(slice('async function recognizeBestFromCanvas','async function ocrFilePotenciado'),quality);
 await quality.recognizeBestFromCanvas({},'default','test');assert.equal(attempts,4);
 console.log('OK OCR no interrumpe alternativas con confianza baja aunque haya muchas etiquetas');
 for(const tipo of Object.keys(ex.fields)){
  const req=ex.buildRequest(tipo,'data:image/png;base64,AA==',Object.keys(ex.fields[tipo]));
  assert.match(req.contents[0].parts[0].text,/fila\/columna/);
 }
 console.log('OK todos los documentos IA incluyen verificación de asociación espacial');
})().catch(e=>{console.error(e);process.exitCode=1;});
