// Lote real del navegador con HTTP/Apps Script/Gemini interceptados y documentos ficticios.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),A='gemini-3.5-flash-lite',B='gemini-3.1-flash-lite';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const mode of ['recover','persistent','owner-failure','empty-response','fatal-quota','cancel']){
  const ownerCase=['owner-failure','empty-response'].includes(mode);
  const page=await browser.newPage(),requests=[],errors=[];let matriculaRequests=0,forceGood=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='script.google.com'&&url.searchParams.get('action')==='geminiProxy'){
    const {request}=route.request().postDataJSON(),keys=request.generationConfig.responseSchema.required,probe=keys.length===3;
    const kind=probe?'probe':keys.includes('apellidos')?(await page.locator('#spinnerText').textContent()).includes('Cónyuge')?'cedula-cony':'cedula-prop':keys.includes('serialChasis')?'notaria':'matricula';
    const model=url.searchParams.get('model');
    const fail=!forceGood&&((ownerCase&&kind==='cedula-prop')||(kind==='matricula'&&!ownerCase&&(mode!=='recover'||matriculaRequests<2)));if(kind==='matricula')matriculaRequests++;
    const status=fail?(mode==='empty-response'?200:mode==='fatal-quota'?429:503):200;
    requests.push({kind,model,status,keys});
    if(fail&&mode==='empty-response')return route.fulfill({contentType:'application/json',body:JSON.stringify({_proxy:{ok:true,status:200},data:{candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]}})});
    if(fail)return route.fulfill({contentType:'application/json',body:JSON.stringify({_proxy:{ok:false,status,retryAfter:mode==='fatal-quota'?'60':'0',upstreamMs:1},data:{error:{status:status===429?'RESOURCE_EXHAUSTED':'UNAVAILABLE'}}})});
    const values={placa:'ABC1234',propietario:'PEREZ LOPEZ ANA',cedulaRuc:'1722821509',marca:'CHEVROLET',modelo:'SPARK 1.2 LT',color:probe?'AZUL':'BLANCO',chasis:'ABC12345678901234',motor:'AB12345678',anio:'2020',apellidos:'PEREZ LOPEZ',nombres:'ANA',numeroCedula:'1722821509',codigoDactilar:'A1234B5678',fechaExpiracion:'01/01/2030',estadoCivil:ownerCase?'CASADO':'SOLTERO',nacionalidad:'ECUATORIANA',serialChasis:'ABC12345678901234',numeroMotor:'AB12345678',nombrePropietario:'PEREZ LOPEZ ANA',identificacionPropietario:'1722821509',_reviewKeys:[]};
    const data=Object.fromEntries(keys.map(key=>[key,values[key]??'']));
    return route.fulfill({contentType:'application/json',body:JSON.stringify({_proxy:{ok:true,status:200,upstreamMs:1},data:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]}})});
   }
   if(url.hostname!=='autocor.test')return route.fulfill({contentType:'application/javascript',body:'window.pdfjsLib={GlobalWorkerOptions:{}};'});
   const file=path.join(root,decodeURIComponent(url.pathname));
   if(url.pathname==='/js/api-client.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorApi={postJson:async()=>({ok:true})};'});
   if(url.pathname==='/js/apps-script-transport.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorTransport={request:async()=>null,connect:async()=>null};'});
   if(url.pathname==='/js/workflow.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorWork={register(){},refreshControls(){},captureDrive(){return{}},restoreDrive(){}};'});
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'image/png',body:fs.readFileSync(file)});
  });
  await page.addInitScript(mode=>{
   localStorage.setItem('autocor_auth',JSON.stringify({user:'PRUEBA',token:'fixture',isAdmin:true}));
   window.AutoCorAIAvailabilityConfig={retryBaseMs:mode==='cancel'?5000:2,retryMaxMs:5000};
   window.__timings=[];addEventListener('autocor-timing',e=>__timings.push(e.detail));
   Object.defineProperty(window,'Tesseract',{get(){throw Error('Tesseract prohibido');}});
  },mode);
  await page.goto('https://autocor.test/contratos.html');
  await page.waitForFunction(()=>document.getElementById('aiStatusBanner').classList.contains('ok'));
  await page.evaluate(mode=>{
   const canvas=document.createElement('canvas');canvas.width=900;canvas.height=500;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,500);ctx.fillStyle='black';ctx.font='28px Arial';ctx.fillText('DOCUMENTO FICTICIO - SIN VALIDEZ',25,80);window.__image=canvas.toDataURL();
   const cuv={placa:'ABC1234',cedula:'1722821509',propietario:'PEREZ LOPEZ ANA',marca:'CHEVROLET',modelo:'SPARK 1.2 LT',color:'BLANCO',chasis:'ABC12345678901234',motor:'AB12345678',anio:'2020',_source:'cuv',_missing:[],_origins:{}};
   AutoCorContractDraft.restore({flow:{operacion:'comision',tipoPersona:'natural',estadoCivil:['owner-failure','empty-response'].includes(mode)?'CASADO':'SOLTERO'},data:{cuv,matricula:{motor:'AB12345678',_origins:{motor:'manual'},_processingIncomplete:true},notaria:{valorContrato:'',_origins:{valorContrato:'manual'},_processingIncomplete:true}},images:{'cedula-prop':{frontal:__image,reverso:__image},...(['owner-failure','empty-response'].includes(mode)?{'cedula-cony':{frontal:__image,reverso:__image}}:{}),matricula:{frontal:__image,reverso:__image},notaria:{frontal:__image}},files:{}});
   window.__cuvBefore=JSON.stringify(_contratosData.cuv);
  },mode);
  await page.locator('#btnValidateAll').click();
  if(mode==='cancel'){
   await page.waitForFunction(()=>__timings.some(t=>t.details?.some(d=>d.stage==='ai-response'&&d.httpStatus===503)));
   await page.getByRole('button',{name:'Cancelar procesamiento',exact:true}).click();
   await page.waitForFunction(()=>document.getElementById('validateToastTitle').textContent==='Validación cancelada');
   await page.waitForTimeout(30);
   assert.equal(matriculaRequests,1);assert.equal(requests.filter(r=>r.kind==='notaria').length,0);
   assert.equal(requests.filter(r=>r.kind==='probe').length,1,'Cancelar no comprueba otra IA');
   console.log('OK lote: cancelar durante recuperación detiene el envío pendiente y no inicia Notaría');
  }else{
   // Simular invocaciones repetidas mientras la validación original sigue activa.
   await page.evaluate(()=>{document.getElementById('btnValidateAll').dispatchEvent(new Event('click'));});
   const title=mode==='recover'?'Validación completada':'Validación incompleta';
   await page.waitForFunction(title=>document.getElementById('validateToast').classList.contains('visible')&&document.getElementById('validateToastTitle').textContent===title,title);
   const expected=ownerCase?['cedula-prop','cedula-prop','cedula-prop','cedula-cony','matricula','notaria']:mode==='fatal-quota'?['cedula-prop','matricula']:['cedula-prop','matricula','matricula','matricula','notaria'];
   assert.deepEqual(requests.filter(r=>r.kind!=='probe').map(r=>r.kind),expected);
   assert.deepEqual(requests.filter(r=>r.kind==='probe').map(r=>r.model),[A]);
   assert.ok(requests.every(r=>r.model===A),'Todos los documentos y reintentos mantienen el modelo inicial');
   if(mode==='recover'){
    assert.equal(await page.evaluate(()=>_contratosValidacionCompletada),true);
    assert.equal(await page.evaluate(()=>_contratosData.matricula._processingIncomplete),false);
    assert.equal(await page.evaluate(()=>_contratosData.notaria._processingIncomplete),false);
    console.log('OK lote: Cédula correcta → Matrícula 503, 503 → recuperación con el mismo modelo → Notaría, sin reiniciar el lote');
   }else if(mode==='fatal-quota'){
    assert.equal(requests.filter(r=>r.kind==='notaria').length,0);
    assert.match(await page.locator('#validateToastSub').textContent(),/Sin intentar: Print Notaría/);
    console.log('OK cuota global y espera del servicio: detención justificada, sin cambiar modelo ni insistir');
   }else{
    const failed=ownerCase?'cedula-prop':'matricula';
    const text=await page.locator('#validateToastSub').textContent();assert.match(text,/límite de recuperación/);assert.match(text,/lectura/i);assert.ok(!text.includes('Sin intentar:'));assert.ok(!text.includes('ausente o ilegible'));
    assert.equal(await page.evaluate(()=>_contratosValidacionCompletada),false);
    assert.equal(await page.evaluate(tipo=>_contratosData[tipo]._readError.code,failed),mode==='empty-response'?'AI_INVALID_RESPONSE':'AI_UPSTREAM_ERROR');
    assert.equal(await page.evaluate(()=>_contratosData.notaria._processingIncomplete),false);
    const beforeRetry=requests.length,completed=await page.evaluate(failed=>JSON.stringify(Object.fromEntries(Object.entries(_contratosData).filter(([tipo])=>tipo!==failed))),failed);
    forceGood=true;await page.locator('#btnValidateAll').click();await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled&&_contratosValidacionCompletada===true);
    assert.deepEqual(requests.slice(beforeRetry).map(r=>r.kind),[failed],'Sólo se reintenta el fallido');
    assert.equal(await page.evaluate(failed=>JSON.stringify(Object.fromEntries(Object.entries(_contratosData).filter(([tipo])=>tipo!==failed))),failed),completed);
    assert.equal(await page.evaluate(tipo=>!!_contratosData[tipo]._readError,failed),false);
    console.log('OK '+failed+': fallo técnico acotado, continúa con los demás; el reintento sólo completa ese documento y limpia el error anterior');
   }
  }
  if(!ownerCase)assert.equal(requests.filter(r=>r.kind==='cedula-prop').length,1);
  assert.equal(await page.evaluate(()=>JSON.stringify(_contratosData.cuv)===__cuvBefore),true);
  assert.equal(await page.evaluate(()=>_contratosData.matricula.motor),'AB12345678');
  assert.equal(await page.evaluate(()=>_contratosData.matricula._origins.motor),'manual');
  assert.equal(await page.evaluate(()=>_contratosData.notaria.valorContrato),'');
  assert.equal(await page.evaluate(()=>_contratosData.notaria._origins.valorContrato),'manual');
  assert.equal(await page.evaluate(()=>pastedImages.matricula.frontal===__image&&pastedImages.matricula.reverso===__image&&pastedImages.notaria.frontal===__image),true);
  assert.ok(requests.filter(r=>r.kind==='matricula').every(r=>!r.keys.includes('motor')),'Los reintentos no solicitan el campo manual');
  assert.deepEqual(errors,[]);
  const diagnostics=await page.evaluate(()=>JSON.stringify(__timings));for(const value of ['1722821509','PEREZ LOPEZ ANA','data:image','ABC12345678901234'])assert.ok(!diagnostics.includes(value));
  await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
