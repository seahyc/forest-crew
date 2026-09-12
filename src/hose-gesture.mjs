const STALE_MS=220;
const clamp=value=>Math.max(0,Math.min(1,value));

/**
 * Interprets the hose stance independently from finger walking.
 * One hand must point while the other is an open support palm. The stance is
 * deliberately asymmetric, stable for a short dwell, and loses authority as
 * soon as fresh evidence disappears.
 */
export class HoseGestureController{
 constructor({dwellMs=250,staleMs=STALE_MS}={}){this.dwellMs=dwellMs;this.staleMs=staleMs;this.reset();}
 reset(){this.candidate='';this.since=0;this.last=-Infinity;this.active=false;this.aim={x:.5,y:.5};this.pointerId=null;}
 update(hands,now,{overUi=false}={}){
  if(!Number.isFinite(now)||!Array.isArray(hands)){this.reset();return this.read(now,{overUi});}
  const valid=hands.filter(hand=>hand&&hand.id!==undefined&&Number.isFinite(hand.pointX)&&Number.isFinite(hand.pointY));
  const pointers=valid.filter(hand=>hand.pointing===true);
  let pointer=pointers.find(hand=>String(hand.id)===this.pointerId)??pointers[0];
  const support=pointer&&valid.find(hand=>String(hand.id)!==String(pointer.id)&&hand.open===true);
  const stance=pointer&&support?`${String(pointer.id)}|${String(support.id)}`:'';
  if(now-this.last>this.staleMs||stance!==this.candidate){this.candidate=stance;this.since=now;this.active=false;}
  this.last=now;
  if(!stance){this.active=false;this.pointerId=null;return this.read(now,{overUi});}
  this.pointerId=String(pointer.id);
  // Camera is mirrored in the UI, so normalized horizontal aim is mirrored too.
  this.aim={x:clamp(1-pointer.pointX),y:clamp(pointer.pointY)};
  if(now-this.since>=this.dwellMs)this.active=true;
  return this.read(now,{overUi});
 }
 read(now,{overUi=false}={}){
  const fresh=Number.isFinite(now)&&now-this.last<=this.staleMs;
  if(!fresh)this.active=false;
  return {active:this.active&&fresh, spraying:this.active&&fresh&&!overUi, aim:{...this.aim}, pointerId:fresh?this.pointerId:null, dwell:this.candidate&&fresh?clamp((now-this.since)/this.dwellMs):0, fresh};
 }
}
