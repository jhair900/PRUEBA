// Reproduce los fallos observados sin red, documentos ni credenciales reales.
const assert=require('node:assert/strict'),api=require('../js/gemini-availability.js');
const [A,B]=api.catalog.map(m=>m.id),ok=()=>({ok:true,status:200,json:async()=>({valid:true})});
const failure=(status=503,retryAfter='0',service='UNAVAILABLE',message='The service is temporarily unavailable.')=>({ok:false,status,retryAfter,json:async()=>({error:{code:status,status:service,message}})});
const tick=()=>new Promise(r=>setTimeout(r,0));
function setup(request,extra={}){
 let context='fixture-initial';const calls=[],timings=[],states=[];
 const controller=api.create({getContext:()=>context,config:{retryBaseMs:1,retryMaxMs:2,checkMs:200,attemptMs:40,...extra},probeBody:()=>({probe:true}),validate:d=>{if(!d.valid)throw Object.assign(Error('AI_INVALID_RESPONSE'),{code:'AI_INVALID_RESPONSE'});return d;},request:(model,body,signal,timeoutMs,trace)=>{calls.push({model,probe:!!body.probe});return request(model,body,signal,calls.length,trace);},onTiming:t=>timings.push(t),onState:s=>states.push(s)});
 return {controller,calls,timings,states,context:c=>context=c};
}
(async()=>{
 const unhandled=[],onUnhandled=e=>unhandled.push(e);process.on('unhandledRejection',onUnhandled);
 try{
  let t=setup(async(model,body,signal,n)=>{if(n===1)return failure();return ok();});
  const tickets=await Promise.all(Array.from({length:8},()=>t.controller.ensure()));
  assert.deepEqual(t.calls.map(v=>v.model),[A,B]);assert.ok(tickets.every(v=>v.model===B));assert.equal(t.controller.snapshot().ready,true);
  const count=t.calls.length;for(let i=0;i<5;i++)await t.controller.ensure();assert.equal(t.calls.length,count);
  await t.controller.generate({document:true});assert.equal(t.calls.at(-1).model,B);assert.equal(t.calls.filter(v=>v.probe).length,2);
  assert.equal(t.timings.find(v=>v.serviceCode===503).serviceMessage,'The service is temporarily unavailable.');
  console.log('OK 503 A confirmado → B válido en la misma ronda; un solo inicio compartido y modelo fijo después');

  t=setup(async()=>failure());await assert.rejects(t.controller.ensure(),e=>e.code==='AI_UPSTREAM_ERROR');assert.equal(t.calls.length,2);assert.equal(t.controller.snapshot().ready,false);
  for(let i=0;i<3;i++)await assert.rejects(t.controller.ensure());t.controller.invalidate();await assert.rejects(t.controller.ensure());assert.equal(t.calls.length,2);
  console.log('OK servicio persistentemente caído: dos envíos como máximo; no hay temporizador periódico ni nuevas rondas por interacción');

  t=setup(async()=>failure(503,'60'));await assert.rejects(t.controller.ensure(),e=>e.code==='AI_UPSTREAM_ERROR');assert.deepEqual(t.calls.map(v=>v.model),[A]);assert.ok(t.timings.some(t=>t.outcome==='skipped'));
  t=setup(()=>new Promise(()=>{}),{checkMs:30,attemptMs:8});await assert.rejects(t.controller.ensure(),e=>e.code==='AI_INITIAL_RESULT_UNKNOWN'&&e.causeCode==='AI_TIMEOUT');assert.equal(t.calls.length,1);assert.equal(t.controller.snapshot().remoteUnconfirmed,true);
  console.log('OK Retry-After se respeta sin exceder el plazo; un timeout local detiene la ronda sin lanzar B a ciegas');

  t=setup(async()=>failure(500,'0','CONFIG_ERROR','GEMINI_API_KEY no configurada en Script Properties'));await assert.rejects(t.controller.ensure(),e=>e.code==='AI_BACKEND_CONFIG_ERROR');assert.equal(t.calls.length,1);assert.equal(t.controller.snapshot().ready,false);
  t=setup(async()=>failure(429,'60','RESOURCE_EXHAUSTED'));await assert.rejects(t.controller.ensure(),e=>e.code==='AI_QUOTA_EXHAUSTED');assert.deepEqual(t.calls.map(v=>v.model),[A,B]);
  assert.equal(api.classify(403,{}, {statusOrigin:'apps-script-http'}),'AI_BACKEND_ACCESS_ERROR');assert.equal(api.classify(403,{error:{status:'PERMISSION_DENIED'}}),'AI_PROVIDER_AUTH_ERROR');
  console.log('OK sesión/proveedor/configuración/cuota/acceso al backend conservan diagnósticos distintos; no se acredita un modelo fallido');

  let rejectOld;
  t=setup((model,body,signal,n,trace)=>n===1?new Promise((resolve,reject)=>rejectOld=()=>{trace.remoteState='complete';t.context('');t.controller.invalidate();reject(Object.assign(Error('Sesión expirada.'),{code:'AUTH_EXPIRED'}));}):Promise.resolve(ok()));
  const old=t.controller.ensure().catch(e=>e.code);await tick();rejectOld();t.context('fixture-renewed');t.controller.invalidate();
  assert.equal(t.controller.snapshot().selectionStarted,false,'Una respuesta de sesión confirmada permite completar el inicio');
  const renewed=t.controller.ensure();await old;const selected=await renewed;await tick();
  assert.equal(selected.model,A);assert.equal(t.controller.snapshot().ready,true);assert.equal(t.calls.length,2);
  t.context('fixture-third');t.controller.invalidate();await t.controller.ensure();assert.equal(t.calls.length,2,'Una selección terminada no se repite al autenticar');
  console.log('OK rechazo de sesión confirmado: puede continuar tras el acceso correcto; modelo elegido fijo');

  const pending=setup(()=>new Promise(()=>{}));const interrupted=pending.controller.ensure().catch(e=>e.code);await tick();pending.context('');pending.controller.invalidate();pending.context('other-session');pending.controller.invalidate();await interrupted;
  assert.equal(pending.controller.snapshot().remoteUnconfirmed,true);await assert.rejects(pending.controller.ensure(),e=>e.code==='AI_INITIAL_RESULT_UNKNOWN');assert.equal(pending.calls.length,1);
  console.log('OK cambiar sesión durante un envío incierto no crea una ronda superpuesta');

  const sanitized=api.safeDiagnostic('UNAVAILABLE Bearer token-secreto https://example.invalid/?key=oculta correo@example.test projects/mi-proyecto 123456789 AIzaClaveSecreta');
  for(const privateText of ['token-secreto','example.invalid','correo@example.test','mi-proyecto','123456789','AIzaClaveSecreta'])assert.ok(!sanitized.includes(privateText));
  assert.ok(!JSON.stringify(t.timings).includes('fixture-renewed'));await tick();assert.deepEqual(unhandled,[]);
  console.log('OK diagnóstico acotado sin credenciales ni identificadores; sin rechazos sin manejar');
 }finally{process.removeListener('unhandledRejection',onUnhandled);}
})().catch(e=>{console.error(e);process.exitCode=1;});
