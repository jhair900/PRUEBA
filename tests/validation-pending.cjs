// Estado de validación real en navegador, datos ficticios y ninguna extracción IA.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[],calls=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='script.google.com'&&url.searchParams.get('action')==='geminiProxy'){
    const keys=route.request().postDataJSON().request.generationConfig.responseSchema.required;
    calls.push(keys);assert.equal(keys.length,3,'No debe enviarse ningún documento ni repetir la extracción');
    return route.fulfill({contentType:'application/json',body:JSON.stringify({_proxy:{ok:true,status:200},data:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({placa:'ABC1234',color:'AZUL',_reviewKeys:[]})}]}}]}})});
   }
   if(url.hostname!=='autocor.test')return route.fulfill({contentType:'application/javascript',body:'window.pdfjsLib={GlobalWorkerOptions:{}};'});
   if(url.pathname==='/js/api-client.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorApi={postJson:async()=>({ok:true,session:{...JSON.parse(localStorage.getItem("autocor_auth")),expiresAt:Date.now()+3600000}})};'});
   if(url.pathname==='/js/apps-script-transport.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorTransport={request:async()=>null,connect:async()=>null};'});
   if(url.pathname==='/js/workflow.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorWork={register(){},refreshControls(){},captureDrive(){return{}},restoreDrive(){}};'});
   const file=path.join(root,decodeURIComponent(url.pathname));
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':'image/png',body:fs.readFileSync(file)});
  });
  await page.addInitScript(()=>{
   localStorage.setItem('autocor_auth',JSON.stringify({user:'PRUEBA',token:'fixture',isAdmin:true}));
   Object.defineProperty(window,'Tesseract',{get(){throw Error('Tesseract prohibido');}});
  });
  await page.goto('https://autocor.test/contratos.html');
  await page.waitForFunction(()=>document.getElementById('aiStatusBanner').classList.contains('ok'));
  await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=600;c.height=300;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,300);ctx.fillStyle='black';ctx.font='22px Arial';ctx.fillText('RESPALDO FICTICIO - SIN VALIDEZ',25,70);window.__image=c.toDataURL();
   const cedula={apellidos:'PEREZ LOPEZ',nombres:'ANA',numeroCedula:'1722821509',codigoDactilar:'A1234B5678',fechaExpiracion:'01/01/2030',estadoCivil:'SOLTERO',nacionalidad:'ECUATORIANA',_origins:{},_missing:['nombres']};
   const matricula={placa:'ABC1234',propietario:'PEREZ LOPEZ ANA',cedulaRuc:'1722821509',marca:'CHEVROLET',modelo:'SPARK 1.2 LT',color:'BLANCO',chasis:'ABC12345678901234',motor:'AB12345678',anio:'2020',_origins:{}};
   const cuv={...matricula,cedula:matricula.cedulaRuc,_origins:{}};
   const notaria={placa:matricula.placa,marca:matricula.marca,modelo:matricula.modelo,anio:matricula.anio,serialChasis:matricula.chasis,numeroMotor:matricula.motor,nombrePropietario:matricula.propietario,identificacionPropietario:matricula.cedulaRuc,valorContrato:'',_origins:{valorContrato:'manual'}};
   AutoCorContractDraft.restore({flow:{operacion:'comision',tipoPersona:'natural',estadoCivil:'SOLTERO'},data:{'cedula-prop':cedula,matricula,cuv,notaria},images:{'cedula-prop':{frontal:__image,reverso:__image},matricula:{frontal:__image,reverso:__image},notaria:{frontal:__image}},files:{}});
  });
  async function state(complete){
   await page.waitForFunction(complete=>window._contratosValidacionCompletada===complete&&['generarContratosBar','continuarLiquidacionBar'].every(id=>(getComputedStyle(document.getElementById(id)).display!=='none')===complete),complete,{timeout:2000});
  }
  const toast=page.locator('#validateToast');
  const field=(tipo,key)=>page.locator('#block-'+tipo+' [data-key="'+key+'"]');
  const review=(tipo,key)=>toast.locator('[data-validation-tipo="'+tipo+'"][data-validation-key="'+key+'"]');
  await page.locator('#btnValidateAll').click();
  await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled);
  await state(true);
  assert.equal(await page.locator('#validacionCruzada .vc-status.diff,#validacionCruzada .vc-status.pending').count(),0);
  assert.equal(await page.evaluate(()=>_contratosData.notaria.valorContrato),'');
  console.log('OK datos completos: las marcas antiguas de _missing y los campos condicionales vacíos no bloquean');

  await page.evaluate(()=>{_contratosData['cedula-prop'].codigoDactilar='';AutoCorContractDraft.refresh();});
  await page.locator('#btnValidateAll').click();
  await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled);
  await state(false);
  assert.equal(await page.locator('#validacionCruzada .vc-status.diff').count(),0);
  assert.match(await toast.innerText(),/Código dactilar/);
  assert.match(await toast.innerText(),/Cédula Propietario/);
  assert.match(await toast.innerText(),/ausente o ilegible/i);
  assert.equal(await review('cedula-prop','codigoDactilar').count(),1);
  assert.equal(await field('cedula-prop','codigoDactilar').evaluate(e=>e.classList.contains('ok')),false);
  await field('cedula-prop','codigoDactilar').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(root,'entrega/pendiente-identificado-20261026.png')});
  await review('cedula-prop','codigoDactilar').click();
  assert.equal(await page.locator('#contractEvidence img').count(),2);
  await page.locator('#evidence-codigoDactilar').fill('A1234B5678');
  assert.equal(await page.evaluate(()=>_contratosValidacionCompletada),true,'La corrección habilita inmediatamente, sin debounce ni cierre del visor');
  await page.getByRole('button',{name:'Aplicar y cerrar',exact:true}).click();
  await state(true);
  assert.equal(await toast.locator('[data-validation-key]').count(),0);
  assert.ok(!(await toast.innerText()).includes('Datos pendientes'));
  assert.equal(await page.evaluate(()=>_contratosData['cedula-prop']._origins.codigoDactilar),'manual');
  console.log('OK pendiente obligatorio fuera de las filas comparadas: campo, documento, motivo y respaldo; corregir limpia el aviso');

  await page.evaluate(()=>{const m=_contratosData.matricula;m._origins.chasis='ai';m._internalReview=['chasis'];m._missing=[];AutoCorContractDraft.refresh();});
  await state(false);
  const chassisRow=page.locator('#validacionCruzada .vc-row').filter({has:page.locator('.vc-row-field',{hasText:/^Chasis$/})});
  assert.equal(await chassisRow.locator('.vc-source-line.pending').count(),1);
  assert.equal(await chassisRow.locator('.vc-status.pending').count(),1);
  assert.match(await toast.innerText(),/Chasis.*Matrícula[\s\S]*lectura ambigua/i);
  assert.equal(await field('matricula','chasis').evaluate(e=>e.classList.contains('ok')),false);
  await review('matricula','chasis').click();
  await page.getByRole('button',{name:'Confirmar el campo revisado',exact:true}).click();
  await page.getByRole('button',{name:'Aplicar y cerrar',exact:true}).click();
  await state(true);
  assert.equal(await chassisRow.locator('.vc-status.ok').count(),1);
  assert.equal(await page.evaluate(()=>_contratosData.matricula._internalReview.includes('chasis')),false);
  assert.equal(await page.evaluate(()=>_contratosData.matricula._missing.includes('chasis')),false);
  console.log('OK revisión interna no aparece en verde; confirmar el mismo valor elimina la revisión sin alterar el identificador');

  await field('cedula-prop','codigoDactilar').fill('');
  await state(false);
  assert.match(await toast.innerText(),/vaciado manualmente/i);
  assert.equal(await page.evaluate(()=>_contratosData['cedula-prop'].codigoDactilar),'');
  await field('cedula-prop','codigoDactilar').fill('A1234B5678');
  await state(true);
  assert.ok(!(await toast.innerText()).includes('vaciado manualmente'));
  console.log('OK vacío obligatorio manual conservado y explicado; corregirlo elimina el bloqueo');

  await field('cedula-prop','nacionalidad').fill('NO EXISTE');
  await state(false);
  assert.match(await toast.innerText(),/Nacionalidad.*Cédula Propietario[\s\S]*formato/i);
  assert.equal(await field('cedula-prop','nacionalidad').evaluate(e=>e.classList.contains('ok')),false);
  await field('cedula-prop','nacionalidad').fill('ECUATORIANA');
  await state(true);
  console.log('OK un valor presente con formato inválido no se presenta como validado');

  await page.evaluate(()=>{const m=_contratosData.matricula;m._origins.chasis='review';m._internalReview=[];m._processingIncomplete=true;AutoCorContractDraft.refresh();});
  await state(true);
  assert.equal(await page.evaluate(()=>_contratosData.matricula._origins.chasis),'cross');
  assert.equal(await page.evaluate(()=>_contratosData.matricula._processingIncomplete),false);
  console.log('OK la coincidencia que resuelve la última revisión también elimina la marca anterior de incompleto');

  await page.evaluate(()=>{_contratosData.notaria._processingIncomplete=true;AutoCorContractDraft.refresh();});
  await state(false);
  assert.match(await toast.innerText(),/Print Notaría[\s\S]*lectura.*(?:interrumpida|completad)/i);
  assert.equal(await page.locator('#block-notaria .rb-badge.ok').count(),0);
  await review('notaria','placa').click();
  await page.getByRole('button',{name:'Confirmar el campo revisado',exact:true}).click();
  await page.getByRole('button',{name:'Aplicar y cerrar',exact:true}).click();
  await state(true);
  assert.equal(await page.evaluate(()=>_contratosData.notaria._processingIncomplete),false);
  console.log('OK una lectura realmente incompleta se identifica por documento y permite revisar; no se habilita por estar verde la comparación');

  await page.evaluate(()=>{window.__matricula=_contratosData.matricula;_contratosData.matricula=null;AutoCorContractDraft.refresh();});
  await state(false);
  assert.match(await toast.innerText(),/Matrícula[\s\S]*documento obligatorio/i);
  await page.evaluate(()=>{_contratosData.matricula=__matricula;_contratosData['cedula-cony']={_processingIncomplete:true};_contratosData.ruc={_processingIncomplete:true};AutoCorContractDraft.refresh();});
  await state(true);
  await field('matricula','motor').fill('AB99999999');
  await state(false);
  assert.match(await toast.innerText(),/Motor.*Matrícula[\s\S]*diferente/i);
  await field('matricula','motor').fill('AB12345678');
  await state(true);
  assert.equal(await page.evaluate(()=>_contratosData['cedula-prop']._origins.codigoDactilar),'manual');
  assert.equal(await page.evaluate(()=>_contratosData.matricula.modelo),'SPARK 1.2 LT');
  assert.equal(await page.evaluate(()=>!!(document.getElementById('generarContratosBar').compareDocumentPosition(document.getElementById('continuarLiquidacionBar'))&Node.DOCUMENT_POSITION_FOLLOWING)),true);
  assert.equal(calls.length,1,'Se reutiliza la comprobación ficticia inicial; cero extracciones o nuevas consultas');
  assert.deepEqual(errors,[]);
  console.log('OK documentos obligatorios ausentes y diferencias reales bloquean; datos inactivos no bloquean; orden y manuales conservados');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
