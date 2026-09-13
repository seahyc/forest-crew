import test from 'node:test';
import assert from 'node:assert/strict';
import {createCrewSession, GAME_OXYGEN_COST} from '../server/crew-session.mjs';

// These scripted providers are protocol fixtures. They are not real AI agents and
// their calls are not evidence of model-driven cooperation.
const quietProvider=()=>({
  async createActor({id,model}){return {id,model};},
  async decide(){return {calls:[],usage:{}};},
  async interrupt(){},
});
const skillStore={
  async list(){return {ok:true,skills:[]};},
  async read(){return {ok:false,error:'skill_not_found'};},
  async save(){return {ok:true};},
};
const makeSession=(overrides={})=>createCrewSession({provider:quietProvider(),skillStore,...overrides});
let callSequence=0;
const execute=(session,actorId,tool,args={})=>session.execute(actorId,tool,args,`test-${++callSequence}`);
const claim=(session,actorId,taskId)=>execute(session,actorId,'claim_task',{taskId,expectedRevision:session.snapshot().world.revision});

async function finishPending(session,promise,maxTicks=200){
  let settled=false,result;
  promise.then(value=>{settled=true;result=value;});
  for(let i=0;i<maxTicks&&!settled;i++){session.tick(.1);await Promise.resolve();}
  assert.equal(settled,true,'travel/work job should settle after enough ticks');
  return result;
}

test('requires a current claim and delays world effects until travel and work ticks complete',async()=>{
  const session=makeSession();
  assert.equal((await execute(session,'firefighter','perform_task',{taskId:'fetch_hose'})).error,'claim_required');
  assert.equal((await claim(session,'firefighter','fetch_hose')).ok,true);
  assert.equal((await claim(session,'engineer','fetch_hose')).error,'task_claimed');

  const pending=execute(session,'firefighter','perform_task',{taskId:'fetch_hose'});
  let settled=false;pending.then(()=>{settled=true;});
  await Promise.resolve();
  assert.equal(settled,false);
  assert.equal(session.snapshot().world.hose.fetched,false);
  assert.equal(session.snapshot().actors.find(actor=>actor.id==='firefighter').taskId,'fetch_hose');
  session.tick(.1);
  await Promise.resolve();
  assert.equal(session.snapshot().world.hose.fetched,false);

  const result=await finishPending(session,pending);
  assert.equal(result.ok,true);
  assert.equal(session.snapshot().world.hose.fetched,true);
  assert.equal(session.snapshot().world.events,undefined);
  assert.equal(session.world.events.filter(event=>event.type==='TaskCompleted'&&event.taskId==='fetch_hose').length,1);
  await session.stop();
});

test('crew work time starts only after the actor reaches the physical station',async()=>{
 const session=makeSession();
 await claim(session,'engineer','repair_pump');
 const pending=execute(session,'engineer','perform_task',{taskId:'repair_pump'});
 let settled=false;pending.then(()=>{settled=true;});await Promise.resolve();
 for(let i=0;i<12;i++)session.tick(.1);
 const travelling=session.snapshot().actors.find(actor=>actor.id==='engineer');
 assert.equal(travelling.activity,'walking');
 assert.equal(settled,false);
 assert.equal(session.snapshot().world.pump.repaired,false);
 const result=await finishPending(session,pending);
 assert.equal(result.ok,true);
 assert.equal(session.snapshot().world.pump.repaired,true);
 await session.stop();
});

test('binds claims and world outcomes to the acting crew member across a cooperative supply chain',async()=>{
  const session=makeSession();
  await claim(session,'firefighter','fetch_hose');
  assert.equal((await execute(session,'engineer','perform_task',{taskId:'fetch_hose'})).error,'claim_required');
  await finishPending(session,execute(session,'firefighter','perform_task',{taskId:'fetch_hose'}));
  await claim(session,'firefighter','connect_hose');
  await finishPending(session,execute(session,'firefighter','perform_task',{taskId:'connect_hose'}));

  await claim(session,'engineer','repair_pump');
  await finishPending(session,execute(session,'engineer','perform_task',{taskId:'repair_pump'}));
  await claim(session,'engineer','operate_pump');
  const operated=await finishPending(session,execute(session,'engineer','perform_task',{taskId:'operate_pump'}));
  assert.equal(operated.commitment,'maintained_until_release');

  const snapshot=session.snapshot();
  assert.equal(snapshot.pressure,1);
  assert.deepEqual(snapshot.world.pump,{repaired:true,active:true,operator:'engineer'});
  assert.equal(snapshot.world.hose.connected,true);
  assert.equal(snapshot.world.tasks.fetch_hose.status,'completed');
  assert.equal(snapshot.world.tasks.connect_hose.status,'completed');
  assert.equal(snapshot.world.tasks.repair_pump.status,'completed');
  assert.equal(snapshot.world.tasks.operate_pump.owner,'engineer');
  assert.deepEqual(session.world.events.filter(event=>event.type==='TaskCompleted').map(event=>[event.actorId,event.taskId]),[
    ['firefighter','fetch_hose'],['firefighter','connect_hose'],['engineer','repair_pump'],
  ]);
  assert.deepEqual(session.world.events.filter(event=>event.type==='TaskActivated').map(event=>[event.actorId,event.taskId]),[['engineer','operate_pump']]);

  assert.equal((await execute(session,'engineer','release_task',{taskId:'operate_pump'})).ok,true);
  assert.equal(session.snapshot().pressure,0);
  assert.equal(session.snapshot().world.pump.active,false);
  await session.stop();
});

