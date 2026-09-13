import test from 'node:test';
import assert from 'node:assert/strict';
import {createCrewWorld} from '../prototype/crew-world.mjs';

// These scripted callers are protocol fixtures, not simulated agents or evidence of model coordination.
const call=(world,actorId,callId,tool,args={})=>world.execute({actorId,callId,tool,args});
const claim=(world,actorId,callId,taskId)=>call(world,actorId,callId,'claim_task',{taskId,expectedRevision:world.snapshot().revision});

test('two independent caller sequences cooperate through the hose and pump chain',()=>{
 const world=createCrewWorld();
 assert.equal(claim(world,'firefighter','f-claim-fetch','fetch_hose').ok,true);
 assert.equal(call(world,'firefighter','f-do-fetch','perform_task',{taskId:'fetch_hose'}).ok,true);
 assert.equal(claim(world,'firefighter','f-claim-connect','connect_hose').ok,true);
 assert.equal(call(world,'firefighter','f-do-connect','perform_task',{taskId:'connect_hose'}).ok,true);
 assert.equal(call(world,'firefighter','f-msg','message_actor',{to:'engineer',text:'Hose connected; establish pressure.'}).ok,true);
 const inbox=call(world,'engineer','e-observe','observe',{}).mailbox;assert.equal(inbox.length,1);assert.equal(inbox[0].acknowledged,false);
 const ack=call(world,'engineer','e-ack','acknowledge_message',{messageId:inbox[0].id});assert.match(ack.note,/receipt only/);
 assert.equal(claim(world,'engineer','e-claim-repair','repair_pump').ok,true);
 assert.equal(call(world,'engineer','e-do-repair','perform_task',{taskId:'repair_pump'}).ok,true);
 assert.equal(claim(world,'engineer','e-claim-pump','operate_pump').ok,true);
 assert.equal(call(world,'engineer','e-do-pump','perform_task',{taskId:'operate_pump'}).commitment,'maintained_until_release');
 assert.equal(claim(world,'firefighter','f-claim-fire','suppress_fire').ok,true);
 const contained=call(world,'firefighter','f-do-fire','perform_task',{taskId:'suppress_fire'});assert.equal(contained.ok,true);assert.equal(contained.reward,30);
 assert.equal(world.snapshot().fire,'contained');assert.equal(world.snapshot().pump.operator,'engineer');
});

test('reports prerequisites as blockers and permits released work to be reassigned',()=>{
 const world=createCrewWorld();claim(world,'player','p-claim-connect','connect_hose');
 const blocked=call(world,'player','p-do-connect','perform_task',{taskId:'connect_hose'});assert.equal(blocked.error,'blocked');assert.deepEqual(blocked.blockers,[{code:'prerequisite_incomplete',task:'fetch_hose'}]);
 assert.equal(world.snapshot().tasks.connect_hose.status,'claimed');
 assert.equal(call(world,'player','p-release','release_task',{taskId:'connect_hose'}).ok,true);
 assert.equal(claim(world,'engineer','e-reassign','connect_hose').ok,true);
 assert.equal(world.snapshot().tasks.connect_hose.owner,'engineer');
});

test('enforces exclusive claims, stale revisions, maintained pump commitment and role freedom',()=>{
 const world=createCrewWorld();const revision=world.snapshot().revision;
 assert.equal(call(world,'firefighter','first','claim_task',{taskId:'repair_pump',expectedRevision:revision}).ok,true);
 assert.equal(call(world,'engineer','duplicate','claim_task',{taskId:'repair_pump',expectedRevision:world.snapshot().revision}).error,'task_claimed');
 assert.equal(call(world,'player','stale','claim_task',{taskId:'fetch_hose',expectedRevision:revision}).error,'stale_revision');
 call(world,'firefighter','repair','perform_task',{taskId:'repair_pump'});claim(world,'player','pump-claim','operate_pump');
 assert.equal(call(world,'player','pump-do','perform_task',{taskId:'operate_pump'}).ok,true);
 assert.equal(claim(world,'player','busy-claim','fetch_hose').error,'actor_busy');
 assert.equal(call(world,'player','pump-release','release_task',{taskId:'operate_pump'}).ok,true);
 assert.equal(claim(world,'player','free-claim','fetch_hose').ok,true);
});

test('expires idle claim leases deterministically and allows reassignment',()=>{
 const world=createCrewWorld({claimLeaseRevisions:2});claim(world,'firefighter','lease-first','fetch_hose');
 call(world,'player','advance-one','begin_decision',{decisionId:'advance-one',maxCost:1});
 call(world,'player','advance-two','settle_decision',{decisionId:'advance-one',actualCost:0});
 const reassigned=claim(world,'engineer','lease-next','fetch_hose');assert.equal(reassigned.ok,true);assert.equal(reassigned.task.owner,'engineer');
 const claimEvent=world.events.at(-1);assert.equal(claimEvent.type,'TaskClaimed');assert.equal(claimEvent.expiredOwner,'firefighter');
});

test('blocks every preclaimed task permutation while an actor operates the pump',()=>{
 for(const preclaimed of ['fetch_hose','connect_hose','suppress_fire']){
  const world=createCrewWorld();
  claim(world,'player',`preclaim-${preclaimed}`,preclaimed);
  claim(world,'engineer',`repair-claim-${preclaimed}`,'repair_pump');call(world,'engineer',`repair-do-${preclaimed}`,'perform_task',{taskId:'repair_pump'});
  claim(world,'player',`pump-claim-${preclaimed}`,'operate_pump');call(world,'player',`pump-do-${preclaimed}`,'perform_task',{taskId:'operate_pump'});
  const blocked=call(world,'player',`preclaim-do-${preclaimed}`,'perform_task',{taskId:preclaimed});assert.equal(blocked.error,'actor_busy');assert.equal(world.snapshot().tasks[preclaimed].status,'claimed');
  const replay=call(world,'player',`pump-repeat-${preclaimed}`,'perform_task',{taskId:'operate_pump'});assert.equal(replay.replayedState,true);
  assert.equal(world.events.filter(event=>event.type==='TaskActivated').length,1);
 }
});

