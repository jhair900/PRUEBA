// Regresiones del PDF: navegador aislado, datos ficticios y toda la red interceptada.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'.codex/fixes-cinco-puntos-20261029');
const mode=process.argv[2]||'1';
async function setup(browser,file='contratos.html',options={}){
 const context=await browser.newContext({viewport:{width:1360,height:900},...(options.timezoneId?{timezoneId:options.timezoneId}:{})}),page=await context.newPage();
 const calls=[],errors=[];let valid=true,isAdmin=false;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await context.addInitScript(options=>{
  localStorage.setItem('autocor_auth',JSON.stringify({user:'PRUEBA',token:'fixture',isAdmin:true}));
  if(options.now){const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[options.now]));}static now(){return options.now;}};}
  if(options.preload){sessionStorage.setItem('autocor_placa_preload',options.preload.placa);sessionStorage.setItem('autocor_liquidacion_preload',JSON.stringify(options.preload));}
  if(Object.prototype.hasOwnProperty.call(options,'earlyDate'))document.addEventListener('DOMContentLoaded',()=>{const el=document.getElementById('fecha');el.value=options.earlyDate;el.dispatchEvent(new Event('input',{bubbles:true}));});
 },options);
 const session=()=>({user:'PRUEBA',displayName:'USUARIO FICTICIO',isAdmin,expiresAt:(options.now||Date.now())+3600000});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='script.google.com'&&route.request().method()==='POST'){
   const body=route.request().postDataJSON(),action=u.searchParams.get('action')||body.action;
   calls.push({action,body});
   const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   if(action==='validateSession')return send(valid?{ok:true,session:session()}:{ok:false,code:'AUTH_EXPIRED',message:'Sesión vencida ficticia.'});
   if(action==='login')return send(body.password==='correcta'?{ok:true,sessionToken:'fixture-renovada',expiresAt:(options.now||Date.now())+3600000,user:{username:body.username,displayName:'USUARIO FICTICIO',isAdmin}}:{ok:false,message:'Clave incorrecta.'});
   if(action==='geminiProxy'){
    // Sólo la selección inicial ficticia; nunca se permite una extracción documental.
    const keys=body.request.generationConfig.responseSchema.required;
    assert.equal(keys.length,3,'No se deben procesar documentos con Gemini');
    return send({_proxy:{ok:true,status:200,origin:'provider'},data:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({placa:'ABC1234',color:'AZUL',_reviewKeys:[]})}]}}]}});
   }
   if(!valid&&action!=='logout')return send({ok:false,code:'AUTH_EXPIRED',message:'Sesión vencida ficticia.'});
   return send({ok:true,rows:[],data:{},session:session()});
  }
  const library=u.href==='https://unpkg.com/pizzip@3.1.4/dist/pizzip.js'?'pizzip.js':u.href==='https://unpkg.com/docxtemplater@3.50.0/build/docxtemplater.js'?'docxtemplater.js':'';
  if(library)return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(process.env.TEMP,'autocor-docx-test-libs',library))});
  if(u.hostname!=='autocor.test')return route.fulfill({contentType:'application/javascript',body:'window.pdfjsLib={GlobalWorkerOptions:{}};'});
  if(u.pathname==='/js/apps-script-transport.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorTransport={request:async()=>null,connect:async()=>null};'});
  const filePath=path.resolve(root,decodeURIComponent(u.pathname).slice(1));
  if(!filePath.startsWith(root+path.sep)||!fs.existsSync(filePath))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:filePath.endsWith('.html')?'text/html':filePath.endsWith('.js')?'application/javascript':filePath.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(filePath)});
 });
 await page.goto('https://autocor.test/'+file);
 await page.waitForFunction(()=>AutoCorSession.snapshot().authenticated);
 return {context,page,calls,errors,setValid:value=>valid=value,setAdmin:value=>isAdmin=value};
}
async function issue1(browser){
 const {context,page,calls,errors}=await setup(browser);
 try{
  await page.waitForFunction(()=>document.getElementById('aiStatusBanner').classList.contains('ok'));
  await page.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=300;canvas.height=180;
   canvas.getContext('2d').fillText('RESPALDO FICTICIO',15,30);const image=canvas.toDataURL();
   AutoCorContractDraft.restore({flow:{operacion:'directa',tipoPersona:'natural',estadoCivil:'SOLTERO'},data:{'cedula-prop':{_origins:{}},cuv:{motor:'MOTOR2',_origins:{}},matricula:{placa:'ABC1234',motor:'MOTOR1',_origins:{}}},images:{matricula:{frontal:image,reverso:image}}});
  });
  await page.locator('#btnValidateAll').click();
  await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled);
  const toast=page.locator('#validateToast');await toast.scrollIntoViewIfNeeded();
  const metrics=await toast.evaluate(el=>{
   const style=getComputedStyle(el),box=el.getBoundingClientRect(),list=el.querySelector('.validate-toast-sub');
   return {position:style.position,height:box.height,inWorkspace:!!el.closest('#validationWorkspace'),bottom:box.bottom,resultsTop:document.getElementById('resultsSection').getBoundingClientRect().top,scroll:list.scrollHeight>list.clientHeight};
  });
  assert.equal(metrics.position,'static');assert.ok(metrics.height<180);assert.ok(metrics.inWorkspace);assert.ok(metrics.bottom<=metrics.resultsTop);assert.ok(metrics.scroll);
  assert.ok(await toast.getByRole('button',{name:'Ver documento de respaldo',exact:true}).count()>8);
  await page.screenshot({path:path.join(qa,'punto-1-aviso-compacto.png')});
  await toast.locator('[data-validation-tipo="matricula"][data-validation-key="motor"]').click();
  assert.equal(await page.locator('#contractEvidence img').count(),2);
  assert.equal(await page.locator('#evidence-motor').inputValue(),'MOTOR1');
  assert.equal(calls.filter(c=>c.action==='geminiProxy').length,1,'Sólo selección inicial simulada');
  assert.deepEqual(errors,[]);
  console.log('PUNTO 1 OK: aviso dentro de validación, compacto, sin superposición; todos los detalles y respaldos conservados.');
 }finally{await context.close();}
}
async function issue2(browser){
 const {context,page,calls,errors,setValid}=await setup(browser,'liquidacion.html');
 try{
  await page.waitForFunction(()=>document.getElementById('authUiCurrentUser')?.textContent==='USUARIO FICTICIO');
  assert.equal(await page.locator('#asesor').inputValue(),'PRUEBA','Sesión confirmada debe actualizar al asesor');
  assert.equal(await page.locator('#asesorHeader').innerText(),'PRUEBA');
  assert.equal(await page.locator('#userBanner').isVisible(),false,'No mantener el aviso inicial después de confirmar sesión');
  assert.equal(await page.locator('#authUiAdmin').isVisible(),false,'Respetar permisos devueltos por el backend');
  assert.equal(await page.evaluate(()=>requireUser()),true);
  assert.equal(calls.filter(c=>c.action==='validateSession').length,1);
  await page.locator('#cliente').fill('CLIENTE FICTICIO');await page.locator('#placa').fill('ABC1234');await page.locator('#valorToma').fill('10000');await page.locator('#modelo').fill('MODELO 1.2');await page.locator('#motor').fill('');
  const before=await page.evaluate(()=>['cliente','placa','valorToma','modelo','motor'].map(id=>document.getElementById(id).value));
  setValid(false);
  await page.evaluate(()=>AutoCorApi.postJson(AutoCorConfig.apiUrl,{action:'getByPlaca',placa:'ABC1234'},{retries:0}).catch(()=>{}));
  await page.locator('#authUiLoginModal').waitFor({state:'visible'});
  assert.equal(await page.locator('#userBanner').isVisible(),true);
  assert.ok(!/SESIÓN INICIADA/.test(await page.locator('#statusBar').innerText()));
  assert.equal(await page.evaluate(()=>requireUser()),false);
  const login=async password=>{await page.locator('#authUiUsername').fill('PRUEBA');await page.locator('#authUiPassword').fill(password);await page.locator('#authUiDoLogin').click();};
  await login('incorrecta');await page.waitForFunction(()=>document.getElementById('authUiLoginNotice').textContent.includes('incorrecta'));
  assert.equal(await page.locator('#authUiLoginModal').isVisible(),true);
  setValid(true);await login('correcta');await page.waitForFunction(()=>AutoCorSession.snapshot().authenticated);
  assert.equal(await page.locator('#asesor').inputValue(),'PRUEBA');assert.equal(await page.locator('#userBanner').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>['cliente','placa','valorToma','modelo','motor'].map(id=>document.getElementById(id).value)),before);
  assert.equal(await page.evaluate(()=>requireUser()),true);
  assert.equal(calls.filter(c=>c.action==='geminiProxy').length,0);
  assert.deepEqual(errors,[]);
  console.log('PUNTO 2 OK: sesión confirmada sincroniza asesor y aviso; permisos del backend, vencimiento y reingreso local sin pérdida de trabajo.');
 }finally{await context.close();}
}
async function issue3(browser){
 const {context,page,calls,errors,setAdmin}=await setup(browser,'liquidacion.html');
 try{
  const unique=async admin=>{
   assert.equal(await page.locator('.auth-ui-user:visible').count(),1,'Una sola etiqueta de usuario');
   for(const name of ['Cerrar sesión','Cambiar usuario','Cambiar clave'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),1,name+': una sola instancia visible');
   assert.equal(await page.getByRole('button',{name:'Admin usuarios',exact:true}).count(),admin?1:0);
   assert.equal(await page.locator('#authUiBar').count(),1);
  };
  await page.evaluate(()=>requireUser());await unique(false);
  setAdmin(true);await page.evaluate(()=>AutoCorApi.postJson(AutoCorConfig.apiUrl,{action:'getByPlaca',placa:'ABC1234'}));
  await page.evaluate(()=>{requireUser();renderAuthUI();AutoCorAuthUI.render();});await unique(true);
  await page.evaluate(()=>{AutoCorSession.invalidate('AUTH_EXPIRED');});
  await page.locator('#authUiLoginModal').waitFor({state:'visible'});
  await page.locator('#authUiUsername').fill('PRUEBA');await page.locator('#authUiPassword').fill('correcta');await page.locator('#authUiDoLogin').click();
  await page.waitForFunction(()=>AutoCorSession.snapshot().authenticated);await unique(true);
  await page.locator('#placa').fill('ABC1234');
  await page.evaluate(()=>{window.__prints=0;window.print=()=>{__prints++;window.dispatchEvent(new Event('beforeprint'));window.dispatchEvent(new Event('afterprint'));};});
  await page.locator('#btnGuardarImprimir').click();
  await page.waitForFunction(()=>window.__prints===1&&!document.getElementById('btnGuardarImprimir').disabled);
  await unique(true);
  assert.equal(calls.filter(c=>c.action==='save').length,1,'Un único guardado simulado');
  assert.equal(calls.filter(c=>c.action==='geminiProxy').length,0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(qa,'punto-3-cuenta-unica.png')});
  console.log('PUNTO 3 OK: una sola etiqueta y un juego de controles; permisos, renovación y Guardar e imprimir no los duplican. Impresión simulada.');
 }finally{await context.close();}
}
async function issue4(browser){
 const {context,page,calls,errors}=await setup(browser);
 try{
  await page.evaluate(()=>AutoCorContractDraft.restore({flow:{operacion:'directa',tipoPersona:'natural',estadoCivil:'CASADO'},data:{
   'cedula-prop':{apellidos:'PEREZ LOPEZ',nombres:'ANA',numeroCedula:'1722821509',codigoDactilar:'A1234B5678',fechaExpiracion:'01/01/2030',estadoCivil:'CASADO',nacionalidad:'ECUATORIANA',_origins:{}},
   'cedula-cony':{apellidos:'VEGA LOPEZ',nombres:'JOSE',numeroCedula:'0102030405',codigoDactilar:'A1234B5678',fechaExpiracion:'01/01/2030',estadoCivil:'CASADO',nacionalidad:'ECUATORIANA',_origins:{}},
   matricula:{placa:'ABC1234',propietario:'PEREZ LOPEZ ANA',cedulaRuc:'1722821509',marca:'PRUEBA',modelo:'MODELO 1.2',anio:'2020',color:'BLANCO',motor:'MOTORFICTICIO',chasis:'CHASISFICTICIO',_origins:{}}
  },images:{}}));
  for(const [tipo,key,value] of [['cedula-prop','apellidos','MUÑOZ PEÑA'],['cedula-prop','nombres','MARÍA FICTICIA'],['cedula-cony','nombres','JOSÉ FICTICIO']])await page.locator(`#block-${tipo} [data-key="${key}"]`).fill(value);
  const generated=await page.evaluate(()=>{
   const output=[];
   for(const operacion of ['directa','comision'])for(const domicilio of ['QUITO','GUAYAQUIL']){
    _contratosFlujo.operacion=operacion;
    const result=generarContratos({domicilio,valorNum:'15000',km:'1000',telefonoProp:'0999999999',emailProp:'ficticio@example.test',telefonoCony:'0999999998',emailCony:'ficticia@example.test'},{download:false});
    const generated=result.generados.find(d=>d.tipo==='prestacion'),zip=new PizZip(generated.buffer);
    const xml=new DOMParser().parseFromString(zip.file('word/document.xml').asText(),'text/xml');
    const boxes=[...xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','txbxContent')].map(box=>box.textContent).filter(text=>text.includes('EL CLIENTE'));
    output.push({operacion,domicilio,template:result.prestacion,owner:result.vars.NOMBRE_PROP,spouse:result.vars.NOMBRE_CONY,boxes,base64:zip.generate({type:'base64'})});
   }
   return output;
  });
  for(const item of generated){
   assert.equal(item.owner,'MUÑOZ PEÑA MARÍA FICTICIA');assert.equal(item.spouse,'VEGA LOPEZ JOSÉ FICTICIO');
   assert.equal(item.boxes.length,4,'Dos firmas, cada una con representación moderna y compatible');
   assert.equal(item.boxes.filter(text=>text.includes(item.owner)).length,2,item.template+': firma del titular');
   assert.equal(item.boxes.filter(text=>text.includes(item.spouse)).length,2,item.template+': firma del cónyuge');
   fs.writeFileSync(path.join(qa,`punto-4-${item.operacion}-${item.domicilio}.docx`),Buffer.from(item.base64,'base64'));
  }
  assert.equal(await page.evaluate(()=>_contratosData['cedula-prop']._origins.nombres),'manual');
  assert.equal(calls.filter(c=>c.action==='geminiProxy').length,1,'Sólo comprobación inicial simulada, sin extraer documentos');
  assert.deepEqual(errors,[]);
  console.log('PUNTO 4 OK: nombres completos corregidos manualmente en ambas firmas, compra directa/comisión y ambas ciudades; plantillas reales generadas.');
 }finally{await context.close();}
}
async function issue5(browser){
 const base={timezoneId:'Pacific/Auckland',now:Date.parse('2026-10-30T02:30:00Z'),preload:{placa:'ABC1234',propietario:'CLIENTE FICTICIO',cedulaPropietario:'1722821509',marca:'PRUEBA',modelo:'MODELO 1.2',fechaRegistro:'2026-10-30'}};
 for(const earlyDate of [undefined,'2026-10-05','']){
  const {context,page,calls,errors}=await setup(browser,'liquidacion.html',{...base,...(earlyDate===undefined?{}:{earlyDate})});
  try{
   await page.waitForFunction(()=>document.getElementById('statusBar').textContent.includes('NUEVA LIQUIDACIÓN CON DATOS PRECARGADOS'));
   const expected=earlyDate===undefined?'2026-10-29':earlyDate;
   assert.equal(await page.locator('#fecha').inputValue(),expected,'Fecha Ecuador o corrección manual durante la precarga');
   assert.equal(await page.evaluate(()=>obtenerDatos().fecha),expected,'La fecha se conserva en el payload de guardado');
   await page.locator('#fecha').fill('2026-10-12');
   await page.evaluate(()=>_aplicarDatosDeContratos({placa:'ABC1234',propietario:'CLIENTE FICTICIO'}));
   assert.equal(await page.locator('#fecha').inputValue(),'2026-10-12','Aplicar datos no cambia fecha manual');
   await page.evaluate(()=>{cargarFormularioDesdeData({placa:'ABC1234',fecha:'2026-09-15',items:[]},'ABC1234');_aplicarDatosDeContratos({placa:'ABC1234'});});
   assert.equal(await page.locator('#fecha').inputValue(),'2026-09-15','Conservar fecha del registro existente');
   assert.equal(calls.filter(c=>c.action==='geminiProxy').length,0);
   assert.deepEqual(errors,[]);
  }finally{await context.close();}
 }
 console.log('PUNTO 5 OK: fecha de Ecuador al transferir, incluso con navegador en otro día; fecha manual y fecha guardada conservadas.');
}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{if(mode==='1')await issue1(browser);else if(mode==='2')await issue2(browser);else if(mode==='3')await issue3(browser);else if(mode==='4')await issue4(browser);else if(mode==='5')await issue5(browser);else throw Error('Caso desconocido '+mode);}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
