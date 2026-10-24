
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ex=require('../js/document-extraction.js');
const html=fs.readFileSync(require('path').join(__dirname,'../contratos.html'),'utf8');
const fn=n=>html.match(new RegExp('(?:async )?function '+n+'\\([^]*?\\n\\}'))[0];
function setup(data,previous,native){
 const calls=[];const ctx=vm.createContext({console,performance,structuredClone,requireDocumentAccess:()=>({model:'B'}),aiController:{checkTicket(){}},GEMINI_MODEL_ACTIVE:'B',
  prepararImagenParaIA:async()=>{calls.push('prepare');return 'data:image/png;base64,AA==';},
  analizarConGeminiCampos:async()=>{calls.push('ia');if(data instanceof Error)throw data;return data;},
  normalizeFieldValue:(k,v)=>typeof v==='string'?v.trim():'',postProcesarMatriculaConfiabilidad(){},sanitizeDetectedData:d=>d,
  personasArrayATexto:a=>a.map(x=>x.nombre).join('\n'),isDocumentHeader:v=>/^(RAMV\s*\/\s*CPN|MOTOR)$/.test(v||'')
 });
 for(const n of ['isFieldEmpty','isFieldDubious','getMissingFields','validationFieldsForDocument','getDocumentPendingDetail','mergearDatosConIA','mergearDatosConOCR','procesarIaFirst'])vm.runInContext(fn(n),ctx);
 const op={previousData:previous,nativeText:native,record(){},update(){},check(){}};
 return {ctx,calls,run:()=>ctx.procesarIaFirst({file:{name:'test.png'},tipo:'matricula',tipoIA:'matricula',operation:op,fieldsFn:()=>['placa','color','motor','anio'].map(key=>({key})),parserLocal:()=>({placa:'ABC1235',color:'AZUL',_reviewKeys:['placa']})})};
}
(async()=>{
 let t=setup({placa:'ABC1234',color:'BLANCO',motor:'AB12345678',anio:'2020'}),d=await t.run();
 assert.deepEqual(t.calls,['prepare','ia']);assert.equal(d.motor,'AB12345678');assert.equal(d._origins.motor,'ai');assert.equal(d._origins.placa,'ai');assert.ok(!d._missing.includes('motor'));assert.deepEqual(Array.from(d._verifiedCritical),[]);
 console.log('OK una lectura Gemini válida no se convierte automáticamente en sospecha');
 t=setup(Object.assign(new Error('quota'),{code:'AI_QUOTA_EXHAUSTED'}));await assert.rejects(t.run,e=>e.code==='AI_QUOTA_EXHAUSTED');assert.deepEqual(t.calls,['prepare','ia']);
 console.log('OK fallo Gemini se entrega para recuperación manual sin ejecutar respaldo OCR');
 t=setup({placa:'ABC1235',color:'AZUL',motor:'AB99999999',anio:'2021'},{placa:'ABC1234',motor:'MANUAL',anio:'',_origins:{placa:'review',motor:'manual',anio:'manual'}});d=await t.run();assert.equal(d.placa,'ABC1234');assert.equal(d._origins.placa,'review');assert.equal(d.motor,'MANUAL');assert.equal(d.anio,'');assert.equal(d._origins.anio,'manual');
 console.log('OK relectura mantiene contradicciones, edición manual y vacío intencional');
 t=setup({placa:'ABC1234',color:'BLANCO',motor:'RAMV / CPN',anio:''},null,'TEXTO NATIVO');d=await t.run();assert.equal(d.motor,'');assert.equal(d._origins.motor,'review');assert.ok(d._missing.includes('placa'));
 t.ctx.mergearDatosConIA(d,d._origins,{placa:'ABC1235'},['placa']);assert.equal(d._origins.placa,'review');
 console.log('OK encabezados rechazados y contradicción del texto PDF persiste en fusiones posteriores');
 for(const kind of Object.keys(ex.fields)){const body=ex.buildRequest(kind,'data:image/png;base64,AA==',Object.keys(ex.fields[kind]));assert.match(body.contents[0].parts[0].text,/fila\/columna/);}
 assert.match(ex.fields.matricula.anio,/FABRICACIÓN/);assert.match(ex.fields.matricula.motor,/RAMV/);
 console.log('OK todos los criterios mantienen roles y asociación espacial; año de fabricación separado de año/modelo');
})().catch(e=>{console.error(e);process.exitCode=1;});
