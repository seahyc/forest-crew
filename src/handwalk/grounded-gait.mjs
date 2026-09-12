const SIDES=['left','right'];
const other=side=>side==='left'?'right':'left';
const clamp=(value,min=-1,max=1)=>Math.max(min,Math.min(max,Number.isFinite(value)?value:0));

function validBody(body){
 return body&&['x','y','z','yaw'].every(key=>Number.isFinite(body[key]));
}

function toWorld(body,local){
 const cosine=Math.cos(body.yaw),sine=Math.sin(body.yaw);
 return {x:body.x+local.x*cosine+local.z*sine,z:body.z-local.x*sine+local.z*cosine};
}

function toLocal(body,world){
 const x=world.x-body.x,z=world.z-body.z,cosine=Math.cos(body.yaw),sine=Math.sin(body.yaw);
 return {x:x*cosine-z*sine,z:x*sine+z*cosine};
}

export class GroundedGait{
 constructor({stanceWidth=.22,homeZ=.04,stride=.52,lift=.43,minStance=.15,maxReach=.5,hardReach=.7}={}){
  this.stanceWidth=stanceWidth;this.homeZ=homeZ;this.stride=stride;this.lift=lift;this.minStance=minStance;this.maxReach=maxReach;this.hardReach=hardReach;this.reset();
 }

 reset(){
  this.supportSide='left';this.stanceAge=0;this.quietAge=0;this.settled=false;this.releaseQueued=false;this.initialized=false;
  this.feet={left:{anchor:null,airborne:false,landed:false,recovery:null},right:{anchor:null,airborne:false,landed:false,recovery:null}};
 }

 home(side){return {x:(side==='left'?-1:1)*this.stanceWidth/2,z:this.homeZ};}

 groundAt(provider,x,z){
  const value=typeof provider==='function'?provider(x,z):0;
  return Number.isFinite(value)?value:0;
 }

 anchorAtHome(side,body,groundHeight){
  const world=toWorld(body,this.home(side));
  return {...world,y:this.groundAt(groundHeight,world.x,world.z)};
 }

 reachableLocal(side,swing){
  const home=this.home(side),margin=.08,reach=Math.max(.05,this.maxReach-margin),offset=clamp(swing*this.stride-home.z,-reach,reach);
  return {x:home.x,z:home.z+offset};
 }

 startRecovery(side,body,start=null){
  const foot=this.feet[side],origin=foot.anchor??start;if(!origin||foot.recovery)return;
  foot.recovery={elapsed:0,start:{...origin}};foot.anchor=null;foot.airborne=true;foot.landed=false;
 }

 initialize(body,groundHeight){
  for(const side of SIDES){this.feet[side].anchor=this.anchorAtHome(side,body,groundHeight);this.feet[side].landed=true;this.feet[side].airborne=false;this.feet[side].recovery=null;}
  this.initialized=true;
 }

 limitDisplacement(body,desiredDelta){
  if(!validBody(body)||!desiredDelta||!Number.isFinite(desiredDelta.x)||!Number.isFinite(desiredDelta.z))return {x:0,z:0,limited:true};
  const anchor=this.feet[this.supportSide]?.anchor;if(!anchor)return {x:desiredDelta.x,z:desiredDelta.z,limited:false};
  const home=this.home(this.supportSide),cosine=Math.cos(body.yaw),sine=Math.sin(body.yaw);
  const center={x:anchor.x-(home.x*cosine+home.z*sine),z:anchor.z-(-home.x*sine+home.z*cosine)};
  const start={x:body.x-center.x,z:body.z-center.z},end={x:start.x+desiredDelta.x,z:start.z+desiredDelta.z};
  const startDistance=Math.hypot(start.x,start.z),endDistance=Math.hypot(end.x,end.z);
  if(endDistance<=this.maxReach||endDistance<startDistance)return {x:desiredDelta.x,z:desiredDelta.z,limited:false};
  if(startDistance>=this.maxReach)return {x:0,z:0,limited:true};
  const a=desiredDelta.x**2+desiredDelta.z**2,b=2*(start.x*desiredDelta.x+start.z*desiredDelta.z),c=start.x**2+start.z**2-this.maxReach**2;
  const scale=clamp((-b+Math.sqrt(Math.max(0,b*b-4*a*c)))/(2*a),0,1);
  return {x:desiredDelta.x*scale,z:desiredDelta.z*scale,limited:scale<1};
 }

