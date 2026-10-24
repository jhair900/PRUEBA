// Comparación real de Contratos, sin DOM, servicios externos ni documentos personales.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../contratos.html'),'utf8');
const context=vm.createContext({datos:{},flujoContrato:{tipoPersona:'natural'},_flujoEsConyugal:()=>false,TIPO_LABEL_VC:{}});
function load(name){
 const start=html.search(new RegExp('^function '+name+'\\(','m'));assert.ok(start>=0,name);
 for(let end=html.indexOf('}',start);end>=0;end=html.indexOf('}',end+1)){
  let script;try{script=new vm.Script(html.slice(start,end+1));}catch{continue;}
  script.runInContext(context);return;
 }
 throw Error('Función incompleta: '+name);
}
for(const name of ['normalizarValor','vcEquivalentes','vcAgrupar','vcMejorValor','vcOrigenCampo','vcFieldKeys','getValidacionesCruzadas','computarValidaciones'])load(name);
if(/^function vcClaveChasis\(/m.test(html))load('vcClaveChasis');
const original='1HGBH41JXMN109186';
context.datos={cuv:{chasis:original},matricula:{chasis:original},notaria:{serialChasis:original}};
const row=()=>context.computarValidaciones().find(r=>r.campo==='chasis');
assert.equal(row().estado,'ok');assert.equal(row().sospechosos.length,0);assert.equal(row().coincidentes.length,3);
console.log('OK tres chasis iguales coinciden sin discrepancia');
context.datos.notaria.serialChasis='1HGBH41JXMN109187';
assert.equal(row().estado,'diff');assert.deepEqual(Array.from(row().sospechosos),['notaria']);
assert.deepEqual(Array.from(row().coincidentes),['cuv','matricula']);
console.log('OK un chasis distinto se identifica sin etiquetar como diferentes los dos coincidentes');
context.datos.notaria.serialChasis=original;context.datos.notaria._origins={serialChasis:'manual'};
assert.equal(row().estado,'ok');assert.equal(row().sospechosos.length,0);assert.equal(row().coincidentes.length,3);
assert.equal(context.datos.notaria.serialChasis,original);assert.equal(context.datos.notaria._origins.serialChasis,'manual');
console.log('OK al igualar manualmente desaparece la discrepancia anterior y se conserva el dato');
for(const raw of [' '+original+' ',original.toLowerCase(),original.slice(0,5)+'\u00a0'+original.slice(5),'\u200b'+original+'\u200e']){
 context.datos.notaria.serialChasis=raw;
 assert.equal(row().estado,'ok');assert.equal(context.datos.notaria.serialChasis,raw,'Comparar no modifica el original');
}
for(const different of [original.replace('1','I'),original.replace('0','O'),original+'7',original.slice(0,5)+'Ø'+original.slice(5),original.replace('H','Ḥ')]){
 context.datos.notaria.serialChasis=different;
 assert.equal(row().estado,'diff');assert.equal(context.datos.notaria.serialChasis,different);
}
console.log('OK formatos invisibles no alteran la identidad; letras o cifras distintas no se sustituyen ni se borran');
