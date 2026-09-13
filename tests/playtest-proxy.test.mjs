import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createPlaytestProxy} from '../scripts/playtest-proxy.mjs';

const ORIGIN='http://127.0.0.1:4180',KEY='test-service-key-never-return-this';
async function fixture(options={}){
 const calls=[];const fetchImpl=options.fetchImpl??(async(url,init)=>{calls.push({url:String(url),init});return Response.json({session:'ok',token:'bearer'});});
 const middleware=createPlaytestProxy({serviceKey:options.serviceKey,fetchImpl,allowedOrigin:ORIGIN});
 const server=createServer((req,res)=>middleware(req,res,()=>{res.writeHead(404);res.end('asset');}));server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();return {calls,base:`http://127.0.0.1:${address.port}`,close:()=>new Promise(resolve=>{server.closeAllConnections?.();server.close(resolve);})};
}
const post=(base,path,body='{}',headers={})=>fetch(base+path,{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json',...headers},body});

test('rejects unauthorised origin before forwarding',async()=>{const f=await fixture({serviceKey:KEY});try{const response=await post(f.base,'/api/playtests/sessions','{}',{origin:'http://evil.test'});assert.equal(response.status,403);assert.equal(f.calls.length,0);}finally{await f.close();}});

test('rejects methods and paths outside the narrow write API',async()=>{const f=await fixture({serviceKey:KEY});try{assert.equal((await fetch(f.base+'/api/playtests/sessions',{headers:{origin:ORIGIN}})).status,405);assert.equal((await post(f.base,'/api/playtests/admin')).status,404);assert.equal((await post(f.base,'/elsewhere')).status,404);assert.equal(f.calls.length,0);}finally{await f.close();}});

test('enforces telemetry and clip body caps',async()=>{const f=await fixture({serviceKey:KEY});const id='00000000-0000-4000-8000-000000000000';try{assert.equal((await post(f.base,`/api/playtests/sessions/${id}/telemetry`,'x'.repeat(256*1024+1),{'content-type':'application/octet-stream'})).status,413);assert.equal((await post(f.base,`/api/playtests/sessions/${id}/clips/0`,'x'.repeat(1024*1024+1),{'content-type':'video/webm'})).status,413);assert.equal(f.calls.length,0);}finally{await f.close();}});

test('strips client identity, injects private identity, and forces archive tag',async()=>{const f=await fixture({serviceKey:KEY});try{const response=await post(f.base,'/api/playtests/sessions',JSON.stringify({noticeShown:true,recordingMode:'opt-out',version:'spoof'}),{'x-playtest-service-key':'browser-key','x-playtest-client':'browser-client','authorization':'Bearer supplied'});assert.equal(response.status,200);const call=f.calls[0],forwarded=JSON.parse(Buffer.from(call.init.body).toString());assert.equal(forwarded.version,'forest-crew/0.2.2/local-preview');assert.equal(call.init.headers.get('x-playtest-service-key'),KEY);assert.match(call.init.headers.get('x-playtest-client'),/^[a-f0-9]{64}$/);assert.equal(call.init.headers.get('authorization'),'Bearer supplied');const text=await response.text();assert.equal(text.includes(KEY),false);assert.equal(text.includes('browser-key'),false);}finally{await f.close();}});

test('missing key is an honest optional 503 and never calls upstream',async()=>{const f=await fixture({serviceKey:''});try{const response=await post(f.base,'/api/playtests/sessions',JSON.stringify({noticeShown:true}));assert.equal(response.status,503);assert.match((await response.json()).error,/unavailable/i);assert.equal(f.calls.length,0);}finally{await f.close();}});

test('never reflects the injected service key even if an upstream response contains it',async()=>{const f=await fixture({serviceKey:KEY,fetchImpl:async()=>Response.json({debug:KEY})});try{const response=await post(f.base,'/api/playtests/sessions',JSON.stringify({noticeShown:true}));assert.equal(response.status,503);assert.equal((await response.text()).includes(KEY),false);}finally{await f.close();}});
