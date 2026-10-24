const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('request',r=>requests.push(r.url()));
  await page.route('**/*',r=>{
   const url=new URL(r.request().url());if(url.hostname!=='autocor.test')return r.fulfill({contentType:'application/javascript',body:'window.pdfjsLib={GlobalWorkerOptions:{}};'});
   const file=path.join(root,decodeURIComponent(url.pathname));
   if(url.pathname==='/js/api-client.js')return r.fulfill({contentType:'application/javascript',body:'window.AutoCorApi={postJson:async()=>({ok:true,rows:[]})};'});
   if(url.pathname==='/js/gemini-client.js')return r.fulfill({contentType:'application/javascript',body:`
    window.__calls=[];window.__probeStatus=429;window.__docStatus=200;window.__late=false;window.__blockedModels=[];
    window.AutoCorGemini={fetch:async(url,init)=>{
     if(url.includes('op=models'))return {ok:true,status:200,json:async()=>({models:AutoCorGeminiAvailability.catalog.map(m=>({name:'models/'+m.id,supportedGenerationMethods:['generateContent']}))})};
     const body=init.request||JSON.parse(init.body),probe=body.generationConfig.responseSchema.required.length===3;
     const model=new URL(url).searchParams.get('model');__calls.push({probe,model});
     const status=probe?(__blockedModels.includes(model)?429:__probeStatus):__docStatus;
     if(status!==200)return {ok:false,status,retryAfter:'2',json:async()=>({error:{status:'RESOURCE_EXHAUSTED'}})};
     const all={placa:'ABC1234',propietario:'PERSONA DE PRUEBA',cedulaRuc:'0102030400',marca:'TOYOTA',modelo:'COROLLA',color:probe?'AZUL':'BLANCO',chasis:'12345678901234567',motor:'AB12345678',anio:'2020',_reviewKeys:[]};
     const data=Object.fromEntries(body.generationConfig.responseSchema.required.map(k=>[k,all[k]??'']));
     const response={ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]})};
     return !probe&&__late?new Promise(resolve=>window.__releaseAI=()=>resolve(response)):response;
    }};`});
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return r.fulfill({status:404,body:''});
   return r.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'image/png',body:fs.readFileSync(file)});
  });
  await page.addInitScript(()=>{
   localStorage.setItem('autocor_auth',JSON.stringify({user:'PRUEBA',token:'simulado',isAdmin:true}));
   window.AutoCorAIAvailabilityConfig={ttlMs:1000,retryMs:1};
   window.__trace=[];addEventListener('autocor-timing',e=>__trace.push(e.detail));
   window.__reads=0;const read=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(){__reads++;return read.apply(this,arguments);};
   Object.defineProperty(window,'Tesseract',{get(){throw Error('Tesseract no debe ejecutarse');}});
  });
  await page.goto('https://autocor.test/contratos.html');
  await page.locator('[data-flow-field="operacion"][data-flow-value="comision"]').click();
  await page.locator('[data-flow-field="tipoPersona"][data-flow-value="natural"]').click();
  await page.locator('[data-flow-field="estadoCivil"][data-flow-value="SOLTERO"]').click();
  await page.locator('#flowStart').click();
  await page.waitForFunction(()=>document.getElementById('aiStatusBanner').classList.contains('err'));
  assert.equal(await page.locator('#file-ruc').isEnabled(),false);
  await page.evaluate(()=>{
   const file=new File(['private'],'test.png',{type:'image/png'}),dt=new DataTransfer();dt.items.add(file);
   onFileChange({target:{files:[file]}},'matricula');onDrop({preventDefault(){},dataTransfer:dt},'matricula');
   const zone=document.getElementById('paste-matricula-frontal');zone.click();zone.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt,cancelable:true}));
   document.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));
   AutoCorContractDraft.restore({images:{matricula:{frontal:'data:image/png;base64,AA=='}},data:{}});
  }).catch(e=>assert.match(e.message,/AI_PRECHECK_REQUIRED/));
  assert.equal(await page.evaluate(()=>__reads),0);assert.equal((await page.locator('#pprev-matricula-frontal img').getAttribute('src'))||'','');
  assert.equal(await page.evaluate(()=>__calls.filter(c=>!c.probe).length),0);
  for(const selector of ['#aiModelSelect','#aiBannerTest','#manualDocumentSelect','#file-matricula','.manual-entry','.ai-availability-note'])assert.equal(await page.locator(selector).count(),0);
  assert.equal(await page.locator('#file-cuv').isEnabled(),true);
  await page.evaluate(()=>AutoCorContractDraft.restore({images:{},data:{matricula:{motor:'MANUAL',anio:'',_origins:{motor:'manual',anio:'manual'}}},flow:{operacion:'comision',tipoPersona:'natural',estadoCivil:'SOLTERO'}}));
  assert.ok(await page.locator('#block-matricula').isVisible());
  console.log('OK interfaz original sin selectores, botones ni carga extra; CUV y campos existentes conservados');
  await page.evaluate(()=>{__probeStatus=200;__blockedModels=['gemini-3.5-flash-lite'];});
  await page.waitForFunction(()=>document.getElementById('aiStatusBanner').classList.contains('ok'));
  assert.equal(await page.locator('#file-ruc').isEnabled(),true);
  console.log('OK comprobación y recuperación automáticas, sin clics ni elección de modelo');
  await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=100;c.height=80;window.__image=c.toDataURL();
   window.__paste=lado=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(__image.split(',')[1]),c=>c.charCodeAt(0))],'synthetic.png',{type:'image/png'}));document.getElementById('paste-matricula-'+lado).click();document.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));};
   __paste('frontal');
  });
  await page.waitForFunction(()=>!!document.querySelector('#pprev-matricula-frontal img').getAttribute('src'));
  await page.evaluate(()=>__paste('reverso'));
  await page.waitForFunction(()=>!!document.querySelector('#pprev-matricula-reverso img').getAttribute('src'));
  await page.evaluate(()=>{_contratosData.matricula={motor:'MANUAL',anio:'',_origins:{motor:'manual',anio:'manual'}};__late=true;});
  await page.locator('#pbtn-matricula').click();
  await page.waitForFunction(()=>typeof __releaseAI==='function');
  await page.getByRole('button',{name:'Cancelar procesamiento',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('spinnerOverlay').classList.contains('open'));
  await page.evaluate(()=>{_contratosData.matricula.motor='MANUAL POSTERIOR';_contratosData.matricula._origins.motor='manual';__releaseAI();__late=false;});
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>_contratosData.matricula.motor),'MANUAL POSTERIOR');assert.equal(await page.evaluate(()=>_contratosData.matricula.anio),'');assert.equal(await page.evaluate(()=>Object.values(pastedImages.matricula).filter(Boolean).length),2);
  await page.getByRole('button',{name:'Reintentar documento',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('spinnerOverlay').classList.contains('open'));
  assert.equal(await page.evaluate(()=>_contratosData.matricula._origins.chasis),'ai');assert.equal(await page.evaluate(()=>_contratosData.matricula.motor),'MANUAL POSTERIOR');
  assert.ok((await page.evaluate(()=>__calls.filter(c=>!c.probe))).every(c=>c.model==='gemini-3.1-flash-lite'));
  console.log('OK navegador: modelo B en la solicitud simulada, cancelar/reintentar conserva frontal/reverso y campos manuales, vacío y protección tardía');
  const priorChecks=await page.evaluate(()=>__calls.filter(c=>c.probe).length);
  await page.waitForFunction(n=>__calls.filter(c=>c.probe).length>n,priorChecks);
  await page.waitForFunction(()=>document.getElementById('aiStatusBanner').classList.contains('ok'));
  console.log('OK la comprobación vencida se renueva automáticamente');
  // La implementación vigente no vuelve a consultar campos ya completos: simular uno pendiente.
  await page.evaluate(()=>{__docStatus=429;_contratosData.matricula.placa='';_contratosData.matricula._origins.placa='none';_contratosData.matricula._processingIncomplete=true;AutoCorContractDraft.refresh();});
  await page.locator('#pbtn-matricula').click();
  await page.locator('#documentRecovery').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('spinnerOverlay').classList.contains('open'));
  assert.equal(await page.evaluate(()=>_contratosData.matricula.motor),'MANUAL POSTERIOR');assert.equal(await page.evaluate(()=>Object.values(pastedImages.matricula).filter(Boolean).length),2);assert.ok(await page.getByRole('button',{name:'Revisar datos',exact:true}).isVisible());
  assert.equal(await page.locator('#file-ruc').isEnabled(),false);
  console.log('OK cuota posterior: archivos y manuales conservados; alternativas y comprobación siguen automáticas');
  assert.equal(requests.filter(u=>/tesseract|traineddata|tessdata/i.test(u)).length,0);assert.ok(!errors.length,errors.join('\n'));
  const diag=JSON.stringify(await page.evaluate(()=>__trace));for(const s of ['PERSONA DE PRUEBA','0102030400','12345678901234567','simulado','data:image'])assert.ok(!diag.includes(s));
  await page.screenshot({path:path.join(root,'entrega/interfaz-original-ia-automatica.png')});
  console.log('OK navegador: ninguna descarga/ejecución de Tesseract, sin errores JS ni datos personales en Tiempos');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

