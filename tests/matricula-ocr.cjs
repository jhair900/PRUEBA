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
const ctx = vm.createContext({ console });
const names = ['normalizeOcrText','normalizeForParsing','trimUpper','normalizePlaca','normalizeDate',
  'validarCedulaEc','normalizeCedula10','normalizeRuc13','normalizeIdentificacion',
  'matriculaHasPhoneContext','matriculaHasCedulaContext','findMatriculaCedulaContextual',
  'etqMatr','parseMatricula'];
vm.runInContext(names.map(fn).join('\n'), ctx);
let passed = 0;
function test(name, body) { body(); passed++; console.log('OK', name); }

test('Campos de una fila terminan en su siguiente etiqueta', () => {
  const d = ctx.parseMatricula('PLACA: PBA-1234 MARCA TOYOTA MODELO COROLLA AÑO DE FABRICACIÓN 2020 COLOR BLANCO CHASIS 1HGBH41JXMN109186 MOTOR 12345678 CLASE AUTOMOVIL TIPO SEDAN SERVICIO PARTICULAR');
  assert.equal(d.placa, 'PBA1234');
  assert.equal(d.marca, 'TOYOTA');
  assert.equal(d.modelo, 'COROLLA');
  assert.equal(d.anio, '2020');
  assert.equal(d.color, 'BLANCO');
  assert.equal(d.chasis, '1HGBH41JXMN109186');
  assert.equal(d.motor, '12345678');
  assert.equal(d.clase, 'AUTOMOVIL');
  assert.equal(d.tipo, 'SEDAN');
  assert.equal(d.servicio, 'PARTICULAR');
});
test('Etiquetas en su propia línea incluyen valores numéricos', () => {
  const d = ctx.parseMatricula('MARCA\nTOYOTA\nMODELO\nCOROLLA\nAÑO MODELO\n2020\nNÚMERO DE MOTOR\n12345678');
  assert.equal(d.marca, 'TOYOTA');
  assert.equal(d.modelo, 'COROLLA');
  assert.equal(d.anio, '2020');
  assert.equal(d.motor, '12345678');
});
test('Columnas explícitas respetan su asociación con la fila siguiente', () => {
  for(const sep of [' | ', '\t', '    ']) {
    const d = ctx.parseMatricula(['MARCA','MODELO','AÑO DE FABRICACIÓN'].join(sep)+'\n'+['TOYOTA','COROLLA','2020'].join(sep));
    assert.equal(d.marca, 'TOYOTA');
    assert.equal(d.modelo, 'COROLLA');
    assert.equal(d.anio, '2020');
  }
});
test('Pares etiqueta y valor en columnas de la misma fila', () => {
  const d = ctx.parseMatricula('MARCA | TOYOTA | MODELO | COROLLA | AÑO MODELO | 2020');
  assert.equal(d.marca, 'TOYOTA');
  assert.equal(d.modelo, 'COROLLA');
  assert.equal(d.anio, '2020');
});
test('Fila de etiquetas sin separación de columnas no se adivina', () => {
  const d = ctx.parseMatricula('MARCA MODELO AÑO\nTOYOTA COROLLA 2020');
  assert.equal(d.marca, '');
  assert.equal(d.modelo, '');
  assert.equal(d.anio, '');
});
test('Etiqueta vacía no salta al valor de otro campo', () => {
  const d = ctx.parseMatricula('MARCA\nMODELO\nCOROLLA\nCHASIS\nMOTOR\n12345678');
  assert.equal(d.marca, '');
  assert.equal(d.modelo, 'COROLLA');
  assert.equal(d.chasis, '');
  assert.equal(d.motor, '12345678');
});
test('No toma el año de emisión, fecha suelta ni número de trámite como fabricación o VIN', () => {
  const d = ctx.parseMatricula('FECHA DE EMISIÓN: 15/06/2024\nAÑO DE MATRICULACIÓN: 2025\n15/06/2030\nNUMERO DE TRAMITE: 1HGBH41JXMN109186');
  assert.equal(d.anio, '');
  assert.equal(d.chasis, '');
  assert.equal(d.fechaEmision, '15/06/2024');
  assert.equal(d.fechaCaducidad, '');
});
test('Fechas sólo de emisión y caducidad rotuladas', () => {
  const d = ctx.parseMatricula('FECHA DE NACIMIENTO: 01/02/1980\nFECHA DE EMISIÓN 2024-06-15 FECHA DE CADUCIDAD 15/06/2029');
  assert.equal(d.fechaEmision, '15/06/2024');
  assert.equal(d.fechaCaducidad, '15/06/2029');
  assert.equal(ctx.parseMatricula('FECHA DE EMISIÓN\nFECHA DE CADUCIDAD\n31/02/2029').fechaEmision, '');
  assert.equal(ctx.parseMatricula('FECHA DE CADUCIDAD 31/02/2029').fechaCaducidad, '');
});
test('Marca y color no se infieren del texto del modelo', () => {
  const d = ctx.parseMatricula('MODELO CHEVROLET COLORADO\nCLASE DE VEHICULO CAMIONETA');
  assert.equal(d.marca, '');
  assert.equal(d.color, '');
  assert.equal(d.modelo, 'CHEVROLET COLORADO');
  assert.equal(d.clase, 'CAMIONETA');
});
test('Valores contradictorios de la misma etiqueta requieren revisión', () => {
  const d = ctx.parseMatricula('MARCA TOYOTA\nMARCA NISSAN\nCHASIS 1HGBH41JXMN109186\nVIN 1HGBH41JXMN109187\nAÑO MODELO 2020\nAÑO DE FABRICACION 2021');
  for(const key of ['marca','chasis','anio']) {
    assert.equal(d[key], '');
    assert.ok(d._reviewKeys.includes(key));
  }
  assert.equal(ctx.parseMatricula('MARCA TOYOTA\nMARCA TOYOTA').marca, 'TOYOTA');
});
test('Identificación y teléfono no contaminan el propietario', () => {
  const d = ctx.parseMatricula('PROPIETARIO AUTOS DEL VALLE S.A. RUC 1790012345001 TELEFONO 0999999999');
  assert.equal(d.propietario, 'AUTOS DEL VALLE S.A.');
});
test('Placa anterior y color secundario no reemplazan a los principales', () => {
  const d = ctx.parseMatricula('PLACA ANTERIOR PBA1234\nPLACA ACTUAL PBA5678\nCOLOR SECUNDARIO NEGRO\nCOLOR PRINCIPAL BLANCO');
  assert.equal(d.placa, 'PBA5678');
  assert.equal(d.color, 'BLANCO');
});
test('Chasis y motor conservan letras alfanuméricas', () => {
  const d = ctx.parseMatricula('CHASIS B1234S678O901D234\nMOTOR B1234S678');
  assert.equal(d.chasis, 'B1234S678O901D234');
  assert.equal(d.motor, 'B1234S678');
});
console.log(passed + ' pruebas de OCR matrícula aprobadas.');
