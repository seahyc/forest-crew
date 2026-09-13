/** A finite starting reserve lets the player learn aiming while agents connect supply. */
export function createWaterSupply({seconds=12,reservePressure=.45}={}){
 let remaining=seconds;
 return {reset(){remaining=seconds;},update(dt,{crewPressure=0,requested=false,active=false}={}){
  const connected=Number.isFinite(crewPressure)&&crewPressure>0;
  const fromReserve=!connected&&remaining>0;
  const flow=active&&requested&&(connected||fromReserve);
  // A paused or hidden game consumes no reserve. Supply does not refill it:
  // disconnecting the crew cannot mint an endless starter tank.
  const step=Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.1));
  const fraction=flow&&fromReserve&&step>0?Math.min(1,remaining/step):1;
  const pressure=connected?Math.min(1,crewPressure):fromReserve?reservePressure*fraction:0;
  if(flow&&fromReserve)remaining=Math.max(0,remaining-step);
  return {pressure,flowing:flow,source:connected?'crew':fromReserve?'reserve':'empty',remainingSeconds:remaining};
 }};
}
