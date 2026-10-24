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
      const panel=document.createElement('section');panel.id='contractEvidence';panel.dataset.workflowUi='true';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Documento de respaldo');panel.setAttribute('aria-modal','true');
      panel.style.cssText='position:fixed;inset:3vh 3vw;z-index:22000;background:white;color:#17212f;display:flex;flex-direction:column;padding:16px;border:1px solid #94a3b8;border-radius:12px;box-shadow:0 0 0 6vw #0009;font:14px Arial';
      const style=document.createElement('style');style.textContent='#contractEvidence .evidence-layout{display:grid;grid-template-columns:minmax(0,3fr) minmax(290px,2fr);gap:18px;min-height:0;flex:1}#contractEvidence .evidence-view,#contractEvidence .evidence-fields{overflow:auto;min-height:0}#contractEvidence .evidence-view{background:#e2e8f0;border-radius:8px}#contractEvidence button{padding:9px 13px;background:#f1f5f9;color:#17212f;border:1px solid #94a3b8;border-radius:7px;cursor:pointer}#contractEvidence label{display:block;font-weight:600;margin:12px 0 5px}#contractEvidence input,#contractEvidence textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid #94a3b8;border-radius:6px;font:14px Arial}#contractEvidence .evidence-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 10px}#contractEvidence .evidence-image{overflow:auto;padding:10px}#contractEvidence img{display:block;max-width:none;height:auto;margin:auto}@media(max-width:760px){#contractEvidence .evidence-layout{grid-template-columns:1fr;grid-template-rows:minmax(180px,1fr) minmax(160px,1fr)}}';panel.appendChild(style);
      const heading=document.createElement('div');heading.className='evidence-toolbar';panel.appendChild(heading);
      const title=document.createElement('h3');title.textContent=label+' · '+global.AutoCorContractDraft.label(tipo);panel.appendChild(title);
      title.style.cssText='margin:0;flex:1';heading.appendChild(title);
      const d=global._contratosData[tipo]||{};
      const canonical=()=>[...document.querySelectorAll('#resultsGrid [data-tipo][data-key]')].filter(e=>e.dataset.tipo===tipo);
      const close=document.createElement('button');close.type='button';close.textContent='Aplicar y cerrar';
      close.onclick=()=>{applyEdits();panel.remove();global.AutoCorContractDraft.refresh();global.dispatchEvent(new Event('autocor-draft-changed'));const input=canonical().find(e=>e.dataset.key===key);if(input){input.scrollIntoView({block:'center'});input.focus();}};heading.appendChild(close);
      const layout=document.createElement('div');layout.className='evidence-layout';panel.appendChild(layout);
      const left=document.createElement('section');left.className='evidence-view';layout.appendChild(left);
      const right=document.createElement('section');right.className='evidence-fields';right.setAttribute('aria-label','Datos del documento');layout.appendChild(right);
      // Confirmar/aplicar debe guardar lo visible, aunque no se haya recibido input.
      const applyEdits=()=>{for(const edit of right.querySelectorAll('[data-evidence-key]')){const input=canonical().find(e=>e.dataset.key===edit.dataset.evidenceKey);if(input&&input.value!==edit.value){input.value=edit.value;global.onFieldEdit(input);}}};
      const original=global._uploadedDocumentOriginals?.[tipo];
      const imgs=original?{frontal:original.dataUrl.startsWith('data:image/')?original.dataUrl:'',reverso:null}:global.pastedImages[tipo]||{};
      const pdf=original?.dataUrl?.startsWith('data:application/pdf;')?original.dataUrl:tipo==='cuv'?global._cuvOriginalBase64:'';
      if(pdf){const object=document.createElement('object');object.type='application/pdf';object.data=pdf;object.setAttribute('aria-label','PDF del documento');object.style.cssText='width:100%;height:100%;min-height:320px';left.appendChild(object);}
      let zoom=100;
      const pictures=[];
      if(imgs.frontal||imgs.reverso){
        const toolbar=document.createElement('div');toolbar.className='evidence-toolbar';toolbar.style.cssText='position:sticky;top:0;background:#e2e8f0;padding:8px;z-index:1';left.appendChild(toolbar);
        const percent=document.createElement('span');percent.textContent='100 %';
        for(const [text,delta] of [['−',-25],['+',25]]){const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',delta<0?'Reducir documento':'Ampliar documento');button.onclick=()=>{zoom=Math.max(50,Math.min(300,zoom+delta));pictures.forEach(img=>img.style.width=zoom+'%');percent.textContent=zoom+' %';};toolbar.appendChild(button);}toolbar.appendChild(percent);
        for(const [side,src] of Object.entries(imgs))if(src){const caption=document.createElement('p');caption.textContent=side==='frontal'?'Frontal':'Reverso';caption.style.margin='10px';left.appendChild(caption);const viewport=document.createElement('div');viewport.className='evidence-image';const img=document.createElement('img');img.src=src;img.alt=caption.textContent+' del documento';img.style.width='100%';pictures.push(img);viewport.appendChild(img);left.appendChild(viewport);}
      }
      if(!pdf&&!pictures.length){const note=document.createElement('p');note.textContent='No hay imagen conservada. Consulta el archivo original para corregir los campos.';left.appendChild(note);if(d._rawText){const pre=document.createElement('pre');pre.textContent=d._rawText;pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;padding:12px';left.appendChild(pre);}}
      for(const source of canonical()){
        const item=document.createElement('div'),name=document.createElement('label');
        name.textContent=(source.closest('.f-item')?.querySelector('.f-label')?.childNodes[0]?.textContent||source.dataset.key).trim();
        const edit=document.createElement(source.tagName==='TEXTAREA'?'textarea':'input');edit.id='evidence-'+source.dataset.key;name.htmlFor=edit.id;edit.value=source.value;edit.dataset.evidenceKey=source.dataset.key;if(edit.tagName==='TEXTAREA')edit.rows=3;
        if(source.closest('.f-item').classList.contains('vc-needs-review'))edit.style.borderColor='#dc2626';
        edit.oninput=()=>{const target=canonical().find(e=>e.dataset.key===source.dataset.key);if(!target)return;target.value=edit.value;global.onFieldEdit(target);global.dispatchEvent(new Event('autocor-draft-changed'));};
        item.append(name,edit);right.appendChild(item);
      }
      const confirm=document.createElement('button');confirm.type='button';confirm.textContent='Confirmar el campo revisado';confirm.style.marginTop='14px';
      confirm.onclick=()=>{applyEdits();const input=canonical().find(e=>e.dataset.key===key);if(input){global.onFieldEdit(input);global.AutoCorContractDraft.refresh();global.dispatchEvent(new Event('autocor-draft-changed'));confirm.textContent='Campo confirmado';}};right.appendChild(confirm);
      panel.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();close.click();}if(e.key==='Tab'){const focusable=[...panel.querySelectorAll('button,input,textarea')];const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
      document.body.appendChild(panel);const selected=right.querySelector('#evidence-'+key);(selected||close).focus();
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
