import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGestureRecording} from '../src/gesture-replay-data.mjs';

const points=(offset=0)=>Array.from({length:21},(_,i)=>({x:offset+i/100,y:.2+i/200,z:-i/300,visibility:.9}));
const hand=(id='Right',offset=0)=>({id,landmarks:points(offset)});

test('normalizes real-shaped telemetry, stably sorts, rebases, and preserves gaps and empty events',()=>{
 const input=[
  {seq:1,t:900,type:'recognition-empty',data:{videoWidth:640,videoHeight:480}},
  {seq:2,t:1200,type:'hands',data:{landmarks:[hand('Right',1)]}},
  {seq:3,t:1000,type:'hands',data:{landmarks:[hand('Left')]}},
  {seq:4,t:1200,type:'hands',data:{landmarks:[]}},
 ];
 const snapshot=structuredClone(input),result=normalizeGestureRecording(input);
 assert.deepEqual(result.frames.map(frame=>frame.t),[0,200,200]);
 assert.deepEqual(result.frames.map(frame=>frame.hands.map(h=>h.id)),[['Left'],['Right'],[]]);
 assert.deepEqual(result.frames.map(frame=>frame.aspect),[4/3,4/3,4/3]);
 assert.equal(result.durationMs,200);
 assert.deepEqual(result.warnings,[]);
 assert.deepEqual(input,snapshot);
 assert.deepEqual(Object.keys(result.frames[0].hands[0].landmarks[0]),['x','y','z']);
});

test('accepts version 1 frames and uses frame, nearest, then metadata aspect evidence',()=>{
 const result=normalizeGestureRecording({version:1,metadata:{aspect:2},frames:[
  {t:50,hands:[hand()],aspect:1.5},
  {t:100,hands:[]},
  {t:300,hands:[hand('Left')],aspect:1.8},
 ]});
 assert.deepEqual(result.frames.map(frame=>frame.aspect),[1.5,1.5,1.8]);
 assert.deepEqual(result.frames.map(frame=>frame.t),[0,50,250]);
});

test('falls back explicitly when no aspect evidence exists',()=>{
 const result=normalizeGestureRecording({version:1,frames:[{t:8,hands:[]}]},{defaultAspect:16/9});
 assert.equal(result.frames[0].aspect,16/9);
 assert.match(result.warnings[0],/using default/);
});

test('reads nested tracker camera dimensions and ignores unavailable zero dimensions',()=>{
 const result=normalizeGestureRecording([
  {t:5,type:'tracker-ready',data:{camera:{videoWidth:0,videoHeight:0}}},
  {t:20,type:'hands',data:{landmarks:[hand()]}},
  {t:40,type:'tracker-ready',data:{camera:{videoWidth:1920,videoHeight:1080}}},
  {t:60,type:'hands',data:{landmarks:[]}},
 ]);
 assert.deepEqual(result.frames.map(frame=>frame.aspect),[16/9,16/9]);
 assert.deepEqual(result.warnings,[]);
});

test('rejects malformed recordings instead of deleting bad samples',()=>{
 const badPoint=hand();badPoint.landmarks[4].x=NaN;
 const cases=[
  [[],/no hand frames/],
  [{version:1},/missing frames/],
  [{version:2,frames:[{t:0,hands:[]}]},/version/],
  [{version:1,frames:[{t:-1,hands:[]}]},/timestamp/],
  [{version:1,frames:[{t:0,hands:[badPoint]}]},/non-finite/],
  [{version:1,frames:[{t:0,hands:[{id:'Right',landmarks:points().slice(1)}]}]},/21 landmarks/],
  [{version:1,frames:[{t:0,hands:[hand('Left'),hand('Left')]}]},/duplicate/],
  [{version:1,frames:[{t:0,hands:[hand('')]}]},/invalid id/],
  [{version:1,frames:[{t:0,hands:[hand('a'),hand('b'),hand('c')]}]},/more than 2/],
  [{version:1,frames:[{t:0,hands:[],aspect:0}]},/aspect ratio/],
  [{version:1,frames:[{t:0,hands:[]},{t:1_800_001,hands:[]}]},/30 minutes/],
 ];
 for(const [value,pattern] of cases)assert.throws(()=>normalizeGestureRecording(value),pattern);
});

test('rejects excessive frame counts before processing landmarks',()=>{
 const frames=Array.from({length:100_001},(_,t)=>({t,hands:[]}));
 assert.throws(()=>normalizeGestureRecording({version:1,frames}),/100000 frames/);
});
