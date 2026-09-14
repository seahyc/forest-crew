const MAX_FRAMES=100_000;
const MAX_DURATION_MS=30*60*1000;

export function normalizeGestureRecording(value,{defaultAspect=4/3}={}){
 if(!finitePositive(defaultAspect))throw new Error('defaultAspect must be a positive finite number');
 const warnings=[];
 let frames,aspectSamples=[];
 if(Array.isArray(value))({frames,aspectSamples}=fromTelemetry(value));
 else if(value&&typeof value==='object')({frames,aspectSamples}=fromVersioned(value));
 else throw new Error('Gesture recording must be a telemetry array or a version 1 recording');
 if(!frames.length)throw new Error('Gesture recording has no hand frames');
 if(frames.length>MAX_FRAMES)throw new Error(`Gesture recording exceeds ${MAX_FRAMES} frames`);

 frames=frames.map((frame,index)=>normalizeFrame(frame,index));
 frames.sort((a,b)=>a.t-b.t||a.order-b.order);
 aspectSamples=prepareAspectSamples(aspectSamples);
 const start=frames[0].t,end=frames.at(-1).t;
 if(end-start>MAX_DURATION_MS)throw new Error('Gesture recording exceeds 30 minutes');
 if(!aspectSamples.length)warnings.push(`No recording aspect ratio found; using default ${defaultAspect}`);
 const normalized=frames.map(frame=>({
  t:frame.t-start,
  hands:frame.hands,
  aspect:finitePositive(frame.aspect)?frame.aspect:nearestAspect(frame.t,aspectSamples)??defaultAspect,
 }));
 return {version:1,frames:normalized,durationMs:end-start,warnings};
}

function fromTelemetry(records){
 const frames=[],aspectSamples=[];
 for(let order=0;order<records.length;order++){
  const record=records[order];
  if(!record||typeof record!=='object')throw new Error(`Telemetry record ${order} must be an object`);
  const t=timestamp(record.t,`Telemetry record ${order}`),data=record.data;
  const directAspect=aspectFrom(record)??aspectFrom(data);
  if(directAspect!==undefined)aspectSamples.push({t,aspect:directAspect,order});
  if(record.type==='hands'){
   if(!data||typeof data!=='object'||!Array.isArray(data.landmarks))throw new Error(`Hand record ${order} is missing data.landmarks`);
   frames.push({t,hands:data.landmarks,aspect:directAspect,order});
  }
 }
 return {frames,aspectSamples};
}

function fromVersioned(recording){
 if(recording.version!==1)throw new Error('Gesture recording version must be 1');
 if(!Array.isArray(recording.frames)||!recording.frames.length)throw new Error('Gesture recording is missing frames');
 const metadataAspect=aspectFrom(recording.metadata);
 const frames=recording.frames.map((frame,order)=>{
  if(!frame||typeof frame!=='object')throw new Error(`Frame ${order} must be an object`);
  return {t:frame.t,hands:frame.hands,aspect:aspectFrom(frame),order};
 });
 const aspectSamples=frames.flatMap(frame=>frame.aspect===undefined?[]:[{t:timestamp(frame.t,`Frame ${frame.order}`),aspect:frame.aspect,order:frame.order}]);
 if(metadataAspect!==undefined)aspectSamples.push({t:0,aspect:metadataAspect,order:-1});
 return {frames,aspectSamples};
}

function normalizeFrame(frame,index){
 const t=timestamp(frame.t,`Frame ${index}`);
 if(!Array.isArray(frame.hands))throw new Error(`Frame ${index} is missing hands`);
 if(frame.hands.length>2)throw new Error(`Frame ${index} has more than 2 hands`);
 const ids=new Set();
 const hands=frame.hands.map((hand,handIndex)=>{
  if(!hand||typeof hand!=='object'||typeof hand.id!=='string'||!hand.id)throw new Error(`Frame ${index} hand ${handIndex} has an invalid id`);
  const id=hand.id;
  if(ids.has(id))throw new Error(`Frame ${index} has duplicate hand id ${String(id)}`);
  ids.add(id);
  if(!Array.isArray(hand.landmarks)||hand.landmarks.length!==21)throw new Error(`Frame ${index} hand ${String(id)} must have 21 landmarks`);
  const landmarks=hand.landmarks.map((point,pointIndex)=>{
   if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z))throw new Error(`Frame ${index} hand ${String(id)} landmark ${pointIndex} has non-finite coordinates`);
   return {x:point.x,y:point.y,z:point.z};
  });
  return {id,landmarks};
 });
 if(frame.aspect!==undefined&&!finitePositive(frame.aspect))throw new Error(`Frame ${index} has an invalid aspect ratio`);
 return {...frame,t,hands};
}

function timestamp(value,label){
 if(!Number.isFinite(value)||value<0)throw new Error(`${label} has an invalid timestamp`);
 return value;
}
function finitePositive(value){return Number.isFinite(value)&&value>0;}
function aspectFrom(value){
 if(!value||typeof value!=='object')return undefined;
 if(Object.hasOwn(value,'aspect')){
  if(!finitePositive(value.aspect))throw new Error('Recording has an invalid aspect ratio');
  return value.aspect;
 }
 return cameraAspect(value)??cameraAspect(value.camera);
}
function cameraAspect(value){return value&&finitePositive(value.videoWidth)&&finitePositive(value.videoHeight)?value.videoWidth/value.videoHeight:undefined;}
function nearestAspect(t,samples){
 let low=0,high=samples.length;
 while(low<high){const mid=(low+high)>>>1;if(samples[mid].t<t)low=mid+1;else high=mid;}
 const after=samples[low],before=samples[low-1];
 if(!before)return after?.aspect;
 if(!after)return before.aspect;
 return t-before.t<=after.t-t?before.aspect:after.aspect;
}
function prepareAspectSamples(samples){
 const sorted=samples.filter(sample=>finitePositive(sample.aspect)&&Number.isFinite(sample.t)&&sample.t>=0).sort((a,b)=>a.t-b.t||a.order-b.order);
 return sorted.filter((sample,index)=>index===0||sample.t!==sorted[index-1].t);
}
