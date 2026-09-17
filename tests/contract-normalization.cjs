const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'contratos.html'), 'utf8');
const context = vm.createContext({console, Date, Set, datos: {}, flujoContrato: {tipoPersona: 'natural'},
  _flujoEsConyugal: () => false, TIPO_LABEL_VC: {}});

// Cargar las funciones reales sin ejecutar eventos ni depender de un DOM simulado.
function loadFunction(name) {
  const start = html.search(new RegExp('^function '+name+'\\(', 'm'));
  assert.ok(start >= 0, 'Existe '+name);
  for(let end = html.indexOf('}', start); end >= 0; end = html.indexOf('}', end + 1)) {
    const candidate = html.slice(start, end + 1);
    let script;
    try { script = new vm.Script(candidate); } catch (_) { continue; }
    script.runInContext(context);
    return;
  }
  throw new Error('No se pudo extraer '+name);
}
for(const name of ['KEYWORDS_CED', 'KEYWORDS_CED_EXACT', 'ESTADOS_CIVILES_VALIDOS', 'NACIONALIDADES_VALIDAS']) {
  const match = html.match(new RegExp('^const '+name+' = [\\s\\S]*?^[\\]}];', 'm'));
  assert.ok(match, 'Existe '+name);
  vm.runInContext(match[0], context);
}
for(const name of [
  'trimUpper', 'isKeyword', 'normalizeHumanName', 'normalizeOwnerName', 'normalizeCompanyName',
  'normalizeCedula10', 'normalizeRuc13', 'normalizeIdentificacion', 'validarCedulaEc',
  'normalizeDate', 'normalizeEstadoCivil', 'normalizeNacionalidad', 'normalizeDactilar',
  'normalizePlaca', 'normalizeMarca', 'normalizeModelo', 'normalizeAnio', 'normalizeColor',
  'normalizeChasis', 'normalizeMotor', 'normalizeFieldValue', 'normalizeOcrText', 'normalizeForParsing',
  'matriculaHasPhoneContext', 'matriculaHasCedulaContext', 'findMatriculaCedulaContextual',
  'validarCedulaMatriculaPorOCR', 'cedulaPropietarioReferencia', 'postProcesarMatriculaConfiabilidad',
  'normalizarValor', 'nombresEquivalentes', 'similitudCadena', 'vcEquivalentes', 'vcAgrupar',
  'vcMejorValor', 'vcOrigenCampo', 'getValidacionesCruzadas', 'computarValidaciones'
]) loadFunction(name);

let count = 0;
function test(name, run) { run(); count++; console.log('OK', name); }
function result(field) { return context.computarValidaciones().find(row => row.campo === field); }
const cedula = '1722821509';
const ruc = '1790012345001';

