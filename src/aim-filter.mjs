const clamp=v=>Math.max(0,Math.min(1,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
/** Time-based aim smoothing: quiet near rest, quick on deliberate sweeps. */
export class AimFilter{
 constructor(){this.reset();}
 reset(){this.point=null;this.last=null;this.raw=null;this.pending=null;}
 update(target,now){
  if(!target||![target.x,target.y,now].every(Number.isFinite))return this.point?{...this.point}:{x:.5,y:.5};
  const next={x:clamp(target.x),y:clamp(target.y)};
  if(!this.point||this.last===null||now-this.last>450||now<this.last){this.point=next;this.raw=next;this.last=now;this.pending=null;return {...next};}
  const dt=Math.max(0,(now-this.last)/1000);if(!dt)return {...this.point};this.last=now;
  // One isolated landmark jump must not fling the hose or select a UI button.
  if(distance(next,this.raw)>.1&&dt<.15&&!this.pending){this.pending=next;return {...this.point};}
  this.pending=null;this.raw=next;
  const delta=distance(next,this.point),deadzone=.0025;
  if(delta<=deadzone)return {...this.point};
  const tau=delta>.07?.035:delta>.025?.06:.13,alpha=1-Math.exp(-dt/tau),travel=(delta-deadzone)/delta;
  this.point={x:this.point.x+(next.x-this.point.x)*alpha*travel,y:this.point.y+(next.y-this.point.y)*alpha*travel};return {...this.point};
 }
}
