const clamp=v=>Math.max(0,Math.min(1,v));
/** @param {{onEvent?:(type:string,data:object)=>void}} [options] */
export function createPlayerHeat({onEvent=(_type,_data)=>{}}={}){
 let state,safeSeconds=0;
 const snapshot=()=>({...state});
 const reset=()=>{safeSeconds=0;state={health:1,heat:0,burning:false,exposure:0,needsRescue:false,sourceId:null};return snapshot();};
 /** @param {number} dt @param {{position?:{x:number,z:number},patches?:Array<{id:string,x:number,z:number,radius:number,heat:number,extinguished:boolean}>,active?:boolean}} [input] */
 function update(dt,{position,patches=[],active=true}={}){
  if(!active||state.needsRescue||!Number.isFinite(dt)||dt<=0||!Number.isFinite(position?.x)||!Number.isFinite(position?.z))return snapshot();
  dt=Math.min(dt,.1);let exposure=0,sourceId=null;
  for(const p of patches){if(p.extinguished||!['x','z','radius','heat'].every(k=>Number.isFinite(p[k]))||p.radius<=0)continue;const distance=Math.hypot(position.x-p.x,position.z-p.z);const contact=clamp((p.radius+.25-distance)/.45)*clamp(p.heat);if(contact>exposure){exposure=contact;sourceId=p.id;}}
  const burning=exposure>.05;if(burning!==state.burning)onEvent(burning?'burn-enter':'burn-exit',{sourceId,health:state.health});
  state.burning=burning;state.sourceId=sourceId;state.exposure=exposure;
  if(burning){safeSeconds=0;state.heat=clamp(state.heat+dt*.7*exposure);state.health=clamp(state.health-dt*.20*exposure);}
  else{safeSeconds+=dt;state.heat=clamp(state.heat-dt*.4);if(safeSeconds>2)state.health=clamp(state.health+dt*.1);}
  if(state.health<=0){state.needsRescue=true;onEvent('rescue-needed',{sourceId});}
  return snapshot();
 }
 reset();return {update,reset,snapshot};
}
