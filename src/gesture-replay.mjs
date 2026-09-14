import {normalizeGestureRecording} from './gesture-replay-data.mjs';

/** Wall-clock playback: gaps stay gaps; no interpolation or game-state overrides. */
export function createGestureReplay({ingest,reset,onStop=()=>{}}){
 let recording=null,index=0,origin=0,state='empty',warmupMs=0,warmupAt=0,lastNow=-Infinity,maxLatenessMs=0,lateFrames=0;
 function stop(reason='stopped') {if(state==='playing'){state=reason;onStop();}return status();}
 function load(value,options={}){
  const next=normalizeGestureRecording(value);
  const warmup=options.warmupMs??0;
  if(!Number.isFinite(warmup)||warmup<0||warmup>5000)throw new Error('warmupMs must be between 0 and 5000');
  stop();recording=next;warmupMs=warmup;index=0;state='loaded';return status();
 }
 function play(now){
  if(!recording)throw new Error('Load a recording first');
  if(!Number.isFinite(now))throw new Error('Invalid playback clock');
  reset();index=0;origin=now;warmupAt=now;lastNow=now;maxLatenessMs=0;lateFrames=0;state='playing';return status();
 }
 function tick(now){
  if(state!=='playing')return;
  if(!Number.isFinite(now)||now<lastNow){stop('clock-error');return;}
  // A suspended tab cannot faithfully replay a burst of historical gestures.
  if(now-lastNow>250){stop('interrupted');return;}
  lastNow=now;
  if(now<origin+warmupMs){
   if(now>=warmupAt){const first=recording.frames.find(frame=>frame.hands.length);if(first)ingest(first.hands,now,first.aspect);warmupAt=now+33;}
   return;
  }
  while(index<recording.frames.length&&origin+warmupMs+recording.frames[index].t<=now){
   const frame=recording.frames[index++],due=origin+warmupMs+frame.t,lateness=now-due;
   maxLatenessMs=Math.max(maxLatenessMs,lateness);if(lateness>50)lateFrames++;
   ingest(frame.hands,due,frame.aspect);
  }
  // Let genuine staleness run through the game before releasing the input.
  if(index===recording.frames.length&&now>=origin+warmupMs+recording.durationMs+500)stop('complete');
 }
 function status(){return {state,index,frameCount:recording?.frames.length??0,durationMs:recording?.durationMs??0,warmupMs,elapsedMs:Math.max(0,lastNow-origin),maxLatenessMs,lateFrames,warnings:recording?.warnings??[]};}
 return {load,play,tick,stop,status};
}
