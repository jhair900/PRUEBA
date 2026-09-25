(function(global){
  'use strict';
  const page=location.pathname.split('/').pop();
  if(!global.AutoCorWork)return;
  const copy=v=>structuredClone(v);
  if(typeof global.renderSupportPrints==='function'){
    const renderPrints=global.renderSupportPrints;
    global.renderSupportPrints=function(){const result=renderPrints.apply(this,arguments);global.dispatchEvent(new Event('autocor-draft-changed'));return result;};
  }
  const contactValues=()=>Object.fromEntries([...document.querySelectorAll('input[id^="gen"],select[id^="gen"],textarea[id^="gen"],input[id^="gp"],select[id^="gp"],textarea[id^="gp"]')].map(e=>[e.id,e.value]));
  if(page==='contratos.html'){
    global.AutoCorWork.register({module:'contratos',
      saves:[['ejecutarGenerarContratos','Guardando y generando contratos'],['ejecutarGuardarProceso','Guardando proceso']],
      plate:s=>s.data.cuv?.placa || s.data.matricula?.placa || s.data.notaria?.placa || '',
      capture:()=>Object.assign(global.AutoCorContractDraft.capture(), {contacts:contactValues(),pending:global.AutoCorWork.captureDrive()}),
      restore:s=>{
        global.AutoCorContractDraft.restore(s);
        Object.entries(s.contacts||{}).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.value=value;});
        global.AutoCorWork.restoreDrive(s.pending);
      }
    });
    global.verRespaldoContrato=function(tipo,key,label){
      let old=document.getElementById('contractEvidence');if(old)old.remove();
      const panel=document.createElement('section');panel.id='contractEvidence';panel.dataset.workflowUi='true';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Documento de respaldo');
      panel.style.cssText='position:fixed;inset:5vh 5vw;z-index:22000;background:white;color:#17212f;overflow:auto;padding:20px;border:1px solid #94a3b8;border-radius:12px;box-shadow:0 0 0 6vw #0006;font:14px Arial';
      const title=document.createElement('h3');title.textContent=label+' · '+global.AutoCorContractDraft.label(tipo);panel.appendChild(title);
      const d=global._contratosData[tipo]||{},value=document.createElement('p');
      value.textContent='Valor: '+(d[key]||'No detectado')+' · Origen: '+(d._origins?.[key]||d._source||'sin determinar')+'. Comprueba el documento antes de corregir este campo.';panel.appendChild(value);
      const close=document.createElement('button');close.type='button';close.textContent='Volver al campo para revisarlo';
      close.onclick=()=>{panel.remove();const input=[...document.querySelectorAll('[data-tipo][data-key]')].find(e=>e.dataset.tipo===tipo&&e.dataset.key===key);if(input){const body=input.closest('.result-block-body');if(body)body.classList.add('open');input.scrollIntoView({block:'center'});input.focus();}};panel.appendChild(close);
      if(d[key]){
        const confirmField=document.createElement('button');confirmField.type='button';confirmField.textContent='Confirmar este dato tras revisar el documento';
        confirmField.onclick=()=>{
          const input=[...document.querySelectorAll('[data-tipo][data-key]')].find(e=>e.dataset.tipo===tipo&&e.dataset.key===key);
          if(input){global.onFieldEdit(input);global.dispatchEvent(new Event('autocor-draft-changed'));close.click();}
        };panel.appendChild(confirmField);
      }
      const imgs=global.pastedImages[tipo]||{};
      [imgs.frontal,imgs.reverso].filter(Boolean).forEach(src=>{const img=document.createElement('img');img.src=src;img.alt='Documento '+global.AutoCorContractDraft.label(tipo);img.style.cssText='display:block;max-width:100%;margin-top:12px';panel.appendChild(img);});
      if(d._rawText){const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;background:#f1f5f9;padding:12px';pre.textContent=d._rawText;panel.appendChild(pre);}
      if(!imgs.frontal&&!imgs.reverso&&!d._rawText){const note=document.createElement('p');note.textContent='No hay una imagen conservada para este documento. Consulta el archivo original.';panel.appendChild(note);}
      document.body.appendChild(panel);close.focus();
    };
  }else if(page==='pagos.html' || page==='ventas.html'){
    const isPago=page==='pagos.html';
    global.AutoCorWork.register({module:isPago?'pagos':'ventas',saves:[['guardarYExportarTodo','Guardando y exportando']],
      plate:s=>s.data.placaValue,
      capture:()=>({data:isPago?obtenerDatosPago():obtenerDatosVenta(),prints:copy(supportPrints)}),
      restore:s=>{if(isPago)cargarFormularioPago(s.data);else cargarFormularioVenta(s.data);supportPrints=copy(s.prints||[]);renderSupportPrints();}
    });
  }else if(page==='liquidacion.html'){
    global.AutoCorWork.register({module:'liquidacion',saves:[['preparePrint','Guardando e imprimiendo'],['guardar','Guardando liquidación']],
      plate:s=>s.data.placa,
      capture:()=>({data:obtenerDatos(),prints:copy(supportPrints)}),
      restore:s=>{cargarFormularioDesdeData(s.data,s.data.placa);supportPrints=copy(s.prints||[]);renderSupportPrints();calcular();}
    });
  }
})(window);
