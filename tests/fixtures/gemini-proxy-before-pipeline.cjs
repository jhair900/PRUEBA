// Línea base exacta anterior a la corrección del recorrido IA, sólo para pruebas sin red.
function geminiProxy_(params, rawBody) {
  let envelope;
  try { envelope = JSON.parse(rawBody || '{}'); }
  catch (_) { return outputJson({ _proxy: { ok: false, status: 400 }, data: { error: { message: 'JSON invalido.' } } }); }
  sessionForResponse_ = null;
  const session = validateSession_(envelope.sessionToken);
  if (!session.ok) return outputJson({ _proxy: { ok: false, status: session.code === 'SESSION_SERVICE_ERROR' ? 503 : 401, origin:'session', authCode:session.code }, data: { error: { message: session.message } } });
  rawBody = JSON.stringify(envelope.request || {});
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return outputJson({
      _proxy: { ok: false, status: 500 },
      data: { error: { code: 500, status: 'CONFIG_ERROR',
        message: 'GEMINI_API_KEY no configurada en Script Properties' } }
    });
  }
  const op = String(params.op || 'models');
  let url, options;
  if (op === 'models') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=' + encodeURIComponent(apiKey);
    options = { method: 'get', muteHttpExceptions: true };
  } else if (op === 'generate') {
    const model = String(params.model || '').replace(/[^A-Za-z0-9._\-]/g, '');
    if (!model) {
      return outputJson({
        _proxy: { ok: false, status: 400 },
        data: { error: { code: 400, status: 'BAD_REQUEST', message: 'Falta parámetro model' } }
      });
    }
    url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model
        + ':generateContent?key=' + encodeURIComponent(apiKey);
    options = {
      method: 'post',
      contentType: 'application/json',
      payload: rawBody || '{}',
      muteHttpExceptions: true
    };
  } else {
    return outputJson({
      _proxy: { ok: false, status: 400 },
      data: { error: { code: 400, status: 'BAD_REQUEST', message: 'op inválida: ' + op } }
    });
  }
  try {
    const started = Date.now();
    const resp = UrlFetchApp.fetch(url, options);
    const status = resp.getResponseCode();
    let parsed;
    try { parsed = JSON.parse(resp.getContentText()); }
    catch (e) { parsed = { raw: resp.getContentText() }; }
    // Sólo metadatos del servicio; sin cabeceras de autenticación ni contenido documental.
    const headers = typeof resp.getAllHeaders === 'function' ? resp.getAllHeaders() : {};
    const retryKey = Object.keys(headers).find(function(key){return key.toLowerCase()==='retry-after';});
    if(op==='models' && parsed.nextPageToken){
      // No presentar una lista parcial como prueba de ausencia de un modelo.
      return outputJson({_proxy:{ok:false,status:502},data:{error:{status:'INCOMPLETE_MODEL_LIST'}}});
    }
    return outputJson({
      session: sessionForResponse_,
      _proxy: { origin:'provider', ok: status >= 200 && status < 300, status: status, retryAfter: retryKey ? String(headers[retryKey]) : '', upstreamMs: Date.now()-started },
      data: parsed
    });
  } catch (err) {
    return outputJson({
      _proxy: { ok: false, status: 0 },
      data: { error: { code: 0, status: 'FETCH_ERROR', message: String(err && err.message || err) } }
    });
  }
}
function autocorRpc(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {ok:false, message:'Solicitud invalida.'};
  let result;
  if (payload.action === 'geminiProxy') {
    result = JSON.parse(geminiProxy_({op:payload.op, model:payload.model}, JSON.stringify({sessionToken:payload.sessionToken, request:payload.request})).getContent());
  } else result = handleAction_(payload.action || 'ping', payload);
  // google.script.run no admite objetos Date; igualar la serializacion de la API HTTP.
  return JSON.parse(JSON.stringify(result));
}
