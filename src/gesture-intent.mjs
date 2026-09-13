/** Forest Crew intent features; Hand Walk's shared feature extractor stays unchanged. */
export function withGestureIntent(sample,landmarks){
 if(!sample||!Array.isArray(landmarks)||landmarks.length!==21)return sample;
 const distance=(a,b)=>Math.hypot(...['x','y','z'].map(k=>landmarks[a]?.[k]-landmarks[b]?.[k]));
 const ringRatio=distance(16,0)/distance(14,0),littleRatio=distance(20,0)/distance(18,0);
 if(![ringRatio,littleRatio,sample.indexCurl,sample.indexFlex,sample.middleFlex].every(Number.isFinite))return {...sample,aimPose:false,aimHoldPose:false,walkingPose:false};
 const difference=sample.middleFlex-sample.indexFlex,stopped=sample.open||sample.fist;
 // Use the whole middle finger: a folded finger can have a nearly straight PIP.
 const aimPose=!stopped&&sample.indexCurl<.3&&sample.indexFlex<.15&&sample.middleFlex>.48&&difference>.18&&ringRatio<1.05&&littleRatio<1.05;
 const aimHoldPose=!stopped&&sample.indexCurl<.42&&sample.middleFlex>.4&&difference>.12&&ringRatio<1.12&&littleRatio<1.12;
 const walkingPose=!stopped&&!aimHoldPose&&(sample.middleFlex<.48||Math.abs(difference)<.14);
 return {...sample,ringRatio,littleRatio,aimPose,aimHoldPose,walkingPose};
}
