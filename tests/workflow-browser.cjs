const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.join(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});
try {for(const file of ['contratos.html','liquidacion.html','pagos.html','ventas.html']){
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname!=='autocor.test')return r.abort();const rel=decodeURIComponent(u.pathname).slice(1)||'index.html';if(rel==='js/api-client.js')return r.fulfill({contentType:'application/javascript',body:'window.AutoCorApi={postJson:async()=>({ok:true,rows:[]})};'});const f=path.resolve(root,rel);if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return r.fulfill({status:404,body:''});return r.fulfill({contentType:rel.endsWith('.html')?'text/html':rel.endsWith('.js')?'application/javascript':rel.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(f)});});
 await page.addInitScript(()=>{try{localStorage.setItem('autocor_auth',JSON.stringify({user:'PRUEBA',token:'simulado',isAdmin:true}));}catch(_){}});
 await page.goto('https://autocor.test/'+file);await page.waitForTimeout(200);assert.deepEqual(errors,[],file);
 await page.evaluate(async file=>{
  if(file==='contratos.html'){
   Object.assign(window._contratosFlujo,{operacion:'directa',tipoPersona:'natural',estadoCivil:'SOLTERO'});
   window._contratosData.matricula={placa:'AAA1111',propietario:'MUÑOZ PEÑA',_origins:{propietario:'review'}};
  }else{document.getElementById(file==='liquidacion.html'?'placa':'placaValue').value='AAA1111';document.getElementById(file==='liquidacion.html'?'cliente':'clienteValue').value='MUÑOZ PEÑA';}
  await AutoCorWork.persist();
 },file);
 await page.evaluate(file=>{if(file==='contratos.html')window._contratosData.matricula.propietario='CAMBIO';else document.getElementById(file==='liquidacion.html'?'cliente':'clienteValue').value='CAMBIO';},file);
 await page.reload();
 await page.getByRole('button',{name:'Borradores',exact:true}).click();await page.getByRole('button',{name:'Recuperar',exact:true}).click();await page.waitForTimeout(400);
 assert.equal(await page.evaluate(file=>file==='contratos.html'?window._contratosData.matricula.propietario:document.getElementById(file==='liquidacion.html'?'cliente':'clienteValue').value,file),'MUÑOZ PEÑA');
 if(file==='pagos.html'||file==='ventas.html'){
  const saved=await page.evaluate(async file=>{let sent,exported;AutoCorApi.postJson=async(_,body)=>{sent=structuredClone(body.data);return {ok:true,data:body.data};};window.exportarImagenes=async()=>{exported=file==='pagos.html'?obtenerDatosPago():obtenerDatosVenta();};await guardarYExportarTodo();return {sent,exported};},file);
  assert.ok(saved.exported,'La operación real debe exportar');assert.equal(saved.sent.clienteValue,saved.exported.clienteValue);assert.deepEqual(saved.sent.docs,saved.exported.docs);
 }
 const result=await page.evaluate(async()=>{let calls=0;window.__unlock=null;const work=AutoCorWork.run('Prueba',async()=>{calls++;await new Promise(r=>window.__unlock=r);});await new Promise(r=>setTimeout(r,100));await AutoCorWork.run('Doble',()=>calls++);const inert=[...document.body.children].filter(e=>!e.dataset.workflowUi).some(e=>e.inert);window.__unlock();await work;return {calls,inert,busy:AutoCorWork.busy};});assert.equal(result.calls,1);assert.ok(result.inert);assert.equal(result.busy,false);
 if(file==='contratos.html') {
  const generation=await page.evaluate(async()=>{
   for(const [id,v] of Object.entries({genTelefonoProp:'0999999999',genEmailProp:'prueba@example.test',genDomicilio:'QUITO',genKm:'1000',genValorNum:'10000'}))document.getElementById(id).value=v;
   const events=[];window.generarContratos=(_,opts)=>{events.push('preparar');if(opts.download!==false)throw Error('descarga prematura');return {generados:[]};};window.descargarContratosGenerados=()=>events.push('descargar');window._autoGuardarConContrato=async()=>{events.push('guardar');return {ok:true,placa:'AAA1111'};};window._subirExpedienteADrive=async()=>{events.push('drive');return {ok:true};};
   await ejecutarGenerarContratos();const success=events.slice();events.length=0;window._autoGuardarConContrato=async()=>({ok:false,message:'sin confirmación'});await ejecutarGenerarContratos();return {success,failed:events,error:document.getElementById('genError').textContent};
  });assert.deepEqual(generation.success,['preparar','guardar','descargar','drive']);assert.deepEqual(generation.failed,['preparar']);assert.ok(generation.error.includes('No se descargaron'));
  await page.evaluate(()=>verRespaldoContrato('matricula','propietario','Propietario'));assert.ok((await page.locator('#contractEvidence').innerText()).includes('MUÑOZ PEÑA'));await page.locator('#contractEvidence button').first().click();
  const drive=await page.evaluate(async()=>{const calls=[];AutoCorApi.postJson=async(_,b)=>{calls.push(b.archivos.map(f=>f.nombre));return {ok:true,archivos:b.archivos.map(f=>({nombre:f.nombre,ok:calls.length>1||f.nombre==='uno.pdf'}))};};await AutoCorWork.sendDrive('AAA1111',[{nombre:'uno.pdf',contenidoBase64:'AA=='},{nombre:'dos.pdf',contenidoBase64:'AA=='}]);const pending=AutoCorWork.captureDrive();await AutoCorWork.sendDrive('AAA1111',pending[0].files);return {calls,remaining:AutoCorWork.captureDrive().length};});assert.deepEqual(drive.calls,[['uno.pdf','dos.pdf'],['dos.pdf']]);assert.equal(drive.remaining,0);
 }
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('autocor-timing',{detail:{action:'savePago',elapsedMs:9000,attempts:1,server:{serverMs:800},details:[]}})));
 await page.getByRole('button',{name:'Tiempos',exact:true}).click();assert.ok((await page.getByRole('dialog',{name:'Tiempos de las operaciones'}).innerText()).includes('9.0 s'));await page.getByRole('dialog',{name:'Tiempos de las operaciones'}).getByRole('button',{name:'Cerrar'}).click();
 if(file==='pagos.html'){
  await page.evaluate(()=>localStorage.setItem('autocor_auth',JSON.stringify({user:'OTRO',token:'otro'})));
  await page.getByRole('button',{name:'Borradores',exact:true}).click();await page.getByRole('dialog',{name:'Borradores recuperables'}).getByText(/No hay borradores/).waitFor();await page.getByRole('dialog',{name:'Borradores recuperables'}).getByRole('button',{name:'Cerrar'}).click();
  await page.evaluate(async()=>{localStorage.setItem('autocor_auth',JSON.stringify({user:'PRUEBA',token:'simulado',isAdmin:true}));await new Promise((resolve,reject)=>{const req=indexedDB.open('autocor-work',1);req.onsuccess=()=>{const tx=req.result.transaction('drafts','readwrite'),store=tx.objectStore('drafts');store.getAll().onsuccess=e=>e.target.result.forEach(r=>store.put({...r,expiresAt:Date.now()-1}));tx.oncomplete=resolve;tx.onerror=reject;};});});
  await page.getByRole('button',{name:'Borradores',exact:true}).click();await page.getByRole('dialog',{name:'Borradores recuperables'}).getByText(/No hay borradores/).waitFor();await page.getByRole('dialog',{name:'Borradores recuperables'}).getByRole('button',{name:'Cerrar'}).click();
 }
 await page.setViewportSize({width:1360,height:850});
 await page.getByRole('button',{name:'Tiempos',exact:true}).click();
 await page.evaluate(()=>{const oldValue=localStorage.getItem('autocor_auth');const a=JSON.parse(oldValue);a.isAdmin=false;localStorage.setItem('autocor_auth',JSON.stringify(a));window.dispatchEvent(new StorageEvent('storage',{key:'autocor_auth',oldValue,newValue:JSON.stringify(a)}));});
 assert.equal(await page.getByRole('button',{name:'Tiempos',exact:true}).count(),0);
 if(file==='contratos.html'){await page.getByRole('button',{name:'Pendientes Drive',exact:true}).click();assert.ok(await page.getByRole('dialog',{name:'Archivos pendientes de Drive'}).isVisible());await page.getByRole('dialog',{name:'Archivos pendientes de Drive'}).getByRole('button',{name:'Cerrar',exact:true}).click();}
 assert.equal(await page.getByRole('dialog',{name:'Tiempos de las operaciones'}).count(),0);
 assert.ok(await page.getByRole('button',{name:'Borradores',exact:true}).isVisible());
 await page.locator('[data-work-admin]').evaluateAll(buttons=>buttons.forEach(b=>b.click()));
 assert.equal(await page.getByRole('dialog',{name:'Tiempos de las operaciones'}).count(),0);
 const aligned=await page.evaluate(()=>{const save=document.querySelector('.toolbar-wrap #btnGuardarImprimir,.toolbar-wrap button[onclick*=guardarYExportarTodo]');const drafts=document.querySelector('[data-work-drafts]');return !save || Math.abs(save.getBoundingClientRect().y-drafts.getBoundingClientRect().y)<6;});assert.ok(aligned,'Borradores en la misma fila que Guardar');
 await page.evaluate(()=>{const oldValue=localStorage.getItem('autocor_auth');const a=JSON.parse(oldValue);a.isAdmin=true;localStorage.setItem('autocor_auth',JSON.stringify(a));window.dispatchEvent(new StorageEvent('storage',{key:'autocor_auth',oldValue,newValue:JSON.stringify(a)}));});
 assert.ok(await page.getByRole('button',{name:'Tiempos',exact:true}).isVisible());
 if(file==='contratos.html')assert.ok(await page.getByRole('button',{name:'Pendientes Drive',exact:true}).isVisible());
 await page.setViewportSize({width:390,height:850});
 const fits=await page.locator('.autocor-work-controls').evaluate(e=>e.getBoundingClientRect().right<=innerWidth);assert.ok(fits,'Controles visibles en celular');
 await page.screenshot({path:path.join(process.env.TEMP,'autocor-workflow-'+file+'.png'),clip:{x:0,y:0,width:390,height:370}});
 await page.evaluate(()=>AutoCorWork.forget());await page.getByRole('button',{name:'Borradores',exact:true}).click();await page.getByRole('dialog',{name:'Borradores recuperables'}).getByText(/No hay borradores/).waitFor();
 assert.deepEqual(errors,[],file);console.log('OK '+file+': borrador, bloqueo, tiempos, limpieza'+(file==='contratos.html'?', evidencia y reintento parcial':''));await page.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});

