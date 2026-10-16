const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1360,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='autocor.test')return route.abort();const rel=decodeURIComponent(u.pathname).slice(1);if(rel==='js/api-client.js')return route.fulfill({contentType:'application/javascript',body:'window.AutoCorApi={postJson:async()=>({ok:true,rows:[]})};'});const f=path.resolve(root,rel);if(!f.startsWith(root+path.sep)||!fs.existsSync(f))return route.fulfill({status:404,body:''});return route.fulfill({contentType:rel.endsWith('.html')?'text/html':rel.endsWith('.js')?'application/javascript':rel.endsWith('.css')?'text/css':'image/png',body:fs.readFileSync(f)});});
 await page.addInitScript(()=>{try{localStorage.setItem('autocor_auth',JSON.stringify({user:'PRUEBA',token:'test',isAdmin:true}));}catch(_){}});
 await page.goto('https://autocor.test/contratos.html');
 await page.evaluate(()=>AutoCorContractDraft.restore({flow:{operacion:'directa',tipoPersona:'natural',estadoCivil:'CASADO'},images:{},data:{
  'cedula-prop':{apellidos:'LOZA MONTERO',nombres:'MAURO JOSE',numeroCedula:'1722821509',fechaExpiracion:'09/02/2030',_origins:{apellidos:'manual',nombres:'manual',numeroCedula:'manual'}},
  matricula:{placa:'AAA1234',propietario:'LOZA MONTERO MAURO JOSE',cedulaRuc:'1722821509'},
  'cedula-cony':{apellidos:'MUÑOZ PEÑA',nombres:'ANA MARIA',numeroCedula:'0102030405'},
  'papeleta-prop':{numeroCedula:'1722821509',nombreCompleto:'LOZA MONTERO MAURO JOSE',fechaSufragio:'09/02/2025',provincia:'DATO ANTERIOR QUE YA NO DEBE MOSTRARSE'},
  'papeleta-cony':{numeroCedula:'0102030405',nombreCompleto:'MUÑOZ PEÑA ANA MARIA',fechaSufragio:'16/11/2025'}
 }}));
 for(const tipo of ['papeleta-prop','papeleta-cony'])assert.equal(await page.locator('#block-'+tipo+' .f-input').count(),3);
 const wrong=page.locator('[data-tipo="papeleta-prop"][data-key="fechaSufragio"]'),right=page.locator('[data-tipo="papeleta-cony"][data-key="fechaSufragio"]');
 assert.ok((await wrong.getAttribute('class')).includes('err'));assert.equal(await wrong.evaluate(e=>getComputedStyle(e).color),'rgb(185, 28, 28)');assert.ok(!(await right.getAttribute('class')).includes('err'));
 const name=page.locator('.vc-source-val').filter({hasText:'LOZA MONTERO MAURO JOSE'}).first();
 let box=await name.boundingBox();assert.ok(box.width>250 && box.height<60,JSON.stringify(box));
 const row=name.locator('xpath=ancestor::div[contains(@class,"vc-row")]');
 await row.scrollIntoViewIfNeeded();await row.screenshot({path:path.join(process.env.TEMP,'autocor-validacion-1360.png')});
 await page.setViewportSize({width:390,height:900});box=await name.boundingBox();assert.ok(box.width>150 && box.height<80,JSON.stringify(box));
 assert.ok(await page.locator('#validacionCruzada').evaluate(e=>e.scrollWidth<=e.clientWidth+2));
 await row.screenshot({path:path.join(process.env.TEMP,'autocor-validacion-390.png')});
 await wrong.fill('16/11/2025');assert.ok(!(await wrong.getAttribute('class')).includes('err'));assert.ok(!(await wrong.locator('xpath=ancestor::div[contains(@class,"f-item")]').getAttribute('class')).includes('papeleta-date-error'));
 await right.fill('21/04/2024');assert.ok((await right.getAttribute('class')).includes('err'));
 assert.deepEqual(errors,[]);console.log('OK navegador: tres campos en ambas papeletas, color por fecha y edición, nombres legibles en escritorio y móvil, sin desbordamiento');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
