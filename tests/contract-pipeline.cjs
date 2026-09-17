const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname, '../contratos.html'), 'utf8').replace(/\r\n/g, '\n');
const slice = (a, b) => {
  const start = html.indexOf(a), end = html.indexOf(b, start);
  assert.ok(start >= 0 && end > start, a);
  return html.slice(start, end);
};
const plain = x => JSON.parse(JSON.stringify(x));
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('OK', name); }
function context(aiData, ocrData) {
  const calls = [];
  const ctx = vm.createContext({
    console: {log(){}, warn(){}}, aiAvailable:false, calls,
    spinnerMsg(){}, setSpinnerBar(){}, tipoLabel:x=>x,
    prepararImagenParaIA:async()=> 'data:image/png;base64,AA==',
    analizarConGeminiCampos:async()=> {calls.push('ia'); if(aiData instanceof Error) throw aiData; return aiData;},
    ocrFilePotenciado:async()=> {calls.push('ocr'); return 'DOCUMENTO DE PRUEBA CON ETIQUETAS';},
    normalizeFieldValue:(key,value)=> typeof value==='string' && value!=='INVALIDO' ? value.trim() : '',
    personasArrayATexto:x=> x.map(p=>p.nombre).join('\n'),
    sanitizeDetectedData:x=>x,
    postProcesarMatriculaConfiabilidad:x=>x
  });
  vm.runInContext(slice('function isFieldEmpty(', '/* ── Inicializar mapa'), ctx);
  vm.runInContext(slice('function mergearDatosConOCR(', '/* ── Cédula'), ctx);
  const opts = {file:{name:'prueba.png'}, tipo:'ruc', tipoIA:'ruc', fieldsFn:()=>[
    {key:'numeroRuc'}, {key:'razonSocial'}, {key:'direccionMatriz'}
  ], parserLocal:()=>ocrData};
  return {ctx, calls, run:()=>ctx.procesarIaFirst(opts)};
}
(async()=>{
  await test('IA se intenta aunque la disponibilidad anterior sea falsa; no OCR si todos los campos están claros', async()=>{
    const b=context({numeroRuc:'1790000000001',razonSocial:'EMPRESA',direccionMatriz:'CALLE UNO'}, {});
    const d=await b.run();
    assert.deepEqual(b.calls,['ia']); assert.equal(d._source,'ia');
  });
  await test('RUC: OCR completa dirección aunque IA ya detectó RUC y razón social', async()=>{
    const b=context({numeroRuc:'1790000000001',razonSocial:'EMPRESA'}, {numeroRuc:'OTRO',direccionMatriz:'CALLE UNO'});
    const d=await b.run();
    assert.deepEqual(b.calls,['ia','ocr']); assert.equal(d.numeroRuc,'1790000000001');
    assert.equal(d.direccionMatriz,'CALLE UNO'); assert.equal(d._origins.direccionMatriz,'ocr');
  });
  await test('Fallo IA usa OCR y no descarta formulario', async()=>{
    const b=context(new Error('sin conexión'),{numeroRuc:'1790000000001',razonSocial:'EMPRESA',direccionMatriz:'CALLE UNO'});
    const d=await b.run(); assert.deepEqual(b.calls,['ia','ocr']); assert.equal(d._source,'ocr');
  });
  await test('OCR reemplaza valor IA inválido no vacío y completa revisión explícita', async()=>{
    const b=context({numeroRuc:'INVALIDO',razonSocial:'EMPRESA',direccionMatriz:'AMBIGUA',_reviewKeys:['direccionMatriz']},
      {numeroRuc:'1790000000001',direccionMatriz:'CALLE DOS'});
    const d=await b.run(); assert.equal(d.numeroRuc,'1790000000001'); assert.equal(d.direccionMatriz,'CALLE DOS');
    assert.deepEqual(plain(d._missing),[]);
  });
  await test('Ambigüedad OCR no se convierte en aceptación automática', async()=>{
    const b=context({}, {numeroRuc:'1790000000001',razonSocial:'EMPRESA',_reviewKeys:['numeroRuc']});
    const d=await b.run(); assert.equal(d._origins.numeroRuc,'review'); assert.ok(d._missing.includes('numeroRuc'));
  });
  await test('Ambas fuentes conservan las ediciones manuales', ()=>{
    const {ctx}=context({},{}), d={numeroRuc:'MANUAL'}, origins={numeroRuc:'manual'};
    ctx.mergearDatosConIA(d,origins,{numeroRuc:'IA'},['numeroRuc']);
    ctx.mergearDatosConOCR(d,origins,{numeroRuc:'OCR'},['numeroRuc']);
    assert.equal(d.numeroRuc,'MANUAL');
  });
  await test('PDF entrega páginas separadas, en orden, y libera recursos', async()=>{
    const rendered=[], released=[];
    const pdf={numPages:2, async getPage(n){return {getViewport:()=>({width:100,height:200}),render:()=>({promise:Promise.resolve(rendered.push(n))}),cleanup:()=>released.push(n)};},destroy:async()=>released.push('pdf')};
    const ctx=vm.createContext({pdfjsLib:{getDocument:()=>({promise:Promise.resolve(pdf)})},spinnerMsg(){},setSpinnerBar(){},
      document:{createElement:()=>({getContext:()=>({}),toDataURL:()=> 'data:image/png;base64,AA=='})}});
    vm.runInContext(slice('async function prepararImagenParaIA(', '/* ── Convertir compradores'),ctx);
    const pages=await ctx.prepararImagenParaIA({name:'cedula.pdf',arrayBuffer:async()=>new ArrayBuffer(0)},'cedula-prop');
    assert.equal(pages.length,2); assert.equal(pages[1].label,'Página 2 de 2');
    assert.deepEqual(rendered,[1,2]); assert.deepEqual(released,[1,2,'pdf']);
    pdf.numPages=7;
    await assert.rejects(()=>ctx.prepararImagenParaIA({name:'largo.pdf',arrayBuffer:async()=>new ArrayBuffer(0)}), {code:'DOCUMENT_PAGE_LIMIT'});
  });
  await test('CUV conserva ruta local sin ninguna llamada IA', async()=>{
    const {ctx,calls}=context({},{});
    Object.assign(ctx, {window:{leerPdfTexto:async()=> 'DOCUMENTO CUV SUFICIENTEMENTE LARGO PARA PRUEBA',parseCUV:()=>({placa:'ABC1234'})},
      camposCuv:()=>[{key:'placa'}],sanitizeCuvData:x=>x,datos:{},setStatus(){},document:{getElementById:()=>null}});
    vm.runInContext(slice('async function procesarCUV(', '/* ══════════════════════════════════════════════════════════════\n   PROCESADORES'),ctx);
    await ctx.procesarCUV({name:'cuv.pdf'},'cuv.pdf');
    assert.deepEqual(calls,[]); assert.equal(ctx.datos.cuv.placa,'ABC1234'); assert.equal(ctx.datos.cuv._source,'cuv');
  });
  await test('Papeletas cargadas y pegadas comparten IA primero y respaldo OCR', async()=>{
    const {ctx,calls}=context({numeroCedula:'1712345678'},{});
    Object.assign(ctx,{camposPapeleta:()=>[{key:'numeroCedula'},{key:'fechaSufragio'}],
      AutoCorDocumentExtraction:{parsePapeleta:()=>({fechaSufragio:'09/02/2025'})},datos:{},setStatus(){}});
    vm.runInContext(slice('async function procesarPapeleta(', '/* Hook al botón'),ctx);
    await ctx.procesarPapeleta({name:'papeleta.png'},'papeleta-prop','papeleta.png');
    assert.deepEqual(calls,['ia','ocr']); assert.equal(ctx.datos['papeleta-prop'].fechaSufragio,'09/02/2025');
    assert.ok(slice('async function _procesarPapeletaPaste(', '/* Helper local:').includes('await procesarPapeleta('));
  });
  await test('Texto OCR preserva códigos alfanuméricos y separadores de tablas',()=>{
    const ctx=vm.createContext({});
    vm.runInContext(slice('function normalizeOcrText(', 'function normalizeForParsing('),ctx);
    assert.equal(ctx.normalizeOcrText('B1234S678 | MOTOR D1234Q567'), 'B1234S678 | MOTOR D1234Q567');
  });
  await test('Todos los campos del formulario tienen un esquema IA compatible',()=>{
    const extraction=require('../js/document-extraction.js');
    const ctx=vm.createContext({});
    vm.runInContext(slice('function camposPapeleta(', 'async function procesarPapeleta('),ctx);
    vm.runInContext(slice('function camposCedula(', '/* ── Block icon'),ctx);
    for(const [type,fn] of [['cedula','camposCedula'],['ruc','camposRuc'],['matricula','camposMatricula'],['notaria','camposNotaria'],['papeleta','camposPapeleta']]){
      const keys=Array.from(ctx[fn](),f=>f.key);
      const req=extraction.buildRequest(type,'data:image/png;base64,AA==',keys);
      assert.equal(req.generationConfig.responseSchema.required.length,keys.length+1,type);
    }
  });
  await test('Edición manual de papeleta valida cédula y fecha usando sus propios campos',()=>{
    const ctx=vm.createContext({window:{},datos:{'papeleta-prop':{}},_invalidarValidacion(){},setTimeout(){},
      fieldState:(v,f)=>f.validate ? f.validate(v) : 'ok',
      validCed10:v=>/^\d{10}$/.test(v),validDate:v=>v==='09/02/2025'});
    vm.runInContext(slice('function camposPapeleta(', 'async function procesarPapeleta('),ctx);
    vm.runInContext(slice('window.onFieldEdit = function(', '/* ── Field definitions'),ctx);
    for(const [key,value,expected] of [['numeroCedula','123','warn'],['fechaSufragio','31/02/2025','warn'],['fechaSufragio','09/02/2025','ok']]){
      const input={dataset:{tipo:'papeleta-prop',key},value,tagName:'INPUT',closest:()=>null,nextElementSibling:{}};
      ctx.window.onFieldEdit(input); assert.equal(input.className,'f-input '+expected);
      assert.equal(ctx.datos['papeleta-prop']._origins[key],'manual');
    }
  });
  console.log(`${passed} pruebas del flujo de extracción completadas.`);
})().catch(err=>{console.error(err);process.exitCode=1;});
