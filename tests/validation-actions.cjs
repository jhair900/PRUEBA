// UI real con documentos ficticios y red interceptada; no consulta Gemini.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[],calls=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());page.on('request',r=>network.push(r.url()));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='script.google.com'&&url.searchParams.get('action')==='geminiProxy'){
    const request=route.request().postDataJSON().request,keys=request.generationConfig.responseSchema.required;
    const probe=keys.length===3;calls.push({probe,keys});
    const values={placa:'ABC1234',marca:'CHEVROLET',modelo:'SPARK 1.2 LT',anio:'2020',color:'AZUL',serialChasis:'ABC12345678901234',numeroMotor:'AB12345678',nombrePropietario:'PEREZ LOPEZ ANA',identificacionPropietario:'1722821509',_reviewKeys:[]};
    const data=Object.fromEntries(keys.map(k=>[k,values[k]??'']));
    return route.fulfill({contentType:'application/json',body:JSON.stringify({_proxy:{ok:true,status:200},data:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}]}})});
   }
   if(url.hostname!=='autocor.test')return route.fulfill({contentType:'application/javascript',body:'window.pdfjsLib={GlobalWorkerOptions:{}};'});
   if(url.pathname==='/liquidacion.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Destino ficticio</title>'});
   if(url.pathname==='/js/api-client.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorApi={postJson:async()=>({ok:true})};'});
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
  const bars=['generarContratosBar','continuarLiquidacionBar'];
  async function assertBars(visible){
   await page.waitForFunction(({bars,visible})=>bars.every(id=>{const e=document.getElementById(id);return (getComputedStyle(e).display!=='none')===visible;}),{bars,visible},{timeout:2500});
   assert.equal(await page.evaluate(()=>_contratosValidacionCompletada),visible);
  }
  const edit=(tipo,key)=>page.locator('#block-'+tipo+' [data-key="'+key+'"]');
  await assertBars(false);
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=900;canvas.height=500;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,500);ctx.fillStyle='black';ctx.font='28px Arial';ctx.fillText('RESPALDO FICTICIO - SIN VALIDEZ',25,80);window.__image=canvas.toDataURL();
   const cedula={apellidos:'PEREZ LOPEZ',nombres:'ANA',numeroCedula:'1722821509',codigoDactilar:'A1234B5678',fechaExpiracion:'01/01/2030',estadoCivil:'SOLTERO',nacionalidad:'ECUATORIANA',_origins:{}};
   const matricula={placa:'ABC1234',propietario:'PEREZ LOPEZ ANA',cedulaRuc:'1722821509',marca:'CHEVROLET',modelo:'SPARK 1.2 LT',color:'BLANCO',chasis:'ABC12345678901234',motor:'AB12345678',anio:'2020',_origins:{}};
   // Notaría viene de un archivo, no de los recuadros frontal/reverso.
   AutoCorContractDraft.restore({flow:{operacion:'comision',tipoPersona:'natural',estadoCivil:'SOLTERO'},data:{'cedula-prop':cedula,matricula},images:{matricula:{frontal:__image,reverso:__image}},files:{notaria:{dataUrl:__image,name:'respaldo-ficticio.png'}}});
  });
  await assertBars(false);
  await page.locator('#btnValidateAll').click();
  await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled&&document.getElementById('validateToastTitle').textContent==='Validación completada');
  await assertBars(true);
  assert.equal(calls.filter(c=>!c.probe).length,1,'Sólo se procesa el archivo pendiente, sin repetir Cédula ni Matrícula');
  const callsBeforeEditing=calls.length;
  console.log('OK ambos bloques aparecen al completar el lote con archivo de Notaría y campos condicionales vacíos');

  await edit('matricula','chasis').fill('ABC12345678901235');
  await assertBars(false);
  assert.equal(await page.locator('#validacionCruzada .vc-status.diff').count(),1);
  const row=page.locator('#validacionCruzada .vc-row').filter({has:page.locator('.vc-row-field',{hasText:/^Chasis$/})});
  await row.locator('.vc-source-line').filter({has:page.locator('.vc-source-doc',{hasText:/^Matrícula$/})}).getByRole('button',{name:'Ver documento de respaldo',exact:true}).click();
  assert.equal(await page.locator('#contractEvidence img').count(),2);
  await page.locator('#evidence-chasis').fill('ABC12345678901234');
  await page.getByRole('button',{name:'Aplicar y cerrar',exact:true}).click();
  await assertBars(true);
  assert.equal(await page.locator('#validacionCruzada .vc-status.diff').count(),0);
  assert.equal(await page.evaluate(()=>_contratosData.matricula._origins.chasis),'manual');
  console.log('OK tras corregir una diferencia en el respaldo se recalculan y reaparecen ambos bloques');

  // Un procesamiento detenido puede completarse revisando los campos obligatorios.
  await page.evaluate(()=>{_contratosData.notaria._processingIncomplete=true;AutoCorContractDraft.refresh();});
  await assertBars(false);
  await edit('notaria','identificacionPropietario').fill('');
  await assertBars(false);
  await edit('notaria','identificacionPropietario').fill('1722821509');
  await assertBars(true);
  assert.equal(await page.evaluate(()=>_contratosData.notaria._processingIncomplete),false);
  assert.ok(await page.evaluate(()=>_contratosData.notaria._missing.includes('valorContrato')),'Se conserva el diagnóstico condicional; no se inventa su valor');
  assert.equal(await page.evaluate(()=>_contratosData.notaria.valorContrato),'');
  console.log('OK los campos condicionales de Notaría no bloquean una revisión obligatoria ya resuelta');

  await edit('cedula-prop','nombres').fill('');
  await assertBars(false);
  assert.equal(await page.evaluate(()=>_contratosData['cedula-prop'].nombres),'','Se conserva el vacío manual y su bloqueo');
  await edit('cedula-prop','nombres').fill('ANA');
  await assertBars(true);
  await page.evaluate(()=>{window.__cedula=_contratosData['cedula-prop'];_contratosData['cedula-prop']=null;AutoCorContractDraft.refresh();});
  await assertBars(false);
  await page.evaluate(()=>{_contratosData['cedula-prop']=__cedula;_contratosData['cedula-cony']={_processingIncomplete:true};_contratosData.ruc={_processingIncomplete:true};AutoCorContractDraft.refresh();});
  await assertBars(true);
  assert.equal(await page.evaluate(()=>_contratosData.matricula._origins.chasis),'manual','Otras correcciones permanecen intactas');
  assert.equal(calls.length,callsBeforeEditing,'Ninguna corrección ni actualización de visibilidad consulta la IA');
  console.log('OK pendientes obligatorios, documentos faltantes y diferencias bloquean; cónyuge/RUC inactivos no bloquean');

  const order=await page.evaluate(()=>{const a=document.getElementById('generarContratosBar'),b=document.getElementById('continuarLiquidacionBar');return {before:!!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING),above:a.getBoundingClientRect().bottom<=b.getBoundingClientRect().top};});
  assert.deepEqual(order,{before:true,above:true});
  await page.locator('#btnGenerarContratos').click();
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('modalGenerarContratos')).display!=='none');
  assert.match(await page.locator('#genFieldsReadonly').innerText(),/SPARK 1\.2 LT/);
  await page.evaluate(()=>cerrarModalGenerarContratos());
  await page.locator('#btnContinuarLiquidacionValidacion').click();
  await page.waitForURL('https://autocor.test/liquidacion.html');
  const transfer=await page.evaluate(()=>({placa:sessionStorage.getItem('autocor_placa_preload'),data:JSON.parse(sessionStorage.getItem('autocor_liquidacion_preload'))}));
  assert.equal(transfer.placa,'ABC1234');assert.equal(transfer.data.modelo,'SPARK 1.2 LT');assert.equal(transfer.data.chasis,'ABC12345678901234');
  assert.equal(calls.length,callsBeforeEditing);
  assert.equal(network.filter(u=>/tesseract|traineddata|tessdata/i.test(u)).length,0);
  assert.deepEqual(errors,[]);
  console.log('OK orden de bloques, apertura del generador y transferencia a Liquidación conservados; sin consultas reales ni Tesseract');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
