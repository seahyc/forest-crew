import {test} from 'node:test';
import assert from 'node:assert/strict';
import {handleCrewRequest} from '../worker/index.mjs';
const env={PUBLIC_ORIGIN:'https://seahyingcong.com',CREW_ORIGIN:'https://oracle.example/forest-crew-api',FOREST_CREW_EDGE_KEY:'test-only-edge-key'.repeat(3)};
const request=(path,options={})=>new Request(`${env.PUBLIC_ORIGIN}/api/forest-crew/${path}`,options);
const post={method:'POST',headers:{Origin:env.PUBLIC_ORIGIN,'Content-Type':'application/json','X-Forest-Crew':'1'},body:'{}'};
test('edge denies invalid routes, origins, methods and missing secret before upstream',async()=>{
 let calls=0;const upstream=()=>{calls++;throw Error('must not fetch');};
 for(const [req,status] of [[request('other'),404],[request('status?x=1'),404],[request('session'),405],[request('session',{...post,headers:{...post.headers,Origin:'https://other.example'}}),403],[request('session',{...post,headers:{...post.headers,'X-Forest-Crew':'0'}}),403]])assert.equal((await handleCrewRequest(req,env,upstream)).status,status);
 assert.equal((await handleCrewRequest(request('status'),{...env,FOREST_CREW_EDGE_KEY:''},upstream)).status,503);assert.equal(calls,0);
});
test('edge bounds streamed bodies and forwards only allowed headers to fixed origin',async()=>{
 assert.equal((await handleCrewRequest(request('frame',{...post,body:'x'.repeat(4097)}),env,()=>{throw Error('must not fetch');})).status,413);
 let captured;const response=await handleCrewRequest(request('access',{...post,headers:{...post.headers,Cookie:'crew_access=example',Authorization:'must-not-forward'}}),env,async(url,opts)=>{
 captured={url,opts};return new Response('{"ok":true}',{headers:{'Set-Cookie':'crew_access=example; Secure; HttpOnly; Path=/api/forest-crew','X-Private':'hidden'}});
 });
 assert.equal(captured.url,env.CREW_ORIGIN+'/api/crew/access');assert.equal(captured.opts.headers.get('Authorization'),null);assert.equal(captured.opts.headers.get('X-Forest-Crew-Edge'),env.FOREST_CREW_EDGE_KEY);assert.equal(captured.opts.headers.get('Cookie'),'crew_access=example');assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('X-Private'),null);assert.match(response.headers.get('Set-Cookie'),/HttpOnly/);
});
test('edge never follows redirects and masks upstream transport failures',async()=>{
 assert.equal((await handleCrewRequest(request('status'),env,async()=>new Response(null,{status:302,headers:{Location:'https://other.example'}}))).status,502);
 assert.equal((await handleCrewRequest(request('status'),env,async()=>{throw Error('private host details');})).status,503);
});