test('Nombres reales cortos o con NAN no se pierden; etiquetas y lecturas numéricas sí se rechazan', () => {
  for(const name of ['FERNANDO','FERNANDA','HERNAN','ANA','LUZ','PAZ']) {
    assert.equal(context.normalizeHumanName(name, 8), name);
  }
  assert.equal(context.normalizeHumanName('FECHA DE NACIMIENTO', 8), '');
  assert.equal(context.normalizeHumanName('JUAN1', 8), '');
  assert.equal(context.isKeyword('CÓDIGO: DACTILAR'), true);
});
test('No se recorta MARIANA porque un apellido sea ANA ni se inventa separación del nombre', () => {
  assert.equal(context.normalizeFieldValue('nombres', 'MARIANA', {apellidos:'ANA'}), 'MARIANA');
  assert.equal(context.normalizeFieldValue('nombreCompleto', 'DE LA CRUZ ANA LUZ', {}), 'DE LA CRUZ ANA LUZ');
});
test('El propietario empresarial conserva cifras, símbolos y palabras que son válidas en razones sociales', () => {
  const value = 'TRANSPORTES ECUADOR 2020 S.A.';
  assert.equal(context.normalizeFieldValue('propietario', value, {}), value);
  assert.equal(context.normalizeFieldValue('nombrePropietario', value, {}), value);
  assert.equal(context.normalizeOwnerName('PROPIETARIO'), '');
});
test('Fechas son calendarios completos y no coincidencias dentro de otra fecha o una explicación', () => {
  assert.equal(context.normalizeDate('2025-11-16'), '16/11/2025');
  assert.equal(context.normalizeFieldValue('fechaContrato','01/02/1999',{}), '01/02/1999');
  assert.equal(context.normalizeFieldValue('fechaSufragio','31/02/2025',{}), '');
  assert.equal(context.normalizeDate('123/11/2025'), '');
  assert.equal(context.normalizeDate('Fecha de nacimiento: 16/11/2025'), '');
});
test('Matrícula admite RUC del titular y no extrae teléfonos', () => {
  assert.equal(context.findMatriculaCedulaContextual(['PROPIETARIO: COMPAÑIA', 'RUC: '+ruc]), ruc);
  assert.equal(context.findMatriculaCedulaContextual(['TELEFONO: '+cedula]), '');
  assert.equal(context.validarCedulaMatriculaPorOCR(ruc, 'RUC: '+ruc).ok, true);
});
test('La referencia de la empresa usa su RUC y no la cédula del representante', () => {
  context.flujoContrato.tipoPersona = 'juridica';
  context.datos = {ruc: {numeroRuc:ruc}, 'cedula-prop':{numeroCedula:cedula}};
  const data = {cedulaRuc:ruc}, origins = {cedulaRuc:'ai'};
  context.postProcesarMatriculaConfiabilidad(data, origins, 'RUC: '+ruc);
  assert.equal(data.cedulaRuc, ruc);
  assert.equal(origins.cedulaRuc, 'ai');
});
test('OCR sin evidencia no borra una lectura de IA; toda edición manual permanece intacta', () => {
  context.flujoContrato.tipoPersona = 'natural';
  context.datos = {};
  const data = {cedulaRuc:cedula}, origins = {cedulaRuc:'ai'};
  context.postProcesarMatriculaConfiabilidad(data, origins, '');
  assert.equal(data.cedulaRuc, cedula);
  assert.equal(origins.cedulaRuc, 'review');
  const manual = {cedulaRuc:'MI LECTURA'}, manualOrigins = {cedulaRuc:'manual'};
  context.postProcesarMatriculaConfiabilidad(manual, manualOrigins, 'TELEFONO: '+cedula);
  assert.equal(manual.cedulaRuc, 'MI LECTURA');
  assert.equal(manualOrigins.cedulaRuc, 'manual');
});
test('Semejanza o nombre parcial no equivale a coincidencia; distinto orden completo sí', () => {
  assert.equal(context.nombresEquivalentes('PEREZ LOPEZ JUAN CARLOS', 'JUAN CARLOS PEREZ LOPEZ'), true);
  assert.equal(context.nombresEquivalentes('PEREZ LOPEZ JUAN CARLOS', 'PEREZ LOPEZ JUAN'), false);
  assert.equal(context.vcEquivalentes('SPORTAGE 2000','SPORTAGE 2001','estricto','modelo'), false);
  assert.equal(context.vcEquivalentes('ABC-1234','ABC1234','estricto','placa'), true);
});
test('La validación conserva review de identificaciones, nombres, representantes y papeletas', () => {
  assert.equal(context.vcOrigenCampo({_origins:{cedulaRuc:'review'}},'matricula','identificacionPropietario'), 'review');
  assert.equal(context.vcOrigenCampo({_origins:{nombres:'review'}},'cedula-prop','propietario'), 'review');
  assert.equal(context.vcOrigenCampo({_origins:{numeroCedula:'review'}},'papeleta-prop','cedulaRepresentante'), 'review');
  assert.equal(context.vcOrigenCampo({nombreCompleto:'ANA PEREZ',_origins:{nombreCompleto:'review'}},'papeleta-prop','propietario'), 'review');
});
test('Coincidencias entre documentos no hacen pasar una identificación marcada para revisión', () => {
  context.flujoContrato.tipoPersona = 'natural';
  context.datos = {'cedula-prop':{numeroCedula:cedula,_origins:{numeroCedula:'ai'}},
    matricula:{cedulaRuc:cedula,_origins:{cedulaRuc:'review'}}, cuv:{cedula}};
  const row = result('identificacionPropietario');
  assert.equal(row.estado, 'diff');
  assert.ok(row.sospechosos.includes('matricula'));
  assert.ok(!row.coincidentes.includes('matricula'));
});
test('Papeleta compara nombre completo y respeta la fecha detectada ante otra fecha esperada', () => {
  context.datos = {'papeleta-prop':{nombreCompleto:'ANA LUZ PEREZ',fechaSufragio:'09/02/2025',
    _origins:{nombreCompleto:'ai',fechaSufragio:'ai'}}};
  assert.equal(result('propietario').valores[0].raw, 'ANA LUZ PEREZ');
  assert.equal(result('fechaSufragioProp').sugerido, '09/02/2025');
  assert.equal(result('fechaSufragioProp').estado, 'diff');
});
test('La fecha esperada tampoco elimina review de una lectura dudosa', () => {
  context.datos = {'papeleta-prop':{fechaSufragio:'16/11/2025',_origins:{fechaSufragio:'review'}}};
  assert.equal(result('fechaSufragioProp').estado, 'diff');
  assert.equal(result('fechaSufragioProp').coincidentes.length, 0);
});
test('Compradores y vendedores conservan filas separadas al normalizar', () => {
  const rows = 'CEDULA | 1722821509 | ANA PEREZ\nRUC | 1790012345001 | EMPRESA 2020 S.A.';
  assert.equal(context.normalizeFieldValue('compradores', rows, {}), rows);
  assert.equal(context.normalizeFieldValue('vendedores', rows.replace(/\n/g,'\r\n'), {}), rows);
});
console.log(count+' comprobaciones de normalización y validación superadas.');
