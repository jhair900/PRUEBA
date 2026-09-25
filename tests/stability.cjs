const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
(async () => {
  for (const [file,fn,loader] of [
    ['pagos.html','buscarPorPlaca','cargarFormularioPago'],
    ['ventas.html','buscarPorPlaca','cargarFormularioVenta'],
    ['liquidacion.html','buscarPlaca','cargarFormularioDesdeData']
  ]) {
    const pending = {}, loaded = [];
    const ctx = vm.createContext({window:{}, requireUser:()=>true, normalizeValue:v=>v, upperTrim:v=>v,
      setStatus(){}, apiCall:(_,p)=>new Promise((resolve,reject)=>pending[p.placa]={resolve,reject}),
      [loader]:d=>loaded.push(d.placaValue)});
    vm.runInContext(read(file).match(new RegExp('async function '+fn+'\\([^]*?\\n\\}'))[0],ctx);
    const a=ctx[fn]('AAA1111'), b=ctx[fn]('BBB2222');
    pending.BBB2222.resolve({data:{placaValue:'BBB2222'}}); await b;
    pending.AAA1111.resolve({data:{placaValue:'AAA1111'}}); await a;
    assert.deepEqual(loaded,['BBB2222']);
    const c=ctx[fn]('CCC3333'), d=ctx[fn]('DDD4444');
    pending.DDD4444.resolve({data:{placaValue:'DDD4444'}}); await d;
    pending.CCC3333.reject(new Error('fallo tardío')); await c;
    assert.equal(loaded.at(-1),'DDD4444');
    console.log('OK',file,'descarta respuestas y errores antiguos');
  }
  {
    const listeners={}, calls=[];
    let auth={user:'OTRO',token:'nuevo'};
    vm.runInNewContext(read('js/session-sync.js'),{window:{
      addEventListener:(n,f)=>listeners[n]=f,
      localStorage:{getItem:()=>JSON.stringify(auth)},
      saveAuthState:(a,p)=>calls.push([a,p]), AutoCorAuthUI:{render(){}},
      location:{reload(){throw Error('No debe recargar');}}
    }});
    listeners.storage({key:'autocor_auth'});
    assert.equal(calls[0][0].user,'OTRO');assert.equal(calls[0][1],false);
    auth=null;listeners.storage({key:'autocor_auth'});assert.equal(calls[1][0],null);
    console.log('OK cambio y cierre de sesión sin recargar ni reescribir almacenamiento');
  }
  {
    let now=0;const sent=[];
    class Clock extends Date {static now(){return now;}}
    const ctx={Date:Clock,Map,AbortController,console:{info(){}},clearTimeout(){},setTimeout(){return 1;},
      fetch:async(_,opts)=>{const b=JSON.parse(opts.body);sent.push(b);now+=b.action==='savePago'?60000:30000;const e=new Error('timeout');e.name='AbortError';throw e;},
      window:{crypto:{randomUUID:()=> 'same-id'},localStorage:{getItem:()=>null}}};
    vm.runInNewContext(read('js/api-client.js'),ctx);
    await assert.rejects(ctx.window.AutoCorApi.postJson('https://example.test',{action:'savePago',data:{placaValue:'AAA1111'}}),/verifica la placa/);
    assert.equal(now,90000);assert.deepEqual(sent.map(b=>b.action),['savePago','getPagoByPlaca']);
    assert.equal(ctx.window.AutoCorApi.lastSaveTiming.attempts,1);
    console.log('OK presupuesto de 90 segundos incluye verificación y evita nuevos reintentos');
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
