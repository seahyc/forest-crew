import './style.css';
import {finishAstronaut} from './astronaut-finish';
import {Vector3,Matrix,MeshBuilder,Mesh,PBRMaterial,Color3,Ray} from '@babylonjs/core';
import {createEnvironment} from './environment';
import {createLocomotion} from './locomotion';
import {createInputRuntime} from './input-runtime';
import {createFireSimulation} from './fire-simulation.mjs';
import {createFireEffects} from './fire-effects';
import {createPlayerHeat} from './player-heat.mjs';
import {createCrewClient} from './crew-client';
import {buildHosePath} from './hose-path.mjs';
import {HOSE_ANCHOR} from './handwalk/avatar';

const $=(id:string)=>document.getElementById(id)!;
const params=new URLSearchParams(location.search),sceneReview=params.get('view')==='scene',qa=params.get('qa')==='1';
let crewInvite=new URLSearchParams(location.hash.slice(1)).get('crew');
if(crewInvite)history.replaceState(history.state,'',`${location.pathname}${location.search}`);
if(sceneReview)document.body.classList.add('scene-review');
const canvas=$('world') as HTMLCanvasElement;
const env=createEnvironment(canvas);
const movement=createLocomotion(env.scene,env.camera,env.colliders,env.spawn,env.canOccupy);
let input:ReturnType<typeof createInputRuntime>;
const fire=createFireSimulation({onEvent:(type:string,data:any)=>input?.record(type,data)} as any);
const effects=createFireEffects(env.scene);
const crew=params.get('crew')!=='0'&&(params.get('crew')==='1'||import.meta.env.VITE_CREW_DEFAULT==='1')&&!sceneReview?createCrewClient({invite:crewInvite}):null;
crewInvite=null;
if(crew){document.title='Forest Crew · AI crew';const chapter=document.querySelector('.chapter');if(chapter)chapter.textContent='AI crew';}
let crewVisuals:Awaited<ReturnType<typeof import('./crew-visuals').createCrewVisuals>>|null=null;
if(crew)void import('./crew-visuals').then(async({createCrewVisuals})=>{crewVisuals=createCrewVisuals(env.scene,env.shadows);await crewVisuals.ready;}).catch(()=>console.error('Crew visuals unavailable'));
const playerHeat=createPlayerHeat({onEvent:(type:string,data:any)=>input?.record(type,data)});
let rescueUntil=0;const sootMaterials:{material:PBRMaterial;color:Color3}[]=[];
const heatOverlay=document.createElement('div');heatOverlay.className='heat-overlay';heatOverlay.setAttribute('aria-hidden','true');document.body.append(heatOverlay);
const heatNotice=document.createElement('div');heatNotice.className='heat-notice';heatNotice.setAttribute('role','status');heatNotice.hidden=true;document.body.append(heatNotice);
const nozzle=MeshBuilder.CreateCylinder('hand-held hose nozzle',{height:.42,diameterTop:.075,diameterBottom:.11,tessellation:16},env.scene);nozzle.material=env.materials.chrome;nozzle.parent=movement.player;nozzle.position.set(HOSE_ANCHOR.x,HOSE_ANCHOR.y,HOSE_ANCHOR.z);nozzle.rotation.x=Math.PI/2;nozzle.isPickable=false;
let hosePath=Array.from({length:50},(_,i)=>new Vector3(-4.5+i/49*4.85,.06,-.55+i/49*-2));
let hose=MeshBuilder.CreateTube('ivory supply hose',{path:hosePath,radius:.045,tessellation:8,updatable:true,cap:Mesh.CAP_ALL},env.scene);hose.material=env.materials.ivory;hose.isPickable=false;env.shadows.addShadowCaster(hose);
const hoseStart=new Vector3(-4.5,.48,-.5),hoseEnd=new Vector3(Number.POSITIVE_INFINITY,0,0);
let nowSeconds=0,last=performance.now(),lastTrace=0,lastHud=0,lastHose=Number.NEGATIVE_INFINITY,ready=false,disposed=false,qaOverride:any=null,latestState:any=null,latestImpact:Vector3|null=null;
let nozzleVisible=true,lastAimValid='',lastMode='',lastComplete='',lastPatchCount='',lastRangeNote='',lastFps='',lastProgress='';
function reset(){void crew?.reset();movement.reset();fire.reset();playerHeat.reset();rescueUntil=0;$('completion').hidden=true;input?.record('scenario-reset',{scenario:crew?'agent-supply':'hose-baseline',seed:73011});}
input=createInputRuntime({canvas,container:$('controls'),getHeading:()=>movement.player.rotation.y,onEvent:(type)=>{if(type==='reset')reset();}});
function impactAt(aim:{x:number,y:number},origin:Vector3){
 // Babylon converts CSS picking coordinates to render pixels internally.
 const x=aim.x*canvas.clientWidth,y=aim.y*canvas.clientHeight;
 const ray=env.scene.createPickingRay(x,y,Matrix.Identity(),env.camera,false);
 if(ray.direction.y>=-.008)return null;
 const distance=-ray.origin.y/ray.direction.y;if(distance<0||distance>120)return null;
 const point=ray.origin.add(ray.direction.scale(distance));point.y=.03;
 if(Vector3.Distance(origin,point)>14||!env.canOccupy(point.x,point.z))return null;
 return point;
}
let hoseResampled=false;
const hoseContactCache=new Map<string,number>();
function hoseSurfaceHeight(x:number,z:number){
 const gx=Math.round(x/.12),gz=Math.round(z/.12),key=`${gx}:${gz}`;
 const cached=hoseContactCache.get(key);if(cached!==undefined)return cached;
 // Only terrain, never actors, fire cards, foliage or invisible colliders.
 const ray=new Ray(new Vector3(gx*.12,4,gz*.12),new Vector3(0,-1,0),5);
 const hit=env.scene.pickWithRay(ray,m=>m.isEnabled()&&m.isVisible&&/^(pink deck planks|continuous basalt|scanned volcanic shelf)/.test(m.name));
 const height=Math.max(0,hit?.pickedPoint?.y??0);
 if(hoseContactCache.size>24000)hoseContactCache.clear();
 hoseContactCache.set(key,height);return height;
}
function updateHose(now:number,origin:Vector3){
 if(now-lastHose<1000/15)return;
 const end=new Vector3(origin.x,origin.y-.08,origin.z-.2);
 if(Vector3.DistanceSquared(end,hoseEnd)<.0004)return;
 lastHose=now;hoseEnd.copyFrom(end);
 const next=buildHosePath(hoseStart,end,hoseSurfaceHeight).map((p:{x:number;y:number;z:number})=>new Vector3(p.x,p.y,p.z));
 // Tube instances require an unchanged point count. Resample onto a fixed
 // 256-point path, preserving a conservative contact height along each edge.
 const lengths=[0];for(let i=1;i<next.length;i++)lengths.push(lengths[i-1]+Vector3.Distance(next[i-1],next[i]));
 const total=lengths.at(-1)!;let index=1;
 hosePath=Array.from({length:256},(_,i)=>{const d=total*i/255;while(index<next.length-1&&lengths[index]<d)index++;const t=(d-lengths[index-1])/Math.max(.0001,lengths[index]-lengths[index-1]);const point=Vector3.Lerp(next[index-1],next[index],t);if(i>0&&i<255)point.y=Math.max(point.y,hoseSurfaceHeight(point.x,point.z)+.063);return point;});
 if(!hoseResampled){hoseResampled=true;env.shadows.removeShadowCaster(hose);hose.dispose();hose=MeshBuilder.CreateTube('ivory supply hose',{path:hosePath,radius:.045,tessellation:8,updatable:true,cap:Mesh.CAP_ALL},env.scene);hose.material=env.materials.ivory;hose.isPickable=false;env.shadows.addShadowCaster(hose);}
 else hose=MeshBuilder.CreateTube('ivory supply hose',{path:hosePath,instance:hose});
}
function renderFrame(){
 const now=performance.now(),wallDt=Math.max(0,(now-last)/1000),dt=Math.min(.05,wallDt);last=now;nowSeconds+=dt;
 if(!ready){env.scene.render();return;}
 const liveFrame=input.frame(now),frame=qaOverride??liveFrame;
 env.observePerformance({dt:wallDt,fps:env.engine.getFps(),active:!sceneReview&&frame.mode!=='setup'&&frame.mode!=='menu'&&!document.hidden});
 const state=movement.update(dt,{...frame,active:!sceneReview&&frame.active,toolActive:frame.mode==='hose'});
 if(sceneReview)env.setEstablishingView();
 const origin=Vector3.TransformCoordinates(new Vector3(HOSE_ANCHOR.x,HOSE_ANCHOR.y,HOSE_ANCHOR.z+.22),movement.player.getWorldMatrix());
 let impact=qaOverride?.impact?new Vector3(qaOverride.impact.x,.03,qaOverride.impact.z):impactAt(frame.aim,origin);
 crew?.update(now,{active:frame.active&&!sceneReview,spraying:frame.spraying,progress:fire.snapshot().progress,complete:fire.snapshot().complete});
 crewVisuals?.update(dt,crew?.visualSnapshot());
 const pressure=crew?crew.pressure():1;
 const spraying=frame.spraying&&!sceneReview&&pressure>0;
 input.setHoseFeedback(frame.mode!=='hose'?'':pressure<=0?'Waiting for water pressure':!impact?'Aim lower or walk closer':'');
 const fireState=fire.update(dt,{active:frame.active&&!sceneReview,spraying,impact:impact?{x:impact.x,z:impact.z}:null,pressure});
 let heat=playerHeat.update(dt,{position:state.position,patches:fireState.patches,active:frame.active&&!sceneReview});
 if(heat.needsRescue){movement.reset();playerHeat.reset();rescueUntil=now+3500;input.record('rescued',{reason:'fire-contact',fireProgress:fireState.progress});}
 heatOverlay.style.opacity=String(heat.burning?.2+heat.heat*.6:heat.heat*.3);
 heatNotice.hidden=!heat.burning&&now>=rescueUntil;
 const heatCopy=now<rescueUntil?'Toasty. Back to safety.':`YOU ARE BURNING · BACK UP · ${Math.ceil(heat.health*100)}%`;
 if(heatNotice.textContent!==heatCopy)heatNotice.textContent=heatCopy;
 for(const item of sootMaterials){item.material.albedoColor.copyFrom(item.color).scaleInPlace(1-(1-heat.health)*.6);item.material.emissiveColor.set(heat.burning?.12:0,heat.burning?.015:0,0);}
 const visualImpact=impact??origin.add(env.camera.getForwardRay().direction.scale(12));if(!impact)visualImpact.y=-.32;effects.update(dt,nowSeconds,fireState,{active:spraying,origin,impact:visualImpact});latestImpact=impact;
 const aimValid=String(Boolean(impact));if(aimValid!==lastAimValid){lastAimValid=aimValid;document.body.dataset.aimValid=aimValid;}
 updateHose(now,origin);
 const showNozzle=frame.mode==='hose'||sceneReview;if(showNozzle!==nozzleVisible){nozzleVisible=showNozzle;nozzle.setEnabled(showNozzle);}env.update(nowSeconds);env.scene.render();
 latestState={...state,fire:fireState,health:heat,input:frame,impact:impact?{x:impact.x,y:impact.y,z:impact.z}:null,frameMs:dt*1000,crew:crew?.snapshot()};
 if(now-lastTrace>100){lastTrace=now;input.record('world-state',{position:state.position,yaw:state.yaw,speed:state.speed,displacement:state.displacement,blocked:state.blocked,gait:state.gait,camera:state.camera,fire:fireState,health:heat,impact:latestState.impact,pressure,crew:crew?.telemetry(),mode:frame.mode,dt,fps:env.engine.getFps(),quality:env.renderQuality(),seed:73011});}
 if(now-lastHud>150){lastHud=now;const progress=`${fireState.progress*100}%`,patchCount=`${fireState.extinguished} / 3 fires out`,rangeNote=frame.mode==='hose'?(impact?'Water on target':'Aim lower or move closer'):'Supply connected',fps=`${Math.round(env.engine.getFps())} fps`,complete=String(fireState.complete);if(progress!==lastProgress){lastProgress=progress;$('progress-fill').style.width=progress;}if(patchCount!==lastPatchCount){lastPatchCount=patchCount;$('patch-count').textContent=patchCount;}if(rangeNote!==lastRangeNote){lastRangeNote=rangeNote;$('range-note').textContent=rangeNote;}if(fps!==lastFps){lastFps=fps;$('fps').textContent=fps;}if($('completion').hidden===fireState.complete)$('completion').hidden=!fireState.complete;if(frame.mode!==lastMode){lastMode=frame.mode;document.documentElement.dataset.mode=frame.mode;}if(complete!==lastComplete){lastComplete=complete;document.documentElement.dataset.complete=complete;}}
}
function syncRendering(){
 env.engine.stopRenderLoop(renderFrame);
 if(!document.hidden&&!disposed){last=performance.now();env.engine.runRenderLoop(renderFrame);}
}
document.addEventListener('visibilitychange',syncRendering);
syncRendering();
void Promise.all([movement.ready,env.assetsReady]).then(async()=>{finishAstronaut(movement.player.getChildMeshes());for(const mat of new Set(movement.player.getChildMeshes().map(mesh=>mesh.material))){if(mat instanceof PBRMaterial&&(mat.name==='white'||mat.name.startsWith('player-turnout'))){sootMaterials.push({material:mat,color:mat.albedoColor.clone()});}}for(const mesh of movement.player.getChildMeshes()){mesh.receiveShadows=true;env.shadows.addShadowCaster(mesh);}ready=true;await env.scene.whenReadyAsync();$('loading').hidden=true;if(sceneReview)env.setEstablishingView();else await input.start().catch(()=>{/* Input reports camera setup errors; keep the world and waiting crew visible. */});}).catch(error=>{$('loading').hidden=false;$('load-message').textContent=`Could not start: ${String(error)}`;console.error(error);});
window.addEventListener('resize',()=>env.resize());
window.addEventListener('pagehide',()=>{disposed=true;document.removeEventListener('visibilitychange',syncRendering);env.engine.stopRenderLoop(renderFrame);crew?.dispose();crewVisuals?.dispose();input.dispose();effects.dispose();movement.dispose();env.dispose();});
if(qa){(window as any).__forestQA={ready:()=>ready,snapshot:()=>latestState,avatar:()=>movement.avatar.modelStatus(),input:()=>input.diagnostics(),reset,override:(value:any)=>{qaOverride=value;},clear:()=>{qaOverride=null;},aimFor:(x:number,z:number)=>{const point=Vector3.Project(new Vector3(x,.03,z),Matrix.Identity(),env.scene.getTransformMatrix(),env.camera.viewport.toGlobal(env.engine.getRenderWidth(),env.engine.getRenderHeight()));return {x:point.x/env.engine.getRenderWidth(),y:point.y/env.engine.getRenderHeight()};},scene:env.scene,renderSize:()=>({width:env.engine.getRenderWidth(),height:env.engine.getRenderHeight()})};}
