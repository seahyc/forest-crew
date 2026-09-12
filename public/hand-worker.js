// Classic worker: MediaPipe's local WASM loader uses importScripts.
importScripts('./mediapipe/vision_bundle.js');
const {FilesetResolver,HandLandmarker}=Vision;
let detector=null,frames=0;
self.onmessage=async(event)=>{
 const {type,bitmap,time}=event.data;
 try {
   if(type==='init'){
    const files=await FilesetResolver.forVisionTasks('./mediapipe');
    detector=await HandLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'./models/hand_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6});
    self.postMessage({type:'ready',delegate:'CPU'});
   }else if(type==='frame' && detector){
    const started=performance.now();
    const result=detector.detectForVideo(bitmap,time);
    frames++;self.postMessage({type:'result',landmarks:result.landmarks[0]??null,hands:result.landmarks.map((landmarks,i)=>({landmarks,id:result.handedness[i]?.[0]?.categoryName??String(i)})),time,latency:performance.now()-started,processedAt:performance.now(),frame:frames,detectedHands:result.landmarks.length});
   }
 }catch(error){self.postMessage({type:'error',message:String(error)});}
 finally{bitmap?.close();}
};
