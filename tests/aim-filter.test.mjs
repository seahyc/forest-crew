import test from 'node:test';
import assert from 'node:assert/strict';
import {AimFilter} from '../src/aim-filter.mjs';
test('suppresses isolated fingertip glitches without moving the hose',()=>{const f=new AimFilter();f.update({x:.5,y:.5},0);assert.deepEqual(f.update({x:.7,y:.5},60),{x:.5,y:.5});assert.deepEqual(f.update({x:.5,y:.5},120),{x:.5,y:.5});});
test('follows a deliberate large sweep within 200ms',()=>{const f=new AimFilter();f.update({x:.2,y:.5},0);for(let t=40;t<=200;t+=40)f.update({x:.8,y:.5},t);assert.ok(f.point.x>.78);});
test('stationary finger noise is reduced and output is bounded',()=>{const f=new AimFilter();f.update({x:.5,y:.5},0);const points=[];for(let i=1;i<=60;i++)points.push(f.update({x:.5+(i%2?.008:-.008),y:.5},i*40).x);assert.ok(Math.max(...points)-Math.min(...points)<.006);assert.ok(f.update({x:4,y:-3},10000).x<=1);});
test('reacquisition after stale tracking snaps to the new position',()=>{const f=new AimFilter();f.update({x:.1,y:.1},0);assert.deepEqual(f.update({x:.9,y:.9},500),{x:.9,y:.9});});
test('continuous fast movement cannot be rejected as a sequence of outliers',()=>{const f=new AimFilter();f.update({x:.1,y:.5},0);f.update({x:.3,y:.5},40);const next=f.update({x:.5,y:.5},80);assert.ok(next.x>.3);assert.ok(f.update({x:.7,y:.5},120).x>=next.x);});
