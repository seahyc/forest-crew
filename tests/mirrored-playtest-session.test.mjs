import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedFetch} from '../src/handwalk/mirrored-playtest-session.mjs';

test('bounded fetch times out a stalled request without AbortSignal statics',async()=>{
 const fetchImpl=(_url,{signal})=>new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 });
 await assert.rejects(createBoundedFetch(fetchImpl,5)('https://example.test'),error=>error?.name==='TimeoutError');
});

test('bounded fetch forwards a supplied abort signal',async()=>{
 const external=new AbortController(),reason=new Error('caller stopped');
 const fetchImpl=(_url,{signal})=>new Promise((resolve,reject)=>{
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
 });
 const request=createBoundedFetch(fetchImpl,1000)('https://example.test',{signal:external.signal});
 external.abort(reason);
 await assert.rejects(request,error=>error===reason);
});

test('timeout is cleared after response headers so its body can drain independently',async()=>{
 let bodyController;
 const body=new ReadableStream({start(controller){bodyController=controller;}});
 const response=await createBoundedFetch(async()=>new Response(body),5)('https://example.test');
 await new Promise(resolve=>setTimeout(resolve,15));
 bodyController.enqueue(new TextEncoder().encode('complete'));
 bodyController.close();
 assert.equal(await response.text(),'complete');
});
