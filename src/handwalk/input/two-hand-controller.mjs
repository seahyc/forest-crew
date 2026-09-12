const STALE_MS=220,STOP_MS=240,TAU_MS=60,PACE_ATTACK_MS=70,PACE_RELEASE_MS=140,STEERING_TAU_MS=110,STEERING_GATE_MS=250;
const STEERING_ENTER=10*Math.PI/180,STEERING_EXIT=6*Math.PI/180,STEERING_FULL=30*Math.PI/180;
const DEPTH_ENTER=Math.log(1.12),DEPTH_EXIT=Math.log(1.06),DEPTH_FULL=Math.log(1.35),DEPTH_TAU_MS=160,DEPTH_ENTRY_MS=80;
const JOINT_KEYS=['indexMcpFlex','indexPipFlex','indexDipFlex','middleMcpFlex','middlePipFlex','middleDipFlex'];
const CYCLE_MIN_MS=240,CYCLE_MAX_MS=1800,CYCLE_MIN_AREA=.002,CYCLE_MIN_TRAVEL=.16;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const emptyGait=()=>({left:0,right:0,leftLift:0,rightLift:0,stride:0,cadence:0,run:0});
const newCycle=(flex,reach,now)=>({started:now,points:[{flex,reach}],departed:false});
function closeCycle(cycle,flex,reach,now){
 cycle.points.push({flex,reach});const points=cycle.points,start=points[0],elapsed=now-cycle.started;
 if(elapsed>CYCLE_MAX_MS)return {reset:true,evidence:null};
 const flexes=points.map(p=>p.flex),reaches=points.map(p=>p.reach),flexSpan=Math.max(...flexes)-Math.min(...flexes),reachSpan=Math.max(...reaches)-Math.min(...reaches);
 if(Math.abs(flex-start.flex)>.05||Math.abs(reach-start.reach)>.03)cycle.departed=true;
 if(!cycle.departed||elapsed<CYCLE_MIN_MS||flexSpan<=.07||reachSpan<=.04)return {reset:false,evidence:null};
 const closed=Math.abs(flex-start.flex)<=flexSpan*.25&&Math.abs(reach-start.reach)<=reachSpan*.25;
 if(!closed)return {reset:false,evidence:null};
 let area=0,travel=0,flexUp=false,flexDown=false,reachUp=false,reachDown=false;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],df=b.flex-a.flex,dr=b.reach-a.reach;area+=a.flex*b.reach-b.flex*a.reach;travel+=Math.abs(df)+Math.abs(dr);if(df>.003)flexUp=true;if(df<-.003)flexDown=true;if(dr>.002)reachUp=true;if(dr<-.002)reachDown=true;}
 const end=points.at(-1);area+=end.flex*start.reach-start.flex*end.reach;area*=.5;
 const evidence=travel>=CYCLE_MIN_TRAVEL&&flexUp&&flexDown&&reachUp&&reachDown&&Math.abs(area)>=CYCLE_MIN_AREA?{sign:area<0?-1:1,confidence:clamp(Math.abs(area)/.015),area,travel}:null;
 return {reset:true,evidence};
}
function validHands(hands){
  if(!Array.isArray(hands)||hands.length===0)return null;const ids=new Set();
  for(const h of hands){if(!h||(typeof h.id!=='string'&&typeof h.id!=='number')||(typeof h.id==='number'&&!Number.isFinite(h.id))||ids.has(h.id)||!['indexFlex','middleFlex','roll'].every(k=>Number.isFinite(h[k])))return null;ids.add(h.id);}
  return hands;
}

