const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../contratos.html'),'utf8');
const extraction=require('../js/document-extraction.js');
const ctx=vm.createContext({Date,validCed10:v=>/^\d{10}$/.test(v),normalizeHumanName:v=>String(v||'').trim()});
function load(name){
 const start=html.search(new RegExp('^function '+name+'\\(','m'));assert.ok(start>=0,name);
 for(let end=html.indexOf('}',start);end>=0;end=html.indexOf('}',end+1)){
  let script;try{script=new vm.Script(html.slice(start,end+1));}catch(_){continue;}script.runInContext(ctx);return;
 }throw Error(name);
}
['normalizeDate','validDate','camposPapeleta','fieldState','isFieldEmpty','isFieldDubious','getMissingFields'].forEach(load);
const fields=ctx.camposPapeleta();
assert.deepEqual(Array.from(fields,f=>f.key),['numeroCedula','nombreCompleto','fechaSufragio']);
const req=extraction.buildRequest('papeleta','data:image/png;base64,AA==',Array.from(fields,f=>f.key));
assert.deepEqual(Object.keys(req.generationConfig.responseSchema.properties),['numeroCedula','nombreCompleto','fechaSufragio','_reviewKeys']);
assert.ok(!JSON.stringify(req).includes('16/11/2025'),'La fecha esperada no se envía como respuesta sugerida a la IA');
const date=fields.find(f=>f.key==='fechaSufragio');
assert.equal(ctx.fieldState('16/11/2025',date),'ok');assert.equal(ctx.fieldState('2025-11-16',date),'ok');
assert.equal(ctx.fieldState('09/02/2025',date),'err');assert.equal(ctx.fieldState('31/02/2025',date),'err');assert.equal(ctx.fieldState('',date),'none');
assert.equal(ctx.fieldState('09/02/2025',{validate:v=>ctx.validDate(v)?'ok':'warn'}),'ok');
const data={numeroCedula:'1722821509',nombreCompleto:'LOZA MONTERO MAURO JOSE',fechaSufragio:'09/02/2025'};
assert.deepEqual(Array.from(ctx.getMissingFields(data,fields,{})),[],'Fecha diferente pero bien leída no provoca OCR para cambiarla');
assert.deepEqual(Array.from(ctx.getMissingFields(data,fields,{fechaSufragio:'review'})),['fechaSufragio']);
console.log('OK papeletas solicitan solo tres campos; regla de fecha aislada del OCR y de otras fechas, sin sugerir ni sustituir la fecha real');
const blocked={candidates:[{finishReason:'MAX_TOKENS'}]};
assert.throws(()=>extraction.parseResponse(blocked,['placa']),e=>e.code==='AI_RESPONSE_INCOMPLETE'&&e.finishReason==='MAX_TOKENS');
console.log('OK fallo de IA conserva razón exacta de respuesta incompleta para administradores');
