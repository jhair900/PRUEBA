const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../gas/script.gs'),'utf8');
let now=Date.now(),failStorage=false,upstreamStatus=403,fetches=0;
const rows=[['PRUEBA','Prueba','',false,true,false,'fixture',new Date(now+1000*60*60*24)]];
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const sheet={getLastRow:()=>rows.length+1,getRange:(r,c,n=1,w=1)=>({getValues:()=>Array.from({length:n},(_,i)=>rows[r+i-2].slice(c-1,c-1+w)),getValue:()=>rows[r-2][c-1],setValue:v=>rows[r-2][c-1]=v,setValues:values=>values.forEach((row,i)=>row.forEach((v,j)=>rows[r+i-2][c+j-1]=v))})};
const ctx=vm.createContext({Date:Clock,console:{log(){}},SpreadsheetApp:{getActiveSpreadsheet:()=>{if(failStorage)throw Error('storage');return {getSheetByName:()=>sheet};},flush(){}},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
 Utilities:{getUuid:crypto.randomUUID,computeDigest:(_,v)=>[...crypto.createHash('sha256').update(v).digest()],DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},base64Encode:v=>Buffer.from(v).toString('base64')},
 PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'ficticia'})},
 ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({text,setMimeType(){return this;}})},
 UrlFetchApp:{fetch(){fetches++;return {getResponseCode:()=>upstreamStatus,getContentText:()=>JSON.stringify({error:{status:'PERMISSION_DENIED'}}),getAllHeaders:()=>({})};}}
});
vm.runInContext(source,ctx);rows[0][2]=ctx.hashPassword_('correcta');
const check=()=>ctx.handleAction_('validateSession',{sessionToken:rows[0][6]});
let resp=check();assert.equal(resp.ok,true);assert.equal(resp.session.user,'PRUEBA');assert.equal(resp.session.isAdmin,false);assert.equal(resp.session.expiresAt,now+30*24*60*60*1000);assert.equal(rows[0][7].getTime(),resp.session.expiresAt,'Renovación deslizante real, comunicada al cliente');assert.equal(resp.session.sessionToken,undefined);
console.log('OK backend: comprobación y renovación sin exponer token ni fila interna');
const token=rows[0][6];rows[0][7]=new Date(now-1);assert.equal(check().code,'AUTH_EXPIRED');
let env=JSON.parse(ctx.geminiProxy_({op:'generate',model:'gemini-3.5-flash-lite'},JSON.stringify({sessionToken:token,request:{}})).text);assert.equal(env._proxy.origin,'session');assert.equal(env._proxy.authCode,'AUTH_EXPIRED');assert.equal(fetches,0);
rows[0][7]=new Date(now+30*24*60*60*1000);env=JSON.parse(ctx.geminiProxy_({op:'generate',model:'gemini-3.5-flash-lite'},JSON.stringify({sessionToken:token,request:{}})).text);assert.equal(env._proxy.origin,'provider');assert.equal(env._proxy.status,403);assert.equal(env.session.user,'PRUEBA');assert.equal(fetches,1);
failStorage=true;assert.equal(check().code,'SESSION_SERVICE_ERROR');failStorage=false;
assert.equal(ctx.handleAction_('listUsers',{sessionToken:token}).code,'FORBIDDEN');
assert.equal(ctx.handleAction_('login',{username:'PRUEBA',password:'incorrecta'}).ok,false);
resp=ctx.handleAction_('login',{username:'PRUEBA',password:'correcta'});assert.equal(resp.ok,true);assert.ok(resp.expiresAt>now);assert.notEqual(resp.sessionToken,token);assert.equal(ctx.validateSession_(token).code,'AUTH_REQUIRED');
assert.equal(ctx.handleAction_('logout',{sessionToken:resp.sessionToken}).ok,true);assert.equal(ctx.validateSession_(resp.sessionToken).code,'AUTH_REQUIRED');
console.log('OK backend: vencimiento, revocación, credenciales incorrectas/correctas y distinción de sesión, permisos, servicio de sesiones y proveedor IA');
