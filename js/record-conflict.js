// Comparacion explicita antes de reemplazar una version que el formulario no habia leido.
(function(global){
  'use strict';
  const managed = new Set(['historialUsuarios', 'asesorCreador', 'asesorEditor', 'asesor', 'fechaActualizacion',
    'historialEstados', 'estadoProceso', 'estadoActualizadoEn', 'estadoActualizadoPor', 'observacionEstado', 'drive']);
  const names = {placaValue: 'Placa', cedulaPropietario: 'Cédula del propietario', propietario: 'Propietario',
    clienteValue: 'Cliente', responsableValue: 'Responsable', dictamenValue: 'Dictamen',
    telefonoProp: 'Teléfono del propietario', emailProp: 'Correo del propietario', valorNum: 'Valor', km: 'Kilometraje'};
  function label(key){
    return names[key] || key.replace(/Value$/, '').replace(/([a-záéíóú])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  }
  function fields(value, prefix, output){
    Object.keys(value || {}).forEach(function(key){
      if(key.startsWith('_') || (!prefix && managed.has(key))) return;
      const name = prefix ? prefix + ' / ' + label(key) : label(key);
      const item = value[key];
      if(item && typeof item === 'object') fields(item, name, output);
      else output[name] = item == null ? '' : typeof item === 'boolean' ? (item ? 'Sí' : 'No') : String(item);
    });
    return output;
  }
  function review(current, proposed){
    return new Promise(function(resolve){
      const dialog = document.createElement('dialog');
      dialog.style.cssText = 'width:min(960px,92vw);max-height:85vh;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:24px;font:14px system-ui;color:#172033';
      const title = document.createElement('h2');
      title.textContent = 'Revisar cambios antes de guardar';
      const info = document.createElement('p');
      info.textContent = 'La placa ya tiene un registro o fue modificada por otra persona. Compara las diferencias. Reemplazar guarda los datos de tu formulario sobre la versión que se muestra aquí. Cancelar conserva tu formulario sin guardar.';
      const scroll = document.createElement('div');
      scroll.style.cssText = 'max-height:50vh;overflow:auto';
      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;table-layout:fixed';
      const head = table.createTHead().insertRow();
      ['Campo', 'Guardado actualmente', 'Tu formulario'].forEach(function(text){
        const th = document.createElement('th'); th.textContent = text;
        th.style.cssText = 'text-align:left;padding:10px;background:#edf2f7'; head.appendChild(th);
      });
      const before = fields(current, '', {}), after = fields(proposed, '', {});
      const keys = Array.from(new Set(Object.keys(before).concat(Object.keys(after))));
      const tbody = table.createTBody();
      keys.filter(function(key){ return (before[key] || '') !== (after[key] || ''); }).forEach(function(key){
        const row = tbody.insertRow();
        [key, before[key] || '—', after[key] || '—'].forEach(function(text){
          const cell = row.insertCell(); cell.textContent = text;
          cell.style.cssText = 'padding:10px;border-bottom:1px solid #ddd;white-space:pre-wrap;overflow-wrap:anywhere';
        });
      });
      if(!tbody.rows.length){
        const cell = tbody.insertRow().insertCell(); cell.colSpan = 3;
        cell.textContent = 'No hay diferencias en los campos comparables. El registro tiene una versión de guardado distinta.';
      }
      scroll.appendChild(table);
      const actions = document.createElement('div'); actions.style.cssText = 'display:flex;gap:12px;justify-content:flex-end;margin-top:20px';
      function finish(answer){ dialog.close(); dialog.remove(); resolve(answer); }
      [['Cancelar', false], ['Reemplazar con mi formulario', true]].forEach(function(entry){
        const button = document.createElement('button'); button.type = 'button'; button.textContent = entry[0];
        button.style.cssText = 'padding:10px 16px;border:1px solid #aab5c5;border-radius:8px;cursor:pointer';
        button.addEventListener('click', function(){ finish(entry[1]); }); actions.appendChild(button);
      });
      dialog.addEventListener('cancel', function(event){ event.preventDefault(); finish(false); });
      dialog.append(title, info, scroll, actions); document.body.appendChild(dialog); dialog.showModal();
      actions.firstChild.focus();
    });
  }
  global.AutoCorConflict = {review: review};
})(window);
