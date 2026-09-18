const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'contratos.html'), 'utf8');
function fn(name) {
  const match = source.match(new RegExp('function ' + name + '\\([^]*?\\n\\}'));
  assert.ok(match, 'Existe ' + name);
  return match[0];
}
function constant(name) {
  const match = source.match(new RegExp('const ' + name + ' = [^]*?;'));
  assert.ok(match, 'Existe ' + name);
  return match[0];
}
const names = [
  'trimUpper', 'isKeyword', 'normalizeHumanName', 'validarCedulaEc',
  'normalizeCedula10', 'normalizeDactilar', 'normalizeDate',
  'normalizeEstadoCivil', 'normalizeNacionalidad', 'splitCedulaLines',
  'hasForbiddenCedulaContext', 'cedulaFieldBoundary', 'cleanCedulaLabelValue',
  'getCedulaCandidateName', 'findLabeledCedulaText', 'findCedulaNumeroFront',
  'findCedulaBlockNames', 'extractDactilarCandidatesFromLine', 'findStructuredDactilar',
  'parseCedulaFrontal', 'parseCedulaReverso', 'cedulaNamesLookMixed', 'parseCedula'
];
const ctx = vm.createContext({ console });
vm.runInContext(['KEYWORDS_CED', 'KEYWORDS_CED_EXACT', 'ESTADOS_CIVILES_VALIDOS', 'NACIONALIDADES_VALIDAS'].map(constant).join('\n') + '\n' + names.map(fn).join('\n'), ctx);
let passed = 0;
function test(name, body) { body(); passed++; console.log('OK', name); }
const id = '1710034065';
assert.equal(ctx.validarCedulaEc(id), true, 'Cédula sintética de prueba cumple checksum');

