const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const s=fs.readFileSync('contratos.html','utf8');
let made=0;const base={width:200,height:100};const create=()=>{made++;return {width:200,height:100};};
const ctx=vm.createContext({resizeCanvasForOcr:()=>base,cropCanvasMargins:c=>c,applyImageFilter:create,applyOtsuBinarization:create,sharpenCanvas:create});
vm.runInContext(s.slice(s.indexOf('function* buildOcrCanvases'),s.indexOf('async function limitarPrintPegado')),ctx);
const iter=ctx.buildOcrCanvases(base,'matricula');assert.equal(made,0);assert.equal(iter.next().value.canvas,base);assert.equal(made,0);
const first=iter.next().value.canvas;assert.equal(made,1);const second=iter.next().value.canvas;assert.equal(first.width,0);assert.equal(made,2);iter.return();assert.equal(second.width,0);assert.equal(base.width,200);
console.log('OK variantes OCR se crean bajo demanda, se liberan al avanzar y al interrumpir, conservan original');
