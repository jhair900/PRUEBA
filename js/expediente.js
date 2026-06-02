/* ══════════════════════════════════════════════════════════════════
   expediente.js — Capa compartida del "expediente por placa"
   Lee la hoja Contratos como fuente única y permite autollenar
   formularios en Liquidación, Pagos y Ventas.
   Expone window.Expediente = {
     cargarPorPlaca, estadoPorPlaca, autollenar, mostrarBadge
   }
   ══════════════════════════════════════════════════════════════════ */
(function(global){
  'use strict';

  const GAS_URL = 'https://script.google.com/macros/s/AKfycbxbh1cLzulwNeFHJj2c6_k6Yk4PyHhzTlFlcfW7M0SMz4NrAxKUagOweQobl4AJTcmQ/exec';

  function _getToken(){
    try { return (JSON.parse(sessionStorage.getItem('autocor_auth')||'{}')).token || ''; }
    catch(_){ return ''; }
  }

  /* POST al Apps Script con text/plain para evitar preflight CORS. */
  async function _post(action, payload){
    const body = Object.assign({ action: action, sessionToken: _getToken() }, payload||{});
    const resp = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
    return resp.json();
  }

  /* ── cargarPorPlaca(placa) ────────────────────────────────────
     Devuelve { ok, data, message }. data es el JSON completo del
     expediente guardado por contratos.html (mismo shape). */
  async function cargarPorPlaca(placa){
    const p = String(placa||'').replace(/\s/g,'').toUpperCase();
    if(!p) return { ok:false, message:'placa vacía' };
    try {
      return await _post('getContratoByPlaca', { placa: p });
    } catch(err){
      return { ok:false, message:'error de red: '+err.message };
    }
  }

  /* ── estadoPorPlaca(placa) ────────────────────────────────────
     Consulta en paralelo a las 4 hojas y devuelve qué etapas tienen
     registro para esa placa. Útil para el dashboard. */
  async function estadoPorPlaca(placa){
    const p = String(placa||'').replace(/\s/g,'').toUpperCase();
    const vacio = { ok:false };
    if(!p){
      return { placa:'', contratos:false, liquidacion:false, pagos:false, ventas:false,
               _contratos:null, _liquidacion:null, _pagos:null, _ventas:null };
    }
    const [c, l, pa, v] = await Promise.all([
      _post('getContratoByPlaca', { placa: p }).catch(function(){ return vacio; }),
      _post('getByPlaca',         { placa: p }).catch(function(){ return vacio; }),
      _post('getPagoByPlaca',     { placa: p }).catch(function(){ return vacio; }),
      _post('getVentaByPlaca',    { placa: p }).catch(function(){ return vacio; })
    ]);
    return {
      placa:        p,
      contratos:    !!c.ok,
      liquidacion:  !!l.ok,
      pagos:        !!pa.ok,
      ventas:       !!v.ok,
      _contratos:   c.data || null,
      _liquidacion: l.data || null,
      _pagos:       pa.data || null,
      _ventas:      v.data || null
    };
  }

  /* Resuelve "a.b.c" sobre el objeto datos. */
  function _resolverValor(datos, path){
    if(!datos || !path) return '';
    const parts = String(path).split('.');
    let v = datos;
    for(let i=0; i<parts.length; i++){
      if(v === null || v === undefined) return '';
      v = v[parts[i]];
    }
    return v == null ? '' : v;
  }

  /* ── autollenar(idMap, datos, opts) ───────────────────────────
     idMap = { idDelInput: 'campoEnDatos' }  (campo soporta "a.b.c")
     opts.sobrescribir = true para reemplazar valores existentes.
     Devuelve cuántos campos rellenó. */
  function autollenar(idMap, datos, opts){
    opts = opts || {};
    const forzar = !!opts.sobrescribir;
    let n = 0;
    Object.keys(idMap||{}).forEach(function(idInput){
      const el = document.getElementById(idInput);
      if(!el) return;
      const val = _resolverValor(datos, idMap[idInput]);
      if(val === '' || val === null || val === undefined) return;
      if(!forzar && el.value && String(el.value).trim() !== '') return;
      el.value = val;
      el.classList.add('expediente-autollenado');
      // disparar eventos por si el formulario escucha cambios
      try {
        el.dispatchEvent(new Event('input',  { bubbles:true }));
        el.dispatchEvent(new Event('change', { bubbles:true }));
      } catch(_){ }
      n++;
    });
    return n;
  }

  /* ── mostrarBadge ─────────────────────────────────────────────
     Inserta un badge discreto sobre un contenedor para indicar
     que se autocompletó información desde el expediente. */
  function mostrarBadge(containerOrId, mensaje){
    const c = typeof containerOrId === 'string'
      ? document.getElementById(containerOrId)
      : containerOrId;
    if(!c) return;
    let badge = c.querySelector(':scope > .expediente-badge');
    if(!badge){
      badge = document.createElement('div');
      badge.className = 'expediente-badge';
      badge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:#dbeafe;color:#1e40af;font-size:12px;font-weight:700;margin:8px 0;border:1px solid #93c5fd;';
      c.insertBefore(badge, c.firstChild);
    }
    badge.textContent = '✓ ' + (mensaje || 'Datos cargados desde el expediente de Contratos');
    badge.style.opacity = '1';
    setTimeout(function(){ badge.style.transition = 'opacity .6s'; badge.style.opacity = '0.55'; }, 6000);
  }

  global.Expediente = {
    cargarPorPlaca: cargarPorPlaca,
    estadoPorPlaca: estadoPorPlaca,
    autollenar:     autollenar,
    mostrarBadge:   mostrarBadge
  };

  /* Estilo base para campos autollenados (solo se inyecta una vez) */
  if(!document.getElementById('expediente-style')){
    const st = document.createElement('style');
    st.id = 'expediente-style';
    st.textContent =
      '.expediente-autollenado{background:#eff6ff !important;border-color:#93c5fd !important;}'
      +'.expediente-autollenado:focus{background:#fff !important;}';
    (document.head || document.documentElement).appendChild(st);
  }

})(window);
