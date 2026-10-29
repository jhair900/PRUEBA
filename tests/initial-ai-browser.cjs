// Inicio real del código de página con backend simulado. Cero consultas a Gemini real.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),A='gemini-3.5-flash-lite',B='gemini-3.1-flash-lite';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const mode of ['recover','persistent','auth','config']){
  const page=await browser.newPage(),calls=[],errors=[];let releaseSession,probes=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{localStorage.setItem('autocor_auth',JSON.stringify({user:'PRUEBA',token:'fixture-initial',isAdmin:false}));window.AutoCorAIAvailabilityConfig={retryBaseMs:1,retryMaxMs:2,attemptMs:1000,checkMs:4000};});
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='script.google.com'&&route.request().method()==='POST'){
    const b=route.request().postDataJSON(),action=u.searchParams.get('action')||b.action;calls.push({action,model:u.searchParams.get('model')});
    const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
    if(action==='validateSession'){await new Promise(r=>releaseSession=r);return send({ok:true,session:{user:'PRUEBA',isAdmin:false,expiresAt:Date.now()+3600000}});}
    if(action==='login')return send({ok:true,sessionToken:'fixture-renewed',expiresAt:Date.now()+3600000,user:{username:'PRUEBA',isAdmin:false}});
    if(action==='geminiProxy'){
     probes++;assert.equal(b.request.generationConfig.responseSchema.required.length,3,'Sólo comprobación ficticia, nunca documentos');
     if(mode==='auth'&&probes===1)return send({_proxy:{ok:false,status:401,origin:'session',authCode:'AUTH_EXPIRED'},data:{error:{message:'Sesión expirada.'}}});
     if(mode==='config')return send({_proxy:{ok:false,status:500},data:{error:{code:500,status:'CONFIG_ERROR',message:'GEMINI_API_KEY no configurada en Script Properties'}}});
     if((mode==='recover'&&probes===1)||mode==='persistent')return send({_proxy:{ok:false,status:503,origin:'provider',retryAfter:'0',upstreamMs:1},data:{error:{code:503,status:'UNAVAILABLE',message:'The model is overloaded. Please try again later.'}}});
     return send({_proxy:{ok:true,status:200,origin:'provider',upstreamMs:1,...(mode==='recover'?{timing:{version:1,inputDecodeMs:0,sessionMs:0,requestBuildMs:0,providerFetchMs:1,providerDecodeMs:0,otherMs:0,serverMs:1}}:{})},data:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({placa:'ABC1234',color:'AZUL',_reviewKeys:[]})}]}}],usageMetadata:{promptTokenCount:32,candidatesTokenCount:12,thoughtsTokenCount:0,totalTokenCount:44}}});
    }
    return send({ok:true});
   }
   if(u.hostname!=='autocor.test')return route.fulfill({contentType:'application/javascript',body:'window.pdfjsLib={GlobalWorkerOptions:{}};'});
   if(u.pathname==='/js/apps-script-transport.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorTransport={request:async()=>null};'});
   const f=path.join(root,decodeURIComponent(u.pathname));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')?'application/javascript':'image/png',body:fs.readFileSync(f)});
  });
  await page.goto('https://autocor.test/contratos.html');await page.waitForFunction(()=>AutoCorSession.snapshot().phase==='checking');
  assert.equal(probes,0,'Gemini espera la acreditación del backend');assert.ok(await page.locator('.doc-card:not([data-type="cuv"]) input[type="file"]').evaluateAll(inputs=>inputs.every(i=>i.disabled)));
  releaseSession();
  if(mode==='auth'){
   await page.locator('#authUiLoginModal').waitFor({state:'visible'});
   await page.evaluate(()=>AutoCorContractDraft.restore({flow:{operacion:'comision',tipoPersona:'natural',estadoCivil:'SOLTERO'},data:{matricula:{modelo:'SPARK 1.2',motor:'',_origins:{modelo:'manual',motor:'manual'}}},images:{},files:{}}));
   await page.locator('#authUiUsername').fill('PRUEBA');await page.locator('#authUiPassword').fill('ficticia');await page.locator('#authUiDoLogin').click();
  }
  if(mode==='persistent'){
   await page.waitForFunction(()=>document.getElementById('aiStatusText').textContent==='La IA no está disponible temporalmente.');assert.equal(probes,2);
  }else if(mode==='config'){
   await page.waitForFunction(()=>document.getElementById('aiStatusText').textContent.includes('configurada correctamente'));
   assert.equal(probes,1);assert.ok(await page.locator('.doc-card:not([data-type="cuv"]) input[type="file"]').evaluateAll(inputs=>inputs.every(i=>i.disabled)));
   assert.equal(await page.evaluate(()=>AutoCorSession.snapshot().authenticated),true);
  }else{
   await page.waitForFunction(()=>document.getElementById('aiStatusBanner').classList.contains('ok'));
   assert.deepEqual(calls.filter(c=>c.action==='geminiProxy').map(c=>c.model),mode==='recover'?[A,B]:[A,A]);
   if(mode==='auth')assert.deepEqual(await page.evaluate(()=>[_contratosData.matricula.modelo,_contratosData.matricula.motor,_contratosData.matricula._origins.motor]),['SPARK 1.2','','manual']);
  }
  const count=probes;await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('autocor-auth-changed'));AutoCorContractDraft.refresh();});
  assert.equal(probes,count,'Ni volver a la pestaña ni actualizar resultados reinicia la selección');
  await page.getByRole('button',{name:'Tiempos',exact:true}).click();const panel=page.getByRole('dialog',{name:'Tiempos de las operaciones'});
  for(const summary of await panel.getByText('Ver etapas',{exact:true}).all())await summary.click();
  const text=await panel.innerText();assert.ok(!text.includes('fixture-initial'));assert.ok(!text.includes('fixture-renewed'));
  if(mode==='recover'){assert.ok(text.includes('Código original del servicio: 503'));assert.ok(text.includes('The model is overloaded. Please try again later.'));assert.ok(text.includes('Origen informado por el backend: provider'));
   assert.ok(text.includes('UrlFetchApp.fetch (red, cola y generación remotas juntas)'));assert.ok(text.includes('Tokens informados por Gemini: entrada 32; respuesta 12; pensamiento 0; total 44'));
   assert.ok(text.includes('Los totales contienen sus subetapas'));assert.ok(text.includes('Interpretar y validar campos devueltos'));}
  if(mode==='config'){assert.ok(text.includes('AI_BACKEND_CONFIG_ERROR'));assert.ok(text.includes('GEMINI_API_KEY no configurada en Script Properties'));}
  assert.deepEqual(errors,[]);console.log('OK inicio '+mode+': sesión antes de IA, recuperación/código precisos, Tiempos, manuales y ninguna selección posterior');await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
