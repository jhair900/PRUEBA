const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'gas/script.gs'), 'utf8');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('OK', name); }

function backend() {
  let locked = false, blocked = false, releases = 0, fetches = 0;
  const rows = [];
  const sheet = {
    getRange(row, col, count = 1, width = 1) {
      return {
        getValue: () => rows[row - 2]?.[col - 1] || '',
        getValues: () => Array.from({length: count}, (_, i) => Array.from({length: width}, (_, j) => rows[row + i - 2]?.[col + j - 1] || '')),
        setValue(value) { assert.ok(locked); rows[row - 2][col - 1] = value; },
        setValues(values) { assert.ok(locked); values.forEach((r, i) => { rows[row + i - 2] ||= []; r.forEach((v, j) => rows[row + i - 2][col + j - 1] = v); }); }
      };
    },
    appendRow(row) { assert.ok(locked); rows.push(row); },
    getLastRow: () => rows.length + 1
  };
  const ctx = vm.createContext({
    console, Date,
    Utilities: { getUuid: crypto.randomUUID, base64Encode: x => Buffer.from(x).toString('base64'),
      computeDigest: (_, x) => crypto.createHash('sha256').update(x).digest(), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({getSheetByName: () => sheet}), flush() {} },
    LockService: { getScriptLock: () => ({tryLock() { if(blocked) return false; locked = true; return true; }, releaseLock() { locked = false; releases++; }}) },
    PropertiesService: {getScriptProperties: () => ({getProperty: () => 'test-key'})},
    UrlFetchApp: {fetch(url, opts) { fetches++; assert.ok(!opts.payload?.includes('sessionToken')); return {getResponseCode: () => 200, getContentText: () => '{"models":[]}'}; }},
    ContentService: {MimeType: {JSON: 'json'}, createTextOutput: text => ({text, setMimeType() {return this;}})}
  });
  vm.runInContext(source, ctx);
  const realValidate = ctx.validateSession_, realFindPlate = ctx.findRowByPlaca_;
  ctx.validateSession_ = token => token === 'admin' ? {ok: true, user: 'ADMIN', isAdmin: true, rowIndex: 2} : token === 'user' ? {ok: true, user: 'USER', isAdmin: false, rowIndex: 3} : {ok: false, code: 'AUTH_REQUIRED'};
  ctx.ensureActionResources_ = () => {};
  ctx.getSheet_ = ctx.getPaymentsSheet_ = ctx.getVentasSheet_ = ctx.getContratosSheet_ = ctx.ensureUsersSheet_ = () => sheet;
  ctx.findRowByPlaca_ = (_, placa) => { const index = rows.findIndex(r => r[0] === ctx.normalizePlaca_(placa)); return index < 0 ? 0 : index + 2; };
  return {ctx, rows, realValidate, realFindPlate, block: () => blocked = true, releases: () => releases, fetches: () => fetches};
}

