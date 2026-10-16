const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(root, 'js/generador-contratos.js'), 'utf8'), context);
const toWords = context.window._valorATextoHelper;
const expected = 'DIECINUEVE MIL QUINIENTOS NOVENTA Y NUEVE CON 65/100';
let checks = 0;
function test(name, run) { run(); checks++; console.log('OK', name); }

test('El importe de la captura conserva dólares y centavos con ambos formatos', () => {
  for(const value of ['19599,65', '19599.65', '19.599,65', '19,599.65', ' 19599,65 ', 19599.65]) {
    assert.equal(toWords(value), expected, String(value));
  }
});
test('Los separadores de miles no se confunden con decimales', () => {
  for(const value of ['19599', 19599, '19.599', '19,599', '019599,00']) {
    assert.equal(toWords(value), 'DIECINUEVE MIL QUINIENTOS NOVENTA Y NUEVE', String(value));
  }
  assert.equal(toWords('100,5'), 'CIEN CON 50/100');
  assert.equal(toWords('100.05'), 'CIEN CON 05/100');
  assert.equal(toWords('0,01'), 'CERO CON 01/100');
  assert.equal(toWords(0), 'CERO');
});
test('Los importes grandes y los límites no producen undefined', () => {
  assert.equal(toWords('999.999,99'), 'NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE CON 99/100');
  assert.equal(toWords('1.959.965,65'), 'UN MILLÓN NOVECIENTOS CINCUENTA Y NUEVE MIL NOVECIENTOS SESENTA Y CINCO CON 65/100');
  assert.equal(toWords('999999999,99'), 'NOVECIENTOS NOVENTA Y NUEVE MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE CON 99/100');
  assert.throws(() => toWords('1000000000'), /menor a/);
});
test('Cifras de uno se apocopan antes de dólares y miles', () => {
  assert.equal(toWords('21,00'), 'VEINTIÚN');
  assert.equal(toWords('31001'), 'TREINTA Y UN MIL UN');
  assert.equal(toWords('21000'), 'VEINTIÚN MIL');
});
test('Importes incompletos o inválidos no se convierten silenciosamente a otro valor', () => {
  for(const value of ['', 'abc', '19599abc', '19.59,65', '19,59.65', '19599,', '-10', '100,1234', '1.2.3', null, undefined, NaN, Infinity, -1, 19.599]) {
    assert.throws(() => toWords(value), /valor estimado/, String(value));
  }
});
console.log(checks+' comprobaciones del valor en letras completadas.');