 update(pose,dt,body,grounded=true,groundHeight=()=>0){
  if(!validBody(body))throw new TypeError('GroundedGait requires a finite body position and yaw.');
  const elapsed=Math.max(0,Math.min(.1,Number.isFinite(dt)?dt:0));
  if(!this.initialized)this.initialize(body,groundHeight);
  if(!grounded){for(const side of SIDES){this.feet[side].anchor=null;this.feet[side].airborne=false;this.feet[side].landed=false;this.feet[side].recovery=null;}this.initialized=false;this.settled=false;this.releaseQueued=false;}
  this.stanceAge+=elapsed;

  const requests={
   left:{swing:clamp(pose?.left),lift:clamp(pose?.leftLift,0,1),toe:clamp(pose?.leftToe)},
   right:{swing:clamp(pose?.right),lift:clamp(pose?.rightLift,0,1),toe:clamp(pose?.rightToe)},
  };
  const quiet=pose?.source==='neutral'||SIDES.every(side=>Math.abs(requests[side].swing)<.06&&requests[side].lift<.06&&Math.abs(requests[side].toe)<.08);
  this.quietAge=quiet?this.quietAge+elapsed:0;if(!quiet)this.settled=false;
  if(pose?.source==='neutral'){this.releaseQueued=false;const free=other(this.supportSide),foot=this.feet[free];foot.anchor=this.anchorAtHome(free,body,groundHeight);foot.airborne=false;foot.landed=true;foot.recovery=null;this.settled=true;}
  else if(grounded&&requests[this.supportSide].lift>.16)this.releaseQueued=true;

  const swingSide=other(this.supportSide),swing=this.feet[swingSide],swingRequest=requests[swingSide],transferReach=Math.max(.05,this.maxReach-.08);
  const supportAnchor=this.feet[this.supportSide].anchor,supportLocal=supportAnchor?toLocal(body,supportAnchor):this.home(this.supportSide),supportHome=this.home(this.supportSide),supportDistance=Math.hypot(supportLocal.x-supportHome.x,supportLocal.z-supportHome.z);
  if(grounded&&pose?.source!=='neutral'&&supportDistance>transferReach){this.releaseQueued=true;const current=toWorld(body,this.reachableLocal(swingSide,swingRequest.swing));this.startRecovery(swingSide,body,{...current,y:this.groundAt(groundHeight,current.x,current.z)+swingRequest.lift*this.lift});}
  if(grounded&&swing.anchor){const local=toLocal(body,swing.anchor),home=this.home(swingSide);if(Math.hypot(local.x-home.x,local.z-home.z)>transferReach)this.startRecovery(swingSide,body);}
  if(grounded&&!swing.recovery&&swingRequest.lift>.16){swing.airborne=true;swing.landed=false;swing.anchor=null;}
  if(grounded&&!swing.recovery&&swing.airborne&&swingRequest.lift<.08){
   const desired=toWorld(body,this.reachableLocal(swingSide,swingRequest.swing));
   swing.anchor={...desired,y:this.groundAt(groundHeight,desired.x,desired.z)};swing.airborne=false;swing.landed=true;
  }

  if(grounded&&swing.recovery){
   swing.recovery.elapsed+=elapsed;
   if(swing.recovery.elapsed>=.18){swing.anchor=this.anchorAtHome(swingSide,body,groundHeight);swing.recovery=null;swing.airborne=false;swing.landed=true;}
  }

  if(grounded&&this.releaseQueued&&swing.anchor&&!swing.airborne&&swing.landed&&this.stanceAge>=this.minStance){
   const local=toLocal(body,swing.anchor),home=this.home(swingSide);
   if(Math.hypot(local.x-home.x,local.z-home.z)>transferReach)this.startRecovery(swingSide,body);
   else {
   const previous=this.supportSide;this.supportSide=swingSide;this.stanceAge=0;swing.landed=false;
   this.releaseQueued=false;
   if(requests[previous].lift>.08){this.feet[previous].airborne=true;this.feet[previous].landed=false;this.feet[previous].anchor=null;}
   else{this.feet[previous].airborne=false;this.feet[previous].landed=true;}
   }
  }

  if(grounded&&this.quietAge>=.2&&!this.settled){
   const free=other(this.supportSide),foot=this.feet[free];foot.anchor=this.anchorAtHome(free,body,groundHeight);foot.airborne=false;foot.landed=true;foot.recovery=null;this.settled=true;
  }

  const outputFeet={};
  for(const side of SIDES){
   const foot=this.feet[side],request=requests[side];
   if(foot.anchor){const local=toLocal(body,foot.anchor);outputFeet[side]={local:{x:local.x,y:foot.anchor.y-body.y,z:local.z},worldAnchor:{...foot.anchor},planted:true,toe:0};}
   else{
    let local=this.reachableLocal(side,request.swing),world=toWorld(body,local),surface=this.groundAt(groundHeight,world.x,world.z),extraLift=(grounded?request.lift:0)*this.lift;
    if(foot.recovery){const t=clamp(foot.recovery.elapsed/.18,0,1),smooth=t*t*(3-2*t),destination=toWorld(body,this.home(side));world={x:foot.recovery.start.x+(destination.x-foot.recovery.start.x)*smooth,z:foot.recovery.start.z+(destination.z-foot.recovery.start.z)*smooth};surface=this.groundAt(groundHeight,world.x,world.z);local=toLocal(body,world);extraLift=(foot.recovery.start.y-surface)*(1-smooth)+Math.sin(Math.PI*t)*.06;}
    local={...local,y:surface-body.y+extraLift};
    outputFeet[side]={local,worldAnchor:{...world,y:surface+extraLift},planted:false,toe:request.toe};
   }
  }

  const support=outputFeet[this.supportSide],home=this.home(this.supportSide),dx=support.local.x-home.x,dz=support.local.z-home.z,distance=Math.hypot(dx,dz);
  let bodyCorrection={x:0,z:0};
  if(distance>this.maxReach){
   const excess=distance-this.maxReach,world=toWorld(body,{x:dx,z:dz});
   bodyCorrection={x:(world.x-body.x)*excess/distance,z:(world.z-body.z)*excess/distance};
  }
  return {supportSide:this.supportSide,feet:outputFeet,bodyCorrection,remainingReach:Math.max(0,this.maxReach-distance),hardRemainingReach:Math.max(0,this.hardReach-distance),canAdvance:grounded&&distance<this.maxReach,grounded:!!grounded};
 }
}
