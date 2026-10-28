// Sólo documentos y servicios ficticios; todas las solicitudes de red se interceptan.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[],requests=[];
  const crossSource=(field,doc)=>page.locator('#validacionCruzada .vc-row')
   .filter({has:page.locator('.vc-row-field',{hasText:new RegExp('^'+field+'$')})})
   .locator('.vc-source-line').filter({has:page.locator('.vc-source-doc',{hasText:new RegExp('^'+doc+'$')})});
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('request',r=>requests.push(r.url()));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='autocor.test')return route.fulfill({contentType:'application/javascript',body:'window.pdfjsLib={GlobalWorkerOptions:{}};'});
   const file=path.join(root,decodeURIComponent(url.pathname));
   if(url.pathname==='/js/api-client.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorApi={postJson:async(url,body)=>{if(body.action==="validateSession")return {ok:true,session:{...JSON.parse(localStorage.getItem("autocor_auth")),expiresAt:Date.now()+3600000}};window.__saved=body;return {ok:true};}};'});
   if(url.pathname==='/js/workflow.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorWork={register(){},refreshControls(){},captureDrive(){return{}},restoreDrive(){}};'});
   if(url.pathname==='/js/gemini-client.js')return route.fulfill({contentType:'application/javascript',body:`
    window.__calls=[];window.__failNext=false;
    window.AutoCorGemini={fetch:async(url,init)=>{
     if(url.includes('op=models'))return {ok:true,status:200,json:async()=>({models:AutoCorGeminiAvailability.catalog.map(m=>({name:'models/'+m.id,supportedGenerationMethods:['generateContent']}))})};
     const b=init.request||JSON.parse(init.body),keys=b.generationConfig.responseSchema.required,probe=keys.length===3;
     const model=new URL(url).searchParams.get('model');__calls.push({probe,model,keys,prompt:b.contents[0].parts[0].text});
     if(probe&&model===AutoCorGeminiAvailability.catalog[0].id)return {ok:false,status:429,retryAfter:'60',json:async()=>({})};
     if(!probe&&__failNext){__failNext=false;throw Object.assign(new Error('synthetic timeout'),{code:'AI_TIMEOUT'});}
     const data={placa:'ABC1234',propietario:'PEREZ LOPEZ ANA',cedulaRuc:'1722821509',marca:'CHEVROLET',modelo:'SPARK 1.2 LT',color:probe?'AZUL':'BLANCO',chasis:'ABC12345678901234',motor:'AB12345678',anio:'2020',apellidos:'PEREZ LOPEZ',nombres:'ANA',numeroCedula:'1722821509',codigoDactilar:'A1234B5678',fechaExpiracion:'01/01/2030',estadoCivil:'SOLTERO',nacionalidad:'ECUATORIANA',_reviewKeys:[]};
     await new Promise(r=>setTimeout(r,15));
     const response={ok:true,status:200,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(Object.fromEntries(keys.map(k=>[k,data[k]??''])))}]}}]})};
     if(!probe&&window.__holdDocuments)return new Promise(resolve=>window.__releaseDoc=()=>resolve(response));
     return response;
    }};`});
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'image/png',body:fs.readFileSync(file)});
  });
  await page.addInitScript(()=>{localStorage.setItem('autocor_auth',JSON.stringify({user:'PRUEBA',token:'fixture',isAdmin:true}));Object.defineProperty(window,'Tesseract',{get(){throw Error('Tesseract prohibido');}});window.__fixtureClockOffset=0;const now=Date.now;Date.now=()=>now()+window.__fixtureClockOffset;});
  await page.goto('https://autocor.test/contratos.html');
  await page.waitForFunction(()=>document.getElementById('aiStatusBanner').classList.contains('ok'));
  assert.equal(await page.locator('.doc-card[data-type^="papeleta"]').count(),0);
  for(const id of ['aiModelSelect','aiBannerTest','manualDocumentSelect','file-matricula'])assert.equal(await page.locator('#'+id).count(),0);
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=900;canvas.height=500;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,500);ctx.fillStyle='#17212f';ctx.font='bold 28px Arial';ctx.fillText('DOCUMENTO FICTICIO - SIN VALIDEZ',30,60);ctx.font='26px Arial';ctx.fillText('PLACA: ABC1234',30,140);ctx.fillText('MODELO: SPARK 1.2 LT',30,205);ctx.fillText('Sólo prueba local; sin consultas a Gemini.',30,300);window.__image=canvas.toDataURL();
   AutoCorContractDraft.restore({flow:{operacion:'comision',tipoPersona:'natural',estadoCivil:'SOLTERO'},data:{},images:{'cedula-prop':{frontal:__image,reverso:__image},matricula:{frontal:__image,reverso:__image},'papeleta-prop':{frontal:__image}},files:{}});
  });
  await page.locator('#btnValidateAll').click();
  await page.waitForFunction(()=>document.getElementById('validateToast').classList.contains('visible')&&document.getElementById('validateToastTitle').textContent==='Validación completada');
  assert.equal(await page.evaluate(()=>_contratosValidacionCompletada),true);
  assert.equal(await page.evaluate(()=>__calls.filter(c=>!c.probe).length),2);
  assert.ok((await page.evaluate(()=>__calls.filter(c=>!c.probe))).every(c=>c.model==='gemini-3.1-flash-lite'&&!c.prompt.includes('PAPELETA')));
  assert.equal(await page.locator('#block-matricula input[data-key="modelo"]').inputValue(),'SPARK 1.2 LT');
  await page.locator('#btnValidateAll').click();
  await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled);
  assert.equal(await page.evaluate(()=>__calls.filter(c=>!c.probe).length),2);
  console.log('OK un clic procesa ambos documentos en orden; alternativa automática, sin papeletas ni consultas duplicadas');
  await page.evaluate(()=>{
   const m=_contratosData.matricula;
   _contratosData.cuv={...structuredClone(m),cedula:m.cedulaRuc,_source:'cuv',_origins:{}};
   const canvas=document.createElement('canvas');canvas.width=500;canvas.height=200;const ctx=canvas.getContext('2d');ctx.fillStyle='#dbeafe';ctx.fillRect(0,0,500,200);ctx.fillStyle='#17212f';ctx.font='22px Arial';ctx.fillText('RESPALDO CUV FICTICIO',25,90);window.__cuvImage=canvas.toDataURL();
   _uploadedDocumentOriginals.cuv={dataUrl:__cuvImage,name:'respaldo-ficticio.png'};
   m._origins.motor='review';AutoCorContractDraft.refresh();
  });
  assert.equal(await page.locator('#validacionCruzada .vc-status.diff').count(),0);
  assert.equal(await page.locator('#validacionCruzada .vc-evidence').count(),0,'No se añaden accesos a datos coincidentes');
  const beforeReviewCalls=await page.evaluate(()=>__calls.length);
  assert.equal(await page.locator('#block-matricula input[data-key="motor"]').evaluate(e=>e.closest('.f-item').classList.contains('vc-needs-review')),false);
  await page.evaluate(()=>{_contratosData.cuv.motor='OTRO999';AutoCorContractDraft.refresh();});
  assert.equal(await page.locator('#validacionCruzada .vc-status.diff').count(),1);
  assert.ok((await page.locator('#validacionCruzada').innerText()).includes('OTRO999'));
  assert.equal(await page.locator('#block-cuv .vc-needs-review').count(),1);
  assert.equal(await page.locator('#validacionCruzada .vc-evidence').count(),2);
  await crossSource('Motor','Matrícula').getByRole('button',{name:'Ver documento de respaldo',exact:true}).click();
  assert.equal(await page.locator('#contractEvidence h3').innerText(),'Motor · Matrícula');
  assert.equal(await page.locator('#contractEvidence img').count(),2);
  assert.equal(await page.locator('#contractEvidence img').first().getAttribute('src'),await page.evaluate(()=>__image));
  await page.getByRole('button',{name:'Aplicar y cerrar',exact:true}).click();
  await crossSource('Motor','CUV').getByRole('button',{name:'Ver documento de respaldo',exact:true}).click();
  assert.equal(await page.locator('#contractEvidence').getAttribute('aria-modal'),'true');
  assert.equal(await page.locator('#contractEvidence h3').innerText(),'Motor · CUV');
  assert.equal(await page.locator('#contractEvidence img').getAttribute('src'),await page.evaluate(()=>__cuvImage));
  assert.equal(await page.evaluate(()=>document.activeElement.id),'evidence-motor');
  await page.locator('#evidence-motor').fill('AB12345678');
  await page.waitForFunction(()=>_contratosValidacionCompletada===true);
  assert.equal(await page.evaluate(()=>_contratosData.cuv._origins.motor),'manual');
  await page.locator('#evidence-modelo').fill('');
  await page.waitForFunction(()=>_contratosValidacionCompletada===false&&document.getElementById('validacionCruzada').textContent.includes('Pendiente: no detectado'));
  assert.equal(await page.locator('#validacionCruzada .vc-status.diff').count(),0);
  assert.ok((await page.locator('#validacionCruzada').innerText()).includes('Pendiente: no detectado'));
  await page.getByRole('button',{name:'Aplicar y cerrar',exact:true}).click();
  assert.equal(await page.evaluate(()=>_contratosData.cuv.modelo),'','El vacío manual se conserva al cerrar');
  await crossSource('Modelo','CUV').getByRole('button',{name:'Ver documento de respaldo',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'evidence-modelo');
  await page.locator('#evidence-modelo').fill('SPARK 1.2 LT');
  await page.waitForFunction(()=>_contratosValidacionCompletada===true);
  await page.getByRole('button',{name:'Aplicar y cerrar',exact:true}).click();
  assert.equal(await page.locator('#block-cuv input[data-key="modelo"]').inputValue(),'SPARK 1.2 LT');
  assert.equal(await page.evaluate(()=>_contratosData.cuv.motor),'AB12345678','Se conserva la corrección anterior');
  assert.equal(await page.evaluate(()=>__calls.filter(c=>!c.probe).length),2);
  assert.equal(await page.evaluate(()=>__calls.length),beforeReviewCalls,'Abrir respaldos y corregir no comprueba ni extrae con IA');
  console.log('OK accesos desde discrepancia y no detectado abren el respaldo correcto y conservan correcciones y vacíos sin IA');
  await page.evaluate(()=>{
   const m=_contratosData.matricula;
   _contratosData.notaria={placa:m.placa,marca:m.marca,modelo:m.modelo,anio:m.anio,serialChasis:m.chasis,numeroMotor:m.motor,nombrePropietario:m.propietario,identificacionPropietario:m.cedulaRuc,_origins:{}};
   pastedImages.notaria={frontal:__cuvImage};AutoCorContractDraft.refresh();
  });
  const chassisRow=()=>page.locator('#validacionCruzada .vc-row').filter({has:page.locator('.vc-row-field',{hasText:/^Chasis$/})});
  assert.equal(await chassisRow().locator('.vc-status.ok').count(),1);
  assert.equal(await chassisRow().locator('.vc-source-note').count(),0);
  assert.equal(await chassisRow().locator('.vc-source-line.match').count(),3);
  for(const [label,key,reference] of [['Motor','numeroMotor','motor'],['Chasis','serialChasis','chasis'],['Cédula del propietario','identificacionPropietario','cedulaRuc']]){
   await page.evaluate(key=>{_contratosData.notaria[key]=key==='serialChasis'?'ABC12345678901235':'DIFERENTE';AutoCorContractDraft.refresh();},key);
   if(key==='serialChasis'){
    assert.equal(await chassisRow().locator('.vc-source-line.diff').count(),1);
    assert.equal(await chassisRow().locator('.vc-source-line.match').count(),2);
    assert.equal(await chassisRow().locator('.vc-source-note').count(),1);
    assert.equal(await chassisRow().locator('.vc-source-line.diff .vc-source-doc').textContent(),'Print notaría');
   }
   await crossSource(label,'Print notaría').getByRole('button',{name:'Ver documento de respaldo',exact:true}).click();
   assert.equal(await page.evaluate(()=>document.activeElement.id),'evidence-'+key);
   assert.equal(await page.locator('#contractEvidence img').getAttribute('src'),await page.evaluate(()=>__cuvImage));
   if(key==='serialChasis'){
    // Guardar debe tomar lo visible incluso si una modificación no disparó input.
    await page.locator('#evidence-'+key).evaluate((e,value)=>e.value=value,await page.evaluate(()=>_contratosData.matricula.chasis));
    assert.equal(await page.evaluate(()=>_contratosData.notaria.serialChasis),'ABC12345678901235');
    await page.getByRole('button',{name:'Confirmar el campo revisado',exact:true}).click();
    assert.equal(await page.evaluate(()=>_contratosData.notaria.serialChasis),await page.evaluate(()=>_contratosData.matricula.chasis));
   }
   await page.locator('#evidence-'+key).fill(await page.evaluate(key=>_contratosData.matricula[key],reference));
   if(key==='serialChasis'){
    assert.equal(await chassisRow().locator('.vc-status.ok').count(),1,'El recálculo de chasis no espera el debounce ni el cierre del visor');
    assert.equal(await chassisRow().locator('.vc-source-note').count(),0);
    assert.equal(await chassisRow().locator('.vc-source-line.match').count(),3);
    assert.equal(await page.locator('#block-notaria input[data-key="serialChasis"]').evaluate(e=>e.closest('.f-item').classList.contains('vc-needs-review')),false);
   }
   await page.getByRole('button',{name:'Aplicar y cerrar',exact:true}).click();
   assert.equal(await page.locator('#validacionCruzada .vc-status.diff').count(),0);
  }
  await page.locator('#block-cedula-prop input[data-key="nombres"]').fill('');
  await crossSource('Propietario','Cédula propietario').getByRole('button',{name:'Ver documento de respaldo',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'evidence-nombres','Se enfoca el componente ausente del nombre completo');
  assert.equal(await page.locator('#contractEvidence img').first().getAttribute('src'),await page.evaluate(()=>__image));
  await page.locator('#evidence-nombres').fill('ANA');
  await page.getByRole('button',{name:'Aplicar y cerrar',exact:true}).click();
  await page.evaluate(()=>{_contratosData.notaria=null;pastedImages.notaria={};AutoCorContractDraft.refresh();});
  assert.equal(await page.evaluate(()=>_contratosValidacionCompletada),true);
  assert.equal(await page.evaluate(()=>__calls.filter(c=>!c.probe).length),2);
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await page.evaluate(()=>__calls.length),beforeReviewCalls,'Refrescar la revisión o volver a la pestaña reutiliza la prueba vigente');
  console.log('OK campos con nombres internos distintos y nombre compuesto abren y corrigen el campo correspondiente');
  await page.evaluate(()=>abrirModalGuardarProceso());
  await page.locator('#gpTelefonoProp').fill('0999999999');await page.locator('#gpEmailProp').fill('fixture@example.invalid');await page.locator('#gpDomicilio').selectOption('QUITO');
  await page.evaluate(()=>ejecutarGuardarProceso());
  const saved=await page.evaluate(()=>({modelo:__saved.data.modelo,cuv:__saved.data.cuv.modelo,matricula:__saved.data.matricula.modelo}));
  assert.deepEqual(saved,{modelo:'SPARK 1.2 LT',cuv:'SPARK 1.2 LT',matricula:'SPARK 1.2 LT'});
  await page.evaluate(()=>cerrarModalGuardarProceso());
  console.log('OK puntos conservados en extracción, valores por documento, comparación, vista y payload de guardado');
  await page.evaluate(()=>{
   _contratosData.matricula={marca:'CHEVROLET',modelo:'SPARK 1.2 LT',motor:'MANUAL',anio:'',_origins:{marca:'ai',modelo:'ai',motor:'manual',anio:'manual'},_processingIncomplete:true};
   __failNext=true;AutoCorContractDraft.refresh();
  });
  await page.locator('#btnValidateAll').click();
  await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled);
  assert.ok(['Datos pendientes','Valores diferentes'].includes(await page.locator('#validateToastTitle').textContent()));
  assert.equal(await page.evaluate(()=>_contratosValidacionCompletada),false);
  assert.equal(await page.evaluate(()=>_contratosData.matricula._processingIncomplete),false);
  // Se recupera automáticamente; validar otra vez no repite una lectura ya completada.
  await page.locator('#btnValidateAll').click();
  await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled);
  const resumed=await page.evaluate(()=>__calls.filter(c=>!c.probe));
  assert.equal(resumed.length,4);
  for(const c of resumed.slice(2))for(const key of ['marca','modelo','motor','anio'])assert.ok(!c.keys.includes(key),key+' ya procesado/manual');
  assert.equal(await page.evaluate(()=>_contratosData.matricula.motor),'MANUAL');assert.equal(await page.evaluate(()=>_contratosData.matricula.anio),'');
  assert.equal(await page.evaluate(()=>_contratosData.matricula._processingIncomplete),false);
  assert.equal(await page.evaluate(()=>_contratosValidacionCompletada),false,'El vacío manual sigue pendiente');
  console.log('OK un timeout transitorio se recupera; el vacío manual queda pendiente y no se repite la lectura completada');
  await page.evaluate(()=>{_contratosData['cedula-prop']=null;_contratosData.matricula._processingIncomplete=true;__holdDocuments=true;AutoCorContractDraft.refresh();});
  await page.locator('#btnValidateAll').click();await page.waitForFunction(()=>typeof __releaseDoc==='function');
  await page.getByRole('button',{name:'Cancelar procesamiento',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled);
  const cancelledCalls=await page.evaluate(()=>__calls.filter(c=>!c.probe).length);
  const cancelledData=await page.evaluate(()=>JSON.stringify(_contratosData['cedula-prop']));
  await page.evaluate(()=>{__releaseDoc();__holdDocuments=false;});await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>JSON.stringify(_contratosData['cedula-prop'])),cancelledData);
  assert.equal(await page.evaluate(()=>__calls.filter(c=>!c.probe).length),cancelledCalls,'No se envía el siguiente documento tras cancelar');
  assert.equal(await page.evaluate(()=>_contratosData.matricula.motor),'MANUAL');assert.equal(await page.evaluate(()=>_contratosData.matricula.anio),'');
  assert.equal(await page.locator('#pprev-matricula-frontal img').getAttribute('src'),await page.evaluate(()=>__image));
  await page.locator('#btnValidateAll').click();await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled);
  assert.ok(await page.evaluate(()=>!!_contratosData['cedula-prop']));
  assert.equal(await page.evaluate(()=>_contratosData.matricula.motor),'MANUAL');assert.equal(await page.evaluate(()=>_contratosData.matricula.anio),'');
  console.log('OK cancelar corta el lote, conserva archivos y manuales, ignora la respuesta tardía y permite reanudar');
  assert.equal(requests.filter(u=>/tesseract|traineddata|tessdata/i.test(u)).length,0);
  assert.deepEqual(errors,[]);
  // Evidencia exclusivamente sintética, con el cuadro de revisión ya existente.
  await page.locator('#block-matricula .f-item').filter({has:page.locator('input[data-key="modelo"]')}).getByRole('button').click();
  await page.screenshot({path:path.join(root,'entrega/acceso-respaldo-validacion-20261023.png')});
  console.log('OK sin Tesseract ni errores de JavaScript; captura sintética guardada');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
