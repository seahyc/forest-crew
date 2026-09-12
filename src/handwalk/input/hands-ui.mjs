/** Requires continuous fresh evidence; a lost hand cancels the countdown. */
export class HandsReadyGate {
 constructor(holdMs=2000){this.holdMs=holdMs;this.reset();}
 reset(){this.since=null;this.last=-Infinity;this.fired=false;}
 update(bothVisible,now){
  if(!bothVisible||now-this.last>220){this.since=null;this.fired=false;}
  this.last=now;
  if(!bothVisible)return {ready:false,remainingMs:this.holdMs};
  if(this.since===null)this.since=now;
  const remainingMs=Math.max(0,this.holdMs-(now-this.since));
  const ready=remainingMs===0&&!this.fired;
  if(ready)this.fired=true;
  return {ready,remainingMs};
 }
}
/** A target fires once per deliberate dwell, and must be left before reactivation. */
export class DwellSelector {
 constructor(dwellMs=950){this.dwellMs=dwellMs;this.reset();}
 reset(){this.target=null;this.since=0;this.last=-Infinity;this.fired=false;}
 update(target,now){
  if(target!==this.target||now-this.last>220){this.target=target;this.since=now;this.fired=false;}
  this.last=now;
  if(!target){this.fired=false;return {selected:null,progress:0};}
  const progress=Math.min(1,(now-this.since)/this.dwellMs);
  const selected=progress===1&&!this.fired?target:null;
  if(selected)this.fired=true;
  return {selected,progress};
 }
}
/** Gesture vocabulary shared by the UI and deterministic tests. */
export class HandsInterface {
 constructor(){this.start=new HandsReadyGate(2000);this.menu=new HandsReadyGate(1200);this.menuArm=new HandsReadyGate(300);this.menuArmed=false;this.phase=null;this.lastUpdate=-Infinity;this.dwell=new DwellSelector();this.pointerId=null;}
 reset(){this.start.reset();this.menu.reset();this.menuArm.reset();this.menuArmed=false;this.phase=null;this.lastUpdate=-Infinity;this.dwell.reset();this.pointerId=null;}
 update(hands,now,phase){
  if(phase!==this.phase||now-this.lastUpdate>220){this.start.reset();this.menu.reset();this.menuArm.reset();this.menuArmed=false;this.phase=phase;}
  this.lastUpdate=now;
  const bothVisible=hands.length===2,bothFists=bothVisible&&hands.every(h=>h.fist),bothNonFists=bothVisible&&hands.every(h=>!h.fist);
  const start=this.start.update(phase==='setup'&&bothNonFists,now);
  let menu={ready:false,remainingMs:this.menu.holdMs};
  if(phase==='play'){
   if(!bothVisible){this.menu.reset();this.menuArm.reset();this.menuArmed=false;}
   else if(bothNonFists){this.menu.reset();if(this.menuArm.update(true,now).ready)this.menuArmed=true;}
   else if(bothFists&&this.menuArmed)menu=this.menu.update(true,now);
   else this.menu.reset();
  }
  const candidates=phase==='menu'?hands:hands.filter(h=>h.pointing);
  const point=candidates.find(h=>h.id===this.pointerId)??candidates[0];
  if(point)this.pointerId=point.id;
  const clamp=v=>Math.min(1,Math.max(0,v));
  return {start:start.ready,remainingMs:start.remainingMs,openMenu:menu.ready,blockMovement:phase==='play'&&bothFists,
   menuArmed:this.menuArmed,menuProgress:this.menuArmed&&bothFists?1-menu.remainingMs/this.menu.holdMs:0,menuRemainingMs:menu.remainingMs,
   pointer:phase==='menu'&&point?{x:clamp((1-point.pointX-.15)/.7),y:clamp((point.pointY-.12)/.7),id:point.id,selectable:!!point.pointing}:null};
 }
}

/** Retain a visible cursor through pose/tracking loss; never retain selection authority. */
export class PersistentCursor {
 constructor(){this.x=.5;this.y=.5;this.id=null;this.last=-Infinity;}
 update(point,now){
  const changed=!!point&&this.id!==point.id;
  if(point){const alpha=changed||now-this.last>300?1:.4;this.x+=(point.x-this.x)*alpha;this.y+=(point.y-this.y)*alpha;this.id=point.id;this.last=now;}
  return {x:this.x,y:this.y,id:this.id,tracked:!!point,selectable:!!point?.selectable,changed};
 }
}
