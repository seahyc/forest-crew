import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHosePath} from '../src/hose-path.mjs';
const start={x:-4.5,y:.48,z:-.5};
test('hose sag stays above deck and clears a raised surface',()=>{
 const height=(x,z)=>z>4&&z<7?.3:0;
 const path=buildHosePath(start,{x:1,y:.8,z:15},height);
 assert.deepEqual(path[0],start);
 for(const p of path.slice(1,-1))assert.ok(p.y>=height(p.x,p.z)+.063-1e-9);
});
test('long supply line routes through clear causeway rather than diagonal shore',()=>{
 const end={x:5,y:.8,z:19},path=buildHosePath(start,end,()=>0);
 for(const p of path)if(p.z>2&&p.z<12)assert.ok(Math.abs(p.x)<.001);
 assert.deepEqual(path.at(-1),end);
 assert.ok(path.every(p=>Object.values(p).every(Number.isFinite)));
});
test('preserves endpoints from Babylon-style vector coordinate getters',()=>{
 const vector=(x,y,z)=>Object.create({get x(){return x;},get y(){return y;},get z(){return z;}});
 const path=buildHosePath(vector(-4.5,.48,-.5),vector(1,1.2,4),()=>0);
 assert.deepEqual(path[0],start);assert.deepEqual(path.at(-1),{x:1,y:1.2,z:4});
 assert.ok(path.every(p=>[p.x,p.y,p.z].every(Number.isFinite)));
});
