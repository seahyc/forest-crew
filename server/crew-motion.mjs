export const CREW_BODY_RADIUS=.38;
export const CREW_WALK_SPEED=1.8;
export const CREW_MOTION_STEP=1/60;

const EPSILON=1e-9;
const rotate=(x,z,angle)=>({x:x*Math.cos(angle)-z*Math.sin(angle),z:x*Math.sin(angle)+z*Math.cos(angle)});
const distanceAtClosestApproach=(a,b,av,bv,horizon)=>{
 const px=a.x-b.x,pz=a.z-b.z,vx=av.x-bv.x,vz=av.z-bv.z,speed2=vx*vx+vz*vz;
 const t=speed2>EPSILON?Math.max(0,Math.min(horizon,-(px*vx+pz*vz)/speed2)):0;
 return Math.hypot(px+vx*t,pz+vz*t);
};
const priority=actor=>actor.anchored||!actor.target?0:1;

/**
 * Advance authoritative crew locomotion by one small physics step. Actors are
 * discs on the deck. Stationary actors have right of way; moving ties use the
 * stable actor id so a crossing cannot alternate priority between frames.
 *
 * The function mutates actor positions and returns per-actor arrival/blocking
 * state. Model choices remain responsible for destinations; this only solves
 * local physical motion.
 */
export function stepCrewMotion(actors,dt,{radius=CREW_BODY_RADIUS,speed=CREW_WALK_SPEED,arrival=.05,horizon=.8}={}){
 if(!Number.isFinite(dt)||dt<=0)return new Map();
 const ordered=[...actors].sort((a,b)=>priority(a)-priority(b)||String(a.id).localeCompare(String(b.id)));
 const velocities=new Map(),states=new Map(),minimum=radius*2+.025;
 for(const actor of ordered){
  const target=actor.target;
  if(actor.anchored||!target){velocities.set(actor.id,{x:0,z:0});states.set(actor.id,{arrived:!target,blockedReason:null});continue;}
  const dx=target.x-actor.position.x,dz=target.z-actor.position.z,distance=Math.hypot(dx,dz);
  if(distance<=arrival){velocities.set(actor.id,{x:0,z:0});states.set(actor.id,{arrived:true,blockedReason:null});continue;}
  const pace=Math.min(speed,distance/dt),direct={x:dx/distance*pace,z:dz/distance*pace};
  const earlier=ordered.filter(other=>other!==actor&&velocities.has(other.id));
  const clear=candidate=>earlier.every(other=>distanceAtClosestApproach(actor.position,other.position,candidate,velocities.get(other.id),horizon)>=minimum);
  let chosen=clear(direct)?direct:null;
  if(!chosen){
   // The lower-priority actor consistently passes on one side, trying shallow
   // deviations before a full lateral step so it still converges on its job.
   const sign=String(actor.id).localeCompare(String(earlier[0]?.id??''))>=0?1:-1;
   for(const degrees of [24,-24,42,-42,64,-64,86,-86,112,-112]){
    const candidate=rotate(direct.x,direct.z,sign*degrees*Math.PI/180);
    if(clear(candidate)){chosen=candidate;break;}
   }
  }
  velocities.set(actor.id,chosen??{x:0,z:0});
  states.set(actor.id,{arrived:false,blockedReason:chosen?null:'crew_collision'});
 }
 for(const actor of actors){const velocity=velocities.get(actor.id)??{x:0,z:0};actor.position.x+=velocity.x*dt;actor.position.z+=velocity.z*dt;if(Math.hypot(velocity.x,velocity.z)>EPSILON)actor.yaw=Math.atan2(velocity.x,velocity.z);}
 // Numerical guard: priority owns its position and the lower-priority body is
 // separated. This also repairs an old snapshot that starts slightly overlapped.
 for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
  const keeper=ordered[i],mover=ordered[j],dx=mover.position.x-keeper.position.x,dz=mover.position.z-keeper.position.z,d=Math.hypot(dx,dz);
  if(d>=radius*2)continue;
  const fallback=String(mover.id).localeCompare(String(keeper.id))>=0?1:-1,nx=d>EPSILON?dx/d:fallback,nz=d>EPSILON?dz/d:0,push=radius*2-d;
  mover.position.x+=nx*push;mover.position.z+=nz*push;
  states.set(mover.id,{arrived:false,blockedReason:'crew_collision'});
 }
 for(const actor of actors){const state=states.get(actor.id);if(actor.target&&Math.hypot(actor.target.x-actor.position.x,actor.target.z-actor.position.z)<=arrival)states.set(actor.id,{arrived:true,blockedReason:null});}
 return states;
}
