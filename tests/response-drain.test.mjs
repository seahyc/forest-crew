import test from 'node:test';
import assert from 'node:assert/strict';
import {PlaytestSession} from '../src/handwalk/playtest-session.mjs';

test('post consumes a successful response body before resolving',async()=>{
 let pulls=0;
 const body=new ReadableStream({pull(controller){pulls++;if(pulls===1)controller.enqueue(new TextEncoder().encode('ok'));else controller.close();}});
 const session=new PlaytestSession({baseUrl:'http://local/',retryDelays:[],fetchImpl:async()=>new Response(body,{status:201})});
 const response=await session.post('sessions/00000000-0000-4000-8000-000000000000/telemetry',{method:'POST'},0);
 assert.equal(response.status,201);
 assert.equal(response.bodyUsed,true);
 assert.ok(pulls>=2);
});

test('post cancels a response body that does not finish within the bound',async()=>{
 let cancelled=false;
 const body=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}});
 const session=new PlaytestSession({baseUrl:'http://local/',retryDelays:[],responseDrainTimeoutMs:10,fetchImpl:async()=>new Response(body,{status:201})});
 await assert.rejects(()=>session.post('sessions/00000000-0000-4000-8000-000000000000/end',{method:'POST'},0),/response body timed out/);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(cancelled,true);
});
