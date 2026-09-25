(function(global){
  'use strict';
  // Actualizar la cuenta sin recargar ni borrar los formularios abiertos.
  var deferred = false;
  function sync(){
    if(global.AutoCorWork && global.AutoCorWork.busy){deferred=true;return;}
    deferred=false;
    var auth = null;
    try { auth = JSON.parse(global.localStorage.getItem('autocor_auth') || 'null'); } catch(_) {}
    if(typeof global.saveAuthState === 'function') global.saveAuthState(auth, false);
    if(global.AutoCorAuthUI) global.AutoCorAuthUI.render();
    // Ignorar respuestas de búsquedas iniciadas con la sesión anterior.
    ['pagos','ventas','liquidacion'].forEach(function(module){
      var key = '__' + module + 'PlateSearchId';
      global[key] = (global[key] || 0) + 1;
    });
  }
  global.addEventListener('storage', function(event){
    if(event.key === 'autocor_auth' || event.key === null) sync();
  });
  global.addEventListener('autocor-operation-end',function(){if(deferred)sync();});

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
