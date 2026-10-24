const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../contratos.html'),'utf8');
const fn=name=>{const m=html.match(new RegExp('function '+name+'\\([^]*?\\n\\}'));assert.ok(m,name);return m[0];};
const constant=name=>{const m=html.match(new RegExp('const '+name+' = [^]*?;'));assert.ok(m,name);return m[0];};
function context(texts){
 const ctx=vm.createContext({performance,console,window:{},spinnerMsg(){},tipoLabel:t=>t,prepararImagenParaIA:async()=>'',analizarConGeminiCampos:async()=>({}),
  ocrFilePotenciado:async()=>{assert.ok(texts.length,'No añadir reconocimientos sin un objetivo');return texts.shift();},datos:{},flujoContrato:{tipoPersona:'natural'}});
 const functions=['normalizeOcrText','normalizeForParsing','trimUpper','normalizePlaca','normalizeDate','validarCedulaEc','normalizeCedula10','normalizeRuc13','normalizeIdentificacion','normalizeColor','normalizeChasis','isDocumentHeader','normalizeMotor',
  'matriculaHasPhoneContext','matriculaHasCedulaContext','findMatriculaCedulaContextual','etqMatr','parseMatricula','validarCedulaMatriculaPorOCR',
  'cedulaPropietarioReferencia','postProcesarMatriculaConfiabilidad','isFieldEmpty','isFieldDubious','getMissingFields','mergearDatosConIA','mergearDatosConOCR','sanitizeDetectedData'];
 vm.runInContext(functions.map(fn).join('\n'),ctx);
 // Campos reales de esta regresión; no sustituir el parser, sus normalizadores ni el detector de ambigüedad.
 ctx.normalizeFieldValue=(key,value)=>key==='placa'?ctx.normalizePlaca(value):key==='cedulaRuc'?ctx.normalizeIdentificacion(value):key==='color'?ctx.normalizeColor(value):value||'';
 const a=html.indexOf('async function procesarIaFirst('),b=html.indexOf('/* ── Cédula',a);vm.runInContext(html.slice(a,b),ctx);
 return ctx;
}
(async()=>{
 const ctx=context(['PLACA ABC1234','PLACA ABC1235\nCOLOR BLANCO']);
 const result={placa:'',color:'',_origins:{placa:'none',color:'none'}};
 const fields=[{key:'placa'},{key:'color'}];
 for(const raw of ['PLACA ABC1234','PLACA ABC1234\nPLACA ABC1235\nCOLOR BLANCO']){
  const parsed=ctx.parseMatricula(raw);ctx.mergearDatosConOCR(result,result._origins,parsed,ctx.getMissingFields(result,fields),'pdf');
 }
 result._missing=ctx.getMissingFields(result,fields);
 assert.equal(result._origins.placa,'review');assert.ok(result._missing.includes('placa'));assert.equal(result.color,'BLANCO');
 ctx.mergearDatosConOCR(result,result._origins,ctx.parseMatricula('PLACA ABC1235'),['placa'],'pdf');
 assert.equal(result._origins.placa,'review');assert.equal(result.placa,'ABC1234');
 ctx.mergearDatosConIA(result,result._origins,{placa:'ABC1235'},['placa']);assert.equal(result._origins.placa,'review');assert.equal(result.placa,'ABC1234');
 console.log('OK parser real: contradicción frontal/reverso se propaga aunque el campo ya estuviera completo y persiste en fusiones PDF/IA');
 const ids=['0102030400','0203040500'];
 // Calcular el dígito verificador de la segunda identificación ficticia.
 for(let digit=0;digit<10;digit++){const id=ids[1].slice(0,9)+digit;if(ctx.validarCedulaEc(id)){ids[1]=id;break;}}
 for(const key of ['cedulaRuc','placa']){
  const d={[key]:key==='placa'?'ABC1234':ids[0]},origins={[key]:'manual'};
  const initial=d[key];ctx.mergearDatosConOCR(d,origins,{[key]:key==='placa'?'ABC1235':ids[1],_reviewKeys:[key]},[key]);assert.equal(origins[key],'manual');assert.equal(d[key],initial);
  d[key]='';ctx.mergearDatosConOCR(d,origins,{[key]:key==='placa'?'ABC1235':ids[1],_reviewKeys:[key]},[key]);assert.equal(d[key],'');assert.equal(origins[key],'manual');
 }
 console.log('OK contradicciones no cambian valores manuales ni campos vaciados manualmente');
 const duplicated=ctx.parseMatricula('CEDULA PROPIETARIO '+ids[0]+'\nCEDULA PROPIETARIO '+ids[1]);
 assert.equal(duplicated.cedulaRuc,'');assert.ok(duplicated._reviewKeys.includes('cedulaRuc'));
 const distinctRoles=ctx.parseMatricula('RUC PROPIETARIO 1790000000001\nCEDULA REPRESENTANTE '+ids[0]);
 assert.equal(distinctRoles.cedulaRuc,'1790000000001');assert.ok(!distinctRoles._reviewKeys.includes('cedulaRuc'));
 console.log('OK dos identificaciones del propietario requieren revisión; propietario y representante no se mezclan');
 for(const text of ['CEDULA PROPIETARIO '+ids[0]+'\nCEDULA REPRESENTANTE\n'+ids[1], 'RUC PROPIETARIO 1790000000001 CEDULA REPRESENTANTE '+ids[0]]){
  const roles=ctx.parseMatricula(text);assert.ok(!roles._reviewKeys.includes('cedulaRuc'));assert.ok(roles.cedulaRuc);
 }
 const parsedConflict=ctx.parseMatricula('CEDULA PROPIETARIO '+ids[0]+'\nCEDULA PROPIETARIO '+ids[1]+'\nCOLOR BLANCO');
 const conflict={cedulaRuc:ids[0],color:'',_origins:{cedulaRuc:'ai',color:'none'}};
 ctx.mergearDatosConOCR(conflict,conflict._origins,parsedConflict,['color'],'pdf');
 assert.equal(conflict._origins.cedulaRuc,'review');
 ctx.mergearDatosConOCR(conflict,conflict._origins,{cedulaRuc:ids[1]},['cedulaRuc'],'pdf');assert.equal(conflict._origins.cedulaRuc,'review');assert.equal(conflict.cedulaRuc,ids[0]);
 const cedFunctions=['isKeyword','normalizeHumanName','normalizeDactilar','normalizeEstadoCivil','normalizeNacionalidad','splitCedulaLines','hasForbiddenCedulaContext','cedulaFieldBoundary','cleanCedulaLabelValue','getCedulaCandidateName','findLabeledCedulaText','findCedulaNumeroFront','findCedulaBlockNames','extractDactilarCandidatesFromLine','findStructuredDactilar','parseCedulaFrontal','parseCedulaReverso','cedulaNamesLookMixed','parseCedula','parseRuc'];
 vm.runInContext(['KEYWORDS_CED','KEYWORDS_CED_EXACT','ESTADOS_CIVILES_VALIDOS','NACIONALIDADES_VALIDAS'].map(constant).join('\n')+'\n'+cedFunctions.map(fn).join('\n'),ctx);
 const ced=ctx.parseCedula('CEDULA '+ids[0]+'\nCEDULA '+ids[1]);assert.equal(ced.numeroCedula,'');assert.ok(ced._reviewKeys.includes('numeroCedula'));
 const ruc=ctx.parseRuc('RUC 1790000000001\nRUC 1790000001001');assert.equal(ruc.numeroRuc,'');assert.ok(ruc._reviewKeys.includes('numeroRuc'));
 const role=ctx.parseRuc('RUC 1790000000001\nCEDULA REPRESENTANTE '+ids[0]+'\nCEDULA REPRESENTANTE '+ids[1]);assert.equal(role.numeroRuc,'1790000000001');assert.equal(role.cedulaRepresentante,'');assert.ok(role._reviewKeys.includes('cedulaRepresentante'));
 console.log('OK lectores reales de cédula y RUC no eligen la primera identificación contradictoria del mismo rol');
 vm.runInContext(['buscarWhitelist','soloNumerosMenores4','parsePersonasTabla','parsePrintNotaria'].map(fn).join('\n'),ctx);
 const notaria=ctx.parsePrintNotaria('IDENTIFICACION PROPIETARIO '+ids[0]+'\nIDENTIFICACION PROPIETARIO '+ids[1]);assert.equal(notaria.identificacionPropietario,'');assert.ok(notaria._reviewKeys.includes('identificacionPropietario'));
 const notariaRoles=ctx.parsePrintNotaria('IDENTIFICACION PROPIETARIO '+ids[0]+'\nCEDULA REPRESENTANTE '+ids[1]+'\nULTIMO CONTRATO\nCOMPRADORES\n'+ids[1]+' PERSONA DE PRUEBA');assert.equal(notariaRoles.identificacionPropietario,ids[0]);assert.ok(!notariaRoles._reviewKeys.includes('identificacionPropietario'));
 console.log('OK notaría no elige la primera identificación contradictoria y separa propietario de representante/compradores');
 for(const badId of [ids[1],ids[0].slice(0,9)+'9']){
  for(const [parser,key,label] of [[ctx.parseMatricula,'cedulaRuc','CEDULA PROPIETARIO'],[ctx.parseCedula,'numeroCedula','CEDULA'],[ctx.parsePrintNotaria,'identificacionPropietario','IDENTIFICACION PROPIETARIO']]){
   const conflict=parser(label+' '+ids[0]+'\n'+label+' '+badId);assert.equal(conflict[key],'');assert.ok(conflict._reviewKeys.includes(key));
  }
  const rep=ctx.parseRuc('RUC 1790000000001\nCEDULA REPRESENTANTE '+ids[0]+'\nCEDULA REPRESENTANTE '+badId);assert.equal(rep.cedulaRepresentante,'');assert.ok(rep._reviewKeys.includes('cedulaRepresentante'));
 }
 const invalidRuc=ctx.parseRuc('RUC 1790000000001\nRUC 1790000000002');assert.equal(invalidRuc.numeroRuc,'');assert.ok(invalidRuc._reviewKeys.includes('numeroRuc'));
 console.log('OK un segundo identificador con dígito inválido tampoco permite confirmar el primero por descarte');
})().catch(e=>{console.error(e);process.exitCode=1;});