(async () => {
  await test('Todos los JS y scripts HTML tienen sintaxis valida', () => {
    new vm.Script(source);
    for (const f of fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'))) new vm.Script(fs.readFileSync(path.join(root, 'js', f), 'utf8'), {filename: f});
    for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(root, f), 'utf8');
      for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (!/\bsrc\s*=|application\/ld\+json|application\/json/i.test(match[1])) new vm.Script(match[2], {filename: f});
      }
    }
  });
  await test('No se pueden administrar usuarios con un nombre falsificado', () => {
    const {ctx} = backend();
    for (const action of ['listUsers', 'adminResetPassword']) {
      assert.equal(ctx.handleAction_(action, {adminUsername: 'JSANCHEZ'}).ok, false);
      assert.equal(ctx.handleAction_(action, {sessionToken: 'user', adminUsername: 'JSANCHEZ'}).ok, false);
    }
    assert.equal(ctx.handleAction_('setupUsers', {}).ok, false);
    assert.equal(JSON.parse(ctx.doGet({parameter: {action: 'setupUsers'}}).text).ok, false);
  });
  await test('Administrador autenticado puede listar y restablecer claves', () => {
    const {ctx, rows} = backend();
    rows.push(['ADMIN', 'Admin', 'hash', true, true, false, 'admin', new Date(Date.now() + 100000)]);
    rows.push(['USER', 'User', 'hash', false, true, false, 'user', new Date(Date.now() + 100000)]);
    ctx.findUserRow_ = (_, name) => name === 'USER' ? 3 : 2;
    assert.equal(ctx.handleAction_('listUsers', {sessionToken: 'admin'}).rows.length, 2);
    assert.equal(ctx.handleAction_('adminResetPassword', {sessionToken: 'admin', targetUsername: 'USER', newPassword: 'abc'}).ok, false);
    assert.equal(ctx.handleAction_('adminResetPassword', {sessionToken: 'admin', targetUsername: 'USER', newPassword: 'new-password'}).ok, true);
    assert.equal(rows[1][2], ctx.hashPassword_('new-password'));
    assert.equal(rows[1][6], '');
  });
  await test('Gemini rechaza solicitudes anonimas y retira credenciales del cuerpo enviado', () => {
    const b = backend();
    assert.equal(JSON.parse(b.ctx.geminiProxy_({op: 'models'}, '').text)._proxy.status, 401);
    assert.equal(b.fetches(), 0);
    assert.equal(JSON.parse(b.ctx.geminiProxy_({op: 'generate', model: 'test'}, JSON.stringify({sessionToken: 'user', request: {contents: []}})).text)._proxy.ok, true);
    assert.equal(b.fetches(), 1);
  });
  for (const [save, get] of [['save', 'getByPlaca'], ['savePago', 'getPagoByPlaca'], ['saveVenta', 'getVentaByPlaca'], ['saveContrato', 'getContratoByPlaca']]) {
    await test(save + ': reprocesar sin revision sobrescribe una sola fila y el reintento no duplica', () => {
      const b = backend(), {ctx} = b;
      const data = {placa: 'ABC123', cliente: 'Inicial'};
      const first = ctx.handleAction_(save, {sessionToken: 'user', data, requestId: 'one'});
      assert.equal(first.ok, true, first.message);
      const request = {sessionToken: 'user', data: {...data, cliente: 'Reprocesado'}, requestId: 'two'};
      const second = ctx.handleAction_(save, request);
      assert.equal(second.ok, true, second.message);
      assert.equal(second.updated, true);
      assert.equal(ctx.handleAction_(save, request).data.cliente, 'Reprocesado');
      // Una revision antigua enviada por una pestaña previa tampoco debe bloquear.
      const third = ctx.handleAction_(save, {sessionToken: 'admin', data: {...data, cliente: 'Ultimo'}, expectedRevision: 'antigua', requestId: 'three'});
      assert.equal(third.ok, true, third.message);
      assert.equal(ctx.handleAction_(get, {sessionToken: 'user', placa: 'ABC123'}).data.cliente, 'Ultimo');
      assert.equal(b.rows.length, 1);
      assert.equal(b.releases(), 4);
      b.block();
      assert.equal(ctx.handleAction_(save, request).code, 'BUSY');
      assert.equal(b.rows.length, 1);
    });
  }
  await test('Guardar contrato conserva historial de estados y archivos existentes', () => {
    const {ctx} = backend();
    const first = ctx.handleAction_('saveContrato', {sessionToken: 'user', data: {placa: 'ABC', historialEstados: [{estado: 'VALIDADO'}], expedienteDrive: {url: 'file'}}});
    const second = ctx.handleAction_('saveContrato', {sessionToken: 'user', data: {placa: 'ABC'}});
    assert.equal(second.data.historialEstados.length, 1);
    assert.equal(second.data.expedienteDrive.url, 'file');
  });
  await test('Reprocesar despues de cambiar estado conserva historial y archivos', () => {
    const {ctx} = backend();
    const first = ctx.handleAction_('saveContrato', {sessionToken: 'user', data: {placa: 'ABC', drive: {folderId: 'original'}}});
    assert.equal(ctx.handleAction_('setEstadoProceso', {sessionToken: 'user', placa: 'ABC', estado: 'CONTRATADO', observacion: 'Generado'}).ok, true);
    const second = ctx.handleAction_('saveContrato', {sessionToken: 'user', data: {placa: 'ABC', drive: {}, historialEstados: []}});
    assert.equal(second.ok, true, second.message);
    assert.equal(second.data.estadoProceso, 'CONTRATADO');
    assert.equal(second.data.historialEstados.length, 1);
    assert.equal(second.data.drive.folderId, 'original');
  });
  await test('Cliente guarda sin revision y reutiliza ID despues de perder una respuesta', async () => {
    const calls = []; let fail = true;
    const context = vm.createContext({console, AbortController, setTimeout: fn => { queueMicrotask(fn); return 1; }, clearTimeout() {}, window: {crypto, localStorage: {getItem: () => '{"token":"user"}'}}, fetch: async (_, init) => {
      const body = JSON.parse(init.body); calls.push(body);
      if(body.action === 'save' && fail) {fail = false; throw new Error('lost response');}
      return {ok: true, status: 200, text: async () => JSON.stringify({ok: true, revision: body.action === 'save' ? 'r2' : 'r1'})};
    }});
    vm.runInContext(fs.readFileSync(path.join(root, 'js/api-client.js'), 'utf8'), context);
    const api = context.window.AutoCorApi;
    await api.postJson('https://example.test', {action: 'getByPlaca', placa: 'ABC'});
    await api.postJson('https://example.test', {action: 'save', data: {placa: 'ABC'}});
    assert.equal(calls[1].sessionToken, 'user');
    assert.equal(calls[1].expectedRevision, undefined);
    assert.equal(calls[2].action, 'getByPlaca');
    assert.equal(calls[1].requestId, calls[3].requestId);
    await api.postJson('https://example.test', {action: 'save', data: {placa: 'ABC'}});
    assert.equal(calls[4].expectedRevision, undefined);
    await api.postJson('https://example.test', {action: 'save', data: {placa: 'OTHER'}});
    assert.equal(calls[5].expectedRevision, undefined);
  });
  await test('Cliente de IA exige login y usa POST incluso para listar modelos', async () => {
    let token = '', sent;
    const context = vm.createContext({AbortController, setTimeout, clearTimeout, window: {},
      localStorage: {getItem: () => JSON.stringify({token})},
      fetch: async (url, init) => { sent = {url, ...init}; return {ok: true, status: 200, json: async () => ({_proxy: {ok: true, status: 200}, data: {models: []}})}; }
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'js/gemini-client.js'), 'utf8'), context);
    await assert.rejects(context.window.AutoCorGemini.fetch('https://example.test?op=models'), /Inicia sesion/);
    assert.equal(sent, undefined);
    token = 'secret-session';
    const response = await context.window.AutoCorGemini.fetch('https://example.test?op=models');
    assert.equal(response.ok, true);
    assert.equal(sent.method, 'POST');
    assert.ok(!sent.url.includes(token));
    assert.equal(JSON.parse(sent.body).sessionToken, token);
    assert.equal(sent.headers['Content-Type'], 'text/plain;charset=utf-8');
  });
  await test('Ninguna pagina carga el aviso de reemplazo y el servidor no bloquea por revision', () => {
    assert.ok(!source.includes("code: 'CONFLICT'"));
    assert.ok(!source.includes('payload.expectedRevision'));
    for (const f of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(root, f), 'utf8');
      assert.ok(!html.includes('js/record-conflict.js'), f);
      assert.ok(html.includes('js/api-client.js?v=20260915-guardado-1'), f);
    }
  });
  await test('Cada guardado valida una sola sesion y busca la placa una sola vez', () => {
    for (const action of ['save', 'savePago', 'saveVenta', 'saveContrato']) {
      const {ctx} = backend();
      let auth = 0, searches = 0;
      const validate = ctx.validateSession_, find = ctx.findRowByPlaca_;
      ctx.validateSession_ = token => {auth++; return validate(token);};
      ctx.findRowByPlaca_ = (sheet, plate) => {searches++; return find(sheet, plate);};
      assert.equal(ctx.handleAction_(action, {sessionToken: 'user', data: {placa: 'ABC'}}).ok, true);
      assert.equal(auth, 1, action);
      assert.equal(searches, 1, action);
    }
  });
  await test('Busqueda por placa conserva espacios y caracteres literales sin descargar la columna', () => {
    const {realFindPlate} = backend();
    const values = [' A B C 1 2 3 ', 'ABCX'];
    let downloads = 0;
    const sheet = {getLastRow: () => 3, getRange: () => ({
      getValues() {downloads++; return values.map(v => [v]);},
      createTextFinder(pattern) {
        return {matchCase() {return this;}, matchEntireCell() {return this;}, useRegularExpression() {return this;},
          findNext() {const i = values.findIndex(v => new RegExp(pattern, 'i').test(v)); return i < 0 ? null : {getRow: () => i + 2};}
        };
      }
    })};
    assert.equal(realFindPlate(sheet, 'abc123'), 2);
    assert.equal(realFindPlate(sheet, 'ZZZ'), 0);
    assert.equal(realFindPlate(sheet, 'ABC.'), 0);
    assert.equal(downloads, 0);
  });
  await test('Ubicacion de usuario en cache reduce lecturas y sigue detectando token revocado e inactividad', () => {
    const {ctx, rows, realValidate} = backend();
    const cache = new Map();
    ctx.CacheService = {getScriptCache: () => ({get: k => cache.get(k), put: (k,v) => cache.set(k,v)})};
    rows.push(['USER', 'Usuario', 'hash', false, true, false, 'token-live', new Date(Date.now() + 40*86400000)]);
    let reads = 0, lastRows = 0;
    const sheet = {getLastRow() {lastRows++; return rows.length + 1;}, getRange(row, col, count = 1, width = 1) {
      return {getValues() {reads++; return rows.slice(row-2, row-2+count).map(r => r.slice(col-1, col-1+width));}};
    }};
    ctx.SpreadsheetApp = {getActiveSpreadsheet: () => ({getSheetByName: () => sheet})};
    assert.equal(realValidate('token-live').ok, true);
    reads = 0; lastRows = 0;
    assert.equal(realValidate('token-live').ok, true);
    assert.equal(reads, 1);
    assert.equal(lastRows, 0);
    rows[0][4] = false;
    assert.equal(realValidate('token-live').ok, false);
    rows[0][4] = true; rows[0][6] = 'changed';
    assert.equal(realValidate('token-live').ok, false);
  });
  await test('Consultas simultaneas comparten peticion, pero una nueva busqueda vuelve al servidor', async () => {
    let calls = 0, finish;
    const context = vm.createContext({console, AbortController, setTimeout, clearTimeout,
      window: {crypto, localStorage: {getItem: () => '{"token":"user"}'}},
      fetch: async () => {calls++; await new Promise(resolve => {finish = resolve;}); return {ok: true, status: 200, text: async () => '{"ok":true,"data":{"cliente":"A"}}'};}
    });
    vm.runInContext(fs.readFileSync(path.join(root, 'js/api-client.js'), 'utf8'), context);
    const api = context.window.AutoCorApi;
    const a = api.postJson('https://example.test', {action: 'getVentaByPlaca', placa: 'ABC'});
    const b = api.postJson('https://example.test', {action: 'getVentaByPlaca', placa: 'ABC'});
    assert.equal(calls, 1); finish();
    const results = await Promise.all([a,b]);
    results[0].data.cliente = 'Modificado';
    assert.equal(results[1].data.cliente, 'A');
    const c = api.postJson('https://example.test', {action: 'getVentaByPlaca', placa: 'ABC'});
    assert.equal(calls, 2); finish(); await c;
  });
  await test('Respuesta perdida: confirmar guardado por ID sin volver a escribir, en los cuatro modulos', async () => {
    for (const action of ['save', 'savePago', 'saveVenta', 'saveContrato']) {
      const calls = [], timeouts = []; let saved;
      const context = vm.createContext({console, AbortController, clearTimeout() {}, setTimeout(fn, ms) {timeouts.push(ms); return 1;},
        window: {crypto, localStorage: {getItem: () => '{"token":"user"}'}},
        fetch: async (_, init) => {
          const body = JSON.parse(init.body); calls.push(body);
          if(body.action === action){ saved = {placa:'ABC', _requestId:body.requestId}; const err = new Error('timeout'); err.name = 'AbortError'; throw err; }
          return {ok:true, status:200, text:async () => JSON.stringify({ok:true, data:saved})};
        }
      });
      vm.runInContext(fs.readFileSync(path.join(root, 'js/api-client.js'), 'utf8'), context);
      const result = await context.window.AutoCorApi.postJson('https://example.test', {action, data:{placa:'ABC'}});
      assert.equal(result.ok, true);
      assert.equal(result.message, 'Guardado confirmado.');
      assert.equal(calls.filter(c => c.action === action).length, 1);
      assert.equal(calls.length, 2);
      assert.equal(timeouts[0], 60000);
    }
  });
  await test('La conversion de Drive no ocupa el bloqueo global y las escrituras conservan bloqueo', () => {
    const {ctx, releases} = backend();
    ctx.subirExpedienteDrive_ = () => ({ok:true});
    assert.equal(ctx.handleAction_('subirExpedienteDrive', {sessionToken:'user'}).ok, true);
    assert.equal(releases(), 0);
    assert.equal(ctx.withStorageLock_(() => 'written', true), 'written');
    assert.equal(releases(), 1);
    assert.throws(() => ctx.withStorageLock_(() => {throw new Error('fallo');}, true), /fallo/);
    assert.equal(releases(), 2);
  });
  await test('IA distingue tiempo agotado, cancelacion y respuesta incompleta', async () => {
    for(const mode of ['timeout', 'cancel', 'invalid']) {
      let expire, delay, cleaned = false;
      const controller = new AbortController();
      const context = vm.createContext({AbortController, window:{}, localStorage:{getItem: () => '{"token":"user"}'},
        setTimeout(fn, ms) {expire = fn; delay = ms; return 1;}, clearTimeout() {cleaned = true;},
        fetch: async (_, init) => {
          if(mode === 'invalid') return {ok:true, status:200, json:async () => null};
          return {ok:true, status:200, json: () => new Promise((_, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('signal is aborted without reason')));
            if(mode === 'timeout') expire(); else controller.abort();
          })};
        }
      });
      vm.runInContext(fs.readFileSync(path.join(root, 'js/gemini-client.js'), 'utf8'), context);
      await assert.rejects(context.window.AutoCorGemini.fetch('https://example.test', {signal:controller.signal}), err =>
        err.code === ({timeout:'AI_TIMEOUT', cancel:'AI_CANCELLED', invalid:'AI_SERVICE_ERROR'})[mode] && !err.message.includes('signal is aborted'));
      assert.equal(delay, 60000);
      assert.equal(cleaned, true);
    }
  });
  await test('Login reintenta un 404 temporal pero no una clave incorrecta', async () => {
    for(const temporary of [true, false]) {
      let calls = 0;
      const context = vm.createContext({console, AbortController, clearTimeout() {},
        setTimeout(fn, ms) {if(ms < 1000) queueMicrotask(fn); return 1;}, window:{},
        fetch:async () => {
          calls++;
          if(temporary && calls === 1) return {ok:false,status:404,text:async () => '<html>Error temporal</html>'};
          return {ok:true,status:200,text:async () => JSON.stringify(temporary ? {ok:true,sessionToken:'valid'} : {ok:false,message:'Clave incorrecta.'})};
        }
      });
      vm.runInContext(fs.readFileSync(path.join(root, 'js/api-client.js'), 'utf8'), context);
      const work = context.window.AutoCorApi.postJson('https://example.test', {action:'login',username:'TEST',password:'test'});
      if(temporary) assert.equal((await work).sessionToken, 'valid');
      else await assert.rejects(work, /Clave incorrecta/);
      assert.equal(calls, temporary ? 2 : 1);
    }
  });
  await test('Busqueda general no multiplica consultas ante fallos de red o sesion', async () => {
    for(const network of [true,false]) {
      let calls = 0;
      const context = vm.createContext({window:{AutoCorConfig:{apiUrl:'https://example.test'},AutoCorApi:{postJson:async () => {
        calls++; if(network) throw new Error('Conexion lenta'); return {ok:false,code:'AUTH_REQUIRED',message:'Sesion expirada'};
      }}},localStorage:{getItem:() => '{"token":"user"}'},document:{getElementById:()=>({})}});
      vm.runInContext(fs.readFileSync(path.join(root, 'js/expediente.js'), 'utf8'), context);
      await assert.rejects(context.window.Expediente.estadoPorPlaca('ABC'));
      assert.equal(calls,1);
    }
  });
  await test('Inicio de IA reutiliza modelo reciente y no genera una consulta pong', async () => {
    const html = fs.readFileSync(path.join(root, 'contratos.html'),'utf8');
    const start = html.indexOf('window.testAIConnection = function');
    const end = html.indexOf('// Disparar verificación de IA', start);
    for(const cached of [true,false]) {
      let listings=0;
      const context = vm.createContext({window:{},console,Date,Promise,
        aiCheckPromise:null, aiAvailable:false,aiAvailabilityChecked:false,
        GEMINI_SESSION_KEY:'test',GEMINI_SESSION_TTL_MS:300000,GEMINI_MODELS_FALLBACK:['model'],
        GEMINI_MODEL_ACTIVE:'',GEMINI_LAST_OK_MODEL:'',
        sessionStorage:{getItem:()=>cached ? JSON.stringify({model:'model',savedAt:Date.now()}) : null},
        refreshGeminiModelAvailability:async()=>{listings++;return 1;},geminiCandidateModels:()=>['model'],
        geminiGenerateWithFallback:()=>{throw new Error('No debe generar un pong');},setAIBanner(){},setGeminiUnavailable(){}
      });
      vm.runInContext(html.slice(start,end),context);
      await context.window.initializeAIState();
      assert.equal(context.aiAvailable,true);
      assert.equal(listings,cached ? 0 : 1);
    }
  });
  await test('Reproceso con fila localizada lee datos actuales sin buscar toda la placa; recupera filas movidas', () => {
    const {ctx} = backend();
    const cache = new Map(); let searches=0, reads=0;
    const data = [['ABC', '', '', '', '', '{"cliente":"Primero"}'], ['XYZ', '', '', '', '', '{"cliente":"Otro"}']];
    ctx.CacheService = {getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})};
    ctx.findRowByPlaca_ = (_, plate) => {searches++; const i=data.findIndex(row=>row[0]===plate); return i<0 ? 0 : i+2;};
    const sheet = {getSheetId:()=>1,getRange:(row,col,count,width)=>({
      getValue(){reads++;return data[row-2][col-1];},
      getValues(){reads++;return [data[row-2].slice(col-1,col-1+width)];}
    })};
    assert.equal(ctx.readRecordForSave_(sheet,'ABC',6).data.cliente,'Primero');
    data[0][5]='{"cliente":"Actualizado"}'; searches=0;reads=0;
    assert.equal(ctx.readRecordForSave_(sheet,'ABC',6).data.cliente,'Actualizado');
    assert.equal(searches,0); assert.equal(reads,1);
    data.reverse();
    assert.equal(ctx.readRecordForSave_(sheet,'ABC',6).row,3);
    assert.equal(searches,1);
  });
  console.log(`\n${passed} comprobaciones completadas.`);
})().catch(err => {console.error(err); process.exitCode = 1;});
