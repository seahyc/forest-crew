const STALE_MS=450,POINT_DWELL_MS=350,MOTION_HOLD_MS=350,MOTION_STOP_MS=450;
export const HAND_NAV={deadzone:.05,full:.16,anchorMinX:.25,anchorMaxX:.75,anchorMinY:.32,anchorMaxY:.62};
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const gait0=()=>({left:0,right:0,leftLift:0,rightLift:0,stride:0,cadence:0,run:0});
const valid=h=>h&&h.id!==undefined&&['indexFlex','middleFlex','roll'].every(k=>Number.isFinite(h[k]));
const xyz=(a,b,aspect)=>[(b.x-a.x)*aspect,b.y-a.y,(b.z-a.z)*aspect];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const length=a=>Math.hypot(...a);
export function navigationPoint(h){return {x:Number.isFinite(h.navX)?h.navX:Number.isFinite(h.wristX)?h.wristX:.5,y:Number.isFinite(h.navY)?h.navY:Number.isFinite(h.wristY)?h.wristY:.5};}
export function withNavigationPoint(sample,landmarks,aspect=4/3){
 if(!sample)return null;aspect=Number.isFinite(aspect)&&aspect>0?aspect:4/3;
 const finite=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&Number.isFinite(p?.z),knuckles=[5,9,13,17].map(i=>landmarks?.[i]);
 const result={...sample,...(knuckles.every(finite)?{navX:knuckles.reduce((s,p)=>s+p.x,0)/4,navY:knuckles.reduce((s,p)=>s+p.y,0)/4}:{})};
 if([5,6,9,10].every(i=>finite(landmarks?.[i]))){const a=xyz(landmarks[5],landmarks[6],aspect),b=xyz(landmarks[9],landmarks[10],aspect),v=a.map((n,i)=>(n+b[i])/2),n=length(v);if(n>1e-6)result.steerX=-v[0]/n;}
 if([2,3,4,5,17].every(i=>finite(landmarks?.[i]))){const palm=xyz(landmarks[17],landmarks[5],aspect),thumb=xyz(landmarks[5],landmarks[4],aspect),a=xyz(landmarks[2],landmarks[3],aspect),b=xyz(landmarks[3],landmarks[4],aspect),palmLength=length(palm),al=length(a),bl=length(b);if(palmLength>1e-6)result.thumbSpread=dot(thumb,palm)/(palmLength*palmLength);if(al>1e-6&&bl>1e-6)result.thumbStraight=dot(a,b)/(al*bl);}
 return result;
}
const anchorAt=h=>{const p=navigationPoint(h);return {x:clamp(p.x,HAND_NAV.anchorMinX,HAND_NAV.anchorMaxX),y:clamp(p.y,HAND_NAV.anchorMinY,HAND_NAV.anchorMaxY)};};
const steerAxis=x=>Math.abs(x)<=.12?0:clamp((x-Math.sign(x)*.12)/.38,-1,1);
export class OneHandController{
 constructor({staleMs=STALE_MS,pointDwellMs=POINT_DWELL_MS}={}){this.staleMs=staleMs;this.pointDwellMs=pointDwellMs;this.reset();}
 reset(){this.ownerId=null;this.anchor={x:.5,y:.5};this.point={...this.anchor};this.lastSeen=-Infinity;this.lastUpdate=null;this.forward=0;this.pace=0;this.activity=0;this.turn=0;this.filteredTurn=0;this.steerNeutral=null;this.steerX=0;this.armed=true;this.openHeld=false;this.pointSince=null;this.mode='lost';this.decision='reset';this.gait=gait0();this.aim={x:.5,y:.5};this.steps=0;this.phase=0;this.previousFlex=null;this.flexNeutral=0;this.lastStep=-Infinity;this.lastMotion=-Infinity;this.cadence=1;this.reverse=false;this.reverseSince=null;}
 selectHand(hands){const candidates=Array.isArray(hands)?hands.filter(valid):[];if(!candidates.length)return null;if(this.ownerId===null)return candidates[0];return candidates.reduce((best,h)=>{const p=navigationPoint(h),b=navigationPoint(best);return Math.hypot(p.x-this.point.x,p.y-this.point.y)<Math.hypot(b.x-this.point.x,b.y-this.point.y)?h:best;});}
 calibrate(hands,now){const h=this.selectHand(hands);this.reset();if(!h||!Number.isFinite(now))return this.read(now);this.ownerId=String(h.id);this.anchor=anchorAt(h);this.point=navigationPoint(h);this.lastSeen=now;this.lastUpdate=now;this.mode='walk';this.previousFlex={index:h.indexFlex,middle:h.middleFlex};this.flexNeutral=h.indexFlex-h.middleFlex;this.steerNeutral=Number.isFinite(h.steerX)?h.steerX:0;this.steerX=this.steerNeutral;this.decision='finger-walk-ready';return this.read(now);}
 stop(reason){this.forward=0;this.pace=0;this.activity=0;this.gait=gait0();this.pointSince=null;this.phase=0;this.lastMotion=-Infinity;this.lastStep=-Infinity;this.reverse=false;this.reverseSince=null;this.decision=reason;}
 update(hands,now,{overUi=false}={}){
  const h=this.selectHand(hands);if(!h||!Number.isFinite(now)){this.stop('lost');this.turn=0;this.filteredTurn=0;this.lastSeen=-Infinity;this.mode='lost';return this.read(now);}
  if(this.ownerId===null)return this.calibrate([h],now);this.ownerId=String(h.id);
  const continuingHose=this.mode==='hose',dt=clamp(now-this.lastUpdate,0,250);this.lastUpdate=now;this.lastSeen=now;this.mode='walk';this.point=navigationPoint(h);
  if(Number.isFinite(h.pointX)&&Number.isFinite(h.pointY))this.aim={x:clamp((.85-h.pointX)/.7),y:clamp((h.pointY-.12)/.7)};
  const differential=h.indexFlex-h.middleFlex,movement=this.previousFlex?Math.max(Math.abs(h.indexFlex-this.previousFlex.index),Math.abs(h.middleFlex-this.previousFlex.middle)):0,differentialMovement=this.previousFlex?Math.abs(differential-(this.previousFlex.index-this.previousFlex.middle)):0;this.previousFlex={index:h.indexFlex,middle:h.middleFlex};const fingerActive=movement>.018&&differentialMovement>.015;
  if(overUi){this.stop('ui-dwell');this.turn=0;this.filteredTurn=0;return this.read(now,{overUi:true});}
  if(h.open===true){if(!this.openHeld){this.anchor=anchorAt(h);this.steerNeutral=Number.isFinite(h.steerX)?h.steerX:0;this.steerX=this.steerNeutral;this.filteredTurn=0;}this.openHeld=true;this.stop('open-palm-stop');this.turn=0;return this.read(now);}this.openHeld=false;
  if(h.fist===true){this.stop('fist-stop');this.turn=0;this.filteredTurn=0;return this.read(now);}
  if(Number.isFinite(h.steerX)){this.steerNeutral??=h.steerX;this.steerX=h.steerX;const raw=steerAxis(h.steerX-this.steerNeutral);if(raw===0)this.filteredTurn=0;else this.filteredTurn+=(1-Math.exp(-dt/100))*(raw-this.filteredTurn);this.turn=this.filteredTurn;}else{this.turn=0;this.filteredTurn=0;}
  const activityAlpha=dt>0?1-Math.exp(-dt/100):0,flexVelocity=dt>0?movement*1000/dt:0,instantaneous=fingerActive?clamp((flexVelocity-.04)/1.6):0;this.activity+=activityAlpha*(instantaneous-this.activity);
  if(fingerActive){this.lastMotion=now;this.pointSince=null;const relative=differential-this.flexNeutral,phase=relative>.06?1:relative<-.06?-1:0;if(phase&&phase!==this.phase&&now-this.lastStep>100){const elapsed=now-this.lastStep;this.cadence=clamp(480/Math.max(elapsed,150),.6,1.35);this.phase=phase;this.lastStep=now;this.steps++;}const paceTarget=clamp(Math.sqrt(clamp(this.activity))*1.15),paceAlpha=dt>0?1-Math.exp(-dt/100):1;this.pace+=paceAlpha*(paceTarget-this.pace);}
  if(h.pointing===true&&!fingerActive){if(continuingHose){this.forward=0;this.turn=0;this.filteredTurn=0;this.mode='hose';this.decision='spraying';return this.read(now);}this.pointSince??=now;if(now-this.pointSince>=this.pointDwellMs){this.stop('spraying');this.turn=0;this.filteredTurn=0;this.mode='hose';return this.read(now);}}else if(h.pointing!==true)this.pointSince=null;
  const walking=now-this.lastMotion<MOTION_STOP_MS,thumbValid=Number.isFinite(h.thumbSpread)&&Number.isFinite(h.thumbStraight),reverseEnter=thumbValid&&h.thumbSpread>.55&&h.thumbStraight>.75,reverseExit=!thumbValid||h.thumbSpread<.35||h.thumbStraight<.55;
  if(this.reverse){if(!walking||reverseExit){this.reverse=false;this.reverseSince=null;}}else if(walking&&reverseEnter){this.reverseSince??=now;if(now-this.reverseSince>=180)this.reverse=true;}else this.reverseSince=null;
  this.forward=walking?this.pace*(this.reverse?-1:1):0;if(!walking){this.pace=0;this.reverse=false;this.reverseSince=null;}
  const foot=clamp((differential-this.flexNeutral)/.16,-1,1),pace=Math.abs(this.forward);this.gait=pace?{left:foot,right:-foot,leftLift:clamp(foot),rightLift:clamp(-foot),stride:pace,cadence:this.cadence,run:0}:gait0();this.decision=walking?(this.reverse?'finger-walk-reverse':'finger-walk-forward'):Math.abs(this.turn)>.01?'point-steer':'finger-walk-idle';return this.read(now);
 }
 read(now,{overUi=false}={}){const age=now-this.lastSeen,fresh=Number.isFinite(now)&&age<=this.staleMs&&this.ownerId!==null,freshness=fresh?clamp((this.staleMs-age)/(this.staleMs-300)):0,motionAge=now-this.lastMotion,motionConfidence=motionAge<=MOTION_HOLD_MS?1:clamp((MOTION_STOP_MS-motionAge)/(MOTION_STOP_MS-MOTION_HOLD_MS));if(!fresh){this.forward=0;this.pace=0;this.activity=0;this.turn=0;this.filteredTurn=0;this.mode='lost';this.gait=gait0();this.reverse=false;this.reverseSince=null;this.phase=0;this.lastStep=-Infinity;this.lastMotion=-Infinity;}const enabled=fresh&&!overUi,walking=enabled&&this.mode==='walk';return {tracked:fresh,forward:walking?this.forward*freshness*motionConfidence:0,turn:walking?this.turn*freshness:0,headingTarget:null,gait:walking?{...this.gait,stride:this.gait.stride*motionConfidence}:gait0(),mode:fresh?this.mode:'lost',aim:{...this.aim},spraying:enabled&&this.mode==='hose'&&age<=220,steps:this.steps};}
 diagnostics(now){const s=this.read(now);return {inputMode:'one-hand',control:'finger-walk-point-steer',ownerId:this.ownerId,decision:this.decision,mode:s.mode,tracked:s.tracked,lastSeenAge:Number.isFinite(this.lastSeen)?now-this.lastSeen:null,anchor:{...this.anchor},point:{...this.point},steerNeutral:this.steerNeutral,steerX:this.steerX,reverse:this.reverse,armed:this.armed,steps:this.steps,forward:s.forward,turn:s.turn,spraying:s.spraying};}
}
