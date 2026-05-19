/* ══════════════════════════════════════════════════════════════════
   cuv-parser.js  —  Módulo compartido de extracción CUV ANT Ecuador
   v4  (2026)  —  Requiere PDF.js 3.11.174
   Expone en window: parseCUV, cuvIsValidValue, CUV_ETIQUETAS,
                     CUV_MARCAS, CUV_COLORES, leerPdfTexto
   ══════════════════════════════════════════════════════════════════ */
(function(global){
  'use strict';

  /* ── PDF.js worker ─────────────────────────────────────────────── */
  if(global.pdfjsLib){
    global.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  /* ── Constantes de dominio ─────────────────────────────────────── */
  const CUV_ETIQUETAS = [
    'VIN','MARCA','MODELO','COLOR','MOTOR','CHASIS','CLASE','TIPO',
    'SERVICIO','CILINDRAJE','COMBUSTIBLE','TONELAJE','RANV','PAIS',
    'ORIGEN','DATOS','MATRICULACION','MATRICULA','PROPIETARIO',
    'NOMBRES','DOCUMENTO','IDENTIDAD','VIGENCIA','LUGAR','CANAL',
    'EMISION','SOLICITUD','INFORMACION','GRAVAMENES','BLOQUEOS',
    'INFRACCIONES','CERTIFICADO','VEHICULAR','AGENCIA','NACIONAL',
    'TRANSITO','NUMERO','PLACAS'
  ];

  const CUV_MARCAS = [
    'TOYOTA','VOLKSWAGEN','CHEVROLET','HYUNDAI','KIA','NISSAN',
    'MAZDA','FORD','RENAULT','PEUGEOT','FIAT','HONDA','MITSUBISHI',
    'SUZUKI','SUBARU','JEEP','DODGE','CHRYSLER','BMW','MERCEDES',
    'AUDI','VOLVO','LAND ROVER','LEXUS','INFINITI','ACURA','ISUZU',
    'DAIHATSU','MAHINDRA','FOTON','DFSK','CHERY','GREAT WALL',
    'JAC','HAVAL','LIFAN','ZOTYE','BRILLIANCE','BYD','GEELY',
    'SSANGYONG','SEAT','SKODA','OPEL','CITROEN','ALFA ROMEO',
    'MASERATI','FERRARI','LAMBORGHINI','PORSCHE','MINI','SMART',
    'HINO','KENWORTH','FREIGHTLINER','INTERNATIONAL','MACK',
    'VOLVO TRUCK','IVECO','MAN','DAF','SCANIA','MERCEDES BENZ'
  ];

  const CUV_COLORES = [
    'BLANCO','NEGRO','ROJO','AZUL','GRIS','PLATEADO','PLATA',
    'CAFE','MARRON','VERDE','AMARILLO','DORADO','BEIGE','NARANJA',
    'MORADO','VIOLETA','TURQUESA','CELESTE','CREMA','VINO',
    'GRANATE','ARENA','PLOMO','PERLA','CHAMPAN','MULTICOLOR',
    'BLANCO PERLA','GRIS OSCURO','GRIS CLARO','AZUL OSCURO',
    'VERDE OSCURO','ROJO OSCURO','CAFE OSCURO'
  ];

  /* ── cuvIsValidValue ───────────────────────────────────────────── */
  function cuvIsValidValue(valor, campo){
    if(valor === null || valor === undefined) return false;
    const v = String(valor).trim();
    if(!v) return false;
    if(/^no\s+registrad[oa]$/i.test(v)) return false;
    if(v.includes(':')) return false;
    const maxLenMap = {
      placa:8, marca:35, modelo:60, anio:4, color:30,
      chasis:20, motor:25, propietario:80, cedula:15
    };
    const maxLen = maxLenMap[campo] || 80;
    if(v.length > maxLen) return false;
    const RUIDO = [
      'lugar / canal','valor del servicio','solicitud','vigencia',
      'lugar y canal','datos de matriculaci','informaci',
      'certif','agencia nacional','transito','certificado'
    ];
    const vl = v.toLowerCase();
    for(const r of RUIDO){ if(vl.includes(r)) return false; }
    const vUP = v.toUpperCase().replace(/\s+/g,' ').trim();
    if(CUV_ETIQUETAS.includes(vUP)) return false;
    return true;
  }

  /* ── parseCUV(textoPdf) ────────────────────────────────────────── */
  function parseCUV(textoPdf){
    const ETIQUETAS_CONOCIDAS = CUV_ETIQUETAS;
    const MARCAS_CONOCIDAS    = CUV_MARCAS;
    const COLORES_VALIDOS     = CUV_COLORES;
    const isValidValue        = cuvIsValidValue;

    const lines = textoPdf
      .replace(/\r\n/g,'\n').replace(/\r/g,'\n')
      .split('\n').map(l => l.trim()).filter(Boolean);
    const flat = lines.join(' ');

    console.group('[CUV] parseCUV v4 — inicio');
    console.log('[CUV] Total líneas:', lines.length);
    console.log('[CUV] Primeras 40 líneas:\n', lines.slice(0,40).join('\n'));

    const idxPropBlock = lines.findIndex(l =>
      /DATOS\s+DEL\s+PROPIETARIO/i.test(l) ||
      /INFORMACI[OÓ]N\s+DEL\s+PROPIETARIO/i.test(l)
    );
    const bloqueVehiculo = (idxPropBlock > 0 ? lines.slice(0, idxPropBlock) : lines).join(' ');
    const bloqueProp     = (idxPropBlock > 0 ? lines.slice(idxPropBlock)    : lines).join(' ');

    const idxMatrBlock = lines.findIndex(l =>
      /DATOS\s+DE\s+MATRICULACI[OÓ]N/i.test(l) ||
      /INFORMACI[OÓ]N\s+DE\s+MATRICULACI[OÓ]N/i.test(l)
    );
    const linesMatr  = idxMatrBlock >= 0 ? lines.slice(idxMatrBlock, idxMatrBlock + 30) : [];
    const bloqueMatr = linesMatr.join(' ');
    const linesProp  = idxPropBlock >= 0 ? lines.slice(idxPropBlock, idxPropBlock + 20) : lines;

    function buscarEnWhitelist(lista, fuente){
      const src = Array.isArray(fuente) ? fuente.join(' ') : fuente;
      for(const item of lista){
        const re = new RegExp('(?:^|\\s)' + item.replace(/[\-\/]/g,'[\\-\\/]') + '(?:\\s|$)', 'i');
        if(re.test(src)) return item;
      }
      return '';
    }
    function primerCandidato(candidatos, campo){
      for(const c of candidatos){
        if(!c) continue;
        const v = String(c).trim();
        if(isValidValue(v, campo)){
          console.log(`[CUV] ✔ ${campo} = "${v}"`);
          return v;
        } else {
          console.log(`[CUV] ✗ ${campo} rechazado: "${v}"`);
        }
      }
      console.log(`[CUV] — ${campo}: sin candidato válido`);
      return '';
    }

    const d = {};

    /* PLACA */
    {
      const SIGLAS_EXCLUIR = /^(CUV|ANT|RUC|CED|PAS|NUM|NRO)/;
      const candidatos = [];
      const re = /\b([A-Z]{2,3}\d{3,4})\b/g; let m;
      while((m = re.exec(flat)) !== null){
        const c = m[1].toUpperCase();
        if(!SIGLAS_EXCLUIR.test(c)) candidatos.push(c);
      }
      const mEt = flat.match(/Placas?\s*:\s*([A-Z]{2,3}\s*\d{3,4}[A-Z]?)/i);
      const cEt = mEt ? mEt[1].replace(/\s/g,'').toUpperCase() : null;
      d.placa = primerCandidato([cEt, ...candidatos], 'placa');
    }

    /* VIN / CHASIS */
    {
      const vins = []; const re = /\b([A-HJ-NPR-Z0-9]{17})\b/g; let m;
      while((m = re.exec(flat)) !== null){
        const v = m[1].toUpperCase();
        if(!/^\d{17}$/.test(v)) vins.push(v);
      }
      const unicos = [...new Set(vins)];
      console.log('[CUV] VIN candidatos:', unicos);
      d.chasis = primerCandidato(unicos, 'chasis');
    }

    /* MOTOR */
    {
      const mEt = bloqueVehiculo.match(/N[úu]mero\s+de\s+[Mm]otor\s*:\s*([A-Z0-9]{6,20})\b/i);
      const cEt = mEt ? mEt[1].toUpperCase() : null;
      const EXCLUIR = new Set([...ETIQUETAS_CONOCIDAS,
        'RANV','TONELAJE','REGISTRADO','SERVICIO','CLASE',
        'PARTICULAR','GASOLINA','DIESEL','HIBRIDO','ELECTRICO']);
      const candidatos = []; const re = /\b([A-Z]{1,6}\d{3,15}[A-Z0-9]{0,6}|[A-Z0-9]{2,6}\d{4,12}[A-Z0-9]{0,5})\b/g; let m;
      while((m = re.exec(bloqueVehiculo)) !== null){
        const c = m[1].toUpperCase();
        if(!/[A-Z]/.test(c)||!/[0-9]/.test(c)) continue;
        if(c===d.chasis||c===d.placa) continue;
        if(EXCLUIR.has(c)) continue;
        if(c.length<6||c.length>20) continue;
        candidatos.push(c);
      }
      const unicos = [...new Set(candidatos)];
      console.log('[CUV] Motor candidatos:', unicos);
      d.motor = primerCandidato([cEt, ...unicos], 'motor') || '';
    }

    /* MARCA */
    {
      const mEt = bloqueVehiculo.match(/Marca\s*:\s*([A-Z][A-Z\s]{1,30}?)(?=\s+(?:Modelo|Color|Clase|Tipo|VIN|A[ñn]o|N[úu]m|\d))/i)
               || bloqueVehiculo.match(/Marca\s*:\s*([A-Z][A-Z\-\.]{1,30})\b/i);
      let cEt = mEt ? mEt[1].trim().toUpperCase() : null;
      if(cEt && ETIQUETAS_CONOCIDAS.includes(cEt)) cEt = null;
      const marcaLista = buscarEnWhitelist(MARCAS_CONOCIDAS, bloqueVehiculo);
      d.marca = primerCandidato([cEt, marcaLista], 'marca');
    }

    /* MODELO */
    {
      const RE_SEÑAL = /\b(?:AC|[45]P|4X[24]|TM|TA|AT|MT|HYBRID|HEV|TSS|AWD|FWD|4WD|\d+\.\d)\b/i;
      // Patrón de parada: cualquiera de los nombres de campo que siguen al modelo en el CUV
      const RE_STOP_MODELO = /(?=\s+(?:Marca|Color|Clase|Tipo|Serv(?:icio)?|A[ñn]o|VIN|N[úu]mero|Chasis|Motor|Placa|Pa[íi]s|Combustible|Cilindraje|Propietario|Datos|Matr[íi]cula)\b)/i;
      const mEt =
        // 1) Con parada ante 2+ espacios o ante la siguiente etiqueta de campo
        bloqueVehiculo.match(/Modelo\s*:\s*([A-Z0-9][A-Z0-9\s\-\.\/]{2,59}?)(?:\s{2,}|(?=\s+(?:Marca|Color|Clase|A[ñn]o|VIN|N[úu]m)))/i) ||
        // 2) Fallback con parada explícita ante cualquier etiqueta CUV conocida
        bloqueVehiculo.match(/Modelo\s*:\s*([A-Z0-9][A-Z0-9\s\-\.\/]{2,59}?)(?=\s+(?:Marca|Color|Clase|Tipo|Serv(?:icio)?|A[ñn]o|VIN|N[úu]mero|Chasis|Motor|Placa|Pa[íi]s|Combustible|Cilindraje|Propietario|Datos|Matr[íi]cula)\b|$)/i);
      let cEt = mEt ? mEt[1].trim() : null;
      if(cEt && (ETIQUETAS_CONOCIDAS.includes(cEt.toUpperCase()) ||
                 /^(N[úu]mero|VIN|Chasis|NO\s+REGISTR)/i.test(cEt))) cEt = null;
      let modeloLibre = '';
      // Fallback por señal de formato solo si la extracción etiquetada falló
      if(!cEt){
        const lineasVeh = idxPropBlock > 0 ? lines.slice(0, idxPropBlock) : lines;
        for(const linea of lineasVeh){
          const l = linea.trim().toUpperCase();
          if(!RE_SEÑAL.test(l)||l.length<6||l.length>65) continue;
          if(d.chasis&&l.includes(d.chasis)) continue;
          if(d.motor&&l.includes(d.motor))   continue;
          if(/^[\d\s\.\-\/]+$/.test(l)) continue;
          // Descartar líneas que contengan palabras de etiqueta CUV (evita capturar texto de otro campo)
          if(ETIQUETAS_CONOCIDAS.some(e => new RegExp('\\b'+e+'\\b').test(l))) continue;
          modeloLibre = linea.trim().toUpperCase();
          break;
        }
      }
      d.modelo = primerCandidato([cEt, modeloLibre], 'modelo');
    }

    /* AÑO ─ versión robusta para evitar falso positivo del año actual
     *
     * Problema corregido: el CUV emitido por la ANT incluye en su cabecera
     * la fecha de emisión (ej: "07 de Mayo del 2026" ó "07/05/2026 14:30").
     * Si la búsqueda etiquetada fallaba, se devolvía 2026 como año del
     * vehículo. Ahora:
     *   1) Búsqueda agresiva por etiqueta con múltiples variantes
     *   2) Stripping de fechas más completo (de/del, formatos con hora,
     *      "Emisión", "Solicitud", "Vigencia")
     *   3) En el fallback se descarta el año actual y el siguiente
     */
    {
      const currentYear = new Date().getFullYear();

      // 1) Búsqueda etiquetada (varias variantes; primer match gana)
      const patronesEtiqueta = [
        /A[ñn]o\s+Modelo\s*[:\s]+((?:19|20)\d{2})\b/i,
        /A[ñn]o\s+de\s+Fabricaci[oó]n\s*[:\s]+((?:19|20)\d{2})\b/i,
        /A[ñn]o\s+Fabricaci[oó]n\s*[:\s]+((?:19|20)\d{2})\b/i,
        /A[ñn]o\s+de\s+Modelo\s*[:\s]+((?:19|20)\d{2})\b/i,
        /A[ñn]o\s*[:\s]+((?:19|20)\d{2})\b/i,
        /Modelo\s*[:\s]+((?:19|20)\d{2})\b/i
      ];
      let labeled = null;
      for(const re of patronesEtiqueta){
        const mm = bloqueVehiculo.match(re);
        if(mm){
          const y = parseInt(mm[1]);
          if(y>=1960 && y<=currentYear+1){ labeled = mm[1]; break; }
        }
      }

      // 2) Fallback: años libres en bloque vehículo, excluyendo fechas
      const sinFechas = bloqueVehiculo
        // Fechas DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY (con o sin hora)
        .replace(/\b\d{1,2}[-\/\.]\d{1,2}[-\/\.]((?:19|20)\d{2})(?:\s+\d{1,2}:\d{2})?\b/g,
                 function(m,y){ return m.replace(y,'XXXX'); })
        // Fechas en español: "DD de Mes de YYYY" o "DD de Mes del YYYY"
        .replace(/\b\d{1,2}\s+de\s+\w+\s+(?:de|del)\s+((?:19|20)\d{2})\b/gi,
                 function(m,y){ return m.replace(y,'XXXX'); })
        // "Mes de YYYY" o "Mes del YYYY" (sin día)
        .replace(/\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de|del)\s+((?:19|20)\d{2})\b/gi,
                 function(m,y){ return m.replace(y,'XXXX'); })
        // Etiquetas que SIEMPRE preceden al año actual / fecha
        .replace(/\b(emisi[oó]n|solicitud|vigencia|expedici[oó]n|generaci[oó]n|trámite|tramite|impreso|impresion|impresi[oó]n|consulta)\s*[:\s]+((?:19|20)\d{2})\b/gi,
                 function(m,_l,y){ return m.replace(y,'XXXX'); });

      const anios = [];
      const re = /\b((?:19|20)\d{2})\b/g;
      let m;
      while((m = re.exec(sinFechas))!==null){
        const y = parseInt(m[1]);
        // Descartar año actual y el siguiente — casi siempre es fecha de emisión/vigencia
        if(y>=1960 && y<currentYear) anios.push(m[1]);
      }
      const unicos = [...new Set(anios)];
      console.log('[CUV] Año etiquetado:', labeled, '· candidatos libres:', unicos, '· (excluido año actual:', currentYear+')');

      // Prioridad: etiquetado > primer año libre plausible
      d.anio = primerCandidato([labeled, ...unicos], 'anio');

      // Último recurso: si ambos fallaron, aceptar incluso año actual con etiqueta
      if(!d.anio){
        const matchUltimo = bloqueVehiculo.match(/A[ñn]o\s*(?:Modelo|Fabricaci[oó]n)?\s*[:\s]+((?:19|20)\d{2})\b/i);
        if(matchUltimo) d.anio = matchUltimo[1];
      }
    }

    /* COLOR */
    {
      const mEt = bloqueVehiculo.match(/Color\s*:\s*([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]{1,29}?)(?=\s+(?:Tipo|Clase|VIN|N[úu]m|Marca|Modelo|\d)|\s*$)/i)
               || flat.match(/Color\s*:\s*([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]{1,29})/i);
      let colorValido = null;
      if(mEt){
        const cu = mEt[1].trim().toUpperCase();
        colorValido = COLORES_VALIDOS.includes(cu) ? cu
          : (COLORES_VALIDOS.find(c=>cu.startsWith(c)) ? cu : null);
      }
      if(!colorValido) colorValido = buscarEnWhitelist(COLORES_VALIDOS, bloqueVehiculo) || null;
      d.color = primerCandidato([colorValido], 'color');
    }

    /* PROPIETARIO */
    {
      const INVALIDOS = new Set(['DATOS','MATRICULACION','MATRICULACIÓN','VEHICULO','VEHÍCULO',
        'INFORMACION','INFORMACIÓN','PROPIETARIO','TITULAR','NOMBRES','DOCUMENTO','IDENTIDAD',
        'CED','RUC','PAS','FECHA','REGISTRO','DESDE','NO','REGISTRADO','CERTIFICADO',
        'VEHICULAR','AGENCIA']);
      function esNombrePersona(linea){
        const v = linea.trim().replace(/\s+/g,' ');
        if(!/^[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+$/i.test(v)) return false;
        const palabras = v.toUpperCase().split(/\s+/);
        if(palabras.length < 3) return false;
        if(palabras.some(p=>INVALIDOS.has(p))) return false;
        if(v===v.toLowerCase()) return false;
        return true;
      }
      let nombreEncontrado = '';
      for(let i=0; i<linesProp.length; i++){
        const l = linesProp[i];
        if(/^Nombres?\s*:/i.test(l)){
          const mismaLinea = l.replace(/^Nombres?\s*:\s*/i,'').trim();
          if(esNombrePersona(mismaLinea)){ nombreEncontrado=mismaLinea.toUpperCase(); break; }
          if(i+1<linesProp.length&&esNombrePersona(linesProp[i+1])){
            nombreEncontrado=linesProp[i+1].trim().toUpperCase(); break;
          }
        }
      }
      if(!nombreEncontrado){
        for(let i=1; i<Math.min(linesProp.length,15); i++){
          const l=linesProp[i].trim();
          if(esNombrePersona(l)){ nombreEncontrado=l.toUpperCase(); break; }
        }
      }
      d.propietario = nombreEncontrado ? primerCandidato([nombreEncontrado],'propietario') : '';
    }

    /* CÉDULA */
    {
      const mDoc = (linesProp.join(' ')).match(/(CED|RUC|PAS(?:APORTE)?)\s*[-–]\s*(\d{8,13})/i)
                || flat.match(/(CED|RUC|PAS(?:APORTE)?)\s*[-–]\s*(\d{8,13})/i);
      if(mDoc){
        d.cedula             = mDoc[2].trim();
        d.documentoIdentidad = mDoc[1].toUpperCase() + ' - ' + mDoc[2].trim();
      } else {
        const mNum = flat.match(/(?:C[eé]dula|Identificaci[oó]n|Documento)\s*[:\-]\s*(\d{8,13})/i);
        d.cedula             = mNum ? mNum[1].trim() : '';
        d.documentoIdentidad = d.cedula;
      }
      /* Propietario Desde — solo dentro del bloque propietario, antes de matriculación */
      {
        const idxMatrFin = lines.findIndex(l =>
          /DATOS\s+DE\s+MATRICULACI[OÓ]N/i.test(l) ||
          /INFORMACI[OÓ]N\s+DE\s+MATRICULACI[OÓ]N/i.test(l)
        );
        const linesBloqueProp = idxPropBlock >= 0
          ? lines.slice(idxPropBlock, idxMatrFin > idxPropBlock ? idxMatrFin : undefined)
          : linesProp;
        const txtBloqueProp = linesBloqueProp.join(' ');
        const m1 = txtBloqueProp.match(/(CED|RUC|PAS)\s*[-–]\s*\d{8,13}\s+(\d{2}-\d{2}-\d{4})/i);
        const m2 = txtBloqueProp.match(/Propietario\s+Desde\s*:\s*(\d{2}-\d{2}-\d{4})/i);
        const m3 = txtBloqueProp.match(/\b(\d{2}-\d{2}-\d{4})\b/);
        d.propietarioDesde = m1 ? m1[2] : m2 ? m2[1] : m3 ? m3[1] : '';
      }
      console.log('[CUV] cedula →', d.cedula, '| propietarioDesde →', d.propietarioDesde);
    }

    /* CLASE */
    {
      const CLASES = ['VEHICULO UTILITARIO','CAMIONETA','AUTOMOVIL','MOTOCICLETA',
                      'CAMION','BUS','FURGONETA','JEEP','VOLQUETA','TRAILER','MINIBUS'];
      const mEt = bloqueVehiculo.match(/Clase\s*(?:de\s+veh[íi]culo)?\s*:\s*([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]{1,35}?)(?=\s+(?:Tipo|Serv|Marca|Color|\d)|$)/i);
      let cEt = mEt ? mEt[1].trim().toUpperCase() : null;
      if(cEt && !CLASES.some(c=>cEt.startsWith(c)) && /TONELAJE|SOLICITUD|NUMERO|VIN|MOTOR|MODELO/i.test(cEt)) cEt=null;
      d.clase = cEt || buscarEnWhitelist(CLASES, bloqueVehiculo);
    }

    /* TIPO */
    {
      const TIPOS = ['HIBRIDO-J','HATCHBACK','SEDAN','SUV','JEEP',
                     'CAMIONETA','FURGON','BUS','PICKUP','COUPE','MINIVAN'];
      const mEt = bloqueVehiculo.match(/Tipo\s*(?:de\s+veh[íi]culo)?\s*:\s*([A-ZÁÉÍÓÚÜÑ\-][A-ZÁÉÍÓÚÜÑ\s\-]{1,35}?)(?=\s+(?:Clase|Serv|Marca|Color|\d)|$)/i);
      let cEt = mEt ? mEt[1].trim().toUpperCase() : null;
      if(cEt&&cEt.length>25) cEt=null;
      if(cEt&&!TIPOS.some(t=>cEt.startsWith(t))) cEt=null;
      d.tipo = cEt || buscarEnWhitelist(TIPOS, bloqueVehiculo);
    }

    /* SERVICIO */
    {
      const SERVICIOS = ['USO PARTICULAR','PARTICULAR','PUBLICO','COMERCIAL','ESTATAL','MUNICIPAL'];
      const mEt = bloqueVehiculo.match(/Servicio\s*:\s*([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]{1,30}?)(?=\s+(?:Clase|Tipo|Marca|\d)|$)/i);
      let cEt = mEt ? mEt[1].trim().toUpperCase() : null;
      if(cEt&&/SOLICITUD|LUGAR|CANAL|DATOS/i.test(cEt)) cEt=null;
      if(cEt&&!SERVICIOS.some(s=>cEt.startsWith(s))) cEt=null;
      d.servicio = cEt || buscarEnWhitelist(SERVICIOS, bloqueVehiculo);
    }

    /* CILINDRAJE */
    {
      const mEt = bloqueVehiculo.match(/Cilindraje\s*(?:\(cc\))?\s*:\s*(\d{3,4})\b/i)
               || flat.match(/Cilindraje\s*(?:\(cc\))?\s*:\s*(\d{3,4})\b/i);
      let cEt = mEt ? mEt[1] : null;
      let cilLibre = '';
      if(!cEt){
        const re=/\b(\d{3,4})\b/g; let m;
        while((m=re.exec(bloqueVehiculo))!==null){
          const n=parseInt(m[1]);
          if(n>=500&&n<=8000&&!(n>=1960&&n<=2035)&&n!==5&&n!==7&&n!==4){
            cilLibre=m[1]; break;
          }
        }
      }
      d.cilindraje = cEt || cilLibre;
    }

    /* PAÍS DE ORIGEN */
    {
      const PAISES = ['ECUADOR','COLOMBIA','BRASIL','FRANCE','FRANCIA','INDONESIA','JAPON',
                      'JAPAN','CHINA','MEXICO','ARGENTINA','COREA','COREA DEL SUR','ALEMANIA',
                      'GERMANY','ESTADOS UNIDOS','USA','TAILANDIA','THAILAND','INDIA','TURQUIA',
                      'ITALIA','REINO UNIDO'];
      const mEt = bloqueVehiculo.match(/Pa[íi]s\s+de\s+[Oo]rigen\s*:\s*([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]{1,30}?)\b/i)
               || flat.match(/Pa[íi]s\s+de\s+[Oo]rigen\s*:\s*([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]{1,30}?)\b/i);
      let cEt = mEt ? mEt[1].trim().toUpperCase() : null;
      if(cEt&&!PAISES.some(p=>cEt.startsWith(p))) cEt=null;
      d.paisOrigen = cEt || buscarEnWhitelist(PAISES, bloqueVehiculo);
    }

    /* COMBUSTIBLE */
    {
      const COMBUSTIBLES = ['GASOLINA','DIESEL','HIBRIDO','HÍBRIDO',
                            'ELECTRICO','ELÉCTRICO','GLP','GNV','GAS'];
      const mEt = bloqueVehiculo.match(/Combustible\s*:\s*([A-ZÁÉÍÓÚÜÑ\/]{4,20})/i)
               || flat.match(/Combustible\s*:\s*([A-ZÁÉÍÓÚÜÑ\/]{4,20})/i);
      let cEt = mEt ? mEt[1].trim().toUpperCase() : null;
      if(cEt&&!COMBUSTIBLES.some(c=>cEt.startsWith(c))) cEt=null;
      d.combustible = cEt || buscarEnWhitelist(COMBUSTIBLES, bloqueVehiculo);
    }

    /* ESTADO MATRÍCULA */
    {
      const mEst = bloqueMatr.match(/\b(ACTIVO|INACTIVO)\b/i)
                || flat.match(/Estado\s+[Mm]atr[íi]cula\s*:\s*(ACTIVO|INACTIVO)/i);
      d.estadoMatricula = mEst ? mEst[1].toUpperCase() : '';
    }

    /* ÚLTIMO AÑO AUTORIZADO */
    {
      const mEt = bloqueMatr.match(/[ÚU]ltimo\s+[Aa][ñn]o\s+[Aa]utorizado\s*:\s*((19|20)\d{2})/i)
               || bloqueMatr.match(/[Úú]ltimo\s+[Aa][ñn]o\s*:\s*((19|20)\d{2})/i);
      let anioLibre='';
      if(!mEt&&bloqueMatr){
        const sinFechas=bloqueMatr.replace(/\b\d{1,2}[-\/]\d{1,2}[-\/]((?:19|20)\d{2})\b/g,(m,y)=>m.replace(y,'XXXX'));
        const mA=sinFechas.match(/\b((19|20)\d{2})\b/);
        if(mA){const y=parseInt(mA[1]);if(y>=2000&&y<=2040) anioLibre=mA[1];}
      }
      d.ultimoAnioAutorizado = mEt ? mEt[1] : anioLibre;
    }

    /* FECHA EMISIÓN CUV */
    {
      const mFeLargo = flat.match(/(\d{1,2}\s+de\s+[A-ZÁÉÍÓÚa-záéíóú]+\s+de\s+\d{4}\s+\d{2}:\d{2})/i);
      const mFeCorto = flat.match(/Fecha\s+(?:de\s+)?[Ee]misi[oó]n\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/i);
      d.fechaEmisionCUV = mFeLargo ? mFeLargo[1].trim() : (mFeCorto ? mFeCorto[1] : '');
    }

    /* VIGENCIA MATRÍCULA */
    {
      const mVig = bloqueMatr.match(/Fecha\s+Vigencia\s+[Mm]atr[íi]cula\s*:\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i)
                || bloqueMatr.match(/Vigencia\s+[Mm]atr[íi]cula\s*:\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i)
                || bloqueMatr.match(/Vigencia\s*:\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i)
                || flat.match(/Vigencia\s+(?:de\s+)?[Mm]atr[íi]cula\s*:\s*(\d{2}[-\/]\d{2}[-\/]\d{4})/i);
      let vigencia = mVig ? mVig[1] : '';
      if(!vigencia && bloqueMatr){
        const hoy=new Date(); const reFecha=/\b(\d{2}[-\/]\d{2}[-\/]\d{4})\b/g; let m;
        while((m=reFecha.exec(bloqueMatr))!==null){
          const p=m[1].split(/[-\/]/);
          const fc=new Date(p[2],p[1]-1,p[0]);
          if(fc>hoy){ vigencia=m[1]; break; }
        }
      }
      d.fechaVigenciaMatricula = vigencia;
    }

    /* GRAVÁMENES */
    {
      const tieneGrav=/Informaci[oó]n\s+de\s+Grav[aá]menes/i.test(flat);
      const sinReg=/Grav[aá]menes?\s+Vigentes?\s*:\s*NO\s+TIENE\s+REGISTRADOS/i.test(flat)
                ||/NO\s+TIENE\s+REGISTRADOS.*[Gg]rav[aá]menes/i.test(flat);
      d.gravamenes=tieneGrav?(sinReg?'NO TIENE REGISTRADOS':'REGISTRA GRAVAMEN'):'No disponible';
    }
    /* BLOQUEOS */
    {
      const tieneBloq=/Informaci[oó]n\s+de\s+Bloqueos?/i.test(flat);
      const sinReg=/Bloqueos?\s+Vigentes?\s*:\s*NO\s+TIENE\s+REGISTRADOS/i.test(flat)
                ||/NO\s+TIENE\s+REGISTRADOS.*[Bb]loqueo/i.test(flat);
      d.bloqueos=tieneBloq?(sinReg?'NO TIENE REGISTRADOS':'REGISTRA BLOQUEO'):'No disponible';
    }
    /* INFRACCIONES */
    {
      const tieneInf=/Infracciones?\s+Pendientes?\s+de\s+Pago/i.test(flat);
      const sinReg=/Infracciones?\s+Pendientes?.+NO\s+TIENE\s+REGISTRADOS/i.test(flat);
      d.infracciones=tieneInf?(sinReg?'NO TIENE REGISTRADOS':'REGISTRA INFRACCIONES PENDIENTES'):'No disponible';
    }

    console.log('[CUV] ══ Resultado final ══', JSON.parse(JSON.stringify(d)));
    console.groupEnd();
    return d;
  }

  /* ── leerPdfTexto(file) → Promise<string> ─────────────────────── */
  /* Extrae texto de un PDF preservando la estructura de líneas
     usando la coordenada Y de cada item de PDF.js               */
  async function leerPdfTexto(file){
    if(!global.pdfjsLib) throw new Error('PDF.js no está cargado.');
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let texto = '';
    for(let p = 1; p <= pdfDoc.numPages; p++){
      const page  = await pdfDoc.getPage(p);
      const tc    = await page.getTextContent();
      const items = tc.items;
      let lineActual = '';
      let yActual    = null;
      for(const item of items){
        const yItem = item.transform ? Math.round(item.transform[5]) : null;
        if(yActual === null) yActual = yItem;
        if(yItem !== null && Math.abs(yItem - yActual) > 2){
          texto += lineActual.trim() + '\n';
          lineActual = '';
          yActual = yItem;
        }
        const str = item.str || '';
        if(str.trim()){
          lineActual += (lineActual && !lineActual.endsWith(' ') ? ' ' : '') + str;
        }
      }
      if(lineActual.trim()) texto += lineActual.trim() + '\n';
      texto += '\n';
    }
    return texto;
  }

  /* ── Exponer en window ─────────────────────────────────────────── */
  global.CUV_ETIQUETAS    = CUV_ETIQUETAS;
  global.CUV_MARCAS       = CUV_MARCAS;
  global.CUV_COLORES      = CUV_COLORES;
  global.cuvIsValidValue  = cuvIsValidValue;
  global.parseCUV         = parseCUV;
  global.leerPdfTexto     = leerPdfTexto;

})(window);
