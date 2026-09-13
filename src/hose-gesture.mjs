const STALE_MS=450;
const OWNER_RADIUS=.24;
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
 reset(){this.candidate=false;this.since=0;this.last=-Infinity;this.active=false;this.aim={x:.5,y:.5};this.pointerId=null;this.ownerPoint=null;this.candidateFlex=null;}
 clear(now){this.candidate=false;this.since=Number.isFinite(now)?now:0;this.active=false;this.pointerId=null;this.ownerPoint=null;this.candidateFlex=null;}
 update(hands,now,{overUi=false}={}){
  if(!Number.isFinite(now)||!Array.isArray(hands)){this.reset();return this.read(now,{overUi});}
  const valid=hands.filter(hand=>hand&&Number.isFinite(hand.pointX)&&Number.isFinite(hand.pointY));
  if(overUi){this.last=now;this.clear(now);return this.read(now,{overUi:true});}
  if(!valid.length){this.last=now;this.clear(now);return this.read(now);}
  const stale=now-this.last>this.staleMs;
  let owner=null;
  if(this.ownerPoint&&!stale){const nearest=valid.reduce((best,hand)=>!best||distance(hand,this.ownerPoint)<distance(best,this.ownerPoint)?hand:best,null);if(nearest&&distance(nearest,this.ownerPoint)<=OWNER_RADIUS)owner=nearest;}
  if(owner&&owner.pointing!==true){this.last=now;this.clear(now);return this.read(now);}
  let pointer=owner;
  if(!pointer){pointer=valid.find(hand=>hand.pointing===true);if(!pointer){this.last=now;this.clear(now);return this.read(now);}this.since=now;this.active=false;this.candidate=true;this.candidateFlex=flexDifference(pointer);}
  if(stale){this.since=now;this.active=false;this.candidate=true;this.candidateFlex=flexDifference(pointer);}
  const flex=flexDifference(pointer);
  if(!this.active&&this.candidate&&flex!==null&&this.candidateFlex!==null&&Math.abs(flex-this.candidateFlex)>.035)this.since=now;
  if(!this.active)this.candidateFlex=flex;
  this.last=now;this.pointerId=pointer.id===undefined?null:String(pointer.id);this.ownerPoint={pointX:pointer.pointX,pointY:pointer.pointY};
  // Camera is mirrored in the UI, so normalized horizontal aim is mirrored too.
  this.aim={x:clamp((.85-pointer.pointX)/.7),y:clamp((pointer.pointY-.12)/.7)};
  if(now-this.since>=this.dwellMs)this.active=true;
  return this.read(now);
 }
 read(now,{overUi=false}={}){
  const fresh=Number.isFinite(now)&&now-this.last<=this.staleMs;
  if(!fresh)this.active=false;
  return {active:this.active&&fresh&&!overUi,spraying:this.active&&fresh&&!overUi,aim:{...this.aim},pointerId:fresh?this.pointerId:null,dwell:this.candidate&&fresh?clamp((now-this.since)/this.dwellMs):0,fresh};
 }
}
