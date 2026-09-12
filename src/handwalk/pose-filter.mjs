const fields=['left','right','leftLift','rightLift','leftToe','rightToe','stride'];
const zero=()=>({left:0,right:0,leftLift:0,rightLift:0,leftToe:0,rightToe:0,stride:0});

// Interpolate camera-rate targets at render rate. This changes only the visible
// pose: walking, stopping, and steering keep their own immediate control signals.
export class PoseFilter {
 constructor(){this.reset();}
 reset(){this.pose=zero();}
 update(target,dt){
  if(target.source==='neutral'){this.reset();return {...target,...this.pose};}
  const elapsed=Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0));
  const alpha=1-Math.exp(-elapsed/.075),maxChange=elapsed*9;
  for(const field of fields){
   const min=['left','right','leftToe','rightToe'].includes(field)?-1:0;
   const value=Math.max(min,Math.min(1,Number.isFinite(target[field])?target[field]:0));
   const difference=value-this.pose[field];
   this.pose[field]=Math.abs(difference)<.00001?value:this.pose[field]+Math.max(-maxChange,Math.min(maxChange,difference*alpha));
  }
  return {...target,...this.pose};
 }
}
