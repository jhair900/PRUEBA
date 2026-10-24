// Canal HTML Service reutilizable. Nunca envia credenciales en una URL.
(function(global){
  'use strict';
  let connection;
  let connectedClient = null;
  let unavailableUntil = 0;
  function connect(){
    if(connection) return connection;
    if(Date.now() < unavailableUntil) return Promise.resolve(null);
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
      let client, retired = false;
      const pending = new Map();
      function disposeIfIdle(){
        if(!retired || pending.size) return;
        global.removeEventListener('message', receive); iframe.remove();
      }
      function retire(){
        retired = true;
        if(connectedClient === client){connectedClient=null;connection=null;unavailableUntil=0;}
        disposeIfIdle();
      }
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
          client = {retire:retire,request:function(payload, signal){
            return new Promise(function(done, fail){
              const id = global.crypto.randomUUID();
              function cancel(){
                const request=pending.get(id);
                pending.delete(id); if(request)request.cleanup(); disposeIfIdle();
                const error = new Error('Solicitud cancelada'); error.name = 'AbortError'; fail(error);
              }
              if(signal && signal.aborted) {cancel(); return;}
              if(signal) signal.addEventListener('abort', cancel, {once:true});
              pending.set(id, {done:done, fail:fail, cleanup:function(){ if(signal) signal.removeEventListener('abort', cancel); }});
              try { peer.postMessage({type:'autocor-request', channel:channel, id:id, payload:payload}, peerOrigin); }
              catch(error){const request=pending.get(id);pending.delete(id);request.cleanup();disposeIfIdle();fail(error);}
            });
          }};
          connectedClient=client;
          resolve(client);
          return;
        }
        if(event.source !== peer || event.origin !== peerOrigin || message.type !== 'autocor-response') return;
        const request = pending.get(message.id);
        if(!request) return;
        pending.delete(message.id); request.cleanup(); disposeIfIdle();
        if(message.error) request.fail(new Error(message.error)); else request.done(message.result);
      }
      global.addEventListener('message', receive);
      const readyTimer = setTimeout(function(){
        global.removeEventListener('message', receive); iframe.remove();
        unavailableUntil = Date.now() + 60000;
        reject(new Error('El canal directo no confirmó su apertura en 45 s; se mantiene el respaldo HTTP.'));
      }, 45000);
      iframe.src = url.toString();
      document.body.appendChild(iframe);
    });
    // La precarga no debe causar una promesa rechazada sin manejar.
    const opening=connection;
    opening.catch(function(){ if(connection===opening)connection = null; });
    return connection;
  }
  async function request(url, body, signal, trace){
    const cancelled=function(){const error=new Error('Solicitud cancelada');error.name='AbortError';error.code=signal&&signal.reason&&signal.reason.code;return error;};
    if(signal&&signal.aborted)throw cancelled();
    // Compatibilidad: solo usar el canal para el backend configurado.
    const endpoint = new URL(url);
    if(endpoint.origin + endpoint.pathname !== new URL(global.AutoCorConfig.apiUrl).origin + new URL(global.AutoCorConfig.apiUrl).pathname) return null;
    let client = connectedClient;
    if(!client){
      if(body.action==='geminiProxy'){
        // Aún no se ha enviado la consulta. Usar HTTP sin esperar la apertura del iframe.
        // El canal sigue abriéndose para futuras consultas; nunca se envía por ambos.
        connect().catch(function(){});
        if(trace){trace.bridgeUnavailable=true;trace.bridgeWaitMs=0;}
        return null;
      }
      // Solo esperar brevemente al arranque. Aun no se ha enviado ninguna operacion.
      // Si el navegador bloquea el iframe, usar la API HTTP existente.
      let timer,abort;const bridgeStarted=Date.now();
      try {
        client = await Promise.race([
          connect().catch(function(error){ if(trace)trace.bridgeError={name:error.name,message:error.message};return null; }),
          new Promise(function(resolve){timer=setTimeout(function(){resolve(null);},1500);})
          ,new Promise(function(_,reject){if(signal){abort=function(){reject(cancelled());};signal.addEventListener('abort',abort,{once:true});}})
        ]);
      } finally { if(trace)trace.bridgeWaitMs=Date.now()-bridgeStarted;clearTimeout(timer);if(signal&&abort)signal.removeEventListener('abort',abort); }
    }
    if(signal&&signal.aborted)throw cancelled();
    if(!client){
      if(trace) trace.bridgeUnavailable = true;
      return null;
    }
    if(trace) trace.transport = 'google.script.run';
    try {return await client.request(body, signal);}
    catch(error){
      if(signal&&signal.aborted&&signal.reason&&/^(AI_CANCELLED|PROCESSING_CANCELLED|PROCESSING_STALE)$/.test(signal.reason.code||''))throw error;
      // No reenviar aquí: el cliente API confirma primero cualquier escritura incierta.
      client.retire();
      if(trace)trace.channelRecovery='Canal retirado; conexión nueva para la siguiente operación';
      connect();
      throw error;
    }
  }
  global.AutoCorTransport = {request:request, connect:connect};
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){connect();});
  else connect();
})(window);
