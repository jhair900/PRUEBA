(function(global){
  'use strict';

  var GAS_URL = 'https://script.google.com/macros/s/AKfycbxbh1cLzulwNeFHJj2c6_k6Yk4PyHhzTlFlcfW7M0SMz4NrAxKUagOweQobl4AJTcmQ/exec';

  function $(id){ return document.getElementById(id); }

  function getAuth(){
    try { return JSON.parse(localStorage.getItem('autocor_auth') || 'null') || null; }
    catch(_){ return null; }
  }

  function setAuth(auth){
    if(typeof global.saveAuthState === 'function'){
      global.saveAuthState(auth || null);
    } else if(auth){
      localStorage.setItem('autocor_auth', JSON.stringify(auth));
    } else {
      localStorage.removeItem('autocor_auth');
    }
    render();
  }

  function api(action, payload){
    var body = Object.assign({ action: action }, payload || {});
    return global.AutoCorApi.postJson(GAS_URL, body, { context: action });
  }

  function openModal(id){
    var el = $(id);
    if(el) el.style.display = 'flex';
  }

  function closeModal(id){
    var el = $(id);
    if(el) el.style.display = 'none';
  }

  function esc(s){
    return String(s || '').replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);
    });
  }

  function buttonClass(){
    if(document.querySelector('.btn-outline')) return 'btn-outline';
    if(document.querySelector('.outline')) return 'outline';
    return 'auth-ui-btn';
  }

  function hideLegacyButtons(){
    ['btnIniciarSesion','btnCerrarSesion','btnCambiarUsuario','btnCambiarClave','btnAdminUsuarios'].forEach(function(id){
      var el = $(id);
      if(el) el.style.setProperty('display', 'none', 'important');
    });
    document.querySelectorAll('.btn-logout').forEach(function(el){
      el.style.setProperty('display', 'none', 'important');
    });
    var headerName = $('headerName');
    if(headerName) headerName.style.setProperty('display', 'none', 'important');
    var topbarUser = $('topbarUser');
    if(topbarUser) topbarUser.style.setProperty('display', 'none', 'important');
  }

  function isAuthInput(el){
    var id = String(el.id || '').toLowerCase();
    var name = String(el.name || '').toLowerCase();
    return /usuario|username|password|clave|pass/.test(id + ' ' + name) ||
      el.closest('.auth-ui-modal-backdrop') ||
      el.closest('#modalLogin') ||
      el.closest('#modalUsuario') ||
      el.closest('#modalCambioClave');
  }

  function scrubUserAutofill(){
    var auth = getAuth();
    if(!auth) return;
    var values = [auth.user, auth.displayName]
      .map(function(v){ return String(v || '').trim().toUpperCase(); })
      .filter(Boolean);
    if(!values.length) return;

    document.querySelectorAll('input, textarea').forEach(function(el){
      if(isAuthInput(el)) return;
      var v = String(el.value || '').trim().toUpperCase();
      if(v && values.indexOf(v) !== -1){
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  function mountStyles(){
    if($('authUiStyles')) return;
    var style = document.createElement('style');
    style.id = 'authUiStyles';
    style.textContent = [
      '.auth-ui-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.auth-ui-spacer{flex:1 1 auto}',
      '.auth-ui-user{font-size:12px;font-weight:800;color:#374151;background:#f3f4f6;border:1px solid #d1d5db;border-radius:999px;padding:8px 12px;white-space:nowrap}',
      '.auth-ui-btn{border:1px solid #d1d5db;background:#fff;color:#111827;border-radius:8px;padding:9px 12px;font-size:12px;font-weight:800;cursor:pointer}',
      '.auth-ui-modal-backdrop{position:fixed;inset:0;background:rgba(17,24,39,.48);display:none;align-items:center;justify-content:center;padding:18px;z-index:20000}',
      '.auth-ui-modal{width:min(540px,100%);background:#fff;border-radius:12px;box-shadow:0 24px 70px rgba(0,0,0,.28);overflow:hidden;border:1px solid #d1d5db}',
      '.auth-ui-modal.auth-ui-wide{width:min(900px,100%)}',
      '.auth-ui-head{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid #e5e7eb;background:#f9fafb}',
      '.auth-ui-head h3{margin:0;font-size:14px;font-weight:800;color:#111827}',
      '.auth-ui-close{border:none;background:#111827;color:#fff;border-radius:8px;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer}',
      '.auth-ui-body{padding:16px;max-height:72vh;overflow:auto}',
      '.auth-ui-notice{font-size:12px;color:#4b5563;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:12px}',
      '.auth-ui-field{display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center;margin-top:10px}',
      '.auth-ui-field label{font-size:11px;font-weight:800;color:#374151;text-transform:uppercase}',
      '.auth-ui-field input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:9px 10px;font-size:13px}',
      '.auth-ui-actions{margin-top:14px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}',
      '.auth-ui-primary{background:#111827;color:#fff;border:none;border-radius:9px;padding:9px 16px;font-size:13px;font-weight:800;cursor:pointer}',
      '.auth-ui-secondary{background:#fff;color:#111827;border:1px solid #cbd5e1;border-radius:9px;padding:9px 16px;font-size:13px;font-weight:800;cursor:pointer}',
      '.auth-ui-table{width:100%;border-collapse:collapse;font-size:12px}',
      '.auth-ui-table th,.auth-ui-table td{border-bottom:1px solid #e5e7eb;padding:9px;text-align:left}',
      '.auth-ui-table th{font-size:11px;text-transform:uppercase;color:#4b5563;background:#f9fafb}',
      '@media(max-width:720px){.auth-ui-field{grid-template-columns:1fr}.auth-ui-user{width:100%;text-align:center}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function mountBar(){
    if($('authUiBar')) return;
    var host = document.querySelector('.toolbar-wrap') || document.querySelector('.header-user') || document.querySelector('.topbar-right') || document.body;
    var bar = document.createElement('div');
    bar.id = 'authUiBar';
    bar.className = 'auth-ui-bar';
    bar.innerHTML =
      '<button type="button" id="authUiLogin" class="'+buttonClass()+'">Iniciar sesion</button>' +
      '<button type="button" id="authUiLogout" class="'+buttonClass()+'" style="display:none">Cerrar sesion</button>' +
      '<button type="button" id="authUiChange" class="'+buttonClass()+'" style="display:none">Cambiar contrasena</button>' +
      '<button type="button" id="authUiAdmin" class="'+buttonClass()+'" style="display:none">Administrar usuarios</button>';
    host.appendChild(bar);
    hideLegacyButtons();

    $('authUiLogin').addEventListener('click', function(){ openModal('authUiLoginModal'); });
    $('authUiLogout').addEventListener('click', logout);
    $('authUiChange').addEventListener('click', function(){ openChangePassword(); });
    $('authUiAdmin').addEventListener('click', function(){ openAdminUsers(); });
  }

  function mountModals(){
    if($('authUiLoginModal')) return;
    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="auth-ui-modal-backdrop" id="authUiLoginModal">' +
        '<div class="auth-ui-modal">' +
          '<form id="authUiLoginForm" onsubmit="return false;">' +
            '<div class="auth-ui-head"><h3>Iniciar sesion</h3><button type="button" class="auth-ui-close" data-close="authUiLoginModal">Cerrar</button></div>' +
            '<div class="auth-ui-body">' +
              '<div class="auth-ui-notice">Ingresa tu usuario y clave para guardar, buscar y administrar segun tus permisos.</div>' +
              '<div class="auth-ui-field"><label>Usuario</label><input id="authUiUsername" name="username" autocomplete="username" placeholder="Ej: YROMERO"></div>' +
              '<div class="auth-ui-field"><label>Clave</label><input id="authUiPassword" name="password" type="password" autocomplete="current-password" placeholder="Tu contrasena"></div>' +
              '<div class="auth-ui-actions"><button type="submit" class="auth-ui-primary" id="authUiDoLogin">Ingresar</button></div>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>' +
      '<div class="auth-ui-modal-backdrop" id="authUiChangeModal">' +
        '<div class="auth-ui-modal">' +
          '<form id="authUiChangeForm" onsubmit="return false;">' +
            '<div class="auth-ui-head"><h3>Cambiar contrasena</h3><button type="button" class="auth-ui-close" data-close="authUiChangeModal">Cerrar</button></div>' +
            '<div class="auth-ui-body">' +
              '<div class="auth-ui-field"><label>Clave actual</label><input id="authUiCurrentPass" name="current_password" type="password" autocomplete="current-password"></div>' +
              '<div class="auth-ui-field"><label>Nueva clave</label><input id="authUiNewPass" name="new_password" type="password" autocomplete="new-password"></div>' +
              '<div class="auth-ui-field"><label>Confirmar</label><input id="authUiNewPass2" name="confirm_password" type="password" autocomplete="new-password"></div>' +
              '<div class="auth-ui-actions"><button type="submit" class="auth-ui-primary" id="authUiDoChange">Guardar clave</button></div>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>' +
      '<div class="auth-ui-modal-backdrop" id="authUiAdminModal">' +
        '<div class="auth-ui-modal auth-ui-wide">' +
          '<div class="auth-ui-head"><h3>Administrar usuarios</h3><button type="button" class="auth-ui-close" data-close="authUiAdminModal">Cerrar</button></div>' +
          '<div class="auth-ui-body">' +
            '<div class="auth-ui-notice">Solo administradores. Desde aqui puedes ver usuarios y resetear sus claves.</div>' +
            '<table class="auth-ui-table"><thead><tr><th>Usuario</th><th>Nombre</th><th>Admin</th><th>Activo</th><th>Debe cambiar</th><th>Accion</th></tr></thead><tbody id="authUiUsersBody"></tbody></table>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);

    document.querySelectorAll('[data-close]').forEach(function(btn){
      btn.addEventListener('click', function(){ closeModal(btn.getAttribute('data-close')); });
    });
    ['authUiLoginModal','authUiChangeModal','authUiAdminModal'].forEach(function(id){
      $(id).addEventListener('click', function(e){ if(e.target === $(id)) closeModal(id); });
    });
    $('authUiLoginForm').addEventListener('submit', function(e){
      e.preventDefault();
      login();
    });
    $('authUiChangeForm').addEventListener('submit', function(e){
      e.preventDefault();
      changePassword();
    });
  }

  function render(){
    var auth = getAuth();
    var logged = !!(auth && auth.token);
    hideLegacyButtons();
    scrubUserAutofill();
    if($('authUiLogin')) $('authUiLogin').style.display = logged ? 'none' : 'inline-block';
    if($('authUiLogout')) $('authUiLogout').style.display = logged ? 'inline-block' : 'none';
    if($('authUiChange')) $('authUiChange').style.display = logged ? 'inline-block' : 'none';
    if($('authUiAdmin')) $('authUiAdmin').style.display = logged && auth.isAdmin ? 'inline-block' : 'none';
  }

  async function login(){
    var u = ($('authUiUsername').value || '').trim().toUpperCase();
    var p = ($('authUiPassword').value || '').trim();
    if(!u || !p){ alert('Ingresa usuario y clave.'); return; }
    try{
      var resp = await api('login', { username: u, password: p });
      var auth = {
        user: (resp.user && resp.user.username) || u,
        displayName: (resp.user && resp.user.displayName) || u,
        isAdmin: !!(resp.user && resp.user.isAdmin),
        token: resp.sessionToken || ''
      };
      setAuth(auth);
      $('authUiUsername').value = '';
      $('authUiPassword').value = '';
      closeModal('authUiLoginModal');
      if(typeof global.setStatus === 'function') global.setStatus('SESION INICIADA', false, true);
      if(resp.user && resp.user.mustChangePassword){
        alert('Debes cambiar tu clave ahora.');
        openChangePassword();
      }
    }catch(err){
      console.error(err);
      alert(err.message || 'No se pudo iniciar sesion.');
    }
  }

  function logout(){
    if(typeof global.cerrarSesion === 'function' && global.cerrarSesion !== logout){
      try { global.cerrarSesion(); } catch(_) { setAuth(null); }
    } else {
      setAuth(null);
    }
    render();
  }

  function openChangePassword(){
    var auth = getAuth();
    if(!auth || !auth.token){ openModal('authUiLoginModal'); return; }
    $('authUiCurrentPass').value = '';
    $('authUiNewPass').value = '';
    $('authUiNewPass2').value = '';
    openModal('authUiChangeModal');
  }

  async function changePassword(){
    var auth = getAuth();
    if(!auth || !auth.user){ alert('Inicia sesion primero.'); return; }
    var current = ($('authUiCurrentPass').value || '').trim();
    var next = ($('authUiNewPass').value || '').trim();
    var next2 = ($('authUiNewPass2').value || '').trim();
    if(!current || !next || !next2){ alert('Completa todos los campos.'); return; }
    if(next.length < 6){ alert('La nueva clave debe tener al menos 6 caracteres.'); return; }
    if(next !== next2){ alert('La confirmacion no coincide.'); return; }
    try{
      await api('changePassword', { username: auth.user, currentPassword: current, newPassword: next });
      alert('Clave actualizada correctamente.');
      closeModal('authUiChangeModal');
    }catch(err){
      console.error(err);
      alert(err.message || 'No se pudo cambiar la clave.');
    }
  }

  async function openAdminUsers(){
    var auth = getAuth();
    if(!auth || !auth.isAdmin){ alert('Solo los administradores pueden entrar aqui.'); return; }
    openModal('authUiAdminModal');
    await renderUsers();
  }

  async function renderUsers(){
    var auth = getAuth();
    var body = $('authUiUsersBody');
    body.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
    try{
      var resp = await api('listUsers', { adminUsername: auth.user });
      var rows = resp.rows || [];
      if(!rows.length){
        body.innerHTML = '<tr><td colspan="6">No hay usuarios.</td></tr>';
        return;
      }
      body.innerHTML = '';
      rows.forEach(function(u){
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><b>'+esc(u.username)+'</b></td>' +
          '<td>'+esc(u.displayName)+'</td>' +
          '<td>'+(u.isAdmin ? 'Si' : 'No')+'</td>' +
          '<td>'+(u.isActive ? 'Si' : 'No')+'</td>' +
          '<td>'+(u.mustChangePassword ? 'Si' : 'No')+'</td>' +
          '<td><button type="button" class="auth-ui-secondary" data-reset="'+esc(u.username)+'">Resetear clave</button></td>';
        body.appendChild(tr);
      });
      body.querySelectorAll('[data-reset]').forEach(function(btn){
        btn.addEventListener('click', function(){ resetPassword(btn.getAttribute('data-reset')); });
      });
    }catch(err){
      body.innerHTML = '<tr><td colspan="6">'+esc(err.message || 'No se pudo cargar usuarios.')+'</td></tr>';
    }
  }

  async function resetPassword(username){
    var auth = getAuth();
    var next = prompt('Nueva clave temporal para ' + username + ':', '');
    if(!next) return;
    if(next.trim().length < 6){ alert('La clave temporal debe tener al menos 6 caracteres.'); return; }
    try{
      await api('adminResetPassword', {
        adminUsername: auth.user,
        targetUsername: username,
        newPassword: next.trim()
      });
      alert('Clave reseteada para ' + username + '. Ese usuario debera cambiarla al ingresar.');
      await renderUsers();
    }catch(err){
      console.error(err);
      alert(err.message || 'No se pudo resetear la clave.');
    }
  }

  function init(){
    if(!global.AutoCorApi) return;
    mountStyles();
    mountBar();
    mountModals();
    render();
    [100, 500, 1200, 2500].forEach(function(ms){
      setTimeout(scrubUserAutofill, ms);
    });
  }

  global.AutoCorAuthUI = { init: init, render: render, openLogin: function(){ openModal('authUiLoginModal'); } };

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  global.addEventListener('pageshow', function(){ setTimeout(scrubUserAutofill, 50); });
  global.addEventListener('focus', function(){ setTimeout(scrubUserAutofill, 50); });
  document.addEventListener('focusin', function(){ setTimeout(scrubUserAutofill, 50); }, true);
  document.addEventListener('input', function(){ setTimeout(scrubUserAutofill, 0); }, true);
})(window);
