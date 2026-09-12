import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTrackerResult,framingPrompt,preferredInputMode,readinessReason,shouldDispatchFrame} from '../src/input-readiness.mjs';

test('visible embedded viewport dispatches without document focus',()=>{
 assert.equal(shouldDispatchFrame({hidden:false,workerReady:true,cameraReady:true,busy:false,focused:false}),true);
 assert.equal(shouldDispatchFrame({hidden:true,workerReady:true,cameraReady:true,busy:false,focused:true}),false);
});

test('late CPU inference is accepted within a bounded capture age',()=>{
 assert.deepEqual(classifyTrackerResult({hidden:false,captureTime:1000,receivedAt:1320}),{accept:true,reason:'late-inference',ageMs:320});
 assert.equal(classifyTrackerResult({hidden:false,captureTime:1000,receivedAt:2001}).accept,false);
 assert.equal(classifyTrackerResult({hidden:true,captureTime:1000,receivedAt:1010}).reason,'document-hidden');
});

test('readiness distinguishes pipeline and recognition failures',()=>{
 const base={hidden:false,cameraReady:true,workerReady:true,busy:false,lastDispatchAgeMs:0,lastResultAgeMs:20,rawHands:2,sampledHands:2};
 assert.equal(readinessReason({...base,cameraReady:false}),'camera-not-decoding');
 assert.equal(readinessReason({...base,workerReady:false}),'worker-not-ready');
 assert.equal(readinessReason({...base,busy:true,lastDispatchAgeMs:2600}),'worker-stalled');
 assert.equal(readinessReason({...base,rawHands:0,sampledHands:0}),'no-hands-detected');
 assert.equal(readinessReason({...base,sampledHands:0}),'landmarks-invalid');
 assert.equal(readinessReason(base),'hands-ready');
});

test('framing prompt reports the detector count without overstating readiness',()=>{
 assert.equal(framingPrompt(0),'Show both hands at chest height · 0/2 detected');
 assert.equal(framingPrompt(1),'Show both hands at chest height · 1/2 detected');
 assert.equal(framingPrompt(9),'Show both hands at chest height · 2/2 detected');
 assert.equal(framingPrompt(0,1),'Show one hand at chest height · 0/1 detected');
 assert.equal(framingPrompt(2,1),'Show one hand at chest height · 1/1 detected');
});

test('coarse touch devices prefer one-hand controls',()=>{
 assert.equal(preferredInputMode({coarsePointer:true,maxTouchPoints:5}),'one-hand');
 assert.equal(preferredInputMode({coarsePointer:false,maxTouchPoints:5}),'two-hand');
 assert.equal(preferredInputMode({coarsePointer:true,maxTouchPoints:0}),'two-hand');
});
