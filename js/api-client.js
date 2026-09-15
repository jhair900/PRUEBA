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
  function wrapNetworkError(err, context, url){
    const where = context ? (context + ': ') : '';
    const isAbort = err && err.name === 'AbortError';
    const message = isAbort
      ? where + 'No se recibio confirmacion a tiempo. Si estabas guardando, el servidor podria haber completado el registro. Conserva el formulario y verifica la placa antes de volver a guardar.'
      : where + 'No se pudo conectar con el servidor (' + (url || 'API') + '). Verifica tu conexion a internet. Si el problema persiste, revisa en Apps Script que el despliegue siga activo con acceso "Cualquier usuario, incluso anonimo".';
    const wrapped = new Error(message);
    wrapped.isNetworkError = true;
    wrapped.cause = err;
    return wrapped;
  }

  async function fetchWithTimeout(url, fetchOptions, timeoutMs){
    const controller = new AbortController();
    const timer = setTimeout(function(){ controller.abort(); }, timeoutMs);
    try {
      const response = await fetch(url, Object.assign({}, fetchOptions, { signal: controller.signal }));
      const text = await response.text();
      return { ok: response.ok, status: response.status, text: async function(){ return text; } };
    } finally {
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

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await fetchWithTimeout(freshRequestUrl(url, attempt), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'follow'
        }, timeoutMs);
        const json = await parseJsonResponse(resp, options.context, options);
        global.AutoCorApi.lastTiming = {action:body.action, elapsedMs:Date.now()-requestStartedAt, attempts:attempt+1, server:json && json.timing || null};
        if(global.console) global.console.info('[AUTOCOR tiempo]', global.AutoCorApi.lastTiming);
        return json;
      } catch (err) {
        // Error de red (nunca llego respuesta) vs. error ya identificado
        // por parseJsonResponse (isApiError / isNonRetryable).
        const isKnown = err && (err.isApiError || err.isNonRetryable || err.isNetworkError || err.isServiceUnavailable);
        lastError = isKnown ? err : wrapNetworkError(err, options.context, url);

        // Una respuesta perdida no implica que Sheets no haya guardado.
        // Confirmar el identificador antes de repetir la escritura.
        if(saving && !(err && (err.isApiError || err.isNonRetryable))){
          const readAction = {save:'getByPlaca', savePago:'getPagoByPlaca', saveVenta:'getVentaByPlaca', saveContrato:'getContratoByPlaca'}[body.action];
          try {
            const check = await sendJson(url, {action: readAction, sessionToken: body.sessionToken, placa: body.data.placaValue || body.data.placa}, {retries:0, timeoutMs:30000, throwOnApiError:false});
            if(check && check.ok && check.data && check.data._requestId === body.requestId){
              return {ok:true, data:check.data, placa:check.data.placaValue || check.data.placa, updated:true, estadoProceso:check.data.estadoProceso, message:'Guardado confirmado.'};
            }
          } catch (_) { /* Si no se puede confirmar, reutilizar el mismo identificador. */ }
        }
        if (err && (err.isApiError || err.isNonRetryable)) break;
        if (attempt >= retries) break;

        const backoffMs = 700 * Math.pow(2, attempt); // 700ms, 1400ms, 2800ms...
        await new Promise(function(resolve){ setTimeout(resolve, backoffMs); });
      }
    }

    if(lastError && lastError.isServiceUnavailable){
      serviceBlockedUntil = Date.now() + SERVICE_ERROR_COOLDOWN_MS;
      lastServiceError = lastError;
    }

    throw lastError;
  }

  global.AutoCorApi = {
    parseJsonResponse: parseJsonResponse,
    postJson: postJson
  };
})(window);
