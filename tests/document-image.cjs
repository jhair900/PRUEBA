// Sólo píxeles ficticios. No consulta Gemini ni abre documentos del usuario.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),image=require('../js/document-image.js');
(async()=>{
 const rgba=new Uint8ClampedArray(12*12*4).fill(255);let p=(1*12+1)*4;rgba[p]=254;let box=image.contentBounds(rgba,12,12,0);assert.equal(box.x,1);assert.equal(box.y,1);assert.equal(box.width,1);
 rgba[p+3]=128;assert.equal(image.contentBounds(rgba,12,12,0).partialAlpha,true);
 console.log('OK sólo blanco exacto/transparente se recorta; tinta muy tenue y transparencia parcial se conservan');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/document-processing.js'),'utf8')});await page.addScriptTag({content:fs.readFileSync(path.join(root,'js/document-image.js'),'utf8')});
  const result=await page.evaluate(async()=>{
   const source=document.createElement('canvas');source.width=1600;source.height=1000;const ctx=source.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,1600,1000);
   const ink=ctx.createImageData(760,450);let seed=1234;for(let i=0;i<ink.data.length;i+=4){for(let c=0;c<3;c++){seed=(seed*1664525+1013904223)>>>0;ink.data[i+c]=seed>>>24;}ink.data[i+3]=255;}ctx.putImageData(ink,420,275);
   const original=source.toDataURL(),originalBytes=(original.length-original.indexOf(',')-1)*.75,meta=[];
   const op=AutoCorDocumentProcessing.createOperation({documentType:'cedula-prop',budgets:{totalMs:10000}});op.record=(stage,detail)=>meta.push({stage,...detail});
   const start=performance.now(),[prepared]=await AutoCorDocumentImage.prepareAttachments([{dataUrl:original,label:'Frontal'}],op);const elapsed=performance.now()-start;
   const decoded=new Image();await new Promise((resolve,reject)=>{decoded.onload=resolve;decoded.onerror=reject;decoded.src=prepared.dataUrl;});
   const target=document.createElement('canvas');target.width=decoded.naturalWidth;target.height=decoded.naturalHeight;target.getContext('2d').drawImage(decoded,0,0);
   const expected=ctx.getImageData(404,259,792,482).data,actual=target.getContext('2d').getImageData(0,0,target.width,target.height).data;
   const pixelsEqual=actual.length===expected.length&&actual.every((value,i)=>value===expected[i]);
   const [alreadyPrepared]=await AutoCorDocumentImage.prepareAttachments([prepared.dataUrl],op);
   const pdf='data:application/pdf;base64,AA==',small='data:image/png;base64,AA==';const unchanged=await AutoCorDocumentImage.prepareAttachments([pdf,small],op);
   const cancel=AutoCorDocumentProcessing.createOperation({budgets:{totalMs:1000}});cancel.cancel();let cancelled=false;try{await AutoCorDocumentImage.prepareAttachments([original],cancel);}catch(e){cancelled=e.code==='PROCESSING_CANCELLED';}finally{cancel.finish('cancelled');}
   op.finish();
   return {pixelsEqual,dimensions:[target.width,target.height],originalRetained:source.toDataURL()===original,labelRetained:prepared.label==='Frontal',bytesReduced:prepared.dataUrl.length<original.length,inputBytes:Math.round(originalBytes),preparedBytes:meta[0].preparedBytes,syntheticPreparationMs:Math.round(elapsed),alreadyPreparedRetained:alreadyPrepared===prepared.dataUrl,unchanged:unchanged[0]===pdf&&unchanged[1]===small,cancelled};
  });
  assert.equal(result.pixelsEqual,true);assert.deepEqual(result.dimensions,[792,482]);for(const k of ['originalRetained','labelRetained','bytesReduced','alreadyPreparedRetained','unchanged','cancelled'])assert.equal(result[k],true,k);
  fs.writeFileSync(path.join(root,'entrega/preparacion-imagen-sintetica-20261023.json'),JSON.stringify({synthetic:true,realGemini:false,...result},null,2));
  console.log('OK píxeles preservados uno a uno, sin reescalado; reducción de bytes, originales intactos y cancelación protegida');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
