// The supply line follows the walkable corridor instead of cutting across reefs.
// Contact heights include the tube radius; a sagging centreline may never sink
// below the rendered surface. Sampling is supplied by the renderer, not physics.
export function buildHosePath(start,end,heightAt,{spacing=.16,radius=.045}={}){
 const waypoints=[start];
 if(end.z>2)waypoints.push({x:0,y:0,z:1});
 if(end.z>13)waypoints.push({x:0,y:0,z:12});
 waypoints.push({x:end.x,y:0,z:end.z-.4},end);
 const points=[];
 for(let leg=1;leg<waypoints.length;leg++){
  const a=waypoints[leg-1],b=waypoints[leg],length=Math.hypot(b.x-a.x,b.z-a.z,b.y-a.y),steps=Math.max(1,Math.ceil(length/spacing));
  for(let i=leg===1?0:1;i<=steps;i++){
   const t=i/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
   const contact=Math.max(0,heightAt(x,z))+radius+.018;
   const y=Math.max(contact,a.y+(b.y-a.y)*t-Math.sin(t*Math.PI)*.16);
   points.push({x,y,z});
  }
 }
 // A small conservative clearance envelope spans sharp surface changes rather
 // than letting the straight tube edges penetrate a bump between samples.
 const heights=points.map(p=>p.y);
 for(let i=1;i<points.length-1;i++)points[i].y=Math.max(heights[i],heights[i-1]-.06,heights[i+1]-.06);
 points[0]={x:start.x,y:start.y,z:start.z};points[points.length-1]={x:end.x,y:end.y,z:end.z};
 return points;
}