export class TwoHandController{
 gait=emptyGait();
 constructor(){this.stepThreshold=.06;this.steeringGain=1.8;this.cameraAspectRatio=4/3;this.steps=0;this.headingTarget=0;this.reset();}
 reset(){this.handState=new Map();this.selectedId=null;this.ownerIdleSince=null;this.challengerId=null;this.challengerSince=null;this.lastSeen=-Infinity;this.lastUpdate=null;this.lastMotion=-Infinity;this.forward=0;this.rawActivity=0;this.rawIntent=0;this.paceTarget=0;this.rhythm=0;this.run=0;this.runActive=false;this.runSince=null;this.turn=0;this.handsVisible=0;this.lastStep=-Infinity;this.stepTimes=[];this.gait=emptyGait();this.resetSteering();this.decision='reset';}
 calibrate(hands,now,heading=this.headingTarget){
  const valid=validHands(hands);this.handState.clear();this.selectedId=null;this.forward=0;this.run=0;this.runActive=false;this.runSince=null;this.turn=0;this.resetSteering();this.lastUpdate=Number.isFinite(now)?now:null;
  if(Number.isFinite(heading))this.headingTarget=heading;
  if(!valid||!Number.isFinite(now))return this.read(now);
  for(const h of valid)this.rebase(h,now);
  this.updateSteering(valid,now,0);
  this.selectedId=valid[0]?.id??null;
  this.lastSeen=now;this.handsVisible=valid.length;this.decision='calibrated';return this.read(now);
 }
 rebase(h,now){const differential=h.indexFlex-h.middleFlex,common=(h.indexFlex+h.middleFlex)/2,joints=JOINT_KEYS.every(key=>Number.isFinite(h[key]))?Object.fromEntries(JOINT_KEYS.map(key=>[key,h[key]])):null,geometric=['indexReach','middleReach'].every(key=>Number.isFinite(h[key]));this.handState.set(h.id,{differential,neutral:differential,common,neutralCommon:common,joints,activity:0,commonActivity:0,lastSeen:now,phase:0,pendingPhase:0,cycles:geometric?{index:newCycle(h.indexFlex,h.indexReach,now),middle:newCycle(h.middleFlex,h.middleReach,now)}:null,directionMode:1,directionCandidate:1,directionConfidence:0,reverseCycles:0});}
 resetDepth(){this.depthSamples=[];this.depthSince=-Infinity;this.depthBaseline=null;this.depthRawRatio=0;this.depthFilteredRatio=0;this.depthIntent=0;this.depthReady=false;this.depthActive=false;this.depthActiveSign=0;this.depthEntrySince=null;this.depthEntrySign=0;}
 resetSteering(){this.steeringPair=null;this.steeringSince=-Infinity;this.steeringAngle=0;this.heightIntent=0;this.steeringIntent=0;this.steeringReady=false;this.steeringActive=false;this.steeringSource='none';this.lastAppliedRotation=0;this.turn=0;this.resetDepth();}
 updateSteering(hands,now,dt,enabled=false){
  const pair=hands.filter(h=>!h.fist&&Number.isFinite(h.wristX)&&Number.isFinite(h.wristY)).sort((a,b)=>a.wristX-b.wristX);
  if(pair.length!==2){this.resetSteering();return;}
  const dx=(pair[1].wristX-pair[0].wristX)*this.cameraAspectRatio,dy=pair[1].wristY-pair[0].wristY;
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||dx<.12){this.resetSteering();return;}
  const key=`${String(pair[0].id)}|${String(pair[1].id)}`,angle=Math.atan2(dy,dx);
  if(this.steeringPair!==key){this.resetSteering();this.steeringPair=key;this.steeringSince=now;this.steeringAngle=angle;return;}
  const alpha=dt>0?1-Math.exp(-dt/STEERING_TAU_MS):0;
  this.steeringAngle+=alpha*angleDelta(angle,this.steeringAngle);
  this.steeringReady=now-this.steeringSince>=STEERING_GATE_MS;
  if(Math.abs(angle)<STEERING_EXIT){this.steeringAngle=angle;this.steeringActive=false;}
  const scales=pair.map(hand=>hand.palmScale),validDepth=scales.every(value=>Number.isFinite(value)&&value>0);
  if(validDepth){
   if(!Number.isFinite(this.depthSince))this.depthSince=now;
   this.depthRawRatio=Math.log(scales[0]/scales[1]);
   if(this.depthBaseline===null){this.depthSamples.push(this.depthRawRatio);if(now-this.depthSince>=STEERING_GATE_MS){const sorted=this.depthSamples.slice().sort((a,b)=>a-b);this.depthBaseline=sorted[Math.floor(sorted.length/2)];this.depthFilteredRatio=0;this.depthReady=true;}}
   else{const rawOffset=this.depthRawRatio-this.depthBaseline,rawMagnitude=Math.abs(rawOffset),depthAlpha=dt>0?1-Math.exp(-dt/DEPTH_TAU_MS):0;this.depthFilteredRatio+=depthAlpha*(rawOffset-this.depthFilteredRatio);if(rawMagnitude<DEPTH_EXIT){this.depthActive=false;this.depthActiveSign=0;this.depthEntrySince=null;this.depthEntrySign=0;this.depthFilteredRatio=rawOffset;}const magnitude=Math.abs(this.depthFilteredRatio),sign=Math.sign(this.depthFilteredRatio);if(this.depthActive&&sign!==this.depthActiveSign){this.depthActive=false;this.depthActiveSign=0;this.depthEntrySince=now;this.depthEntrySign=sign;}if(!this.depthActive){if(magnitude>DEPTH_ENTER&&rawMagnitude>DEPTH_ENTER){if(this.depthEntrySign!==sign){this.depthEntrySince=now;this.depthEntrySign=sign;}if(this.depthEntrySince===null)this.depthEntrySince=now;if(now-this.depthEntrySince>=DEPTH_ENTRY_MS){this.depthActive=true;this.depthActiveSign=sign;}}else{this.depthEntrySince=null;this.depthEntrySign=0;}}else if(magnitude<DEPTH_EXIT){this.depthActive=false;this.depthActiveSign=0;this.depthEntrySince=null;this.depthEntrySign=0;}this.depthIntent=this.depthActive?-this.depthActiveSign*clamp((magnitude-DEPTH_EXIT)/(DEPTH_FULL-DEPTH_EXIT)):0;}
  }else this.resetDepth();
  if(!this.steeringReady){this.steeringIntent=0;this.turn=0;this.lastAppliedRotation=0;return;}
  const magnitude=Math.abs(this.steeringAngle);
  if(this.steeringActive?magnitude<STEERING_EXIT:magnitude>STEERING_ENTER)this.steeringActive=!this.steeringActive;
  this.heightIntent=this.steeringActive?-Math.sign(this.steeringAngle)*clamp((magnitude-STEERING_EXIT)/(STEERING_FULL-STEERING_EXIT)):0;
  this.steeringSource=this.heightIntent?'height':this.depthIntent?'depth':'none';this.steeringIntent=this.heightIntent||this.depthIntent;
  if(!enabled){this.turn=0;this.lastAppliedRotation=0;return;}
  this.turn=this.steeringIntent;
  this.lastAppliedRotation=this.steeringIntent*.5*this.steeringGain*(dt/1000);
  this.headingTarget+=this.lastAppliedRotation;
 }
 update(hands,now){
  const valid=validHands(hands);
  if(!valid||!Number.isFinite(now)){this.handsVisible=0;this.forward=0;this.run=0;this.runActive=false;this.runSince=null;this.gait=emptyGait();this.selectedId=null;this.handState.clear();this.resetSteering();this.decision='invalid-or-lost';return this.read(now);}
  const dt=this.lastUpdate===null?0:Math.max(0,now-this.lastUpdate),alpha=dt>0?1-Math.exp(-dt/TAU_MS):0,wasStale=now-this.lastSeen>STALE_MS;
  if(wasStale){this.forward=0;this.run=0;this.runActive=false;this.runSince=null;this.gait=emptyGait();this.lastMotion=-Infinity;this.selectedId=null;this.resetSteering();}
  this.lastSeen=now;this.lastUpdate=now;this.handsVisible=valid.length;
  const seen=new Set(valid.map(h=>h.id));for(const id of this.handState.keys())if(!seen.has(id))this.handState.delete(id);
  let anyMotion=false;
  for(const h of valid){
   let s=this.handState.get(h.id);
   if(wasStale||!s||now-s.lastSeen>STALE_MS){this.rebase(h,now);continue;}
   if(h.fist){this.rebase(h,now);continue;}
   const differential=h.indexFlex-h.middleFlex,common=(h.indexFlex+h.middleFlex)/2,travel=differential-s.differential,commonTravel=common-s.common,offset=differential-s.neutral,commonOffset=common-s.neutralCommon;
   const geometric=['indexReach','middleReach'].every(key=>Number.isFinite(h[key]));
   if(geometric){
    if(!s.cycles)s.cycles={index:newCycle(h.indexFlex,h.indexReach,now),middle:newCycle(h.middleFlex,h.middleReach,now)};
    const evidence=[];for(const finger of ['index','middle']){const result=closeCycle(s.cycles[finger],h[`${finger}Flex`],h[`${finger}Reach`],now);if(result.evidence)evidence.push(result.evidence);if(result.reset)s.cycles[finger]=newCycle(h[`${finger}Flex`],h[`${finger}Reach`],now);}
    if(evidence.length){const signs=new Set(evidence.map(value=>value.sign));if(signs.size===1){const sign=evidence[0].sign;s.directionCandidate=sign;s.directionConfidence=Math.min(...evidence.map(value=>value.confidence));if(sign<0){s.reverseCycles++;if(s.reverseCycles>=2)s.directionMode=-1;}else{s.reverseCycles=0;s.directionMode=1;}}else{s.directionCandidate=0;s.directionConfidence=0;}}
   }else{s.cycles=null;s.directionMode=1;s.directionCandidate=1;s.directionConfidence=0;s.reverseCycles=0;}
   const rate=dt>0?Math.abs(travel)*1000/dt:0,commonRate=dt>0?Math.abs(commonTravel)*1000/dt:0,instantaneous=clamp((rate-.04)/1.6)*clamp(Math.abs(offset)/this.stepThreshold),commonInstantaneous=clamp((commonRate-.04)/1.6)*clamp(Math.abs(commonOffset)/this.stepThreshold);
   s.activity+=alpha*(instantaneous-s.activity);s.commonActivity+=alpha*(commonInstantaneous-s.commonActivity);s.combinedActivity=Math.max(s.activity,s.commonActivity*.7);s.differential=differential;s.common=common;s.commonOffset=commonOffset;s.lastSeen=now;
   if((rate>.04&&Math.abs(offset)>this.stepThreshold*.15)||(commonRate>.04&&Math.abs(commonOffset)>this.stepThreshold*.15)){anyMotion=true;this.lastMotion=now;}
   const phase=offset>this.stepThreshold?1:offset< -this.stepThreshold?-1:0;
   s.pendingPhase=phase!==0&&phase!==s.phase?phase:0;
  }
  const candidates=valid.filter(hand=>!hand.fist).map(hand=>({hand,state:this.handState.get(hand.id)})).filter(x=>x.state).sort((a,b)=>(b.state.combinedActivity??b.state.activity)-(a.state.combinedActivity??a.state.activity));
  if(candidates.length===0){this.selectedId=null;this.forward=0;this.run=0;this.runActive=false;this.runSince=null;this.lastMotion=-Infinity;this.gait=emptyGait();this.resetSteering();this.decision='fist';return this.read(now);}
  let current=candidates.find(x=>x.hand.id===this.selectedId),strongest=candidates[0];
  const previousSelected=this.selectedId;
  if(!current){this.selectedId=strongest?.hand.id??null;this.ownerIdleSince=null;this.challengerId=null;this.challengerSince=null;}
  else{
   if((current.state.combinedActivity??current.state.activity)<.08)this.ownerIdleSince??=now;else this.ownerIdleSince=null;
   const challenger=candidates.find(candidate=>candidate.hand.id!==current.hand.id&&(candidate.state.combinedActivity??candidate.state.activity)>.2);
   if(challenger&&this.ownerIdleSince!==null){if(this.challengerId!==challenger.hand.id){this.challengerId=challenger.hand.id;this.challengerSince=now;}if(now-this.ownerIdleSince>=300&&now-this.challengerSince>=250)this.selectedId=challenger.hand.id;}
   else{this.challengerId=null;this.challengerSince=null;}
  }
  const selected=candidates.find(x=>x.hand.id===this.selectedId)??strongest,motionFresh=now-this.lastMotion<=STOP_MS;
  if(selected){
   if(previousSelected!==this.selectedId)selected.state.phase=selected.state.pendingPhase||selected.state.phase;
   else if(selected.state.pendingPhase){selected.state.phase=selected.state.pendingPhase;this.steps++;const interval=now-this.lastStep;if(!Number.isFinite(this.lastStep)||interval>=120){this.lastStep=now;this.stepTimes.push(now);}}
  }
  for(const candidate of candidates)candidate.state.pendingPhase=0;
  this.stepTimes=this.stepTimes.filter(t=>now-t<=2000);let cadence=0;
  if(motionFresh&&this.stepTimes.length>=2&&this.stepTimes.at(-1)>this.stepTimes[0]){const intervals=this.stepTimes.slice(1).map((time,index)=>time-this.stepTimes[index]).filter(value=>value>=120&&value<=1200).sort((a,b)=>a-b);if(intervals.length){const middle=Math.floor(intervals.length/2),median=intervals.length%2?intervals[middle]:(intervals[middle-1]+intervals[middle])/2;cadence=clamp(1000/median,0,5);}}
  this.rawActivity=selected?.state.combinedActivity??selected?.state.activity??0;this.rhythm=cadence;
  const rhythmGain=cadence?clamp(.8+cadence/10,.8,1.25):1;
  const directionState=selected?.state;if(!motionFresh&&directionState){directionState.directionMode=1;directionState.directionCandidate=1;directionState.directionConfidence=0;directionState.reverseCycles=0;}const reverseReady=directionState?.directionMode===-1,direction=reverseReady?-1:1;
  this.rawIntent=motionFresh?clamp(Math.sqrt(clamp(this.rawActivity))*1.15*rhythmGain)*direction:0;
  this.paceTarget=this.rawIntent;
  const paceTau=this.paceTarget>this.forward?PACE_ATTACK_MS:PACE_RELEASE_MS,paceAlpha=dt>0?1-Math.exp(-dt/paceTau):0;
  this.forward+=paceAlpha*(this.paceTarget-this.forward);if(!motionFresh)this.forward=0;
  const runGate=motionFresh&&this.forward>.35&&this.rawActivity>.12&&cadence>=2.8;
  if(runGate){this.runSince??=now;if(now-this.runSince>=300)this.runActive=true;}else{this.runSince=null;if(cadence<2.2||!motionFresh||this.forward<=.02)this.runActive=false;}
  const runTarget=this.runActive?clamp((cadence-2.2)/2.2):0,runTau=runTarget>this.run?250:180,runAlpha=dt>0?1-Math.exp(-dt/runTau):0;
  this.run+=runAlpha*(runTarget-this.run);if(!motionFresh)this.run=0;
  this.updateSteering(valid,now,dt,Math.abs(this.forward)>.02);
  const differential=selected?selected.state.differential-selected.state.neutral:0,foot=clamp(differential/(this.stepThreshold*2),-1,1);
  const commonStride=selected?Math.max(0,Math.abs(selected.state.commonOffset??0)-this.stepThreshold*.15)*.7:0;
  const activityStride=selected&&(Math.abs(differential)>this.stepThreshold*.15||commonStride>0)?(selected.state.combinedActivity??selected.state.activity)*this.stepThreshold*2:0;
  const stride=selected?clamp(Math.max(Math.abs(differential),commonStride,activityStride)/(this.stepThreshold*2)):0;
  if(selected?.state.joints&&JOINT_KEYS.every(key=>Number.isFinite(selected.hand[key]))){
   const baseline=selected.state.joints,pose=selected.hand;
   const indexMcp=pose.indexMcpFlex-baseline.indexMcpFlex,middleMcp=pose.middleMcpFlex-baseline.middleMcpFlex;
   this.gait={left:Math.tanh(indexMcp/.32),right:Math.tanh(middleMcp/.32),leftLift:clamp((pose.indexPipFlex-baseline.indexPipFlex)/.22+.25*Math.max(0,indexMcp)/.32),rightLift:clamp((pose.middlePipFlex-baseline.middlePipFlex)/.22+.25*Math.max(0,middleMcp)/.32),leftToe:Math.tanh((pose.indexDipFlex-baseline.indexDipFlex)/.10),rightToe:Math.tanh((pose.middleDipFlex-baseline.middleDipFlex)/.10),stride,cadence,run:this.run,articulated:true};
  }else this.gait={left:foot,right:-foot,leftLift:clamp(foot),rightLift:clamp(-foot),stride,cadence,run:this.run};
  this.decision=anyMotion?'walking':this.turn?'turning':'rest';return this.read(now);
 }
 read(now){
  const tracked=Number.isFinite(now)&&now-this.lastSeen<=STALE_MS&&this.handsVisible>0,motionFresh=now-this.lastMotion<=STOP_MS,forward=tracked&&motionFresh?clamp(this.forward,-1,1):0,turn=tracked?clamp(this.turn,-1,1):0;
  const gait=tracked?{...this.gait,cadence:motionFresh?this.gait.cadence:0,run:forward>0&&motionFresh?this.gait.run:0}:emptyGait();
  return {forward,turn,tracked,steps:this.steps,handsVisible:tracked?this.handsVisible:0,action:forward>0?'step':forward<0?'reverse':turn!==0?'turn':'rest',gait,headingTarget:tracked?this.headingTarget:null};
 }
 diagnostics(now){const selected=this.handState.get(this.selectedId),reverseReady=selected?.directionMode===-1;return {decision:this.decision,selectedId:this.selectedId,ownerIdleSince:this.ownerIdleSince,challengerId:this.challengerId,challengerSince:this.challengerSince,lastStepAge:Number.isFinite(this.lastStep)?now-this.lastStep:null,lastSeenAge:Number.isFinite(this.lastSeen)?now-this.lastSeen:null,lastMotionAge:Number.isFinite(this.lastMotion)?now-this.lastMotion:null,stepThreshold:this.stepThreshold,pace:this.forward,paceTarget:this.paceTarget,rawActivity:this.rawActivity,rawIntent:this.rawIntent??0,effectiveIntent:this.read(now).forward,intentGate:!selected?.cycles?'geometry-unavailable':reverseReady?'reverse-confirmed':selected.directionCandidate<0?'reverse-confirming':selected.directionConfidence?'forward-confirmed':'forward-default-ambiguous',directionCandidate:selected?.directionCandidate??1,directionConfidence:selected?.directionConfidence??0,reverseCycles:selected?.reverseCycles??0,rhythm:this.rhythm,run:this.run,runActive:this.runActive,steeringGain:this.steeringGain,headingTarget:this.headingTarget,lastAppliedRotation:this.lastAppliedRotation,steeringAngle:this.steeringAngle,heightIntent:this.heightIntent,steeringIntent:this.steeringIntent,steeringReady:this.steeringReady,steeringSource:this.steeringSource,steeringGateReason:!this.steeringPair?'pair-unavailable':!this.steeringReady?'warmup':Math.abs(this.steeringIntent)<=1e-6?'deadzone':Math.abs(this.forward)<=.02?'rest':'none',depthBaseline:this.depthBaseline,depthRawRatio:this.depthRawRatio,depthOffset:this.depthBaseline===null?null:this.depthRawRatio-this.depthBaseline,depthFilteredRatio:this.depthFilteredRatio,depthIntent:this.depthIntent,depthReady:this.depthReady,depthSuppression:this.heightIntent?'height':Math.abs(this.forward)<=.02?'rest':!this.depthReady?'warmup':this.depthIntent?'none':'deadzone',handsVisible:this.handsVisible,handState:[...this.handState.entries()]};}
}
