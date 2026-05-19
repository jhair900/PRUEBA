/* ══════════════════════════════════════════════════════════════════
   generador-contratos.js  —  Generación de contratos Word desde
   los datos validados en contratos.html
   Requiere: PizZip, docxtemplater, contrato-templates.js
   ══════════════════════════════════════════════════════════════════ */
(function(global){
  'use strict';

  /* ── Utilidades ──────────────────────────────────────────────── */

  const MESES = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];

  function fechaHoy(){
    var d = new Date();
    return {
      dia:  String(d.getDate()).padStart(2,'0'),
      mes:  MESES[d.getMonth()],
      anio: String(d.getFullYear())
    };
  }

  function numeroATexto(n){
    // Convierte número entero a texto en español (hasta 999 999)
    var unidades = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
                    'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete',
                    'dieciocho','diecinueve','veinte','veintiuno','veintidós','veintitrés',
                    'veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
    var decenas = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
    var centenas = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos',
                    'seiscientos','setecientos','ochocientos','novecientos'];
    function menorMil(x){
      if(x===0) return '';
      if(x===100) return 'cien';
      if(x<30) return unidades[x];
      if(x<100){
        var d=Math.floor(x/10), u=x%10;
        return u===0 ? decenas[d] : decenas[d]+' y '+unidades[u];
      }
      var c=Math.floor(x/100), r=x%100;
      return centenas[c]+(r>0?' '+menorMil(r):'');
    }
    n = Math.round(n);
    if(n===0) return 'cero';
    var miles = Math.floor(n/1000), resto = n%1000;
    var txt = '';
    if(miles===1) txt = 'mil';
    else if(miles>1) txt = menorMil(miles)+' mil';
    if(resto>0) txt += (txt?' ':'')+menorMil(resto);
    return txt.toUpperCase();
  }

  function valorATexto(valorStr){
    // "19040,00" → "DIECINUEVE MIL CUARENTA"
    var partes = String(valorStr).replace(/\./g,'').replace(',','.').split('.');
    var entero = parseInt(partes[0]||0, 10);
    var cents  = parseInt((partes[1]||'00').substring(0,2), 10);
    var txt = numeroATexto(entero);
    if(cents>0) txt += ' CON '+String(cents).padStart(2,'0')+'/100';
    return txt;
  }

  function normalizarNombre(nombre){
    return String(nombre||'').toUpperCase().trim();
  }

  /* ── Recopilar datos validados ───────────────────────────────── */

  function recopilarDatos(extra){
    var datos = global._contratosData || {};
    var ced  = datos['cedula-prop'] || {};
    var cony = datos['cedula-cony'] || {};
    var cuv  = datos['cuv']         || {};
    var matr = datos['matricula']   || {};
    var not  = datos['notaria']     || {};

    // Nombre propietario: apellidos + nombres
    var apellidos = ced.apellidos || '';
    var nombres   = ced.nombres   || '';
    var nombreProp = apellidos && nombres
      ? normalizarNombre(apellidos + ' ' + nombres)
      : normalizarNombre(ced.propietario || cuv.propietario || matr.propietario || '');

    // Datos vehículo: prioridad cuv > matrícula > notaría
    // Busca el campo en las tres fuentes con múltiples nombres alternativos
    function pick(){
      var campos = Array.prototype.slice.call(arguments);
      var fuentes = [cuv, matr, not];
      for(var fi=0; fi<fuentes.length; fi++){
        var src = fuentes[fi] || {};
        for(var ci=0; ci<campos.length; ci++){
          var v = src[campos[ci]];
          if(v && String(v).trim()) return String(v).trim();
        }
      }
      return '';
    }

    var placa   = pick('placa');
    var marca   = pick('marca');
    var modelo  = pick('modelo');
    var color   = pick('color');
    var anio    = pick('anio');
    var chasis  = pick('chasis', 'serialChasis', 'vin');
    var motor   = pick('motor', 'numeroMotor');

    var estadoCivil = normalizarNombre(
      ced.estadoCivil || cuv.estadoCivil || matr.estadoCivil || ''
    );
    var nacionalidad = normalizarNombre(
      ced.nacionalidad || cuv.nacionalidad || matr.nacionalidad || 'ECUATORIANA'
    );
    var ciProp = ced.numeroCedula || ced.cedulaRuc || cuv.cedula || matr.cedulaRuc || '';

    // Cónyuge
    var nombreCony = '';
    var ciCony = '';
    var nacionalidadCony = 'ECUATORIANA';
    if(cony && (cony.apellidos || cony.nombres || cony.propietario)){
      var capCony = cony.apellidos || '';
      var nomCony = cony.nombres   || '';
      nombreCony = capCony && nomCony
        ? normalizarNombre(capCony+' '+nomCony)
        : normalizarNombre(cony.propietario || '');
      ciCony = cony.numeroCedula || cony.cedulaRuc || '';
      nacionalidadCony = normalizarNombre(cony.nacionalidad || 'ECUATORIANA');
    }

    var fecha = fechaHoy();

    // Valor en texto
    var valorNum  = (extra.valorNum  || '').replace(/\./g,'').replace(',','.');
    var valorText = valorNum ? valorATexto(parseFloat(valorNum)||0) : '';
    var valorDisp = (extra.valorNum  || '').replace('.',','); // mostrar con coma decimal

    return {
      NOMBRE_PROP:          nombreProp || '___________________',
      CI_PROP:              ciProp     || '___________',
      ESTADO_CIVIL_PROP:    estadoCivil|| '___________',
      NACIONALIDAD_PROP:    nacionalidad,
      DOMICILIO_PROP:       normalizarNombre(extra.domicilio || 'QUITO'),
      TELEFONO_PROP:        extra.telefonoProp || '___________',
      EMAIL_PROP:           extra.emailProp    || '___________',

      NOMBRE_CONY:          nombreCony         || '___________________',
      CI_CONY:              ciCony             || '___________',
      NACIONALIDAD_CONY:    nacionalidadCony,
      TELEFONO_CONY:        extra.telefonoCony || '___________',
      EMAIL_CONY:           extra.emailCony    || '___________',

      PLACA:                placa   || '___________',
      MARCA:                marca   || '___________',
      MODELO:               modelo  || '___________',
      COLOR:                color   || '___________',
      ANIO:                 anio    || '____',
      CHASIS:               chasis  || '___________________',
      MOTOR:                motor   || '___________________',
      KM:                   extra.km        || '______',
      VALOR_NUM:            valorDisp       || '___________',
      VALOR_TEXT:           valorText       || '___________',
      CODIGO_ENCARGO:       'AC - '+(placa||'_________'),

      FECHA_DIA:            extra.fechaDia  || fecha.dia,
      FECHA_MES:            extra.fechaMes  || fecha.mes,
      FECHA_ANIO:           extra.fechaAnio || fecha.anio,
      FECHA_CONTRATO_DIA:   extra.fechaDia  || fecha.dia,
      FECHA_CONTRATO_MES:   extra.fechaMes  || fecha.mes,
      FECHA_CONTRATO_ANIO:  extra.fechaAnio || fecha.anio,
    };
  }

  /* ── Selección de plantilla ──────────────────────────────────── */

  function esPlantillaCasados(estadoCivil){
    var ec = String(estadoCivil||'').toUpperCase().trim();
    return ec === 'CASADO' || ec === 'CASADA';
  }

  /* ── Generar docx con docxtemplater ─────────────────────────── */

  function generarDocx(templateBase64, variables){
    var binStr = atob(templateBase64);
    var bytes  = new Uint8Array(binStr.length);
    for(var i=0;i<binStr.length;i++) bytes[i]=binStr.charCodeAt(i);

    // docxtemplater se expone como window.docxtemplater o window.Docxtemplater según la versión del build
    var DocxTpl = global.Docxtemplater || global.docxtemplater;
    if(!DocxTpl) throw new Error('Librería docxtemplater no cargada.');
    if(!global.PizZip)  throw new Error('Librería PizZip no cargada.');

    var zip = new global.PizZip(bytes.buffer);
    var doc = new DocxTpl(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' }
    });
    doc.setData(variables);
    try {
      doc.render();
    } catch(e){
      console.error('[Contratos] Error docxtemplater:', e);
      throw new Error('Error al generar el contrato: '+e.message);
    }
    return doc.getZip().generate({ type:'arraybuffer' });
  }

  function descargarDocx(buffer, nombreArchivo){
    var blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href   = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  /* ── Función principal ───────────────────────────────────────── */

  function generarContratos(extra){
    var templates = global.CONTRATO_TEMPLATES;
    if(!templates){
      throw new Error('Plantillas no cargadas. Asegúrate de incluir contrato-templates.js.');
    }
    if(!global.PizZip || (!global.Docxtemplater && !global.docxtemplater)){
      throw new Error('Faltan librerías PizZip / Docxtemplater. Verifica la conexión a internet para cargar las CDN.');
    }

    var vars   = recopilarDatos(extra);
    var casado = esPlantillaCasados(vars.ESTADO_CIVIL_PROP);
    var encKey = casado ? 'encargo-casado' : 'encargo-soltero';
    var fecha  = vars.FECHA_DIA+'-'+vars.FECHA_MES.substring(0,3).toUpperCase()+'-'+vars.FECHA_ANIO;
    var placa  = vars.PLACA.replace(/[^A-Z0-9]/gi,'') || 'CONTRATO';

    console.log('[Contratos] Generando para', vars.NOMBRE_PROP, '| Estado civil:', vars.ESTADO_CIVIL_PROP, '| Plantilla encargo:', encKey);

    // 1. Encargo Fiduciario
    var bufEnc = generarDocx(templates[encKey], vars);
    descargarDocx(bufEnc, 'Encargo_Fiduciario_'+placa+'_'+fecha+'.docx');

    // 2. Contrato Prestación de Servicios
    var bufPre = generarDocx(templates['prestacion-quito'], vars);
    descargarDocx(bufPre, 'Prestacion_Servicios_'+placa+'_'+fecha+'.docx');

    return { encargo: encKey, vars: vars };
  }

  /* ── Exponer ─────────────────────────────────────────────────── */
  global.generarContratos     = generarContratos;
  global._valorATextoHelper   = valorATexto;

})(window);
