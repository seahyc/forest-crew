import test from 'node:test';
import assert from 'node:assert/strict';
import {createGestureReplay} from '../src/gesture-replay.mjs';
const recording={version:1,frames:[{t:0,hands:[],aspect:1},{t:700,hands:[],aspect:1}]};
function setup(){const seen=[];let stopped=0;const replay=createGestureReplay({ingest:(...args)=>seen.push(args),reset:()=>seen.length=0,onStop:()=>stopped++});return {replay,seen,stopped:()=>stopped};}
test('keeps a tracking gap and original sample times rather than refreshing stale hands',()=>{const {replay,seen,stopped}=setup();replay.load(recording);replay.play(100);for(let t=100;t<=1300;t+=100)replay.tick(t);assert.deepEqual(seen.map(x=>x[1]),[100,800]);assert.equal(replay.status().state,'complete');assert.equal(stopped(),1);});
test('hidden-tab sized scheduling stalls interrupt instead of replaying a burst',()=>{const {replay,seen}=setup();replay.load(recording);replay.play(0);replay.tick(0);replay.tick(900);assert.equal(replay.status().state,'interrupted');assert.equal(seen.length,1);});
test('stop and reload do not leave old frames scheduled',()=>{const {replay,seen}=setup();replay.load(recording);replay.play(0);replay.tick(0);replay.stop();replay.tick(100);assert.equal(seen.length,1);replay.load(recording);replay.play(200);replay.tick(200);assert.equal(seen.length,1);});
test('invalid warmup and backwards clock fail explicitly',()=>{const {replay}=setup();assert.throws(()=>replay.load(recording,{warmupMs:6000}));replay.load(recording);replay.play(10);replay.tick(0);assert.equal(replay.status().state,'clock-error');});
