'use strict';
const assert = require('node:assert/strict');
const extraction = require('../js/document-extraction.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('OK', name); }
const image = 'data:image/jpeg;base64,YWJj';
const response = (value, extra) => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] }, ...extra }] });

test('front and back are separate ordered pages, all requested fields have schema', () => {
  const request = extraction.buildRequest('cedula', [{ dataUrl: image, label: 'Frontal de cédula' }, { dataUrl: image, label: 'Reverso de cédula' }], ['numeroCedula', 'codigoDactilar']);
  assert.equal(request.contents[0].parts[1].text, 'Frontal de cédula');
  assert.equal(request.contents[0].parts[3].text, 'Reverso de cédula');
  assert.equal(request.contents[0].parts.filter(part => part.inline_data).length, 2);
  assert.equal(request.generationConfig.responseSchema.properties.numeroCedula.type, 'STRING');
  assert.deepEqual(request.generationConfig.responseSchema.properties._reviewKeys.items.enum, ['numeroCedula', 'codigoDactilar']);
});
test('notary roles use row objects instead of unstructured names', () => {
  const request = extraction.buildRequest('notaria', image, ['nombrePropietario', 'compradores', 'vendedores']);
  const properties = request.generationConfig.responseSchema.properties;
  assert.equal(properties.compradores.type, 'ARRAY');
  assert.deepEqual(properties.compradores.items.required, ['tipoId', 'identificacion', 'nombre']);
  assert.equal(properties.vendedores.items.properties.identificacion.type, 'STRING');
});
test('CUV cannot accidentally route through AI and foreign keys are rejected', () => {
  assert.throws(() => extraction.buildRequest('cuv', image, ['placa']), /únicamente con OCR/);
  assert.throws(() => extraction.buildRequest('cedula', image, ['placa']), /no permitido/);
  assert.throws(() => extraction.buildRequest('cedula', 'not an image', ['numeroCedula']), /inválida/);
});
test('response joins text fragments, excludes thought text and ignores extra keys', () => {
  const parsed = extraction.parseResponse({ candidates: [{ finishReason: 'STOP', content: { parts: [
    { thought: true, text: 'Consideration is not JSON.' }, { text: '{"numeroCedula":"0123456789",' },
    { text: '"codigoDactilar":"A012345678","unexpected":"ignored"}' }
  ] } }] }, ['numeroCedula', 'codigoDactilar']);
  assert.deepEqual(parsed, { numeroCedula: '0123456789', codigoDactilar: 'A012345678', _reviewKeys: [] });
});
test('ambiguous and numeric identifiers cannot silently become accepted strings', () => {
  const parsed = extraction.parseResponse(response({ numeroCedula: 123456789, codigoDactilar: 'A012345678', _reviewKeys: ['codigoDactilar', 'unrequested'] }), ['numeroCedula', 'codigoDactilar']);
  assert.equal(parsed.numeroCedula, '');
  assert.equal(parsed.codigoDactilar, '');
  assert.deepEqual(new Set(parsed._reviewKeys), new Set(['codigoDactilar', 'numeroCedula']));
});
test('notary malformed row does not get coerced to text or partly accepted', () => {
  const parsed = extraction.parseResponse(response({ compradores: [{ tipoId: 'CÉDULA', identificacion: 1234567890, nombre: 'ANA DE LA CRUZ' }], vendedores: [{ tipoId: 'RUC', identificacion: '0999999999001', nombre: 'EMPRESA DEMO S.A.', extra: true }] }), ['compradores', 'vendedores']);
  assert.deepEqual(parsed.compradores, []);
  assert.deepEqual(parsed._reviewKeys, ['compradores']);
  assert.deepEqual(parsed.vendedores, [{ tipoId: 'RUC', identificacion: '0999999999001', nombre: 'EMPRESA DEMO S.A.' }]);
});
test('truncated, blocked or non-object AI output triggers fallback', () => {
  assert.throws(() => extraction.parseResponse(response({ placa: 'ABC1234' }, { finishReason: 'MAX_TOKENS' }), ['placa']), /incompleta/);
  assert.throws(() => extraction.parseResponse({ promptFeedback: { blockReason: 'SAFETY' } }, ['placa']), /OCR/);
  assert.throws(() => extraction.parseResponse(response(['ABC1234']), ['placa']), /formato/);
  assert.throws(() => extraction.parseResponse({ candidates: [{ content: { parts: [{ text: '{"placa":' }] } }] }, ['placa']), /JSON completos/);
});
test('papeleta full compound name is not split by a two-word heuristic', () => {
  const parsed = extraction.parsePapeleta('CERTIFICADO DE VOTACIÓN\nAPELLIDOS Y NOMBRES:\nDE LA CRUZ DEL RÍO ANA MARÍA\nCC N° 0123456789\nELECCIONES GENERALES\n9 DE FEBRERO DE 2025\nFECHA DE EMISIÓN: 12/02/2025');
  assert.equal(parsed.nombreCompleto, 'DE LA CRUZ DEL RÍO ANA MARÍA');
  assert.equal(parsed.apellidos, '');
  assert.equal(parsed.nombres, '');
  assert.equal(parsed.numeroCedula, '0123456789');
  assert.equal(parsed.fechaSufragio, '09/02/2025');
});
test('papeleta separate labels preserve particles, zeros and literal actual date', () => {
  const parsed = extraction.parsePapeleta('APELLIDOS: DE LA CRUZ PÉREZ\nNOMBRES: ANA MARÍA\nCÉDULA: 0123456789\nFECHA DE SUFRAGIO: 21/04/2024\nPROVINCIA: GUAYAS\nJUNTA: 0007 F');
  assert.equal(parsed.apellidos, 'DE LA CRUZ PÉREZ');
  assert.equal(parsed.nombres, 'ANA MARÍA');
  assert.equal(parsed.nombreCompleto, 'DE LA CRUZ PÉREZ ANA MARÍA');
  assert.equal(parsed.fechaSufragio, '21/04/2024');
  assert.equal(parsed.junta, '0007 F');
  assert.equal(parsed.provincia, 'GUAYAS');
});
test('papeleta neither invents an expected date nor treats an unlabeled ID as identity', () => {
  const parsed = extraction.parsePapeleta('CERTIFICADO DE VOTACIÓN\n0123456789\nN° 57893213\nFECHA DE EMISIÓN: 16/11/2025\nNACIMIENTO: 01/01/1980');
  assert.equal(parsed.numeroCedula, '');
  assert.equal(parsed.fechaSufragio, '');
  assert.equal(parsed.apellidos, '');
  assert.equal(parsed.nombres, '');
});
test('papeleta conflicting IDs and dates remain pending instead of picking one', () => {
  const parsed = extraction.parsePapeleta('CC N° 0123456789\nCC N° 0987654321\nFECHA DE SUFRAGIO: 21/04/2024\nFECHA DE SUFRAGIO: 09/02/2025');
  assert.equal(parsed.numeroCedula, '');
  assert.equal(parsed.fechaSufragio, '');
  assert.ok(parsed._reviewKeys.includes('numeroCedula'));
  assert.ok(parsed._reviewKeys.includes('fechaSufragio'));
});
test('papeleta rejects impossible dates and longer IDs rather than truncating', () => {
  const parsed = extraction.parsePapeleta('CC N° 0123456789001\nFECHA DE SUFRAGIO: 31/02/2025');
  assert.equal(parsed.numeroCedula, '');
  assert.equal(parsed.fechaSufragio, '');
  assert.ok(parsed._reviewKeys.includes('numeroCedula'));
  assert.ok(parsed._reviewKeys.includes('fechaSufragio'));
});
console.log(passed + ' pruebas de extracción completadas.');
