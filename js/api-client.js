(function(global){
  'use strict';

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
      responseError.isNonRetryable = !!(resp && resp.status >= 400 && resp.status < 500);
      responseError.isServiceUnavailable = !!(looksLikeHtml(text) || (resp && resp.status === 404));
      throw responseError;
    }

    if(options.throwOnApiError !== false && json && json.ok === false){
      const where = context ? (context + ': ') : '';
      const apiError = new Error(where + (json.message || 'Error en API'));
      apiError.isApiError = true;
      throw apiError;
    }

    return json;
  }

  async function postJson(url, body, options){
    options = options || {};
    if(Date.now() < serviceBlockedUntil && lastServiceError){
      throw lastServiceError;
    }
    const retries = Number.isFinite(options.retries) ? options.retries : 1;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(freshRequestUrl(url, attempt), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'follow'
        });
        return await parseJsonResponse(resp, options.context, options);
      } catch (err) {
        lastError = err;
        if(err && err.isServiceUnavailable){
          serviceBlockedUntil = Date.now() + SERVICE_ERROR_COOLDOWN_MS;
          lastServiceError = err;
        }
        if (err && (err.isApiError || err.isNonRetryable)) break;
        if (attempt >= retries) break;
        await new Promise(function(resolve){ setTimeout(resolve, 700); });
      }
    }

    throw lastError;
  }

  global.AutoCorApi = {
    parseJsonResponse: parseJsonResponse,
    postJson: postJson
  };
})(window);