test('Etiquetas separadas conservan apellidos compuestos y nombre corto', () => {
  const d = ctx.parseCedula('APELLIDOS: DE LA CRUZ DEL VALLE\nNOMBRES: ANA\nNUI: ' + id + '\nNACIONALIDAD: ECUATORIANA\nESTADO CIVIL: CASADA\nFECHA DE EXPIRACIÓN: 2034-06-15\nCÓDIGO DACTILAR: B1234S678');
  assert.equal(d.apellidos, 'DE LA CRUZ DEL VALLE');
  assert.equal(d.nombres, 'ANA');
  assert.equal(d.numeroCedula, id);
  assert.equal(d.fechaExpiracion, '15/06/2034');
  assert.equal(d.codigoDactilar, 'B1234S678');
  assert.equal(d.estadoCivil, 'CASADO');
});
test('Bloque de nombres en dos líneas consecutivas', () => {
  const d = ctx.parseCedulaFrontal('APELLIDOS Y NOMBRES\nDE LA CRUZ DEL VALLE\nMARIA DE LOS ANGELES\nNACIONALIDAD\nECUATORIANA');
  assert.equal(d.apellidos, 'DE LA CRUZ DEL VALLE');
  assert.equal(d.nombres, 'MARIA DE LOS ANGELES');
});
test('Bloque combinado de una línea no se divide por palabras', () => {
  for(const text of ['APELLIDOS Y NOMBRES\nDE LA CRUZ DEL VALLE ANA\nNACIONALIDAD ECUATORIANA', 'APELLIDOS Y NOMBRES: DE LA CRUZ DEL VALLE ANA\nNACIONALIDAD ECUATORIANA']) {
    const d = ctx.parseCedulaFrontal(text);
    assert.equal(d.apellidos, '');
    assert.equal(d.nombres, '');
    assert.ok(d._reviewKeys.includes('apellidos'));
    assert.ok(d._reviewKeys.includes('nombres'));
  }
});
test('No salta etiquetas ni toma el nombre de padres o cónyuge', () => {
  for(const role of ['PADRE', 'MADRE', 'CONYUGE']) {
    const d = ctx.parseCedula('APELLIDOS Y NOMBRES\nDE LA CRUZ\nNOMBRES DEL ' + role + '\nLUIS ALBERTO\nAPELLIDOS DEL ' + role + '\nPEREZ GOMEZ');
    assert.equal(d.apellidos, '');
    assert.equal(d.nombres, '');
  }
  const d = ctx.parseCedula('APELLIDOS\nNACIONALIDAD\nECUATORIANA\nNOMBRES\nPROFESION\nABOGADO');
  assert.equal(d.apellidos, '');
  assert.equal(d.nombres, '');
  const father = ctx.parseCedula('APELLIDOS Y NOMBRES DEL PADRE\nPEREZ GOMEZ\nJUAN CARLOS');
  assert.equal(father.apellidos, '');
  assert.equal(father.nombres, '');
});
test('Sólo cédula con etiqueta; no teléfono, MRZ ni número suelto', () => {
  for(const text of [id, 'TELÉFONO: ' + id, 'NUI\nTELÉFONO\n' + id, 'I<ECU' + id + '<<<<<<<<', 'NÚMERO DE TELÉFONO ' + id]) {
    assert.equal(ctx.parseCedula(text).numeroCedula, '');
  }
  for(const label of ['NO.', 'NUI', 'CÉDULA', 'NÚMERO DE CÉDULA', 'IDENTIFICACIÓN']) {
    assert.equal(ctx.parseCedula(label + '\n' + id).numeroCedula, id, label);
  }
});
test('No deduce vencimiento de fecha de nacimiento ni emisión', () => {
  const d = ctx.parseCedula('FECHA DE NACIMIENTO\n15/06/1992\nFECHA DE EXPIRACIÓN\nFECHA DE EMISIÓN\n15/06/2024');
  assert.equal(d.fechaExpiracion, '');
  assert.ok(d._reviewKeys.includes('fechaExpiracion'));
});
test('Caducidad explícita acepta fecha y rechaza fecha imposible', () => {
  assert.equal(ctx.parseCedula('VÁLIDA HASTA\n15/06/2034').fechaExpiracion, '15/06/2034');
  assert.equal(ctx.parseCedula('FECHA DE VENCIMIENTO\n31/02/2034').fechaExpiracion, '');
});
test('Nacionalidad no se deduce del encabezado ECUADOR', () => {
  assert.equal(ctx.parseCedula('REPUBLICA DEL ECUADOR\nCEDULA DE IDENTIDAD').nacionalidad, '');
});
test('Código dactilar etiquetado no altera letras válidas', () => {
  const d = ctx.parseCedulaReverso('COD. DACTILAR\nB1234S678\nFECHA DE EXPIRACION\n15/06/2034');
  assert.equal(d.codigoDactilar, 'B1234S678');
  assert.equal(d._reviewKeys.includes('codigoDactilar'), false);
});
test('Código dactilar sin etiqueta exige revisión y candidatos múltiples quedan vacíos', () => {
  const d = ctx.parseCedulaReverso('B1234S678\nINSTRUCCION\nSUPERIOR');
  assert.equal(d.codigoDactilar, 'B1234S678');
  assert.ok(d._reviewKeys.includes('codigoDactilar'));
  const ambiguous = ctx.parseCedulaReverso('B1234S678\nV9876A543');
  assert.equal(ambiguous.codigoDactilar, '');
  assert.ok(ambiguous._reviewKeys.includes('codigoDactilar'));
});
test('Cédula y fechas numéricas no se toman como dactilar', () => {
  assert.equal(ctx.parseCedulaReverso('NUI\n' + id + '\n15062034\n15/06/2034').codigoDactilar, '');
});
test('Comparación de nombres usa palabras completas', () => {
  assert.equal(ctx.cedulaNamesLookMixed('ANA', 'MARIANA'), false);
  assert.equal(ctx.cedulaNamesLookMixed('DE LA CRUZ DEL VALLE', 'MARIA DE LOS ANGELES'), false);
  assert.equal(ctx.cedulaNamesLookMixed('PEREZ GOMEZ', 'PEREZ GOMEZ ANA'), true);
});
test('Etiquetas al final de la misma línea no contaminan el nombre', () => {
  const d = ctx.parseCedula('APELLIDOS: PEREZ GOMEZ NACIONALIDAD ECUATORIANA\nNOMBRES: ANA SEXO FEMENINO');
  assert.equal(d.apellidos, 'PEREZ GOMEZ');
  assert.equal(d.nombres, 'ANA');
});
console.log(passed + ' pruebas de OCR cédula aprobadas.');


test('Cédula OCR conserva Ñ en apellidos del titular', () => {
  const d = ctx.parseCedula('APELLIDOS: MUÑOZ PEÑA\nNOMBRES: ANA\nNUI: '+id+'\nNACIONALIDAD: ECUATORIANA\nESTADO CIVIL: SOLTERA');
  assert.equal(d.apellidos, 'MUÑOZ PEÑA');
  assert.equal(d.nombres, 'ANA');
});
