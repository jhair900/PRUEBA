// Usa las mismas versiones de PizZip y Docxtemplater que contratos.html.
// Guardarlas en AUTOCOR_DOCX_TEST_LIB_DIR (por defecto, TEMP/autocor-docx-test-libs).
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const libs = process.env.AUTOCOR_DOCX_TEST_LIB_DIR || path.join(process.env.TEMP, 'autocor-docx-test-libs');
for(const file of ['pizzip.js', 'docxtemplater.js']) assert.ok(fs.existsSync(path.join(libs, file)), 'Falta biblioteca de prueba: '+file);

(async () => {
  const browser = await chromium.launch({channel:'msedge', headless:true});
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if(url.href === 'https://unpkg.com/pizzip@3.1.4/dist/pizzip.js') return route.fulfill({contentType:'application/javascript', body:fs.readFileSync(path.join(libs, 'pizzip.js'))});
      if(url.href === 'https://unpkg.com/docxtemplater@3.50.0/build/docxtemplater.js') return route.fulfill({contentType:'application/javascript', body:fs.readFileSync(path.join(libs, 'docxtemplater.js'))});
      if(url.hostname !== 'autocor.test') return route.abort();
      const rel = decodeURIComponent(url.pathname).slice(1);
      if(rel === 'js/api-client.js') return route.fulfill({contentType:'application/javascript', body:'window.AutoCorApi={postJson:async()=>({ok:true,rows:[]})};'});
      const file = path.resolve(root, rel);
      if(!file.startsWith(root+path.sep) || !fs.existsSync(file)) return route.fulfill({status:404,body:''});
      return route.fulfill({contentType:rel.endsWith('.html')?'text/html':rel.endsWith('.js')?'application/javascript':rel.endsWith('.css')?'text/css':'image/png', body:fs.readFileSync(file)});
    });
    await page.addInitScript(() => {
      try { localStorage.setItem('autocor_auth', JSON.stringify({user:'PRUEBA', token:'simulado', isAdmin:true})); } catch(_) {}
    });
    await page.goto('https://autocor.test/contratos.html');
    const results = await page.evaluate(() => {
      Object.assign(window._contratosData, {
        'cedula-prop':{numeroCedula:'1722821509', apellidos:'MUÑOZ PEÑA', nombres:'ANA', estadoCivil:'SOLTERO'},
        matricula:{placa:'AAA1111', marca:'PRUEBA'},
        ruc:{razonSocial:'COMPAÑÍA DE PRUEBA', numeroRuc:'1790000000001'}
      });
      const flows = [
        ['natural','compra_directa','SOLTERO','prestacion-soltero'],
        ['natural','compra_directa','CASADO','prestacion-casado'],
        ['natural','comision','SOLTERO','prestacion-comision-soltero'],
        ['natural','comision','CASADO','prestacion-comision-casado'],
        ['juridica','compra_directa','SOLTERO','prestacion-juridica-directa'],
        ['juridica','comision','SOLTERO','prestacion-juridica-comision']
      ];
      const results = [];
      for(const [tipoPersona,operacion,estadoCivil,key] of flows) {
        Object.assign(window._contratosFlujo, {tipoPersona,operacion,estadoCivil});
        for(const value of ['19599,65','19599.65','19.599,65','19,599.65','19599','19.599','100,05']) {
          const result = generarContratos({valorNum:value, domicilio:'QUITO'}, {download:false});
          const contract = result.generados.find(doc => doc.tipo === 'prestacion');
          const xml = new PizZip(contract.buffer).file('word/document.xml').asText();
          const document = new DOMParser().parseFromString(xml, 'text/xml');
          const paragraphs = Array.from(document.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','p'), p => p.textContent);
          results.push({key,actualKey:result.prestacion,value,words:result.vars.VALOR_TEXT,number:result.vars.VALOR_NUM,price:paragraphs.find(p => p.includes('PRECIO'))});
        }
      }
      return results;
    });
    const words = 'DIECINUEVE MIL QUINIENTOS NOVENTA Y NUEVE';
    for(const result of results) {
      const small = result.value === '100,05';
      const decimal = result.value.includes('65');
      assert.equal(result.key, result.actualKey);
      assert.equal(result.words, small ? 'CIEN CON 05/100' : words+(decimal?' CON 65/100':''));
      assert.equal(result.number, small ? '100,05' : decimal?'19599,65':'19599,00');
      assert.ok(result.price.includes(result.words), result.key+' '+result.value);
      assert.ok(result.price.includes('(USD '+result.number+')'), result.price);
      assert.ok(!/undefined|NaN|\{VALOR_/i.test(result.price), result.price);
    }
    console.log('OK '+results.length+' contratos Word reales: seis plantillas, cifras y letras coincidentes, sin undefined.');

    const hint = await page.evaluate(() => {
      Object.assign(window._contratosFlujo, {tipoPersona:'natural', operacion:'compra_directa', estadoCivil:'SOLTERO'});
      abrirModalGenerarContratos();
      const input = document.getElementById('genValorNum');
      const output = document.getElementById('genValorHint');
      input.value = '19599,65'; input.dispatchEvent(new Event('input'));
      const valid = output.textContent;
      input.value = '19.59,65'; input.dispatchEvent(new Event('input'));
      const invalid = output.textContent;
      input.value = ''; input.dispatchEvent(new Event('input'));
      return {valid,invalid,empty:output.textContent};
    });
    assert.equal(hint.valid, 'En letras: '+words+' CON 65/100');
    assert.ok(hint.invalid.includes('Revisa el valor estimado'));
    assert.equal(hint.empty, '');
    const blocked = await page.evaluate(async () => {
      Object.assign(window._contratosFlujo, {tipoPersona:'natural', estadoCivil:'SOLTERO'});
      for(const [id,value] of Object.entries({genTelefonoProp:'0999999999',genEmailProp:'prueba@example.test',genDomicilio:'QUITO',genKm:'1000',genValorNum:'19599abc'})) document.getElementById(id).value = value;
      let writes = 0, downloads = 0;
      window._autoGuardarConContrato = async () => { writes++; return {ok:true}; };
      window.descargarContratosGenerados = () => downloads++;
      await ejecutarGenerarContratos();
      return {writes,downloads,error:document.getElementById('genError').textContent};
    });
    assert.equal(blocked.writes, 0);
    assert.equal(blocked.downloads, 0);
    assert.ok(blocked.error.includes('Revisa el valor estimado'));
    assert.deepEqual(errors, []);
    console.log('OK vista previa corregida e importe inválido detenido antes de guardar o descargar.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
