(function(global){
  'use strict';

  const recordActions = {
    save: 'liquidacion', getByPlaca: 'liquidacion',
    savePago: 'pago', getPagoByPlaca: 'pago',
    saveVenta: 'venta', getVentaByPlaca: 'venta',
    saveContrato: 'contrato', getContratoByPlaca: 'contrato'
  };
  const SERVICE_ERROR_COOLDOWN_MS = 15000;
  let serviceBlockedUntil = 0;
  let lastServiceError = null;

  function looksLikeHtml(text){
    return /^\s*<!doctype\b/i.test(text || '') || /^\s*<html[\s>]/i.test(text || '');
  }

  function shortPreview(text){
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  function freshRequestUrl(url, attempt){
    const separator = String(url).indexOf('?') >= 0 ? '&' : '?';
    return String(url) + separator + '_autocor=' + Date.now() + '_' + (attempt || 0);
  }

  async function parseJsonResponse(resp, context, options){
    options = options || {};
    const text = await resp.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch (err) {
      const status = resp && resp.status ? ('HTTP ' + resp.status + ' ') : '';
      const where = context ? (context + ': ') : '';
      const detail = resp && resp.status === 404
        ? 'No se encontro el servicio de Google Apps Script. Verifica que la URL /exec corresponda a un despliegue activo y accesible.'
        : looksLikeHtml(text)
          ? 'El servidor devolvio una pagina HTML en lugar de JSON. Suele pasar si Google Apps Script responde con una pagina temporal, error de permisos, cuota o despliegue.'
          : 'El servidor devolvio una respuesta que no es JSON.';
      const includePreview = !looksLikeHtml(text) && (!resp || resp.status !== 404);
      const preview = includePreview ? shortPreview(text) : '';
      const responseError = new Error(where + status + detail + (preview ? ' Respuesta: ' + preview : ''));
      responseError.isServiceUnavailable = !!(looksLikeHtml(text) || (resp && resp.status === 404));
      responseError.isNonRetryable = !!(
        resp && resp.status >= 400 && resp.status < 500 &&
        !responseError.isServiceUnavailable && resp.status !== 408 && resp.status !== 429
      );
      throw responseError;
    }

    if(options.throwOnApiError !== false && json && json.ok === false){
      const where = context ? (context + ': ') : '';
      const apiError = new Error(where + (json.message || 'Error en API'));
      apiError.isApiError = true;
      apiError.code = json.code;
      apiError.response = json;
      throw apiError;
    }

    if(resp.ok === false){
      const error = new Error((context ? context + ': ' : '') + 'HTTP ' + resp.status);
      error.isNonRetryable = resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429;
      throw error;
    }
    return json;
  }

  // Convierte errores de red de bajo nivel (fetch rechazado antes de llegar
  // al servidor: "Failed to fetch", "NetworkError", timeout, etc.) en un
  // mensaje entendible en vez del texto crudo del navegador.
  function wrapNetworkError(err, context, url, saving){
    const where = context ? (context + ': ') : '';
    const isAbort = err && err.name === 'AbortError';
    const message = isAbort
      ? where + (saving ? 'No se pudo confirmar el guardado a tiempo. Conserva el formulario y verifica la placa antes de volver a guardar.' : 'La consulta no respondio a tiempo. No se modifico ningun registro. Intenta de nuevo.')
      : where + 'No se pudo conectar con el servidor (' + (url || 'API') + '). Verifica tu conexion a internet. Si el problema persiste, revisa en Apps Script que el despliegue siga activo con acceso "Cualquier usuario, incluso anonimo".';
    const wrapped = new Error(message);
    wrapped.isNetworkError = true;
    wrapped.cause = err;
    return wrapped;
  }

  async function fetchWithTimeout(url, fetchOptions, timeoutMs, trace){
    trace = trace || {};
    const started = Date.now();
    let stage = "connection";
    const controller = new AbortController();
    const timer = setTimeout(function(){ trace.timedOut = true; controller.abort(); }, timeoutMs);
    try {
      if(global.AutoCorTransport){
        const result = await global.AutoCorTransport.request(url, JSON.parse(fetchOptions.body), controller.signal, trace);
        if(result !== null){
          trace.headersMs = Date.now()-started; trace.httpStatus = null; trace.bodyMs = 0;
          return {ok:true, status:200, text:async function(){return JSON.stringify(result);}};
        }
      }
      if(controller.signal.aborted){const error = new Error('Tiempo agotado');error.name='AbortError';throw error;}
      trace.transport = 'fetch';
      const response = await fetch(url, Object.assign({}, fetchOptions, { signal: controller.signal }));
      trace.headersMs = Date.now() - started;
      trace.httpStatus = response.status;
      trace.redirected = !!response.redirected;
      stage = 'body';
      const text = await response.text();
      trace.bodyMs = Date.now() - started - trace.headersMs;
      return { ok: response.ok, status: response.status, text: async function(){ return text; } };
    } catch(err) {
      trace.failedStage = stage;
      trace.errorType = err && err.name || 'Error';
      throw err;
    } finally {
      trace.elapsedMs = Date.now() - started;
      clearTimeout(timer);
    }
  }

  // Compartir solo consultas identicas que aun estan en curso, nunca resultados antiguos.
  const pendingReads = new Map();
  let writeGeneration = 0;
  async function postJson(url, body, options){
    body = Object.assign({}, body);
    if(!body.sessionToken && body.action !== 'login'){
      try { body.sessionToken = (JSON.parse(global.localStorage.getItem('autocor_auth') || '{}') || {}).token || ''; } catch (_) {}
    }
    const reading = /^(get|list|estadoPorPlaca$|ping$)/.test(body.action || '');
    if(!reading){
      writeGeneration++;
      return sendJson(url, body, options);
    }
    const key = JSON.stringify([url, body, options || {}, writeGeneration]);
    let promise = pendingReads.get(key);
    if(!promise){
      promise = sendJson(url, body, options);
      pendingReads.set(key, promise);
    }
    try {
      // Cada formulario puede adaptar su copia sin modificar la respuesta de otro.
      return JSON.parse(JSON.stringify(await promise));
    } finally {
      if(pendingReads.get(key) === promise) pendingReads.delete(key);
    }
  }

  async function sendJson(url, body, options){
    options = options || {};
    body = Object.assign({}, body);
    if(!body.sessionToken && body.action !== 'login'){
      try { body.sessionToken = (JSON.parse(global.localStorage.getItem('autocor_auth') || '{}') || {}).token || ''; } catch (_) {}
    }
    const saving = recordActions[body.action] && body.action.indexOf('save') === 0;
    if(saving){
      body.requestId = global.crypto.randomUUID();
      body.data = Object.assign({}, body.data);
    }
    if(body.action !== 'login' && Date.now() < serviceBlockedUntil && lastServiceError){
      throw lastServiceError;
    }
    // 2 reintentos por defecto (3 intentos en total) con espera creciente,
    // porque fallos de red intermitentes son comunes y no deberian
    // mostrarle un error al usuario a la primera.
    const safeRetry = saving || body.action === 'login' || /^(get|list|ping)/.test(body.action || '');
    const retries = safeRetry ? (Number.isFinite(options.retries) ? options.retries : body.action === 'login' ? 1 : 2) : 0;
    const defaultTimeout = saving ? 60000 : body.action === 'login' ? 45000 : /^(subirExpedienteDrive|convertirDocxAPdf)$/.test(body.action) ? 120000 : 30000;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : defaultTimeout;
    let lastError;
    const requestStartedAt = Date.now();
    // Un único presupuesto incluye intentos, pausas y confirmación de escritura.
    const totalTimeoutMs = Number.isFinite(options.totalTimeoutMs) ? Math.max(1, options.totalTimeoutMs) : saving ? 90000 : Math.max(timeoutMs, 60000);
    const remainingMs = function(){ return Math.max(0, totalTimeoutMs - (Date.now() - requestStartedAt)); };
    function progress(message, done){
      if(saving && global.dispatchEvent && typeof CustomEvent === 'function'){
        global.dispatchEvent(new CustomEvent('autocor-save-progress', {detail:{message:message, done:!!done}}));
      }
    }
    const traces = [];
    function recordTiming(outcome, json){
      progress('', true);
      const timing = {action:body.action, elapsedMs:Date.now()-requestStartedAt,
        attempts:traces.filter(function(t){ return t.kind === 'request'; }).length,
        outcome:outcome, server:json && json.timing || null, details:traces};
      global.AutoCorApi.lastTiming = timing;
      if(saving) global.AutoCorApi.lastSaveTiming = timing;
      if(global.dispatchEvent && typeof CustomEvent === 'function') global.dispatchEvent(new CustomEvent('autocor-timing',{detail:timing}));
      if(global.console) global.console.info('[AUTOCOR tiempo]', timing);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      if(remainingMs() <= 0) break;
      progress(attempt ? 'Reintentando el guardado…' : 'Guardando los datos…');
      const attemptTimeout = Math.min(timeoutMs, remainingMs());
      const trace = {kind:'request', attempt:attempt+1, timeoutMs:attemptTimeout};
      traces.push(trace);
      try {
        const resp = await fetchWithTimeout(freshRequestUrl(url, attempt), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'follow'
        }, attemptTimeout, trace);
        const json = await parseJsonResponse(resp, options.context, options);
        trace.server = json && json.timing || null;
        recordTiming(json && json.ok === false ? 'api_error' : 'success', json);
        return json;
      } catch (err) {
        // Error de red (nunca llego respuesta) vs. error ya identificado
        // por parseJsonResponse (isApiError / isNonRetryable).
        trace.errorType = err.code || err.name || 'Error';
        trace.serviceUnavailable = !!err.isServiceUnavailable;
        const isKnown = err && (err.isApiError || err.isNonRetryable || err.isNetworkError || err.isServiceUnavailable);
        lastError = isKnown ? err : wrapNetworkError(err, options.context, url, saving);

        // Una respuesta perdida no implica que Sheets no haya guardado.
        // Confirmar el identificador antes de repetir la escritura.
        if(saving && remainingMs() > 0 && !(err && (err.isApiError || err.isNonRetryable))){
          progress('Verificando si el servidor ya guardó los datos…');
          const readAction = {save:'getByPlaca', savePago:'getPagoByPlaca', saveVenta:'getVentaByPlaca', saveContrato:'getContratoByPlaca'}[body.action];
          const verification = {kind:'verification', elapsedMs:0, confirmed:false};
          traces.push(verification);
          const verificationStarted = Date.now();
          try {
            const check = await sendJson(url, {action: readAction, sessionToken: body.sessionToken, placa: body.data.placaValue || body.data.placa}, {retries:0, timeoutMs:Math.min(30000, remainingMs()), totalTimeoutMs:remainingMs(), throwOnApiError:false});
            verification.elapsedMs = Date.now()-verificationStarted;
            verification.server = check && check.timing || null;
            verification.details = global.AutoCorApi.lastTiming && global.AutoCorApi.lastTiming.details || [];
            if(check && check.ok && check.data && check.data._requestId === body.requestId){
              verification.confirmed = true;
              recordTiming('confirmed_after_error', check);
              return {ok:true, data:check.data, placa:check.data.placaValue || check.data.placa, updated:true, estadoProceso:check.data.estadoProceso, message:'Guardado confirmado.'};
            }
          } catch (verifyError) {
            verification.elapsedMs = Date.now()-verificationStarted;
            verification.errorType = verifyError.code || verifyError.name || 'Error';
          }
        }
        if (err && (err.isApiError || err.isNonRetryable)) break;
        if (attempt >= retries) break;
        if (remainingMs() <= 0) break;

        const backoffMs = 700 * Math.pow(2, attempt); // 700ms, 1400ms, 2800ms...
        await new Promise(function(resolve){ setTimeout(resolve, Math.min(backoffMs, remainingMs())); });
      }
    }

    if(lastError && lastError.isServiceUnavailable){
      serviceBlockedUntil = Date.now() + SERVICE_ERROR_COOLDOWN_MS;
      lastServiceError = lastError;
    }

    recordTiming('failed', null);
    if(saving && lastError && !lastError.isApiError && !lastError.isNonRetryable){
      lastError.message = (options.context ? options.context + ': ' : '') + 'No se pudo confirmar el guardado. El servidor podría haberlo completado. Conserva el formulario y verifica la placa antes de volver a guardar.';
    }
    throw lastError;
  }

  global.AutoCorApi = {
    parseJsonResponse: parseJsonResponse,
    postJson: postJson
  };
})(window);
