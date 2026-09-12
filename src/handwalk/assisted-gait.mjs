const SIDES=['left','right'];
const other=side=>side==='left'?'right':'left';
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:0));
const copy=point=>point?{...point}:null;
const angleDelta=(to,from)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));

function toWorld(body,local){const c=Math.cos(body.yaw),s=Math.sin(body.yaw);return {x:body.x+local.x*c+local.z*s,z:body.z-local.x*s+local.z*c};}
function toLocal(body,world){const x=world.x-body.x,z=world.z-body.z,c=Math.cos(body.yaw),s=Math.sin(body.yaw);return {x:x*c-z*s,z:x*s+z*c};}

export class AssistedGait{
 constructor({stanceWidth=.22,homeZ=.04,minStep=.45,maxStep=.65,minLift=.1,maxLift=.2,settleTime=.16}={}){
  this.stanceWidth=stanceWidth;this.homeZ=homeZ;this.minStep=minStep;this.maxStep=maxStep;this.minLift=minLift;this.maxLift=maxLift;this.settleTime=settleTime;this.reset();
 }
 reset(){this.initialized=false;this.supportSide='left';this.feet={left:{anchor:null},right:{anchor:null}};this.swing=null;this.phase=0;this.stepLength=.52;this.liftHeight=.13;this.strideSmooth=.35;this.wasActive=false;this.steps=0;this.lastYaw=null;this.yawRate=0;this.lastRenderedSwing=null;this.previousBody=null;this.lastTravelYaw=null;}
 home(side){return {x:(side==='left'?-1:1)*this.stanceWidth/2,z:this.homeZ};}
 ground(provider,x,z){const y=typeof provider==='function'?provider(x,z):0;return Number.isFinite(y)?y:0;}
 anchorHome(side,body,provider,z=this.homeZ){const p=toWorld(body,{x:this.home(side).x,z});return {...p,y:this.ground(provider,p.x,p.z),yaw:body.yaw};}
 initialize(body,provider,pose){
  this.supportSide=(pose?.leftLift??0)>(pose?.rightLift??0)+.08?'right':'left';
  for(const side of SIDES)this.feet[side].anchor=this.anchorHome(side,body,provider);
  this.initialized=true;
 }
 beginSwing(body,provider,side,speed,carryDistance=0,resuming=false,travelYaw=body.yaw){
  const start=this.feet[side].anchor??this.anchorHome(side,body,provider),supportLocal=toLocal(body,this.feet[this.supportSide].anchor),supportHome=this.home(this.supportSide),relative={x:supportLocal.x-supportHome.x,z:supportLocal.z-supportHome.z},travelDelta=angleDelta(travelYaw,body.yaw),direction={x:Math.sin(travelDelta),z:Math.cos(travelDelta)},along=relative.x*direction.x+relative.z*direction.z,lateralSquared=Math.max(0,relative.x*relative.x+relative.z*relative.z-along*along),reachRadius=.32,lead=Math.max(.25,this.stepLength*.48);
  const available=Math.max(.03,along+Math.sqrt(Math.max(0,reachRadius*reachRadius-lateralSquared))),strokeDistance=Math.min(this.stepLength,available),predictionTime=strokeDistance/Math.max(.5,speed),predictedYaw=body.yaw+this.yawRate*predictionTime*.5;
  const c=Math.cos(predictedYaw),s=Math.sin(predictedYaw),travel=strokeDistance+lead,endXZ={x:body.x+travel*Math.sin(travelYaw)+this.home(side).x*c,z:body.z+travel*Math.cos(travelYaw)-this.home(side).x*s},end={...endXZ,y:this.ground(provider,endXZ.x,endXZ.z),yaw:predictedYaw};
  this.feet[side].anchor=null;this.phase=clamp(carryDistance/strokeDistance,0,.92);this.swing={side,start:copy(start),end,settling:false,strokeDistance,lead,liftScale:resuming?0:1};
 }
 swingPoint(){
  if(!this.swing)return null;const t=clamp(this.phase),ease=t*t*(3-2*t),a=this.swing.start,b=this.swing.end;
  return {x:a.x+(b.x-a.x)*ease,y:a.y+(b.y-a.y)*ease+(this.swing.settling?0:Math.sin(Math.PI*t)**2*this.liftHeight*(this.swing.liftScale??1)),z:a.z+(b.z-a.z)*ease,yaw:(a.yaw??b.yaw)+angleDelta(b.yaw??a.yaw,a.yaw??b.yaw)*ease};
 }
 land(body,provider,carryDistance=0,speed=0,travelYaw=body.yaw){
  const side=this.swing.side,end=this.swing.end;this.feet[side].anchor={x:end.x,y:this.ground(provider,end.x,end.z),z:end.z,yaw:end.yaw};
  this.supportSide=side;this.swing=null;this.phase=0;this.steps++;this.lastRenderedSwing=null;
  if(carryDistance>1e-5){const virtual={...body,x:body.x-Math.sin(travelYaw)*carryDistance,z:body.z-Math.cos(travelYaw)*carryDistance};this.beginSwing(virtual,provider,other(side),speed,carryDistance,false,travelYaw);}
 }
 update(pose,dt,body,grounded=true,groundHeight=()=>0,motion={speed:0,displacement:0,active:false}){
  if(!body||!['x','y','z','yaw'].every(key=>Number.isFinite(body[key])))throw new TypeError('AssistedGait requires a finite body position and yaw.');
  const previousBody=this.previousBody;this.previousBody={x:body.x,y:body.y,z:body.z,yaw:body.yaw};
  const elapsed=clamp(dt,0,.05),active=!!motion.active&&grounded,speed=active&&Number.isFinite(motion.speed)?Math.max(0,motion.speed):0,distance=active&&Number.isFinite(motion.displacement)?Math.max(0,motion.displacement):0;
  if(!this.initialized&&grounded)this.initialize(body,groundHeight,pose);
  if(!grounded){this.reset();return this.output(pose,body,groundHeight,false,speed);}
  if(!motion.active){
   if(this.wasActive){this.reset();this.previousBody={x:body.x,y:body.y,z:body.z,yaw:body.yaw};this.initialize(body,groundHeight,{leftLift:0,rightLift:0});}
   this.wasActive=false;return this.output({left:0,right:0,leftLift:0,rightLift:0,leftToe:0,rightToe:0,stride:0},body,groundHeight,true,0);
  }
  this.wasActive=true;
  if(this.lastYaw!==null&&elapsed>0){const delta=Math.atan2(Math.sin(body.yaw-this.lastYaw),Math.cos(body.yaw-this.lastYaw));this.yawRate+= (clamp(delta/elapsed,-1.5,1.5)-this.yawRate)*(1-Math.exp(-elapsed/.1));}this.lastYaw=body.yaw;
  const stride=clamp(pose?.stride);this.strideSmooth+= (stride-this.strideSmooth)*(1-Math.exp(-elapsed/.12));
  this.stepLength=this.minStep+(this.maxStep-this.minStep)*this.strideSmooth;
  const curl=Math.max(clamp(pose?.leftLift),clamp(pose?.rightLift)),liftTarget=this.minLift+(this.maxLift-this.minLift)*curl;this.liftHeight+= (liftTarget-this.liftHeight)*(1-Math.exp(-elapsed/.1));
  const moving=speed>.025&&distance>1e-6,travelDelta=previousBody?{x:body.x-previousBody.x,z:body.z-previousBody.z}:null,travelYaw=travelDelta&&Math.hypot(travelDelta.x,travelDelta.z)>1e-6?Math.atan2(travelDelta.x,travelDelta.z):(this.lastTravelYaw??body.yaw);
  if(moving){
   this.lastTravelYaw=travelYaw;const startBody=previousBody??{...body,x:body.x-Math.sin(travelYaw)*distance,z:body.z-Math.cos(travelYaw)*distance};
   if(this.swing?.settling){const side=this.swing.side;this.feet[side].anchor=copy(this.lastRenderedSwing??this.swingPoint());this.swing=null;this.phase=0;this.beginSwing(startBody,groundHeight,side,speed,0,true,travelYaw);}
   if(!this.swing)this.beginSwing(startBody,groundHeight,other(this.supportSide),speed,0,false,travelYaw);
   const stroke=this.swing.strokeDistance;this.phase+=distance/stroke;
   if(this.phase<.8&&!this.swing.settling){const remaining=Math.max(0,stroke*(1-this.phase)),predictionTime=remaining/Math.max(.5,speed),yaw=body.yaw+this.yawRate*predictionTime*.5,c=Math.cos(yaw),s=Math.sin(yaw),travel=remaining+this.swing.lead,side=this.swing.side,candidate={x:body.x+travel*Math.sin(travelYaw)+this.home(side).x*c,z:body.z+travel*Math.cos(travelYaw)-this.home(side).x*s,yaw},fadePhase=clamp((this.phase-.55)/.25),fade=1-fadePhase*fadePhase*(3-2*fadePhase),blend=(1-Math.exp(-elapsed/.08))*fade;this.swing.end.x+=(candidate.x-this.swing.end.x)*blend;this.swing.end.z+=(candidate.z-this.swing.end.z)*blend;this.swing.end.y=this.ground(groundHeight,this.swing.end.x,this.swing.end.z);this.swing.end.yaw+=angleDelta(candidate.yaw,this.swing.end.yaw)*blend;}
   if(this.phase>=1){const carryDistance=(this.phase-1)*stroke;this.land(body,groundHeight,carryDistance<stroke*.9?carryDistance:0,speed,travelYaw);}
  }else if(this.swing){
   let justStarted=false;if(!this.swing.settling){const current=this.lastRenderedSwing??this.swingPoint();this.swing={side:this.swing.side,start:copy(current),end:this.anchorHome(this.swing.side,body,groundHeight),settling:true,strokeDistance:this.swing.strokeDistance,lead:this.swing.lead,liftScale:0};this.phase=0;justStarted=true;}
   if(!justStarted)this.phase+=elapsed/this.settleTime;if(this.phase>=1-1e-9)this.land(body,groundHeight);
  }
  return this.output(pose,body,groundHeight,grounded,speed);
 }
 output(pose,body,provider,grounded,speed){
  const swingWorld=this.swingPoint(),feet={};
  for(const side of SIDES){
   const isSwing=this.swing?.side===side,smallIdle=!this.swing&&speed<=.025&&side===other(this.supportSide)&&Math.max(clamp(pose?.leftLift),clamp(pose?.rightLift))<.16&&(Math.abs(pose?.[side]??0)>.03||Math.abs(pose?.[`${side}Toe`]??0)>.03),baseWorld=isSwing?swingWorld:this.feet[side].anchor??this.anchorHome(side,body,provider),localXZ=toLocal(body,baseWorld);
   const expressive=isSwing||smallIdle,accent=isSwing&&!this.swing.settling?clamp((pose?.[side]??0),-1,1)*.06*Math.sin(Math.PI*clamp(this.phase)):smallIdle?clamp((pose?.[side]??0),-1,1)*.06:0,local={x:localXZ.x,y:0,z:localXZ.z+accent},renderedXZ=expressive?toWorld(body,local):baseWorld,groundY=this.ground(provider,renderedXZ.x,renderedXZ.z),arc=isSwing&&!this.swing.settling?Math.sin(Math.PI*clamp(this.phase))**2*this.liftHeight*(this.swing.liftScale??1):0,renderedY=expressive?Math.max(baseWorld.y,groundY+arc):baseWorld.y;local.y=renderedY-body.y;
   feet[side]={local,worldAnchor:{x:renderedXZ.x,y:renderedY,z:renderedXZ.z},planted:!!grounded&&!expressive,toe:expressive?clamp(pose?.[`${side}Toe`]??0,-1,1):0,groundY,yaw:baseWorld.yaw??body.yaw};
   if(isSwing)this.lastRenderedSwing={x:renderedXZ.x,y:renderedY,z:renderedXZ.z,yaw:baseWorld.yaw??body.yaw};
  }
  const support=feet[this.supportSide],home=this.home(this.supportSide),rearReach=Math.hypot(support.local.x-home.x,support.local.z-home.z);
  return {supportSide:this.supportSide,feet,remainingReach:Math.max(0,.7-rearReach),hardRemainingReach:Math.max(0,.8-rearReach),canAdvance:true,grounded:!!grounded,limited:false,assist:{mode:'assisted',phase:this.swing?this.phase:0,stepLength:this.stepLength,liftHeight:this.liftHeight,strokeDistance:this.swing?.strokeDistance??this.stepLength,lead:this.swing?.lead??Math.max(.25,this.stepLength*.48),steps:this.steps,moving:speed>.025,settling:!!this.swing?.settling,supportRearReach:rearReach,actualSpeed:speed}};
 }
}
