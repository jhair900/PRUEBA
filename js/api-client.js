(function(global){
  'use strict';

  const recordActions = {
    save: 'liquidacion', getByPlaca: 'liquidacion',
    savePago: 'pago', getPagoByPlaca: 'pago',
    saveVenta: 'venta', getVentaByPlaca: 'venta',
    saveContrato: 'contrato', getContratoByPlaca: 'contrato'
  };
  const revisions = new Map();
  function requestKey(body){
    const data = body.data || {};
    const placa = String(body.placa || data.placaValue || data.placa || '').trim().toUpperCase().replace(/\s+/g, '');
    return (body.sessionToken || '') + ':' + recordActions[body.action] + ':' + placa;
  }
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
      ? where + 'La solicitud tardo demasiado y se cancelo (posible problema de conexion o el servidor no respondio a tiempo). Intenta de nuevo.'
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
      return await fetch(url, Object.assign({}, fetchOptions, { signal: controller.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  async function postJson(url, body, options){
    options = options || {};
    body = Object.assign({}, body);
    if(!body.sessionToken && body.action !== 'login'){
      try { body.sessionToken = (JSON.parse(global.localStorage.getItem('autocor_auth') || '{}') || {}).token || ''; } catch (_) {}
    }
    const saving = recordActions[body.action] && body.action.indexOf('save') === 0;
    const key = recordActions[body.action] ? requestKey(body) : null;
    if(saving){
      body.expectedRevision = revisions.has(key) ? revisions.get(key) : null;
      body.requestId = global.crypto.randomUUID();
      body.data = Object.assign({}, body.data);
    }
    if(Date.now() < serviceBlockedUntil && lastServiceError){
      throw lastServiceError;
    }
    // 2 reintentos por defecto (3 intentos en total) con espera creciente,
    // porque fallos de red intermitentes son comunes y no deberian
    // mostrarle un error al usuario a la primera.
    const safeRetry = saving || /^(get|list|ping)/.test(body.action || '');
    const retries = safeRetry ? (Number.isFinite(options.retries) ? options.retries : 2) : 0;
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 25000;
    let lastError;

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
        if(json && json.code === 'CONFLICT' && saving && global.AutoCorConflict){
          if(await global.AutoCorConflict.review(json.currentData, body.action === 'saveContrato' ? Object.assign({}, json.currentData || {}, body.data) : body.data)){
            revisions.set(key, json.currentRevision || null);
            return postJson(url, body, options);
          }
        }
        if(key && json && json.ok && json.revision) revisions.set(key, json.revision);
        if(json && json.ok && /^delete/.test(body.action || '')) revisions.clear();
        return json;
      } catch (err) {
        if(err && err.code === 'CONFLICT' && saving && global.AutoCorConflict){
          if(await global.AutoCorConflict.review(err.response.currentData, body.action === 'saveContrato' ? Object.assign({}, err.response.currentData || {}, body.data) : body.data)){
            revisions.set(key, err.response.currentRevision || null);
            return postJson(url, body, options);
          }
        }
        // Error de red (nunca llego respuesta) vs. error ya identificado
        // por parseJsonResponse (isApiError / isNonRetryable).
        const isKnown = err && (err.isApiError || err.isNonRetryable || err.isNetworkError || err.isServiceUnavailable);
        lastError = isKnown ? err : wrapNetworkError(err, options.context, url);

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
