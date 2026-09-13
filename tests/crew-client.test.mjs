import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const sourcePath=new URL('../src/crew-client.ts',import.meta.url);
let moduleSequence=0;

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

async function loadClient(){
 const source=await readFile(sourcePath,'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
  .replaceAll('import.meta.env.VITE_CREW_API_BASE',JSON.stringify('/api/test'));
 return import(`data:text/javascript;base64,${Buffer.from(`${output}\n//# sourceURL=crew-client-test-${moduleSequence++}.mjs`).toString('base64')}`);
}

async function fixture(fetchImpl){
 const keys=['document','fetch','performance'];
 const previous=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const restore=()=>{for(const key of keys){const descriptor=previous[key];if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
 let now=1000;
 const notices=[];
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{
  createElement(){return {className:'',textContent:'',removed:false,setAttribute(){},remove(){this.removed=true;}};},
  body:{append(node){notices.push(node);}},
 }});
 Object.defineProperty(globalThis,'fetch',{configurable:true,writable:true,value:fetchImpl});
 Object.defineProperty(globalThis,'performance',{configurable:true,writable:true,value:{now:()=>now}});
 let createCrewClient;
 try{({createCrewClient}=await loadClient());}catch(error){restore();throw error;}
 return {
  createCrewClient,
  notices,
  setNow(value){now=value;},
  async settle(){await tick();await tick();await tick();await tick();},
  restore,
 };
}

test('unauthenticated bootstrap never starts a crew session',async()=>{
 const calls=[];
 const f=await fixture(async(url,init={})=>{calls.push({url,method:init.method??'GET'});return json({authenticated:false,ready:true,localOnly:false});});
 try{
  const client=f.createCrewClient();
  await f.settle();
  client.update(1000,{active:true,spraying:false,progress:0,complete:false});
  await f.settle();
  assert.deepEqual(calls,[{url:'/api/test/status',method:'GET'}]);
  assert.equal(f.notices[0].textContent,'AI CREW · invitation required');
  assert.equal(client.pressure(),0);
 }finally{f.restore();}
});

test('invitation exchange precedes status and active play starts the session',async()=>{
 const calls=[];
 const f=await fixture(async(url,init={})=>{
  calls.push({url,method:init.method??'GET',credentials:init.credentials});
  if(url.endsWith('/access'))return json({ok:true});
  if(url.endsWith('/status'))return json({authenticated:true,ready:true,localOnly:false});
  return json({id:'session-1',status:'running',pressure:0,actors:[],world:{mailboxes:{player:[]}}});
 });
 try{
  const client=f.createCrewClient({invite:'one-use-invite'});
  await f.settle();
  assert.deepEqual(calls.map(call=>call.url),['/api/test/access','/api/test/status']);
  assert.ok(calls.every(call=>call.credentials==='same-origin'));
  client.update(1000,{active:true,spraying:false,progress:0,complete:false});
  await f.settle();
  assert.equal(calls[2].url,'/api/test/session');
  assert.equal(client.snapshot().id,'session-1');
 }finally{f.restore();}
});

for(const [status,copy] of [
 [409,'AI CREW · another crew session is already active'],
 [429,'AI CREW · today’s session limit has been reached'],
 [503,'AI CREW OFFLINE · service is unavailable'],
])test(`session HTTP ${status} has specific status copy`,async()=>{
 const f=await fixture(async url=>url.endsWith('/status')?json({authenticated:true,ready:true,localOnly:false}):json({error:'expected'},status));
 try{
  const client=f.createCrewClient();await f.settle();
  client.update(1000,{active:true,spraying:false,progress:0,complete:false});await f.settle();
  assert.equal(f.notices[0].textContent,copy);
  assert.equal(client.snapshot(),null);
 }finally{f.restore();}
});

test('reset while session creation is pending cannot revive the stale session',async()=>{
 const session=deferred();
 const calls=[];
 const f=await fixture(async url=>{calls.push(url);if(url.endsWith('/status'))return json({ready:true,localOnly:true});if(url.endsWith('/session'))return session.promise;return json({status:'stopped'});});
 try{
  const client=f.createCrewClient();await f.settle();
  client.update(1000,{active:true,spraying:false,progress:0,complete:false});await tick();
  const resetting=client.reset();
  session.resolve(json({id:'late',status:'running',pressure:1,actors:[],world:{mailboxes:{player:[]}}}));
  await resetting;await f.settle();
  assert.equal(client.snapshot(),null);
  assert.equal(client.pressure(),0);
  assert.ok(calls.includes('/api/test/stop'));
 }finally{f.restore();}
});

test('dispose while session creation is pending cannot revive or retain UI',async()=>{
 const session=deferred();
 const f=await fixture(async url=>url.endsWith('/status')?json({ready:true,localOnly:true}):url.endsWith('/session')?session.promise:json({status:'stopped'}));
 try{
  const client=f.createCrewClient();await f.settle();
  client.update(1000,{active:true,spraying:false,progress:0,complete:false});await tick();
  client.dispose();
  session.resolve(json({id:'late',status:'running',pressure:1,actors:[],world:{mailboxes:{player:[]}}}));
  await f.settle();
  assert.equal(client.snapshot(),null);
  assert.equal(client.pressure(),0);
  assert.equal(f.notices[0].removed,true);
 }finally{f.restore();}
});

test('a failed frame request drops previously fresh pressure immediately',async()=>{
 let route='status';
 const calls=[];
 const f=await fixture(async url=>{
  calls.push(url);
  if(url.endsWith('/status'))return json({ready:true,localOnly:true});
  if(url.endsWith('/session')){route='frame';return json({id:'live',status:'running',pressure:1,actors:[],world:{mailboxes:{player:[]}}});}
  if(route==='frame')throw new Error('connection lost');
  throw new Error('unexpected request');
 });
 try{
  const client=f.createCrewClient();await f.settle();
  client.update(1000,{active:true,spraying:false,progress:0,complete:false});await f.settle();
  assert.equal(client.pressure(),1);
  f.setNow(1201);
  client.update(1201,{active:true,spraying:true,progress:.2,complete:false});await f.settle();
  assert.equal(client.pressure(),0,JSON.stringify(calls));
  assert.equal(f.notices[0].textContent,'AI CREW · connection lost, water paused');
 }finally{f.restore();}
});
