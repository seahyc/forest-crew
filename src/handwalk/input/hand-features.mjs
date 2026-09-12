const LANDMARK_COUNT=21,EPSILON=1e-12;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
const isLandmark=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
const vector=(a,b)=>({x:b.x-a.x,y:b.y-a.y,z:b.z-a.z});
const length=v=>Math.hypot(v.x,v.y,v.z);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
function angleBetween(a,b){const d=length(a)*length(b);return d<=EPSILON?null:Math.acos(clamp((a.x*b.x+a.y*b.y+a.z*b.z)/d,-1,1));}
function jointCurl(previous,joint,next){const a=angleBetween(vector(joint,previous),vector(joint,next));return a===null?null:clamp((Math.PI-a)/Math.PI);}
function fingerJoints(p,mcp,pip,dip,tip){
  // Angular terms include the MCP hinge and are invariant to position, scale and rigid roll.
  const mcpAngle=angleBetween(vector(p[0],p[mcp]),vector(p[mcp],p[pip]));
  const pipCurl=jointCurl(p[mcp],p[pip],p[dip]),dipCurl=jointCurl(p[pip],p[dip],p[tip]);
  if(mcpAngle===null||pipCurl===null||dipCurl===null)return null;
  return {mcpFlex:clamp(mcpAngle/(Math.PI*.55)),pipFlex:pipCurl,dipFlex:dipCurl};
}
const normalizeAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const PALM_BONES=[[0,5],[0,9],[0,13],[0,17],[5,9],[9,13],[13,17]];
function palmScale(landmarks,aspect){
  const ratio=Number.isFinite(aspect)&&aspect>0?aspect:4/3;
  const lengths=PALM_BONES.map(([a,b])=>Math.hypot(landmarks[b].x-landmarks[a].x,(landmarks[b].y-landmarks[a].y)/ratio,landmarks[b].z-landmarks[a].z)).sort((a,b)=>a-b);
  return lengths[3]>EPSILON?lengths[3]:null;
}

/** Geometry-only features retained for callers that do not need UI fields. */
export function extractHandFeatures(landmarks){
  if(!Array.isArray(landmarks)||landmarks.length!==LANDMARK_COUNT||!landmarks.every(isLandmark))return null;
  const palm=vector(landmarks[0],landmarks[9]),palmSize=length(palm);
  if(palmSize<=EPSILON)return null;
  const indexCurl=jointCurl(landmarks[5],landmarks[6],landmarks[7]);
  const middleCurl=jointCurl(landmarks[9],landmarks[10],landmarks[11]);
  const index=fingerJoints(landmarks,5,6,7,8),middle=fingerJoints(landmarks,9,10,11,12);
  if([indexCurl,middleCurl,index,middle].some(v=>v===null))return null;
  const indexFlex=.5*index.mcpFlex+.3*index.pipFlex+.2*index.dipFlex;
  const middleFlex=.5*middle.mcpFlex+.3*middle.pipFlex+.2*middle.dipFlex;
  const roll=normalizeAngle(Math.atan2(palm.x,-palm.y));
  return Number.isFinite(roll)?{indexCurl,middleCurl,roll,palmSize,indexFlex,middleFlex,indexMcpFlex:index.mcpFlex,indexPipFlex:index.pipFlex,indexDipFlex:index.dipFlex,middleMcpFlex:middle.mcpFlex,middlePipFlex:middle.pipFlex,middleDipFlex:middle.dipFlex}:null;
}

/** Complete, validated sample consumed by the UI and walking controller. */
export function sampleHand(id,landmarks,aspect=4/3){
  if((typeof id!=='string'&&typeof id!=='number')||String(id).length===0||(typeof id==='number'&&!Number.isFinite(id)))return null;
  const features=extractHandFeatures(landmarks);if(!features)return null;
  const curls=[features.indexCurl,features.middleCurl,jointCurl(landmarks[13],landmarks[14],landmarks[15]),jointCurl(landmarks[17],landmarks[18],landmarks[19])];
  if(curls.some(v=>v===null))return null;
  const distance=(a,b)=>length(vector(landmarks[a],landmarks[b]));
  const ringOut=distance(16,0)>distance(14,0)*1.12,littleOut=distance(20,0)>distance(18,0)*1.12;
  const open=features.indexCurl<.25&&features.middleCurl<.25&&ringOut&&littleOut;
  const pointing=features.indexCurl<.35&&features.middleCurl>.35&&!ringOut&&!littleOut;
  const fist=curls.every(c=>c>.42)&&!ringOut&&!littleOut;
  const scale=palmScale(landmarks,aspect);if(scale===null)return null;
  const palmAxis={x:(landmarks[9].x-landmarks[0].x)/features.palmSize,y:(landmarks[9].y-landmarks[0].y)/features.palmSize,z:(landmarks[9].z-landmarks[0].z)/features.palmSize};
  // Finger reach is palm-local and scale-free. Paired with flex over time it
  // describes a loop, so reversing a finger's physical cycle reverses its sign.
  const reach=(mcp,tip)=>dot(vector(landmarks[mcp],landmarks[tip]),palmAxis)/features.palmSize;
  return {id,x:(landmarks[0].x+landmarks[5].x+landmarks[9].x+landmarks[17].x)/4,y:landmarks[8].y,wristX:landmarks[0].x,wristY:landmarks[0].y,pointX:landmarks[8].x,pointY:landmarks[8].y,indexCurl:features.indexCurl,middleCurl:features.middleCurl,open,pointing,fist,roll:features.roll,palmSize:features.palmSize,palmScale:scale,indexFlex:features.indexFlex,middleFlex:features.middleFlex,indexReach:reach(5,8),middleReach:reach(9,12),indexMcpFlex:features.indexMcpFlex,indexPipFlex:features.indexPipFlex,indexDipFlex:features.indexDipFlex,middleMcpFlex:features.middleMcpFlex,middlePipFlex:features.middlePipFlex,middleDipFlex:features.middleDipFlex};
}
