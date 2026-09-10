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
  ctx.validateSession_ = token => token === 'admin' ? {ok: true, user: 'ADMIN', isAdmin: true, rowIndex: 2} : token === 'user' ? {ok: true, user: 'USER', isAdmin: false, rowIndex: 3} : {ok: false, code: 'AUTH_REQUIRED'};
  ctx.ensureActionResources_ = () => {};
  ctx.getSheet_ = ctx.getPaymentsSheet_ = ctx.getVentasSheet_ = ctx.getContratosSheet_ = ctx.ensureUsersSheet_ = () => sheet;
  ctx.findRowByPlaca_ = (_, placa) => { const index = rows.findIndex(r => r[0] === ctx.normalizePlaca_(placa)); return index < 0 ? 0 : index + 2; };
  return {ctx, rows, block: () => blocked = true, releases: () => releases, fetches: () => fetches};
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
    await test(save + ': crear, leer, actualizar, rechazar edicion antigua y repetir sin duplicar', () => {
      const b = backend(), {ctx} = b;
      const first = ctx.handleAction_(save, {sessionToken: 'user', data: {placa: 'ABC123'}, requestId: 'one'});
      assert.equal(first.ok, true, first.message);
      const loaded = ctx.handleAction_(get, {sessionToken: 'user', placa: 'ABC123'});
      assert.equal(loaded.revision, first.revision);
      const request = {sessionToken: 'user', data: {placa: 'ABC123', cliente: 'Nuevo'}, expectedRevision: loaded.revision, requestId: 'two'};
      const second = ctx.handleAction_(save, request);
      assert.equal(second.ok, true, second.message);
      assert.notEqual(second.revision, first.revision);
      assert.equal(ctx.handleAction_(save, {...request, data: {placa: 'ABC123'}, requestId: 'stale'}).code, 'CONFLICT');
      assert.equal(ctx.handleAction_(save, {sessionToken: 'user', data: {placa: 'ABC123'}}).code, 'CONFLICT');
      assert.equal(ctx.handleAction_(save, request).revision, second.revision);
      assert.equal(b.rows.length, 1);
      assert.equal(b.releases(), 5);
      b.block();
      assert.equal(ctx.handleAction_(save, request).code, 'BUSY');
    });
  }
  await test('Guardar contrato conserva historial de estados y archivos existentes', () => {
    const {ctx} = backend();
    const first = ctx.handleAction_('saveContrato', {sessionToken: 'user', data: {placa: 'ABC', historialEstados: [{estado: 'VALIDADO'}], expedienteDrive: {url: 'file'}}});
    const second = ctx.handleAction_('saveContrato', {sessionToken: 'user', data: {placa: 'ABC'}, expectedRevision: first.revision});
    assert.equal(second.data.historialEstados.length, 1);
    assert.equal(second.data.expedienteDrive.url, 'file');
  });
  await test('Cambiar estado no provoca conflicto falso ni pierde el historial al guardar', () => {
    const {ctx} = backend();
    const first = ctx.handleAction_('saveContrato', {sessionToken: 'user', data: {placa: 'ABC', drive: {folderId: 'original'}}});
    assert.equal(ctx.handleAction_('setEstadoProceso', {sessionToken: 'user', placa: 'ABC', estado: 'CONTRATADO', observacion: 'Generado'}).ok, true);
    const second = ctx.handleAction_('saveContrato', {sessionToken: 'user', data: {placa: 'ABC', drive: {}, historialEstados: []}, expectedRevision: first.revision});
    assert.equal(second.ok, true, second.message);
    assert.equal(second.data.estadoProceso, 'CONTRATADO');
    assert.equal(second.data.historialEstados.length, 1);
    assert.equal(second.data.drive.folderId, 'original');
  });
  await test('Cliente envia token, revision y reutiliza ID despues de perder una respuesta', async () => {
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
    assert.equal(calls[1].expectedRevision, 'r1');
    assert.equal(calls[1].requestId, calls[2].requestId);
    await api.postJson('https://example.test', {action: 'save', data: {placa: 'ABC'}});
    assert.equal(calls[3].expectedRevision, 'r2');
    await api.postJson('https://example.test', {action: 'save', data: {placa: 'OTHER'}});
    assert.equal(calls[4].expectedRevision, null);
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
  for (const approve of [false, true]) {
    await test('Conflicto: ' + (approve ? 'reemplazo explicito usa la revision revisada' : 'cancelar no escribe ni reintenta'), async () => {
      for (const throwOnApiError of [false, true]) {
        const calls = []; let reviews = 0;
        const context = vm.createContext({console, AbortController, setTimeout, clearTimeout,
          window: {crypto, localStorage: {getItem: () => '{"token":"user"}'}, AutoCorConflict: {review: async (current, next) => {
            reviews++; assert.equal(current.cliente, 'Actual'); assert.equal(next.cliente, 'Propuesto'); return approve;
          }}},
          fetch: async (_, init) => {
            const body = JSON.parse(init.body); calls.push(body);
            const value = calls.length === 1 ? {ok: false, code: 'CONFLICT', currentRevision: 'reviewed', currentData: {cliente: 'Actual'}} : {ok: true, revision: 'saved'};
            return {ok: true, status: 200, text: async () => JSON.stringify(value)};
          }
        });
        vm.runInContext(fs.readFileSync(path.join(root, 'js/api-client.js'), 'utf8'), context);
        const work = context.window.AutoCorApi.postJson('https://example.test', {action: 'save', data: {placa: 'ABC', cliente: 'Propuesto'}}, {throwOnApiError});
        if(!approve && throwOnApiError) await assert.rejects(work, err => err.code === 'CONFLICT');
        else assert.equal((await work).ok, approve);
        assert.equal(reviews, 1);
        assert.equal(calls.length, approve ? 2 : 1);
        if(approve) assert.equal(calls[1].expectedRevision, 'reviewed');
      }
    });
  }
  console.log(`\n${passed} comprobaciones completadas.`);
})().catch(err => {console.error(err); process.exitCode = 1;});
