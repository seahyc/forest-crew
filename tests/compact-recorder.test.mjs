import test from 'node:test';
import assert from 'node:assert/strict';
import {CompactRecorder,recorderCaptureConfig} from '../src/handwalk/compact-recorder.ts';

test('keeps legacy capture defaults and bounds custom capture cost',()=>{
 assert.deepEqual(recorderCaptureConfig(),{width:640,height:360,frameRate:8,videoBitsPerSecond:300000});
 assert.deepEqual(recorderCaptureConfig({captureWidth:480,captureHeight:270,captureFrameRate:5,videoBitsPerSecond:220000}),{width:480,height:270,frameRate:5,videoBitsPerSecond:220000});
 assert.deepEqual(recorderCaptureConfig({captureWidth:1,captureHeight:9999,captureFrameRate:0,videoBitsPerSecond:Infinity}),{width:320,height:720,frameRate:1,videoBitsPerSecond:300000});
});

test('uses one configured cadence for capture and drawing, then clears it on stop',()=>{
 const original={document:globalThis.document,window:globalThis.window,MediaRecorder:globalThis.MediaRecorder,clearInterval:globalThis.clearInterval,clearTimeout:globalThis.clearTimeout};
 const intervals=[],cleared=[];
 const context=new Proxy({},{get:(target,key)=>key in target?target[key]:(..._args)=>{},set:(target,key,value)=>{target[key]=value;return true;}});
 const canvas={width:0,height:0,getContext:()=>context,captureStream(frameRate){this.frameRate=frameRate;return {getTracks:()=>[{stop(){canvas.trackStopped=true;}}]};}};
 class Recorder{
  static isTypeSupported=()=>true;
  constructor(_stream,options){this.options=options;this.state='inactive';}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.onstop?.();}
 }
 try{
  globalThis.document={hidden:false,createElement:()=>canvas,addEventListener(){},removeEventListener(){}};
  globalThis.window={addEventListener(){},removeEventListener(){},setInterval(fn,delay){intervals.push({fn,delay});return 41;},setTimeout(){return 42;}};
  globalThis.MediaRecorder=Recorder;
  globalThis.clearInterval=id=>cleared.push(id);
  globalThis.clearTimeout=()=>{};
  const recorder=new CompactRecorder({world:{width:1280,height:720},session:'test-session',startedAt:performance.now(),record(){},overlay:()=>({phase:'walk',reason:'moving',choice:'',dwell:0,cursorX:.5,cursorY:.5,cursorVisible:false}),captureWidth:480,captureHeight:270,captureFrameRate:5,videoBitsPerSecond:220000});
  recorder.enabled=true;
  recorder.start();
  assert.equal(canvas.width,480);
  assert.equal(canvas.height,270);
  assert.equal(canvas.frameRate,5);
  assert.equal(intervals[0].delay,200);
  assert.equal(recorder.recorder.options.videoBitsPerSecond,220000);
  recorder.stop('test-complete');
  assert.deepEqual(cleared,[41]);
  assert.equal(canvas.trackStopped,true);
 }finally{
  Object.assign(globalThis,original);
 }
});
