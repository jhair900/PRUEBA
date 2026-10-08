const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
async function scenario({interaction=false,remote='new',offline=false}={}){
 const events={},moves=[];let calls=0;
 const location={protocol:'https:',href:'https://test.local/pagos.html',replace:url=>moves.push(url)};
 const document={hidden:false,readyState:'complete',querySelector:s=>s.includes('meta')?{content:'old'}:null,addEventListener:(t,f)=>events[t]=f,body:{appendChild(){}},createElement:()=>({setAttribute(){},style:{}})};
 const win={addEventListener(){}};
 const ctx=vm.createContext({window:win,document,location,navigator:{onLine:true},URL,Date,JSON,AbortController,setTimeout,clearTimeout,setInterval(){},DOMParser:class{parseFromString(){return {querySelector:()=>({content:remote})};}},fetch:async()=>{calls++;if(interaction)events.input();if(offline)throw Error('offline');return {ok:true,text:async()=>calls===1?' {"version":"new"}':'html'};}});
 vm.runInContext(fs.readFileSync('js/auto-update.js','utf8'),ctx);await new Promise(r=>setImmediate(r));return moves;
}
(async()=>{assert.equal((await scenario()).length,1);assert.equal((await scenario({interaction:true})).length,0);assert.equal((await scenario({remote:'old'})).length,0);assert.equal((await scenario({offline:true})).length,0);console.log('OK nueva version recarga; actividad, despliegue parcial y red fallida no recargan');})().catch(e=>{console.error(e);process.exitCode=1;});
