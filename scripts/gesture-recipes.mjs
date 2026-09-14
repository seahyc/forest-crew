const ASPECT=4/3,STEP_MS=100;
const clone=p=>({x:p.x,y:p.y,z:p.z});
const point=(x,y,z=0)=>({x,y,z});

function finger(points,start,lengths,{angle=-Math.PI/2,bend=0}={}){
 let p=clone(start),a=angle;
 for(let i=0;i<3;i++){
  a+=i===0?bend*.72:bend*.64;
  p=point(p.x+Math.cos(a)*lengths[i],p.y+Math.sin(a)*lengths[i]);points.push(p);
 }
}

function hand({x=.5,y=.72,steer=0,index=0,middle=0,ring=1.5,little=1.55,pose='walk',reverse=false}={}){
 const p=Array(21),put=(i,dx,dy,z=0)=>p[i]=point(x+dx,y+dy,z);
 put(0,0,0);put(1,-.045,-.025);put(2,-.075,-.06);put(3,-.105,-.085);put(4,-.135,-.105);
 if(reverse){put(2,-.09,-.055);put(3,-.14,-.075);put(4,-.19,-.095);}
 const bases=[[-.055,-.115],[0,-.13],[.05,-.115],[.09,-.085]];
 for(let i=0;i<4;i++)put(5+i*4,...bases[i]);
 const bends=pose==='hose'?[0,1.55,1.62,1.65]:pose==='open'?[0,0,0,0]:pose==='fist'?[1.7,1.7,1.7,1.7]:[index,middle,ring,little];
 const angles=pose==='hose'?[-Math.PI/2+steer,-Math.PI/2,-Math.PI/2,-Math.PI/2]:[-Math.PI/2+steer,-Math.PI/2+steer,-Math.PI/2,-Math.PI/2];
 const lengths=[[.075,.055,.045],[.082,.062,.05],[.075,.055,.045],[.065,.048,.04]];
 for(let f=0;f<4;f++){
  const built=[];finger(built,p[5+f*4],lengths[f],{angle:angles[f],bend:bends[f]});
  for(let j=0;j<3;j++)p[6+f*4+j]=built[j];
 }
 return p;
}

function frame(t,hands){return {t,hands:hands.map(({id='primary',...shape})=>({id,landmarks:hand(shape)})),aspect:ASPECT};}
function timeline(duration,producer){const frames=[];for(let t=0;t<=duration;t+=STEP_MS)frames.push(frame(t,producer(t)));return frames;}

function walkTurn(){return timeline(10000,t=>{
 if(t<2300)return [{pose:'walk',index:.18,middle:.18}];
 if(t<7200){const phase=(t-2300)/260,alternate=(Math.sin(phase)+1)/2,steer=t<3900?0:t<5100?-.42:t<6100?.42:0;return [{pose:'walk',steer,reverse:t>=6100,index:.12+alternate*.75,middle:.12+(1-alternate)*.75}];}
 if(t<8200)return [{pose:'open'}];
 return [];
});}
function hoseSweep(){return timeline(10000,t=>{
 if(t<2300)return [{pose:'walk',index:.18,middle:.18}];
 if(t<7200)return [{pose:'hose',x:.5+Math.sin((t-2300)/900)*.13,y:.72+Math.sin((t-2300)/1300)*.05}];
 if(t<8200)return [{pose:'open'}];
 return [];
});}
function handCount(){return timeline(9000,t=>{
 if(t<2300)return [{pose:'walk',index:.18,middle:.18}];
 if(t<3500)return [{pose:'walk',index:.25,middle:.2}];
 if(t<3700)return [{pose:'walk',index:.25,middle:.2},{id:'secondary',x:.72,pose:'walk',index:.22,middle:.26}];
 if(t<4000)return [{pose:'walk',index:.25,middle:.2}];
 if(t<5200)return [{pose:'walk',index:.25,middle:.2},{id:'secondary',x:.72,pose:'walk',index:.22,middle:.26}];
 if(t<7400)return [{pose:'walk',index:.25,middle:.2}];
 return [];
});}

const factories={'walk-turn':walkTurn,'hose-sweep':hoseSweep,'hand-count':handCount};
export const recipeNames=Object.freeze(Object.keys(factories));
export function gestureRecipe(name){
 const make=factories[name];if(!make)throw new RangeError(`Unknown gesture recipe: ${name}`);
 return {version:1,frames:make(),metadata:{synthetic:true,name}};
}
