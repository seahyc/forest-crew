const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wrap=n=>Math.atan2(Math.sin(n),Math.cos(n));
/** Pure temporal gesture interpreter. Timestamps are monotonically increasing ms. */
export class GestureWalker {
  constructor(){ this.neutral=0; this.sensitivity=.14; this.steps=0; this.reset(); }
  reset(){this.previous=null;this.foot=0;this.lastStep=-Infinity;this.lastMotion=-Infinity;this.lastSeen=-Infinity;this.alternating=false;this.turn=0;this.cadence=1;}
  calibrate(roll){this.neutral=roll;this.reset();}
  update(f,now){
    if(!f || !Number.isFinite(f.roll) || !Number.isFinite(f.indexCurl) || !Number.isFinite(f.middleCurl)){this.reset();return this.read(now);}
    if(now-this.lastSeen>250) this.reset();
    this.lastSeen=now;
    const difference=f.indexCurl-f.middleCurl;
    if(this.previous && Math.max(Math.abs(f.indexCurl-this.previous.indexCurl),Math.abs(f.middleCurl-this.previous.middleCurl))>.012) this.lastMotion=now;
    const foot=difference>this.sensitivity?1:difference < -this.sensitivity?-1:0;
    if(foot && foot!==this.foot && now-this.lastStep>100){
      const elapsed=now-this.lastStep;
      this.alternating=this.foot!==0 && elapsed<1100;
      this.cadence=clamp(480/Math.max(elapsed,150),.6,1.35);
      this.foot=foot;this.lastStep=now;this.steps++;
    }
    let turn=-wrap(f.roll-this.neutral); // mirrored self-view: lean right -> turn right
    this.turn=Math.abs(turn)<.12?0:clamp((turn-Math.sign(turn)*.12)/.55,-1,1);
    this.previous=f;
    return this.read(now);
  }
  read(now){
    const tracked=now-this.lastSeen<220;
    const walking=tracked && this.alternating && now-this.lastStep<850 && now-this.lastMotion<170;
    return {forward:walking?this.cadence:0,turn:walking?this.turn:0,tracked,steps:this.steps};
  }
}
