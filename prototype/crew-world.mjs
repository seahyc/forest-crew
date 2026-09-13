import {createHash} from 'node:crypto';

const ACTORS=['player','firefighter','engineer'];
const TASKS={
 fetch_hose:{reward:10,requires:[]},
 connect_hose:{reward:15,requires:['fetch_hose']},
 repair_pump:{reward:15,requires:[]},
 operate_pump:{reward:0,requires:['repair_pump']},
 suppress_fire:{reward:30,requires:['connect_hose','operate_pump']},
};
const TOOL_NAMES=new Set(['observe','claim_task','perform_task','release_task','message_actor','acknowledge_message','begin_decision','settle_decision']);
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/;
const clone=value=>structuredClone(value);
const canonical=value=>{
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
 return JSON.stringify(value);
};
const fingerprint=value=>createHash('sha256').update(canonical(value)).digest('hex');
const exact=(args,required,optional=[])=>{
 if(!args||typeof args!=='object'||Array.isArray(args))return false;
 const keys=Object.keys(args);return required.every(key=>keys.includes(key))&&keys.every(key=>required.includes(key)||optional.includes(key));
};

export function createCrewWorld(options={}){
 const initialOxygen=Number.isSafeInteger(options.initialOxygen)&&options.initialOxygen>=0?options.initialOxygen:100;
 const claimLeaseRevisions=Number.isSafeInteger(options.claimLeaseRevisions)&&options.claimLeaseRevisions>0?options.claimLeaseRevisions:20;
 const state={revision:0,fire:'burning',pump:{repaired:false,active:false,operator:null},hose:{fetched:false,connected:false,carrier:null},tasks:Object.fromEntries(Object.keys(TASKS).map(id=>[id,{id,status:'pending',owner:null,leaseUntilRevision:null}])),actors:Object.fromEntries(ACTORS.map(id=>[id,{oxygen:initialOxygen,score:0,busy:null}])),mailboxes:Object.fromEntries(ACTORS.map(id=>[id,[]])),outboxes:Object.fromEntries(ACTORS.map(id=>[id,[]]))};
 const events=[];const calls=new Map(),decisions=new Map();let messageSequence=0;
 const record=(type,actorId,data={})=>{state.revision++;const event={sequence:events.length+1,revision:state.revision,type,actorId,...clone(data)};events.push(event);return event;};
 const fail=(error,extra={})=>({ok:false,error,...clone(extra),revision:state.revision});
 const success=(value={})=>({ok:true,...clone(value),revision:state.revision});
 const blockersFor=taskId=>{
  const blockers=[];for(const required of TASKS[taskId].requires){if(required==='operate_pump'){if(!state.pump.active)blockers.push({code:'pump_not_operated',task:'operate_pump'});}else if(state.tasks[required].status!=='completed')blockers.push({code:'prerequisite_incomplete',task:required});}
  if(taskId==='operate_pump'&&!state.pump.repaired)blockers.push({code:'pump_broken',task:'repair_pump'});
  if(taskId==='operate_pump'&&state.hose.carrier===state.tasks[taskId].owner)blockers.push({code:'hose_carrier_cannot_operate_pump',actorId:state.hose.carrier});
  return blockers;
 };
 const observe=actorId=>{
  const mailbox=state.mailboxes[actorId].slice(-20).map(message=>clone(message)),outbox=state.outboxes[actorId].slice(-20).map(message=>clone(message));
  return success({world:{fire:state.fire,pump:clone(state.pump),hose:clone(state.hose),tasks:clone(state.tasks),actors:Object.fromEntries(ACTORS.map(id=>[id,{score:state.actors[id].score,oxygen:state.actors[id].oxygen,busy:state.actors[id].busy}]))},mailbox,outbox});
 };
 const handlers={
  observe(actorId,args){if(!exact(args,[]))return fail('invalid_args');return observe(actorId);},
  claim_task(actorId,args){
   if(!exact(args,['taskId','expectedRevision'])||!Object.hasOwn(TASKS,args.taskId)||!Number.isSafeInteger(args.expectedRevision))return fail('invalid_args');
   const changedAt=options.taskScopedClaims===true?events.findLast(event=>event.taskId===args.taskId)?.revision??0:state.revision;
   if(args.expectedRevision<changedAt||args.expectedRevision>state.revision||args.expectedRevision<0)return fail('stale_revision',{expectedRevision:state.revision});
   const task=state.tasks[args.taskId],leaseExpired=task.status!=='active'&&task.owner!==null&&state.revision>=task.leaseUntilRevision;if(task.status==='completed')return fail('task_completed',{taskId:task.id});if(task.owner!==null&&!leaseExpired&&task.owner!==actorId)return fail('task_claimed',{taskId:task.id,owner:task.owner,leaseUntilRevision:task.leaseUntilRevision});
   if(state.actors[actorId].busy&&state.actors[actorId].busy!==task.id)return fail('actor_busy',{taskId:state.actors[actorId].busy});
   const priorOwner=task.owner;if(task.owner===actorId&&!leaseExpired){task.leaseUntilRevision=state.revision+claimLeaseRevisions+1;record('TaskClaimRenewed',actorId,{taskId:task.id,leaseUntilRevision:task.leaseUntilRevision});return success({task:clone(task)});}
   task.owner=actorId;task.status='claimed';task.leaseUntilRevision=state.revision+claimLeaseRevisions+1;record('TaskClaimed',actorId,{taskId:task.id,leaseUntilRevision:task.leaseUntilRevision,...(leaseExpired?{expiredOwner:priorOwner}:{})});return success({task:clone(task)});
  },
  perform_task(actorId,args){
   if(!exact(args,['taskId'])||!Object.hasOwn(TASKS,args.taskId))return fail('invalid_args');const task=state.tasks[args.taskId];
   if(task.status==='completed')return success({task:clone(task),reward:0,replayedState:true});if(task.owner!==actorId||(task.status!=='active'&&state.revision>=task.leaseUntilRevision))return fail('claim_required',{taskId:task.id,owner:task.owner,leaseExpired:task.owner===actorId});
   if(task.id==='operate_pump'&&task.status==='active')return success({task:clone(task),commitment:'maintained_until_release',replayedState:true});
   if(state.actors[actorId].busy&&state.actors[actorId].busy!==task.id)return fail('actor_busy',{taskId:state.actors[actorId].busy});
   const blockers=blockersFor(task.id);if(blockers.length)return fail('blocked',{taskId:task.id,blockers});
   if(task.id==='fetch_hose'){state.hose.fetched=true;state.hose.carrier=actorId;}
   if(task.id==='connect_hose'){state.hose.connected=true;state.hose.carrier=null;}
   if(task.id==='repair_pump')state.pump.repaired=true;
   if(task.id==='operate_pump'){state.pump.active=true;state.pump.operator=actorId;state.actors[actorId].busy=task.id;task.status='active';record('TaskActivated',actorId,{taskId:task.id});return success({task:clone(task),commitment:'maintained_until_release'});}
   if(task.id==='suppress_fire')state.fire='contained';
   task.status='completed';task.owner=null;task.leaseUntilRevision=null;const reward=TASKS[task.id].reward;state.actors[actorId].score+=reward;record('TaskCompleted',actorId,{taskId:task.id,reward});return success({task:clone(task),reward});
  },
  release_task(actorId,args){
   if(!exact(args,['taskId'])||!Object.hasOwn(TASKS,args.taskId))return fail('invalid_args');const task=state.tasks[args.taskId];if(task.owner!==actorId||(task.status!=='active'&&state.revision>=task.leaseUntilRevision))return fail('not_claim_owner',{taskId:task.id,owner:task.owner});
   if(task.id==='operate_pump'){state.pump.active=false;state.pump.operator=null;state.actors[actorId].busy=null;}
   if(task.id==='fetch_hose'&&task.status!=='completed')state.hose.carrier=null;
   task.owner=null;task.status='pending';task.leaseUntilRevision=null;record('TaskReleased',actorId,{taskId:task.id});return success({task:clone(task)});
  },
  message_actor(actorId,args){
   if(!exact(args,['to','text'])||!ACTORS.includes(args.to)||args.to===actorId||typeof args.text!=='string'||!args.text.trim()||args.text.length>500)return fail('invalid_args');
   const id=`msg-${++messageSequence}`;const message={id,from:actorId,to:args.to,text:args.text,acknowledged:false};state.mailboxes[args.to].push(message);state.outboxes[actorId].push(message);if(state.mailboxes[args.to].length>100)state.mailboxes[args.to].shift();if(state.outboxes[actorId].length>100)state.outboxes[actorId].shift();record('MessageSent',actorId,{messageId:id,to:args.to});return success({messageId:id});
  },
  acknowledge_message(actorId,args){
   if(!exact(args,['messageId'])||typeof args.messageId!=='string')return fail('invalid_args');const message=state.mailboxes[actorId].find(item=>item.id===args.messageId);if(!message)return fail('message_not_found');if(message.acknowledged)return success({messageId:message.id,replayedState:true,note:'acknowledgement confirms receipt only'});
   message.acknowledged=true;record('MessageAcknowledged',actorId,{messageId:message.id,from:message.from});return success({messageId:message.id,note:'acknowledgement confirms receipt only'});
  },
  begin_decision(actorId,args){
   if(!exact(args,['decisionId','maxCost'])||typeof args.decisionId!=='string'||!ID.test(args.decisionId)||!Number.isSafeInteger(args.maxCost)||args.maxCost<=0)return fail('invalid_args');const existing=decisions.get(args.decisionId);
   if(existing){if(existing.actorId!==actorId||existing.maxCost!==args.maxCost)return fail('decision_conflict');return success({decision:clone(existing),replayedState:true});}
   const reserved=[...decisions.values()].filter(d=>d.actorId===actorId&&d.status==='reserved').reduce((sum,d)=>sum+d.maxCost,0);if(state.actors[actorId].oxygen-reserved<args.maxCost)return fail('oxygen_exhausted',{available:state.actors[actorId].oxygen-reserved});
   const decision={decisionId:args.decisionId,actorId,maxCost:args.maxCost,status:'reserved',actualCost:null};decisions.set(args.decisionId,decision);record('DecisionReserved',actorId,{decisionId:args.decisionId,maxCost:args.maxCost});return success({decision:clone(decision)});
  },
  settle_decision(actorId,args){
   if(!exact(args,['decisionId','actualCost'])||typeof args.decisionId!=='string'||!ID.test(args.decisionId)||!Number.isSafeInteger(args.actualCost)||args.actualCost<0)return fail('invalid_args');const decision=decisions.get(args.decisionId);if(!decision||decision.actorId!==actorId)return fail('decision_not_found');if(args.actualCost>decision.maxCost)return fail('decision_overspend',{maxCost:decision.maxCost});
   if(decision.status==='settled'){if(decision.actualCost!==args.actualCost)return fail('decision_conflict');return success({decision:clone(decision),replayedState:true});}
   decision.status='settled';decision.actualCost=args.actualCost;state.actors[actorId].oxygen-=args.actualCost;record('DecisionSettled',actorId,{decisionId:args.decisionId,actualCost:args.actualCost,refunded:decision.maxCost-args.actualCost});return success({decision:clone(decision),oxygen:state.actors[actorId].oxygen});
  },
 };
 const execute=request=>{
  if(!request||typeof request!=='object'||Array.isArray(request)||!exact(request,['actorId','callId','tool','args'])||!ACTORS.includes(request.actorId)||typeof request.callId!=='string'||!ID.test(request.callId)||typeof request.tool!=='string'||!TOOL_NAMES.has(request.tool))return fail('invalid_request');
  const print=fingerprint({actorId:request.actorId,tool:request.tool,args:request.args}),prior=calls.get(request.callId);if(prior){if(prior.fingerprint!==print)return fail('call_id_conflict');return clone(prior.result);}
  const result=handlers[request.tool](request.actorId,request.args);calls.set(request.callId,{fingerprint:print,result:clone(result)});return result;
 };
 return {execute,snapshot:()=>clone({...state,decisions:Object.fromEntries(decisions)}),get events(){return clone(events);}};
}
