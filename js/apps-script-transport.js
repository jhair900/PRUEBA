// Canal HTML Service reutilizable. Nunca envia credenciales en una URL.
(function(global){
  'use strict';
  let connection;
  function connect(){
    if(connection) return connection;
    connection = new Promise(function(resolve, reject){
      const channel = global.crypto.randomUUID();
      const iframe = document.createElement('iframe');
      iframe.hidden = true;
      iframe.setAttribute('aria-hidden', 'true');
      const url = new URL(global.AutoCorConfig.apiUrl);
      url.searchParams.set('action', 'bridge');
      url.searchParams.set('channel', channel);
      url.searchParams.set('parentOrigin', global.location.origin);
      let peer, peerOrigin;
      const pending = new Map();
      function descendant(source){
        try {
          for(let i=0; source && i<6; i++){
            if(source === iframe.contentWindow) return true;
            const parent = source.parent;
            if(parent === source) break;
            source = parent;
          }
        } catch(_) {}
        return false;
      }
      function receive(event){
        const message = event.data;
        if(!message || message.channel !== channel || !/^https:\/\/([a-z0-9-]+\.)*googleusercontent\.com$/.test(event.origin)) return;
        if(!descendant(event.source)) return;
        if(message.type === 'autocor-ready' && !peer){
          peer = event.source; peerOrigin = event.origin;
          clearTimeout(readyTimer);
          resolve({request:function(payload, signal){
            return new Promise(function(done, fail){
              const id = global.crypto.randomUUID();
              function cancel(){
                pending.delete(id);
                const error = new Error('Solicitud cancelada'); error.name = 'AbortError'; fail(error);
              }
              if(signal && signal.aborted) {cancel(); return;}
              if(signal) signal.addEventListener('abort', cancel, {once:true});
              pending.set(id, {done:done, fail:fail, cleanup:function(){ if(signal) signal.removeEventListener('abort', cancel); }});
              peer.postMessage({type:'autocor-request', channel:channel, id:id, payload:payload}, peerOrigin);
            });
          }});
          return;
        }
        if(event.source !== peer || event.origin !== peerOrigin || message.type !== 'autocor-response') return;
        const request = pending.get(message.id);
        if(!request) return;
        pending.delete(message.id); request.cleanup();
        if(message.error) request.fail(new Error(message.error)); else request.done(message.result);
      }
      global.addEventListener('message', receive);
      const readyTimer = setTimeout(function(){
        global.removeEventListener('message', receive); iframe.remove();
        reject(new Error('No se pudo abrir la conexion directa. Verifica que el nuevo Apps Script este implementado.'));
      }, 12000);
      iframe.src = url.toString();
      document.body.appendChild(iframe);
    });
    // La precarga no debe causar una promesa rechazada sin manejar.
    connection.catch(function(){ connection = null; });
    return connection;
  }
  async function request(url, body, signal, trace){
    // Compatibilidad: solo usar el canal para el backend configurado.
    const endpoint = new URL(url);
    if(endpoint.origin + endpoint.pathname !== new URL(global.AutoCorConfig.apiUrl).origin + new URL(global.AutoCorConfig.apiUrl).pathname) return null;
    let client;
    try { client = await connect(); }
    catch(error) {
      if(trace) trace.bridgeUnavailable = true;
      error.isNonRetryable = true;
      throw error;
    }
    if(trace) trace.transport = 'google.script.run';
    return client.request(body, signal);
  }
  global.AutoCorTransport = {request:request, connect:connect};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){connect();});
  else connect();
})(window);