test('deduplicates calls, rejects fingerprint changes, and awards completed work once',()=>{
 const world=createCrewWorld();claim(world,'player','claim','fetch_hose');
 const first=call(world,'player','perform','perform_task',{taskId:'fetch_hose'}),retry=call(world,'player','perform','perform_task',{taskId:'fetch_hose'});assert.deepEqual(retry,first);
 assert.equal(world.snapshot().actors.player.score,10);assert.equal(world.events.filter(e=>e.type==='TaskCompleted').length,1);
 assert.equal(call(world,'player','perform','perform_task',{taskId:'repair_pump'}).error,'call_id_conflict');
 const later=call(world,'player','different-call','perform_task',{taskId:'fetch_hose'});assert.equal(later.reward,0);assert.equal(world.snapshot().actors.player.score,10);
});

test('reserves, settles and refunds deterministic oxygen exactly once',()=>{
 const world=createCrewWorld({initialOxygen:10});
 assert.equal(call(world,'engineer','begin-a','begin_decision',{decisionId:'decision-a',maxCost:8}).ok,true);
 assert.equal(call(world,'engineer','begin-b','begin_decision',{decisionId:'decision-b',maxCost:3}).error,'oxygen_exhausted');
 assert.equal(call(world,'engineer','over','settle_decision',{decisionId:'decision-a',actualCost:9}).error,'decision_overspend');
 const settled=call(world,'engineer','settle-a','settle_decision',{decisionId:'decision-a',actualCost:6});assert.equal(settled.oxygen,4);
 assert.deepEqual(call(world,'engineer','settle-a','settle_decision',{decisionId:'decision-a',actualCost:6}),settled);
 assert.equal(call(world,'engineer','settle-again','settle_decision',{decisionId:'decision-a',actualCost:6}).replayedState,true);
 assert.equal(call(world,'engineer','settle-conflict','settle_decision',{decisionId:'decision-a',actualCost:5}).error,'decision_conflict');
 assert.equal(world.snapshot().actors.engineer.oxygen,4);assert.equal(world.events.filter(e=>e.type==='DecisionSettled').length,1);
});

test('rejects non-string identifiers rather than coercing them',()=>{
 const world=createCrewWorld();
 assert.equal(world.execute({actorId:'player',callId:undefined,tool:'observe',args:{}}).error,'invalid_request');
 assert.equal(world.execute({actorId:'player',callId:null,tool:'observe',args:{}}).error,'invalid_request');
 assert.equal(call(world,'player','bad-decision','begin_decision',{decisionId:undefined,maxCost:1}).error,'invalid_args');
 assert.equal(call(world,'player','bad-decision-null','begin_decision',{decisionId:null,maxCost:1}).error,'invalid_args');
});

test('bounds observation mailbox and does not equate acknowledgement with task completion',()=>{
 const world=createCrewWorld();for(let i=0;i<25;i++)call(world,'player',`msg-${i}`,'message_actor',{to:'firefighter',text:`update ${i}`});
 const observed=call(world,'firefighter','observe-mail','observe',{});assert.equal(observed.mailbox.length,20);assert.equal(observed.mailbox[0].text,'update 5');
 call(world,'firefighter','ack-mail','acknowledge_message',{messageId:observed.mailbox.at(-1).id});
 const sender=call(world,'player','sender-observe','observe',{});assert.equal(sender.outbox.length,20);assert.equal(sender.outbox.at(-1).acknowledged,true);
 assert.equal(world.snapshot().fire,'burning');assert.equal(world.snapshot().tasks.suppress_fire.status,'pending');
 assert.equal(call(world,'engineer','other-observe','observe',{}).mailbox.length,0);
});

test('task-scoped claims tolerate independent work and communication but reject changed targets',()=>{
 const world=createCrewWorld({taskScopedClaims:true});let seq=0;
 const call=(actorId,tool,args)=>world.execute({actorId,tool,args,callId:`scoped-${++seq}`});
 const revision=world.snapshot().revision;
 assert.equal(call('engineer','message_actor',{to:'firefighter',text:'I can repair the pump.'}).ok,true);
 assert.equal(call('engineer','claim_task',{taskId:'repair_pump',expectedRevision:revision}).ok,true);
 assert.equal(call('firefighter','claim_task',{taskId:'fetch_hose',expectedRevision:revision}).ok,true);
 assert.equal(call('firefighter','claim_task',{taskId:'repair_pump',expectedRevision:revision}).error,'stale_revision');
 const beforeRelease=world.snapshot().revision;
 assert.equal(call('engineer','release_task',{taskId:'repair_pump'}).ok,true);
 assert.equal(call('firefighter','claim_task',{taskId:'repair_pump',expectedRevision:beforeRelease}).error,'stale_revision');
 assert.equal(call('firefighter','claim_task',{taskId:'repair_pump',expectedRevision:world.snapshot().revision}).ok,true);
 for(const expectedRevision of [-1,world.snapshot().revision+1])assert.equal(call('engineer','claim_task',{taskId:'connect_hose',expectedRevision}).error,'stale_revision');
});
