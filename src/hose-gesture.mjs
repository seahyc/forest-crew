const STALE_MS=450;
const OWNER_RADIUS=.24;
const WALK_RELEASE_MS=180;
const clamp=value=>Math.max(0,Math.min(1,value));
const distance=(a,b)=>Math.hypot(a.pointX-b.pointX,a.pointY-b.pointY);
const flexDifference=hand=>Number.isFinite(hand.indexFlex)&&Number.isFinite(hand.middleFlex)?hand.indexFlex-hand.middleFlex:null;

/**
 * Interprets the hose stance independently from finger walking.
 * Hand count, array order and handedness labels do not affect an established
 * spatial pointer owner.
 */
export class HoseGestureController{
 constructor({dwellMs=150,staleMs=STALE_MS}={}){this.dwellMs=dwellMs;this.staleMs=staleMs;this.reset();}
 reset(){this.candidate=false;this.since=0;this.last=-Infinity;this.active=false;this.aim={x:.5,y:.5};this.pointerId=null;this.ownerPoint=null;this.candidateFlex=null;this.needsAimEntry=false;this.walkingSince=null;this.reason=null;}
 clear(now){this.candidate=false;this.since=Number.isFinite(now)?now:0;this.active=false;this.pointerId=null;this.ownerPoint=null;this.candidateFlex=null;this.needsAimEntry=false;this.walkingSince=null;this.reason=null;}
 update(hands,now,{overUi=false}={}){
  if(!Number.isFinite(now)||!Array.isArray(hands)){this.reset();return this.read(now,{overUi});}
  const valid=hands.filter(hand=>hand&&Number.isFinite(hand.pointX)&&Number.isFinite(hand.pointY));
  if(overUi){this.last=now;this.clear(now);return this.read(now,{overUi:true});}
  if(!valid.length){this.last=now;this.clear(now);return this.read(now);}
  const stale=now-this.last>this.staleMs;
  let owner=null;
  if(this.ownerPoint&&!stale){const nearest=valid.reduce((best,hand)=>!best||distance(hand,this.ownerPoint)<distance(best,this.ownerPoint)?hand:best,null);if(nearest&&distance(nearest,this.ownerPoint)<=OWNER_RADIUS)owner=nearest;}
  if(owner&&(owner.open===true||owner.fist===true)){this.last=now;this.clear(now);return this.read(now);}
  let pointer=owner;
  if(!pointer){pointer=valid.find(hand=>hand.aimPose===true||(!('aimPose' in hand)&&!('aimHoldPose' in hand)&&!('walkingPose' in hand)&&hand.pointing===true));if(!pointer){this.last=now;this.clear(now);return this.read(now);}this.since=now;this.active=false;this.candidate=true;this.candidateFlex=flexDifference(pointer);this.needsAimEntry=false;this.walkingSince=null;}
  const geometric='aimPose' in pointer||'aimHoldPose' in pointer||'walkingPose' in pointer;
  if(!geometric&&pointer.pointing!==true){this.last=now;this.clear(now);return this.read(now);}
  if(stale){
   if(geometric&&!pointer.aimPose){this.last=now;this.clear(now);return this.read(now);}
   this.since=now;this.active=false;this.candidate=true;this.candidateFlex=flexDifference(pointer);this.needsAimEntry=false;this.walkingSince=null;this.reason=null;
  }
  if(geometric&&(pointer.open===true||pointer.fist===true)){this.last=now;this.clear(now);return this.read(now);}
  if(geometric&&!pointer.aimPose&&!pointer.aimHoldPose){
   this.active=false;this.needsAimEntry=true;
   if(pointer.walkingPose===true){
    if(this.walkingSince===null)this.walkingSince=now;
    if(now-this.walkingSince>=WALK_RELEASE_MS){this.last=now;this.clear(now);return this.read(now);}
    this.reason='walking';
   }else{this.walkingSince=null;this.reason='ambiguous';}
  }else if(geometric){
   this.walkingSince=null;
   if(pointer.aimPose===true&&this.needsAimEntry){this.since=now;this.active=false;this.candidate=true;this.needsAimEntry=false;this.reason=null;}
   if(pointer.aimHoldPose===true&&this.needsAimEntry){this.active=false;}
   if(!this.active&&!this.needsAimEntry&&pointer.aimPose!==true&&pointer.aimHoldPose===true)this.since=now;
  }
  const flex=flexDifference(pointer);
  if(!geometric&&!this.active&&this.candidate&&flex!==null&&this.candidateFlex!==null&&Math.abs(flex-this.candidateFlex)>.035)this.since=now;
  if(!this.active)this.candidateFlex=flex;
  this.last=now;this.pointerId=pointer.id===undefined?null:String(pointer.id);this.ownerPoint={pointX:pointer.pointX,pointY:pointer.pointY};
  // Camera is mirrored in the UI, so normalized horizontal aim is mirrored too.
  this.aim={x:clamp((.85-pointer.pointX)/.7),y:clamp((pointer.pointY-.12)/.7)};
  if((!geometric||pointer.aimPose===true||pointer.aimHoldPose===true)&&!this.needsAimEntry&&now-this.since>=this.dwellMs)this.active=true;
  this.reason=this.active?'active':this.reason||'candidate';
  return this.read(now);
 }
 read(now,{overUi=false}={}){
  const fresh=Number.isFinite(now)&&now-this.last<=this.staleMs;
  if(!fresh)this.active=false;
  const active=this.active&&fresh&&!overUi;
  const blockWalking=this.candidate&&fresh&&!overUi;
  return {active,spraying:active,aim:{...this.aim},pointerId:fresh?this.pointerId:null,dwell:this.candidate&&fresh?clamp((now-this.since)/this.dwellMs):0,fresh,blockWalking,reason:blockWalking?(this.reason||'candidate'):null};
 }
}
