export const MAX_CAPTURE_AGE_MS=1000;

export function shouldDispatchFrame({hidden,workerReady,cameraReady,busy}){
 return !hidden&&workerReady&&cameraReady&&!busy;
}

export function classifyTrackerResult({hidden,captureTime,receivedAt,maxCaptureAgeMs=MAX_CAPTURE_AGE_MS}){
 if(hidden)return {accept:false,reason:'document-hidden',ageMs:null};
 if(!Number.isFinite(captureTime)||!Number.isFinite(receivedAt))return {accept:false,reason:'invalid-timestamp',ageMs:null};
 const ageMs=receivedAt-captureTime;
 if(ageMs<0)return {accept:false,reason:'future-timestamp',ageMs};
 if(ageMs>maxCaptureAgeMs)return {accept:false,reason:'capture-too-old',ageMs};
 return {accept:true,reason:ageMs>220?'late-inference':'fresh',ageMs};
}

export function readinessReason({hidden,cameraReady,workerReady,busy,lastDispatchAgeMs,lastResultAgeMs,rawHands,sampledHands,staleMs=220}){
 if(hidden)return 'document-hidden';
 if(!cameraReady)return 'camera-not-decoding';
 if(!workerReady)return 'worker-not-ready';
 if(busy&&lastDispatchAgeMs>2500)return 'worker-stalled';
 if(!Number.isFinite(lastResultAgeMs))return 'awaiting-first-result';
 if(lastResultAgeMs>staleMs)return 'result-stale';
 if(rawHands===0)return 'no-hands-detected';
 if(sampledHands===0)return 'landmarks-invalid';
 return 'hands-ready';
}

export function framingPrompt(rawHands,targetHands=2){
 const target=targetHands===1?1:2,count=Number.isFinite(rawHands)?Math.max(0,Math.min(target,Math.trunc(rawHands))):0;
 return `Show ${target===1?'one hand':'both hands'} at chest height · ${count}/${target} detected`;
}

export function preferredInputMode({coarsePointer=false,maxTouchPoints=0}={}){
 return coarsePointer&&maxTouchPoints>0?'one-hand':'two-hand';
}
