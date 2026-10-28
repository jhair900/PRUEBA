(function(global){
  'use strict';
  // La sincronización de autenticación es inmediata; nunca se difiere por un guardado.
  var previousGeneration=global.AutoCorSession?.snapshot().generation;
  global.addEventListener('autocor-session-state',function(){
    var generation=global.AutoCorSession?.snapshot().generation;
    if(generation!==previousGeneration){
      previousGeneration=generation;
      ['pagos','ventas','liquidacion'].forEach(function(module){
        var key='__'+module+'PlateSearchId';global[key]=(global[key]||0)+1;
      });
    }
    global.AutoCorAuthUI?.render?.();
  });

  var notice;
  global.addEventListener('autocor-save-progress', function(event){
    if(!notice){
      notice = document.createElement('div');
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.style.cssText = 'position:fixed;bottom:16px;left:16px;right:16px;z-index:21000;padding:12px 16px;border-radius:10px;background:#17212f;color:white;font:600 13px Arial;box-shadow:0 3px 12px #0003;pointer-events:none';
      document.body.appendChild(notice);
    }
    notice.textContent = event.detail.message;
    notice.hidden = event.detail.done;
  });
})(window);
