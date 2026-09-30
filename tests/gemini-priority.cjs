const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../contratos.html'), 'utf8');
function setup(responses = []) {
  const calls = [], banners = [];
  const ctx = vm.createContext({ console: {warn(){},error(){}}, Date, Map, Set, Promise,
    window: {}, AutoCorConfig: {apiUrl:'https://example.test'},
    sessionStorage: {getItem:()=>JSON.stringify({model:'gemini-2.5-flash',savedAt:Date.now()}),setItem(){}},
    aiAvailable:false,aiAvailabilityChecked:false,aiCheckPromise:null,
    setAIBanner:(state,message)=>banners.push({state,message}),
    AutoCorGemini: {async fetch(url) {
      calls.push(url);
      const item = responses.shift();
      assert.ok(item, 'Unexpected request');
      return {ok:item.status===200,status:item.status,json:async()=>item.body,text:async()=>JSON.stringify(item.body)};
    }}
  });
  vm.runInContext(html.slice(html.indexOf('const GEMINI_MODEL_CATALOG'),html.indexOf('/* Los criterios de extracción')),ctx);
  vm.runInContext(html.slice(html.indexOf('function geminiCandidateModels'),html.indexOf('// Disparar verificación de IA')),ctx);
  return {ctx,calls,banners,run:code=>vm.runInContext(code,ctx)};
}
(async()=>{
  let t=setup();
  assert.deepEqual(Array.from(t.run('geminiCandidateModels()')).slice(0,2),['gemini-3.5-flash-lite','gemini-3.1-flash-lite']);
  await t.ctx.window.initializeAIState();
  assert.equal(t.run('GEMINI_MODEL_ACTIVE'),'gemini-3.5-flash-lite');
  assert.equal(t.calls.length,0);
  assert.match(t.banners.at(-1).message,/Gemini 3.5 Flash Lite/);
  console.log('OK: prioridad por RPD incluso con modelo antiguo en cache; inicio sin consumo');
  t=setup([{status:200,body:{models:[{name:'models/gemini-3.1-flash-lite',supportedGenerationMethods:['generateContent']},{name:'models/gemini-3.5-flash-lite',supportedGenerationMethods:['embedContent']} ]}}]);
  await t.ctx.refreshGeminiModelAvailability();
  assert.deepEqual(Array.from(t.run('geminiCandidateModels()')),['gemini-3.1-flash-lite']);
  t.ctx.registerGeminiModelFailure('gemini-3.1-flash-lite',429,'RESOURCE_EXHAUSTED');
  assert.equal(t.run('geminiCandidateModels().length'),0);
  console.log('OK: solo modelos disponibles de generacion; no reintroduce ausentes cuando se agota cuota');
  t=setup([{status:429,body:{error:{status:'RESOURCE_EXHAUSTED'}}},{status:200,body:{candidates:[]}}]);
  const result=await t.ctx.geminiGenerateWithFallback({contents:[]});
  assert.equal(result.model,'gemini-3.1-flash-lite');
  assert.equal(t.calls.length,2);
  assert.match(t.banners[0].message,/Procesando documento con Gemini 3.5 Flash Lite/);
  assert.match(t.banners[1].message,/Cambiando de IA: Gemini 3.1 Flash Lite/);
  assert.match(t.banners.at(-1).message,/Última lectura realizada con Gemini 3.1 Flash Lite/);
  assert.equal(t.run('geminiCandidateModels()[0]'),'gemini-3.1-flash-lite');
  t.run("GEMINI_MODEL_COOLDOWNS.set('gemini-3.5-flash-lite',Date.now()-1)");
  assert.equal(t.run('geminiCandidateModels()[0]'),'gemini-3.5-flash-lite');
  console.log('OK: 429 cambia modelo, muestra intento y resultado, cooldown y recuperacion de prioridad');
})().catch(e=>{console.error(e);process.exitCode=1;});
