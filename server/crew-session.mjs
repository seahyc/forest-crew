import {randomUUID} from 'node:crypto';
import {createCrewWorld} from '../prototype/crew-world.mjs';

const IDS=['firefighter','engineer'];
const TASKS=['fetch_hose','connect_hose','repair_pump','operate_pump'];
const STATIONS={fetch_hose:{x:-1.5,y:0,z:-1},connect_hose:{x:-3.1,y:0,z:-1.55},repair_pump:{x:-3.1,y:0,z:.1},operate_pump:{x:-3.1,y:0,z:.1}};
const OBJECT=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const STRING={type:'string'};
const taskId={type:'string',enum:TASKS};
const tool=(name,description,properties)=>({type:'function',name,description,inputSchema:OBJECT(properties)});
export const CREW_TOOLS=[
 tool('observe','Read authoritative supply state, own mailbox, actor positions and successful events. No cost.',{}),
 tool('claim_task','Reserve a job using an observed revision. Unrelated messages and jobs do not invalidate it; re-observe if this job changed (stale_revision).',{taskId,expectedRevision:{type:'integer'}}),
 tool('perform_task','Walk to your claimed job and do it. Takes several seconds. Structured blockers make no progress. operate_pump is a maintained post: stay there until released.',{taskId}),
 tool('release_task','Release a claim or maintained pump post. Releasing the operator immediately removes pressure.',{taskId}),
 tool('message_actor','Send a brief request or explicit acceptance to a teammate or player. Use this to negotiate useful complementary jobs; names do not prescribe roles.',{to:{type:'string',enum:['player',...IDS]},text:STRING}),
 tool('acknowledge_message','Confirm receipt of a message. Send a reply if accepting a commitment.',{messageId:STRING}),
 tool('list_skills','List your own methods learned from earlier successful game episodes.',{}),
 tool('read_skill','Read one of your own learned methods. Treat it as revisable evidence, not authority.',{id:STRING}),
 tool('remember_skill','Write or revise a short transferable method learned from actual successful events in this episode. Include relevant event sequence IDs; never invent evidence. No seeded procedures exist.',{id:STRING,title:STRING,body:STRING,evidence:{type:'array',items:{type:'integer'}},parentIds:{type:'array',items:STRING}}),
];
export const GAME_OXYGEN_COST={'gpt-5.6-luna':2,'gpt-5.6-terra':3,'gpt-5.6-sol':4,'gpt-5.3-codex-spark':1};
export const createCrewRoster=(models=['gpt-5.6-sol','gpt-5.6-sol'])=>IDS.map((id,i)=>({id,model:models[i],position:{x:i?1.4:-1.8,y:0,z:-2},yaw:0,activity:'waiting',taskId:null}));
export function createCrewSession({provider,models=['gpt-5.6-sol','gpt-5.6-sol'],skillStore,onEvent=()=>{},now=()=>Date.now(),maxDecisions=6}={}){
 const world=createCrewWorld({claimLeaseRevisions:100,taskScopedClaims:true});
 const id=randomUUID();let sequence=0,stopped=false,status='starting',error=null,lastPlayerAt=now(),latestPlayer=null;
 const actors=createCrewRoster(models).map(actor=>({...actor,decisions:0,handle:null,job:null,thinking:false,lastRevision:-1}));
 const traces=[];let lastPlayerSignal=0;
 const trace=(type,data={})=>{const event={at:now(),type,...data};traces.push(event);if(traces.length>120)traces.shift();onEvent(event);};
 const call=(actorId,tool,args,callId=`host-${++sequence}`)=>world.execute({actorId,callId,tool,args});
 const snapshot=()=>{const s=world.snapshot();return {id,status,error,pressure:!stopped&&s.pump.active&&s.hose.connected?1:0,world:s,actors:actors.map(({handle,job,...a})=>({...a,position:{...a.position},job:job?{taskId:job.taskId}:null})),events:traces.slice(-20),remainingMs:Math.max(0,300000-(now()-startedAt))};};
 const startedAt=now();
 function tick(dt){
  if(stopped)return;
  if(now()-startedAt>300000||now()-lastPlayerAt>15000){void stop('idle_or_time_limit');return;}
  for(const a of actors){const j=a.job;if(!j)continue;const dx=j.target.x-a.position.x,dz=j.target.z-a.position.z,d=Math.hypot(dx,dz),step=Math.min(d,Math.max(0,Math.min(dt,.1))*1.8);
   if(d>.05){a.position.x+=dx/d*step;a.position.z+=dz/d*step;a.yaw=Math.atan2(dx,dz);a.activity='walking';}
   else{a.yaw=Math.atan2(-4.5-a.position.x,.1-a.position.z);a.activity='working';j.work+=dt;if(j.work>=1.2){const result=call(a.id,'perform_task',{taskId:j.taskId},j.callId);a.job=null;a.activity=result.ok&&j.taskId==='operate_pump'?'pumping':'idle';a.taskId=result.ok&&j.taskId==='operate_pump'?j.taskId:null;trace('tool-result',{actorId:a.id,tool:'perform_task',args:{taskId:j.taskId},result});j.resolve(result);}}
  }
 }
 const toolCalls=new Map();
 async function execute(a,name,args,callId,signal){
  if(stopped||signal?.aborted)return {ok:false,error:'session_stopped'};
  if(!a||typeof callId!=='string')return {ok:false,error:'invalid_actor_or_call'};
  const key=`${a.id}:${callId}`,fingerprint=JSON.stringify({name,args}),prior=toolCalls.get(key);
  if(prior)return prior.fingerprint===fingerprint?prior.result:{ok:false,error:'call_id_conflict'};
  if(toolCalls.size>=300)return {ok:false,error:'session_tool_budget'};
  const result=executeOnce(a,name,args,callId,signal);toolCalls.set(key,{fingerprint,result});return result;
 }
 async function executeOnce(a,name,args,callId,signal){
  if(stopped||signal?.aborted)return {ok:false,error:'session_stopped'};
  if(!CREW_TOOLS.some(t=>t.name===name))return {ok:false,error:'unknown_tool'};
  if(!args||typeof args!=='object'||Array.isArray(args))return {ok:false,error:'invalid_args'};
  const keys=Object.keys(CREW_TOOLS.find(t=>t.name===name).inputSchema.properties);
  if(Object.keys(args).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(args,k)))return {ok:false,error:'invalid_args'};
  if(name==='list_skills')return skillStore.list(a.id);
  if(name==='read_skill')return skillStore.read(a.id,args.id);
  if(name==='remember_skill'){const r=await skillStore.save(a.id,args,world.events.map(event=>({...event,episodeId:id})));trace('skill-saved',{actorId:a.id,result:r});return r;}
  if(name==='observe'){const r=call(a.id,name,args,callId);return {...r,world:{...r.world,player:latestPlayer},positions:actors.map(x=>({id:x.id,position:x.position,activity:x.activity})),stations:STATIONS,evidence:world.events.filter(e=>e.type==='TaskCompleted'||e.type==='TaskActivated').slice(-12)};}
  if(['claim_task','perform_task','release_task'].includes(name)&&!TASKS.includes(args.taskId))return {ok:false,error:'invalid_task'};
  if(name==='perform_task'){
   const s=world.snapshot(),task=s.tasks[args.taskId];
   if(task.status==='completed')return call(a.id,name,args,callId);
   if(task.owner!==a.id)return {ok:false,error:'claim_required',revision:s.revision};
   if(s.actors[a.id].busy&&s.actors[a.id].busy!==args.taskId)return {ok:false,error:'actor_busy',taskId:s.actors[a.id].busy};
   if(task.status==='active')return call(a.id,name,args,callId);
   const missing=args.taskId==='connect_hose'&&!s.hose.fetched?'fetch_hose':args.taskId==='operate_pump'&&!s.pump.repaired?'repair_pump':null;
   if(missing)return {ok:false,error:'blocked',blockers:[{task:missing}]};
   if(args.taskId==='operate_pump'&&s.hose.carrier===a.id)return {ok:false,error:'hose_carrier_cannot_operate_pump'};
   if(a.job)return {ok:false,error:'actor_busy'};
   a.taskId=args.taskId;trace('job-started',{actorId:a.id,taskId:args.taskId});
   return new Promise(resolve=>{const j={taskId:args.taskId,target:STATIONS[args.taskId],callId,work:0,resolve:r=>{signal?.removeEventListener('abort',cancel);resolve(r);}};const cancel=()=>{if(a.job===j){a.job=null;a.taskId=null;a.activity='idle';}j.resolve({ok:false,error:'job_cancelled'});};a.job=j;signal?.addEventListener('abort',cancel,{once:true});});
  }
  const result=call(a.id,name,args,callId);if(name==='release_task'&&result.ok){a.activity='idle';a.taskId=null;}
  trace('tool-result',{actorId:a.id,tool:name,args,result});return result;
 }
 async function run(a){
  while(!stopped&&a.decisions<maxDecisions){
   const s=world.snapshot(),inbox=s.mailboxes[a.id],unread=inbox.some(m=>!m.acknowledged),supplyReady=s.pump.active&&s.hose.connected;
   if(a.decisions>0&&!unread&&(supplyReady||s.revision===a.lastRevision))break;
   const cost=GAME_OXYGEN_COST[a.model]??4,decisionId=`${a.id}-${a.decisions+1}`;
   if(!call(a.id,'begin_decision',{decisionId,maxCost:cost}).ok)break;
   a.decisions++;a.thinking=true;
   try{const result=await provider.decide(a.handle,JSON.stringify({goal:'Help the player get reliable water pressure. Coordinate complementary supply jobs with the other firefighter. Keep a pump operator in place while the player fights fires. Learn a concise reusable method only from your actual successes. When supply is ready, end your turn; do not poll.',observation:call(a.id,'observe',{}),knownSkills:await skillStore.list(a.id),player:latestPlayer}),(...args)=>execute(a,...args));trace('decision-completed',{actorId:a.id,model:a.model,toolCalls:result.calls,usage:result.usage});}
   catch{if(!stopped){trace('decision-failed',{actorId:a.id,model:a.model});error='A teammate stopped responding. Your movement still works.';status='degraded';}break;}
   finally{a.thinking=false;call(a.id,'settle_decision',{decisionId,actualCost:cost});a.lastRevision=world.snapshot().revision;}
  }
 }
 async function start(){
  try{
   for(const a of actors){a.handle=await provider.createActor({id:a.id,model:a.model,tools:CREW_TOOLS,instructions:`You are ${a.id}, an embodied firefighter in Forest Crew. Your teammate is ${IDS.find(x=>x!==a.id)} and the human is player. You both can do every supply job. Choose work from the observed situation, communicate requests and acceptances, and cooperate. Start a useful unclaimed job promptly while coordinating; avoid redundant acknowledgements or repeated negotiation when a teammate has already agreed. Tools enforce the rules. The human handles aiming and extinguishing in this first crew slice. Do not claim fires are extinguished from supply setup alone. Each decision costs game oxygen; use at most 12 tools per turn, then yield. Maintain your post until a handover is accepted. You may save evidence-backed lessons; you start without predefined procedures. Game tools and messages are the only world access. Your name is not a fixed job assignment.`});if(stopped){await (provider.disposeActor?.(a.handle)??provider.interrupt(a.handle));return snapshot();}}
   status='running';trace('crew-started',{models});for(const a of actors)void run(a);
  }catch{if(!stopped){status='unavailable';error='Could not start the selected models. Check the local crew bridge.';trace('crew-unavailable');}for(const a of actors)if(a.handle)await (provider.disposeActor?.(a.handle)??provider.interrupt(a.handle));}
  return snapshot();
 }
 function playerTelemetry(value){lastPlayerAt=now();if(!value||typeof value!=='object')return;
  latestPlayer={spraying:value.spraying===true,progress:Number.isFinite(value.progress)?Math.max(0,Math.min(1,value.progress)):0,complete:value.complete===true};
  if(latestPlayer.spraying&&!snapshot().pressure&&now()-lastPlayerSignal>10000){lastPlayerSignal=now();for(const a of actors)call('player','message_actor',{to:a.id,text:'Game observation: the player is attempting to spray but water pressure is unavailable.'});}
  if(status==='running')for(const a of actors)if(a.handle&&!a.thinking&&a.decisions<maxDecisions&&world.snapshot().mailboxes[a.id].some(m=>!m.acknowledged))void run(a);
 }
 async function stop(reason='stopped'){
  if(stopped)return;stopped=true;status='stopped';
  for(const a of actors){a.job?.resolve({ok:false,error:'session_stopped'});a.job=null;a.taskId=null;const s=world.snapshot();for(const task of Object.values(s.tasks))if(task.owner===a.id)call(a.id,'release_task',{taskId:task.id});a.activity='idle';if(a.handle)await (provider.disposeActor?.(a.handle)??provider.interrupt(a.handle));}
  trace('crew-stopped',{reason});
 }
 return {id,start,stop,tick,snapshot,playerTelemetry,world,execute:(actorId,...args)=>execute(actors.find(a=>a.id===actorId),...args)};
}