test('stopping cancels pending embodied work and prevents late world side effects',async()=>{
  const interrupted=[];
  const session=makeSession({provider:{...quietProvider(),async interrupt(handle){interrupted.push(handle.id);}}});
  await session.start();
  await claim(session,'firefighter','fetch_hose');
  const pending=execute(session,'firefighter','perform_task',{taskId:'fetch_hose'});
  await Promise.resolve();
  session.tick(.1);
  await session.stop('test_stop');
  const result=await pending;
  assert.equal(result.error,'session_stopped');
  for(let i=0;i<100;i++)session.tick(.1);
  const snapshot=session.snapshot();
  assert.equal(snapshot.status,'stopped');
  assert.equal(snapshot.pressure,0);
  assert.equal(snapshot.world.hose.fetched,false);
  assert.equal(snapshot.world.tasks.fetch_hose.status,'pending');
  assert.equal(snapshot.actors.find(a=>a.id==='firefighter').taskId,null);
  assert.deepEqual(interrupted.sort(),['engineer','firefighter']);
  assert.equal(session.world.events.some(event=>event.type==='TaskCompleted'),false);
});

test('enforces max decisions and charges each model decision exactly once',async()=>{
  let releaseFirefighter;
  const firefighterGate=new Promise(resolve=>{releaseFirefighter=resolve;});
  const decisions={firefighter:0,engineer:0};
  const provider={
    async createActor({id,model}){return {id,model};},
    async decide(handle,_prompt,toolCall){
      decisions[handle.id]++;
      if(handle.id==='firefighter'){
        await toolCall('message_actor',{to:'engineer',text:'Fixture request: inspect supply.'},`fixture-message-${decisions[handle.id]}`);
        await firefighterGate;
      }
      return {calls:[],usage:{}};
    },
    async interrupt(){},
  };
  const models=['gpt-5.6-luna','gpt-5.6-terra'];
  const session=makeSession({provider,models,maxDecisions:3});
  await session.start();
  for(let i=0;i<50&&session.snapshot().actors.find(actor=>actor.id==='engineer').thinking;i++)await new Promise(resolve=>setImmediate(resolve));
  releaseFirefighter();
  for(let i=0;i<50&&session.snapshot().actors.some(actor=>actor.thinking);i++)await new Promise(resolve=>setImmediate(resolve));

  const snapshot=session.snapshot();
  assert.equal(snapshot.actors.find(actor=>actor.id==='firefighter').decisions,1);
  assert.equal(snapshot.actors.find(actor=>actor.id==='engineer').decisions,3);
  assert.deepEqual(decisions,{firefighter:1,engineer:3});
  assert.equal(snapshot.world.actors.firefighter.oxygen,100-GAME_OXYGEN_COST[models[0]]);
  assert.equal(snapshot.world.actors.engineer.oxygen,100-3*GAME_OXYGEN_COST[models[1]]);
  assert.equal(Object.keys(snapshot.world.decisions).length,4);
  assert.equal(Object.values(snapshot.world.decisions).every(decision=>decision.status==='settled'),true);
  assert.equal(session.world.events.filter(event=>event.type==='DecisionSettled').length,4);
  await session.stop();
});

test('stop during rejected actor creation preserves stopped state and zero pressure',async()=>{
  let rejectCreation;
  const creation=new Promise((_resolve,reject)=>{rejectCreation=reject;});
  const provider={
    createActor(){return creation;},
    async decide(){return {calls:[],usage:{}};},
    async interrupt(){},
    async disposeActor(){},
  };
  const session=makeSession({provider});
  const starting=session.start();
  await Promise.resolve();
  await session.stop('fixture_stop_during_start');
  rejectCreation(new Error('fixture creation failure'));
  await starting;

  const snapshot=session.snapshot();
  assert.equal(snapshot.status,'stopped');
  assert.equal(snapshot.error,null);
  assert.equal(snapshot.pressure,0);
  assert.equal(snapshot.events.some(event=>event.type==='crew-unavailable'),false);
});

test('stop during successful actor creation disposes the late actor handle',async()=>{
  let resolveCreation;
  const creation=new Promise(resolve=>{resolveCreation=resolve;});
  const disposed=[];
  const provider={
    createActor(){return creation;},
    async decide(){return {calls:[],usage:{}};},
    async interrupt(){},
    async disposeActor(handle){disposed.push(handle.id);},
  };
  const session=makeSession({provider});
  const starting=session.start();
  await Promise.resolve();
  await session.stop('fixture_stop_during_start');
  resolveCreation({id:'late-firefighter'});
  await starting;

  assert.equal(session.snapshot().status,'stopped');
  assert.equal(session.snapshot().pressure,0);
  assert.deepEqual(disposed,['late-firefighter']);
});
