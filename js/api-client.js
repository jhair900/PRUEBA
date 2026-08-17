(function(global){
  'use strict';

  function looksLikeHtml(text){
    return /^\s*<!doctype\b/i.test(text || '') || /^\s*<html[\s>]/i.test(text || '');
  }

  function shortPreview(text){
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  async function parseJsonResponse(resp, context){
    const text = await resp.text();
    let json;

    try {
      json = JSON.parse(text);
    } catch (err) {
      const status = resp && resp.status ? ('HTTP ' + resp.status + ' ') : '';
      const where = context ? (context + ': ') : '';
      const detail = looksLikeHtml(text)
        ? 'El servidor devolvio una pagina HTML en lugar de JSON. Suele pasar si Google Apps Script responde con una pagina temporal, error de permisos, cuota o despliegue.'
        : 'El servidor devolvio una respuesta que no es JSON.';
      const preview = shortPreview(text);
      throw new Error(where + status + detail + (preview ? ' Respuesta: ' + preview : ''));
    }

    if(json && json.ok === false){
      const where = context ? (context + ': ') : '';
      const apiError = new Error(where + (json.message || 'Error en API'));
      apiError.isApiError = true;
      throw apiError;
    }

    return json;
  }

  async function postJson(url, body, options){
    options = options || {};
    const retries = Number.isFinite(options.retries) ? options.retries : 1;
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(body)
        });
        return await parseJsonResponse(resp, options.context);
      } catch (err) {
        lastError = err;
        if (err && err.isApiError) break;
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
