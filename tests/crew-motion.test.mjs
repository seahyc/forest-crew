import test from 'node:test';
import assert from 'node:assert/strict';
import {CREW_BODY_RADIUS,stepCrewMotion} from '../server/crew-motion.mjs';

const separation=actors=>Math.hypot(actors[0].position.x-actors[1].position.x,actors[0].position.z-actors[1].position.z);
function run(actors,dts,seconds=8){let elapsed=0,index=0,minimum=Infinity;
 while(elapsed<seconds){const dt=Math.min(dts[index++%dts.length],seconds-elapsed);stepCrewMotion(actors,dt);elapsed+=dt;minimum=Math.min(minimum,separation(actors));}
 return minimum;
}

test('crossing crew use deterministic right of way without overlapping at variable frame times',()=>{
 const actors=[
  {id:'firefighter',position:{x:-2,z:0},yaw:0,target:{x:2,z:0}},
  {id:'engineer',position:{x:0,z:-2},yaw:0,target:{x:0,z:2}},
 ];
 const minimum=run(actors,[1/120,1/43,1/19],5);
 assert.ok(minimum>=CREW_BODY_RADIUS*2-1e-9,`minimum separation ${minimum}`);
 assert.ok(Math.hypot(actors[0].position.x-2,actors[0].position.z)<.051);
 assert.ok(Math.hypot(actors[1].position.x,actors[1].position.z-2)<.051);
});

test('converging crew reach distinct nearby stations and do not deadlock',()=>{
 const actors=[
  {id:'firefighter',position:{x:-2,z:-2},yaw:0,target:{x:0,z:.42}},
  {id:'engineer',position:{x:2,z:-2},yaw:0,target:{x:0,z:-.42}},
 ];
 const minimum=run(actors,[.1,.016,.047],7);
 assert.ok(minimum>=CREW_BODY_RADIUS*2-1e-9,`minimum separation ${minimum}`);
 for(const actor of actors)assert.ok(Math.hypot(actor.position.x-actor.target.x,actor.position.z-actor.target.z)<.051,`${actor.id} did not arrive`);
});

test('a pump operator keeps the post while a teammate routes around',()=>{
 const operator={id:'engineer',position:{x:0,z:0},yaw:0,target:null,anchored:true};
 const walker={id:'firefighter',position:{x:-2,z:0},yaw:0,target:{x:2,z:0}};
 const minimum=run([operator,walker],[1/30,1/73],5);
 assert.deepEqual(operator.position,{x:0,z:0});
 assert.ok(minimum>=CREW_BODY_RADIUS*2-1e-9,`minimum separation ${minimum}`);
 assert.ok(Math.hypot(walker.position.x-2,walker.position.z)<.051);
});
