const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../js/session.js'),'utf8');
(async()=>{
 let now=10000,requests=0,offline=false,resolveCheck;const listeners={},timers=new Map(),state=new Map([['autocor_auth',JSON.stringify({user:'PRUEBA',token:'ficticio',isAdmin:true})]]);
 class Clock extends Date{static now(){return now;}}
 const window={addEventListener:(n,f)=>listeners[n]=f,dispatchEvent(){},AutoCorConfig:{apiUrl:'https://fixture.invalid'},AutoCorAuthUI:{openLogin(){}},AutoCorApi:{postJson:async()=>{requests++;if(offline)throw Error('red simulada');return new Promise(r=>resolveCheck=r);}}};
 vm.runInNewContext(source,{window,Date:Clock,localStorage:{getItem:k=>state.get(k)||null,setItem:(k,v)=>state.set(k,v),removeItem:k=>state.delete(k)},CustomEvent:class{},Event:class{},document:{readyState:'loading',addEventListener(){}},location:{pathname:'/contratos.html'},setTimeout:(f,ms)=>{timers.set(1,{f,ms});return 1;},clearTimeout:id=>timers.delete(id)});
 const s=window.AutoCorSession;
 assert.equal(s.snapshot().authenticated,false,'Almacenamiento no acredita autenticación');
 const checks=[s.ensure(),s.ensure(),s.ensure()];assert.equal(requests,1);resolveCheck({ok:true,session:{user:'PRUEBA',isAdmin:false,expiresAt:now+1000}});await Promise.all(checks);
 assert.equal(s.snapshot().authenticated,true);assert.equal(s.snapshot().auth.isAdmin,false);
 for(let i=0;i<5;i++)await s.ensure();assert.equal(requests,1,'Sesión vigente reutilizada sin sondeo');
 now+=1100;assert.throws(()=>s.capture(),e=>e.code==='AUTH_REQUIRED');assert.equal(s.snapshot().authenticated,false);assert.equal(state.has('autocor_auth'),false);
 s.login({sessionToken:'nuevo',expiresAt:now+2000,user:{username:'PRUEBA',isAdmin:false}});const ticket=s.capture();
 now+=500;s.consume({ok:true,session:{user:'PRUEBA',isAdmin:false,expiresAt:now+4000}},ticket);assert.equal(s.snapshot().auth.expiresAt,now+4000);
 s.logout();state.set('autocor_auth',JSON.stringify({user:'PRUEBA',token:'otro'}));offline=true;
 await assert.rejects(s.ensure());assert.equal(s.snapshot().phase,'unknown','Error de conexión no equivale a sesión vencida');
 console.log('OK estado local: prueba inicial compartida, permisos del backend, sin sondeos, vencimiento local, renovación y conexión distinta de autenticación');
})().catch(e=>{console.error(e);process.exitCode=1;});
