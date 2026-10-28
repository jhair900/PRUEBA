// Sólo transporte simulado, documentos ficticios y contraseñas de prueba. Cero llamadas reales.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),A='gemini-3.5-flash-lite';
const fixture=()=>({user:'PRUEBA',displayName:'Prueba',isAdmin:false,expiresAt:Date.now()+3600000});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const file of ['contratos.html','pagos.html','ventas.html','liquidacion.html','firmas.html','index.html']){
   const context=await browser.newContext(),page=await context.newPage(),calls=[],errors=[];
   let valid=true,providerStatus=200,releaseLate,hold=false,expireMatricula=false;
   context.on('page',p=>p.on('dialog',d=>d.accept()));page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await context.addInitScript(()=>{if(!localStorage.getItem('autocor_auth'))localStorage.setItem('autocor_auth',JSON.stringify({user:'PRUEBA',token:'fixture',isAdmin:true}));});
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='script.google.com'&&route.request().method()==='POST'){
     const body=route.request().postDataJSON(),action=u.searchParams.get('action')||body.action;calls.push({action,model:u.searchParams.get('model')});
     const send=data=>route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
     if(action==='validateSession')return send(valid?{ok:true,session:fixture()}:{ok:false,code:'AUTH_EXPIRED',message:'Sesión expirada.'});
     if(action==='login')return send(body.password==='correcta'?{ok:true,sessionToken:'renewed-'+Date.now(),expiresAt:Date.now()+3600000,user:{username:body.username,displayName:body.username,isAdmin:false}}:{ok:false,message:'Clave incorrecta.'});
     if(action==='logout')return send({ok:true});
     if(hold&&action==='getPagoByPlaca'){await new Promise(r=>releaseLate=r);return send({ok:true,data:{placa:'ANTIGUA'}});}
     if(action==='geminiProxy'){
      const required=body.request?.generationConfig?.responseSchema?.required||[];
      const kind=required.length===3?'probe':required.includes('apellidos')?'cedula':required.includes('serialChasis')?'notaria':'matricula';calls[calls.length-1].kind=kind;
      if(expireMatricula&&kind==='matricula'){expireMatricula=false;valid=false;}
      if(!valid)return send({_proxy:{ok:false,status:401,origin:'session',authCode:'AUTH_EXPIRED'},data:{error:{message:'Sesión expirada.'}}});
      if(providerStatus!==200)return send({_proxy:{ok:false,status:providerStatus,origin:'provider'},data:{error:{status:'PERMISSION_DENIED'}}});
      const values={placa:'ABC1234',propietario:'PEREZ LOPEZ ANA',cedulaRuc:'1722821509',marca:'CHEVROLET',modelo:'SPARK 1.2 LT',color:kind==='probe'?'AZUL':'BLANCO',chasis:'ABC12345678901234',motor:'AB12345678',anio:'2020',apellidos:'PEREZ LOPEZ',nombres:'ANA',numeroCedula:'1722821509',codigoDactilar:'A1234B5678',fechaExpiracion:'01/01/2030',estadoCivil:'SOLTERO',nacionalidad:'ECUATORIANA',serialChasis:'ABC12345678901234',numeroMotor:'AB12345678',nombrePropietario:'PEREZ LOPEZ ANA',identificacionPropietario:'1722821509',_reviewKeys:[]};
      return send({_proxy:{ok:true,status:200,origin:'provider'},session:fixture(),data:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(Object.fromEntries(required.map(k=>[k,values[k]??''])))}]}}]}});
     }
     if(!valid)return send({ok:false,code:'AUTH_EXPIRED',message:'Sesión expirada.'});
     if(action==='listUsers')return send({ok:false,code:'FORBIDDEN',message:'No autorizado.'});
     return send({ok:true,rows:[],session:fixture(),data:{}});
    }
    if(u.hostname!=='autocor.test')return route.fulfill({contentType:'application/javascript',body:'window.pdfjsLib={GlobalWorkerOptions:{}};'});
    if(u.pathname==='/js/apps-script-transport.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorTransport={request:async()=>null};'});
    const f=path.join(root,decodeURIComponent(u.pathname));if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')?'application/javascript':'image/png',body:fs.readFileSync(f)});
   });
   await page.goto('https://autocor.test/'+file);await page.waitForFunction(()=>AutoCorSession.snapshot().authenticated);
   if(file==='contratos.html')await page.waitForFunction(()=>document.getElementById('aiStatusBanner').classList.contains('ok'));
   assert.equal(calls.filter(c=>c.action==='validateSession').length,1,file+': una comprobación inicial');
   assert.equal(await page.evaluate(()=>AutoCorSession.snapshot().auth.isAdmin),false,'Los permisos vienen del backend, no del almacenamiento');
   await page.evaluate(file=>{
    if(file==='contratos.html'){
     window.__image='data:image/png;base64,ZmljdGljaWE=';
     AutoCorContractDraft.restore({flow:{operacion:'directa',tipoPersona:'natural',estadoCivil:'SOLTERO'},data:{matricula:{placa:'ABC1234',motor:'',_origins:{placa:'manual',motor:'manual'}}},images:{matricula:{frontal:__image,reverso:__image}},files:{}});
    }else{const el=document.getElementById(file==='index.html'?'expPlaca':file==='firmas.html'||file==='liquidacion.html'?'placa':'placaValue');el.value='ABC1234';}
    window.__before=file==='contratos.html'?JSON.stringify(AutoCorContractDraft.capture()):document.getElementById(file==='index.html'?'expPlaca':file==='firmas.html'||file==='liquidacion.html'?'placa':'placaValue').value;
   },file);
   const count=calls.length;
   await page.evaluate(async()=>{await AutoCorApi.postJson(AutoCorConfig.apiUrl,{action:'getPagoByPlaca',placa:'ABC1234'});try{await AutoCorApi.postJson(AutoCorConfig.apiUrl,{action:'listUsers'});}catch(e){window.__permission=e.code;}});
   assert.equal(await page.evaluate(()=>window.__permission),'FORBIDDEN');assert.equal(await page.evaluate(()=>AutoCorSession.snapshot().authenticated),true);
   assert.equal(calls.slice(count).filter(c=>c.action==='validateSession').length,0,'No comprobar en cada solicitud');
   const modal=file==='index.html'?'#modalLogin':'#authUiLoginModal';
   async function login(password,username='PRUEBA'){
    await page.locator(file==='index.html'?'#mlUsuario':'#authUiUsername').fill(username);
    await page.locator(file==='index.html'?'#mlPassword':'#authUiPassword').fill(password);
    await page.locator(file==='index.html'?'#mlBtnIngresar':'#authUiDoLogin').click();
   }
   if(file==='contratos.html'){
    await page.evaluate(()=>{
     const canvas=document.createElement('canvas');canvas.width=900;canvas.height=500;canvas.getContext('2d').fillText('FICTICIO',20,30);const image=canvas.toDataURL();
     const cuv={placa:'ABC1234',cedula:'1722821509',propietario:'PEREZ LOPEZ ANA',marca:'CHEVROLET',modelo:'SPARK 1.2 LT',color:'BLANCO',chasis:'ABC12345678901234',motor:'AB12345678',anio:'2020',_missing:[],_origins:{}};
     AutoCorContractDraft.restore({flow:{operacion:'comision',tipoPersona:'natural',estadoCivil:'SOLTERO'},data:{cuv,matricula:{motor:'',_origins:{motor:'manual'},_processingIncomplete:true}},images:{'cedula-prop':{frontal:image,reverso:image},matricula:{frontal:image,reverso:image},notaria:{frontal:image}},files:{}});
     window.__cuv=JSON.stringify(_contratosData.cuv);
    });
    expireMatricula=true;const beforeReading=calls.length;
    await page.locator('#btnValidateAll').click();await page.locator(modal).waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('spinnerOverlay').classList.contains('open'));
    assert.deepEqual(calls.slice(beforeReading).filter(c=>c.action==='geminiProxy').map(c=>c.kind),['cedula','matricula']);
    const completed=await page.evaluate(()=>JSON.stringify(_contratosData['cedula-prop']));
    assert.equal(await page.evaluate(()=>JSON.stringify(_contratosData.cuv)===__cuv),true);
    valid=true;await login('correcta');await page.waitForFunction(()=>AutoCorSession.snapshot().authenticated);
    const resume=calls.length;await page.locator('#btnValidateAll').click();await page.waitForFunction(()=>!document.getElementById('btnValidateAll').disabled&&!document.getElementById('spinnerOverlay').classList.contains('open'));
    assert.deepEqual(calls.slice(resume).filter(c=>c.action==='geminiProxy').map(c=>c.kind),['matricula','notaria']);
    assert.equal(await page.evaluate(()=>JSON.stringify(_contratosData['cedula-prop'])),completed);
    assert.deepEqual(await page.evaluate(()=>[_contratosData.matricula.motor,_contratosData.matricula._origins.motor]),['','manual']);
    assert.equal(await page.evaluate(()=>JSON.stringify(_contratosData.cuv)===__cuv),true);
    console.log('OK lectura: cédula completada → sesión vence en matrícula → acceso local → sólo matrícula y notaría; CUV y vacío manual intactos');
    await page.evaluate(()=>window.__before=JSON.stringify(AutoCorContractDraft.capture()));
    valid=false;const beforeGeneration=calls.length;
    await page.evaluate(async()=>{
      for(const [id,value] of Object.entries({genTelefonoProp:'0999999999',genEmailProp:'ficticio@example.test',genDomicilio:'QUITO',genKm:'1000',genValorNum:'10000'}))document.getElementById(id).value=value;
      window.__downloads=0;window.generarContratos=()=>({generados:[]});window.descargarContratosGenerados=()=>__downloads++;
      window._autoGuardarConContrato=()=>AutoCorApi.postJson(AutoCorConfig.apiUrl,{action:'saveContrato',data:{placa:'ABC1234'}},{retries:0});
      await ejecutarGenerarContratos();
    });
    await page.locator(modal).waitFor({state:'visible'});assert.equal(await page.evaluate(()=>__downloads),0);
    valid=true;await login('correcta');await page.waitForFunction(()=>AutoCorSession.snapshot().authenticated);
    assert.equal(calls.slice(beforeGeneration).filter(c=>c.action==='saveContrato').length,1,'No repetir guardado o generación al reautenticar');
    assert.equal(await page.locator('#genTelefonoProp').inputValue(),'0999999999');assert.equal(await page.evaluate(()=>__downloads),0);
    console.log('OK generación: sesión rechazada al guardar, ningún contrato descargado ni operación repetida al reautenticar');
    providerStatus=403;
    const code=await page.evaluate(async()=>{const response=await AutoCorGemini.fetch(AutoCorConfig.apiUrl+'?action=geminiProxy&op=generate&model=gemini-3.5-flash-lite',{request:{}},1000);return AutoCorGeminiAvailability.classify(response.status);});
    assert.equal(code,'AI_PROVIDER_AUTH_ERROR');assert.equal(await page.evaluate(()=>AutoCorSession.snapshot().authenticated),true);providerStatus=200;
   }
   valid=false;
   const beforeFailure=calls.length;
   const failures=await page.evaluate(async()=>Promise.all(['getPagoByPlaca','getVentaByPlaca','savePago'].map(action=>AutoCorApi.postJson(AutoCorConfig.apiUrl,{action,placa:'ABC1234',data:{placa:'ABC1234'}},{retries:0}).then(()=>'',e=>e.code))));
   assert.ok(failures.every(c=>['AUTH_EXPIRED','AUTH_CONTEXT_CHANGED','AUTH_REQUIRED'].includes(c)),JSON.stringify(failures));
   assert.ok(calls.slice(beforeFailure).filter(c=>c.action==='savePago').length<=1);
   await page.locator(modal).waitFor({state:'visible'});assert.equal(await page.locator(modal).count(),1);
   await login('incorrecta');await page.getByText(/Clave incorrecta\./).waitFor();assert.equal(await page.evaluate(()=>AutoCorSession.snapshot().authenticated),false);
   valid=true;await login('correcta');await page.waitForFunction(()=>AutoCorSession.snapshot().authenticated);
   assert.equal(page.url(),'https://autocor.test/'+file);
   assert.equal(await page.evaluate(file=>file==='contratos.html'?JSON.stringify(AutoCorContractDraft.capture()):document.getElementById(file==='index.html'?'expPlaca':file==='firmas.html'||file==='liquidacion.html'?'placa':'placaValue').value===__before,file),file==='contratos.html'?await page.evaluate(()=>__before):true,'Trabajo conservado');
   assert.equal(calls.slice(beforeFailure).filter(c=>c.action==='savePago').length,1,'Sin repetición automática al autenticar');
   // Respuesta anterior entregada después de iniciar otra sesión: nunca debe aplicarse.
   hold=true;
   await page.evaluate(()=>{window.__late=AutoCorApi.postJson(AutoCorConfig.apiUrl,{action:'getPagoByPlaca',placa:'ABC1234'},{retries:0}).then(()=> 'aplicada',e=>e.code);});
   while(!releaseLate)await new Promise(r=>setTimeout(r,5));
   const other=await context.newPage();await other.goto('https://autocor.test/index.html');
   await other.evaluate(()=>AutoCorSession.logout());await page.locator(modal).waitFor({state:'visible'});
   releaseLate();assert.equal(await page.evaluate(()=>__late),'AUTH_CONTEXT_CHANGED');hold=false;
   await other.close();await login('correcta');await page.waitForFunction(()=>AutoCorSession.snapshot().authenticated);
   if(file!=='index.html'){
    await page.evaluate(()=>AutoCorSession.logout());await login('correcta','OTRO');await page.waitForFunction(()=>AutoCorSession.snapshot().phase==='mismatch');
    assert.equal(await page.evaluate(()=>AutoCorSession.snapshot().workOwner),'PRUEBA');
    const mismatch=await page.evaluate(()=>AutoCorApi.postJson(AutoCorConfig.apiUrl,{action:'savePago',data:{placa:'ABC1234'}}).then(()=>'',e=>e.code));assert.equal(mismatch,'AUTH_ACCOUNT_MISMATCH');
    await login('correcta','PRUEBA');await page.waitForFunction(()=>AutoCorSession.snapshot().authenticated);
   }
   if(file==='contratos.html'){assert.ok(calls.filter(c=>c.action==='geminiProxy').every(c=>c.model===A));assert.equal(calls.filter(c=>c.kind==='probe').length,1,'Reautenticar no comprueba ni cambia Gemini');}
   assert.deepEqual(errors,[],file);console.log('OK '+file+': sesión real, permisos, vencimiento, acceso incorrecto/correcto, simultaneidad, otra pestaña, respuesta tardía y conservación');await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
