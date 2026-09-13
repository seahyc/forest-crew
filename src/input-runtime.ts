import './controls.css';
import {drawHandFeedback} from './hand-feedback';
import {sampleHand} from './handwalk/input/hand-features.mjs';
import {TwoHandController} from './handwalk/input/two-hand-controller.mjs';
import {OneHandController,withNavigationPoint} from './one-hand-controller.mjs';
import {createBrowserRecordingStore} from './handwalk/browser-recording-store.mjs';
import {CompactRecorder} from './handwalk/compact-recorder';
import {MirroredPlaytestSession} from './handwalk/mirrored-playtest-session.mjs';
import {withGestureIntent} from './gesture-intent.mjs';
import {WalkingModeController} from './walking-mode.mjs';
import {HoseGestureController} from './hose-gesture.mjs';
import {classifyTrackerResult,framingPrompt,preferredInputMode,readinessReason,shouldDispatchFrame} from './input-readiness.mjs';

type Landmark={x:number;y:number;z:number};
type RawHand={id:string;landmarks:Landmark[]};
type Mode='setup'|'walk'|'hose'|'menu'|'lost';
type InputMode='one-hand'|'two-hand';
type InputPreference=InputMode|'auto';
type InputFrame={active:boolean;forward:number;turn:number;headingTarget?:number|null;gait:any;mode:Mode;aim:{x:number;y:number};spraying:boolean};
type Options={canvas:HTMLCanvasElement;container:HTMLElement;getHeading:()=>number;onEvent?:(type:string,data:any)=>void};

const CREW_MODE=new URLSearchParams(location.search).get('crew')==='1'||import.meta.env.VITE_CREW_DEFAULT==='1';
const BUILD_ID=CREW_MODE?'ai-crew':'grove-01',SCENARIO=CREW_MODE?'agent-supply':'hose-baseline',STALE_MS=220,ONE_HAND_STALE_MS=450;
const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const emptyGait=()=>({left:0,right:0,leftLift:0,rightLift:0,stride:0,cadence:0,run:0});
const formatBytes=(bytes:number)=>bytes<1024?`${bytes} B`:bytes<1048576?`${Math.round(bytes/1024)} KiB`:`${(bytes/1048576).toFixed(1)} MiB`;

export function createInputRuntime({canvas,container,getHeading,onEvent}:Options){
 const walker=new TwoHandController();
 const oneHand=new OneHandController({staleMs:ONE_HAND_STALE_MS,pointDwellMs:Infinity});
 const hose=new HoseGestureController({dwellMs:150,staleMs:450});
 const root=document.createElement('section');root.className='forest-input';root.setAttribute('aria-label','Forest Crew hand controls');
 root.innerHTML=`<div class="forest-input__status" role="status" aria-live="polite">Allow camera access, then show your hand.</div>
  <button class="forest-input__target forest-input__menu-open" data-action="menu" data-gesture aria-label="Pause and open controls">Pause</button>
  <div class="forest-input__notice" aria-live="polite"><span class="forest-input__countdown">Recording waits for hand tracking.</span></div>
  <button class="forest-input__target forest-input__hud-open" data-action="hud-open" data-gesture aria-label="Open settings and recording details">Settings</button>
  <div class="forest-input__camera" aria-label="Mirrored hand tracking preview"><video playsinline muted aria-hidden="true"></video><canvas width="320" height="240" aria-hidden="true"></canvas><div class="forest-input__framing">Show both hands at chest height · 0/2 detected</div></div>
  <aside class="forest-input__hud" aria-label="Optional playtest and camera HUD" aria-hidden="true"><button class="forest-input__hud-close" data-action="hud-close" data-gesture>Hide settings</button><button class="forest-input__mode-action" data-action="input-mode" data-gesture>Use one-hand controls</button><div class="forest-input__record" aria-live="polite"><div data-kind="local">LOCAL · WAITING</div><div data-kind="remote">REVIEW COPY · OFF</div><div>Game + camera · no audio</div><button class="forest-input__record-action" data-action="record" data-gesture>Play without recording</button></div></aside>
  <div class="forest-input__panel" role="dialog" aria-modal="true" aria-label="Pause and recording controls" hidden><h2>Controls</h2><p data-controls>Walk your fingers to move. Tilt both hands to turn. Straighten one index finger to start spraying, then aim freely. Show your walking fingers again to walk.</p><div class="forest-input__choices"><button data-action="continue" data-gesture>Continue</button><button data-action="reset" data-gesture>Reset hands</button><button data-action="record" data-gesture>Play without recording</button><button data-action="export" data-gesture>Export latest playtest</button></div><p data-feedback></p></div>
  <div class="forest-input__cursor is-lost" style="--dwell:0" aria-hidden="true"></div><div class="forest-input__aim is-idle" aria-label="Hose aim"><span class="forest-input__aim-label"></span></div>`;
 container.append(root);
 const status=root.querySelector<HTMLElement>('.forest-input__status')!;
 const countdown=root.querySelector<HTMLElement>('.forest-input__countdown')!;
 const localLabel=root.querySelector<HTMLElement>('[data-kind=local]')!;
 const remoteLabel=root.querySelector<HTMLElement>('[data-kind=remote]')!;
 const panel=root.querySelector<HTMLElement>('.forest-input__panel')!;
 const hud=root.querySelector<HTMLElement>('.forest-input__hud')!;
 const hudOpen=root.querySelector<HTMLButtonElement>('.forest-input__hud-open')!;
 const framing=root.querySelector<HTMLElement>('.forest-input__framing')!;
 const modeButton=root.querySelector<HTMLButtonElement>('.forest-input__mode-action')!;
 const controlsCopy=root.querySelector<HTMLElement>('[data-controls]')!;
 const feedback=root.querySelector<HTMLElement>('[data-feedback]')!;
 const cursor=root.querySelector<HTMLElement>('.forest-input__cursor')!;
 const aimNode=root.querySelector<HTMLElement>('.forest-input__aim')!;
 const video=root.querySelector<HTMLVideoElement>('video')!;
 const overlay=root.querySelector<HTMLCanvasElement>('canvas')!;
 const overlayContext=overlay.getContext('2d')!;
 const recordButtons=Array.from(root.querySelectorAll<HTMLButtonElement>('[data-action=record]'));
 const mirrorBase=(import.meta.env.VITE_PLAYTEST_BASE_URL as string|undefined)?.trim()||'';
 const store=createBrowserRecordingStore({databaseName:'forest-crew-recordings',maxBytes:20_000_000});
 const playtest=new MirroredPlaytestSession({store,baseUrl:mirrorBase||'./',remoteEnabled:Boolean(mirrorBase),remoteTimeoutMs:10_000,remoteWaitMs:5_000,onStatus:updateRecordingStatus} as any);
 let qaInjected=false;
 let stream:MediaStream|null=null,worker:Worker|null=null,workerReady=false,busy=false,disposed=false,started=false,recovering=false,suspended=false;
 let generation=0,restartAttempts=0,lastDispatch=0,lastResult=-Infinity,lastTelemetry=-Infinity,lastFlush=0,latency=0,inferenceAge=0,workerFrame=0,noHandsSince:number|null=null,zeroHandsWarned=false,lastReadiness='boot';
 let rawHands:RawHand[]=[],hands:any[]=[],baseMode:Mode='setup',calibrationSince:number|null=null;
 const savedPreference=localStorage.getItem('forest-crew-input-preference');
 let inputPreference:InputPreference=savedPreference==='one-hand'||savedPreference==='two-hand'?savedPreference:'auto';
 let inputMode:InputMode=inputPreference==='auto'?preferredInputMode({coarsePointer:matchMedia('(pointer: coarse)').matches,maxTouchPoints:navigator.maxTouchPoints}) as InputMode:inputPreference;
 const walkingMode=new WalkingModeController({initialMode:inputMode});
 let walkingBlocked=true,walkingNeedsBaseline=true;
 let uiTarget:HTMLButtonElement|null=null,uiTargetSince=0,uiTargetFired=false,lastPointer={x:.5,y:.5},pointerTracked=false;
 let recordTimer=0,recordCountdownEnds=0,recordingError='',lastFrameState:InputFrame={active:false,forward:0,turn:0,headingTarget:null,gait:emptyGait(),mode:'setup',aim:{x:.5,y:.5},spraying:false};

 const qaMode=new URLSearchParams(location.search).get('qa')==='1';
 const criticalEvents=new Set(['complete','extinguish','gesture-select','calibrated','focus','reset','camera-error','tracker-error']);
 const emit=(type:string,data:any={})=>{const payload={version:'0.2.3',buildId:BUILD_ID,scenario:SCENARIO,fixture:qaMode,inputSource:qaInjected?'sampled-hand-fixture':'camera',...data};playtest.record(type,payload);const now=performance.now();if(playtest.state==='recording'&&(criticalEvents.has(type)||now-lastFlush>=1200)){lastFlush=now;void playtest.flushTelemetry();}onEvent?.(type,payload);};
 const recorder=new CompactRecorder({world:canvas,camera:video,session:()=>playtest.session,startedAt:()=>playtest.started,record:emit,uploadClip:(blob,startMs,endMs)=>playtest.uploadClip(blob,startMs,endMs),publicMode:true,captureWidth:480,captureHeight:270,captureFrameRate:5,videoBitsPerSecond:220000,overlay:()=>({phase:lastFrameState.mode,reason:lastFrameState.spraying?'spraying':inputMode==='one-hand'?oneHand.diagnostics(performance.now()).decision:lastFrameState.active?'moving':'idle',choice:uiTarget?.dataset.action||'',dwell:uiTarget?clamp((performance.now()-uiTargetSince)/900):0,cursorX:lastPointer.x,cursorY:lastPointer.y,cursorVisible:true,cursorTracked:pointerTracked}),onStatus:(state,detail)=>{if(state==='error'){recordingError=detail;recorder.setEnabled(false);playtest.fail(detail);}updateRecordingStatus(playtest);}});

 function updateRecordingStatus(snapshot:any){
  localLabel.textContent=snapshot.error||recordingError?'LOCAL · SAVE UNAVAILABLE':snapshot.state==='recording'?`LOCAL · SAVING ${formatBytes(snapshot.savedBytes||0)}`:snapshot.state==='starting'?'LOCAL · OPENING':snapshot.state==='stopped'?'LOCAL · SAVED':snapshot.state==='opted-out'?'LOCAL · OFF':'LOCAL · READY';
  remoteLabel.textContent=!mirrorBase?'REVIEW COPY · OFF (NOT CONFIGURED)':snapshot.remoteState==='recording'?`REVIEW COPY · SENDING ${formatBytes(snapshot.remoteSavedBytes||0)}`:snapshot.remoteState==='uploaded'?'REVIEW COPY · SAVED':snapshot.remoteState==='pending'?'REVIEW COPY · CONNECTING':snapshot.remoteState==='off'?'REVIEW COPY · OFF':'REVIEW COPY · UNAVAILABLE';
  hudOpen.dataset.recording=['recording','starting'].includes(snapshot.state)?'on':snapshot.state==='opted-out'?'off':'waiting';
  for(const button of recordButtons)button.textContent=['recording','starting','undecided'].includes(snapshot.state)?'Play without recording':'Record this playtest';
 }
 function setStatus(message:string){const hidden=!message;if(status.textContent===message&&status.hidden===hidden)return;status.textContent=message;status.hidden=hidden;}
 const staleLimit=()=>450;
 const targetHands=()=>inputMode==='one-hand'?1:2;
 const setupInstruction=()=>inputPreference==='auto'?'Show one or two hands comfortably for 2 seconds.':inputMode==='one-hand'?'Hold your two walking fingers comfortably for 2 seconds.':'Hold both hands comfortably in view for 2 seconds.';
 function updateModeCopy(){root.dataset.inputMode=inputMode;root.dataset.inputPreference=inputPreference;modeButton.textContent=inputPreference==='auto'?'Walking: Auto · use one hand':inputPreference==='one-hand'?'Walking: One hand · use two hands':'Walking: Two hands · use auto';controlsCopy.textContent=inputMode==='one-hand'?'Walk your two fingers to move. Point them left or right to turn; the arrow shows your turn. Stop stepping to stop walking. Thumb out while stepping reverses; tuck it to go forward. Open palm stops and resets straight ahead. Straighten one index finger to start spraying, then aim freely. Show your walking fingers again to walk.':'Walk your fingers to move. Tilt both hands to turn. Straighten one index finger to start spraying, then aim freely. Show your walking fingers again to walk.';}
 function updateFraming(show:boolean,count=rawHands.length){root.classList.toggle('is-framing',show);framing.textContent=inputPreference==='auto'?`Show one or two hands · ${count} detected`:framingPrompt(count,targetHands());}
 function drawHands(value:RawHand[]){
  const state=oneHand.diagnostics(performance.now()),hoseState=hose.read(performance.now());
  drawHandFeedback(overlayContext,value,{single:inputMode==='one-hand',decision:hoseState.active?'spraying':hoseState.blockWalking?'point-dwell':walkingMode.read(performance.now()).pending?'hands-changing':state.decision,fresh:performance.now()-lastResult<=staleLimit()&&hands.length>0,turn:state.turn,reverse:state.reverse});
 }
 function clearUiAuthority(){uiTarget=null;uiTargetSince=0;uiTargetFired=false;root.querySelectorAll('.forest-input__hover').forEach(node=>node.classList.remove('forest-input__hover'));cursor.style.setProperty('--dwell','0');}
 function setHud(open:boolean){hud.classList.toggle('is-open',open);hud.setAttribute('aria-hidden',String(!open));hudOpen.hidden=open;clearUiAuthority();emit('hud',{open});}
 function pointerHand(){const candidates=hands.filter(hand=>(hand.aimPose??hand.pointing)===true&&Number.isFinite(hand.pointX)&&Number.isFinite(hand.pointY));const reference={x:.85-lastPointer.x*.7,y:.12+lastPointer.y*.7};return candidates.reduce((best,hand)=>!best||Math.hypot(hand.pointX-reference.x,hand.pointY-reference.y)<Math.hypot(best.pointX-reference.x,best.pointY-reference.y)?hand:best,null);}
 function updatePointer(now:number){
  const point=pointerHand();pointerTracked=Boolean(point)&&now-lastResult<=staleLimit();
  // Expand the comfortable center camera area across the viewport so edge
  // controls remain reachable without forcing a player's arm out of frame.
  if(point){lastPointer={x:clamp((1-point.pointX-.15)/.7),y:clamp((point.pointY-.12)/.7)};}
  cursor.style.left=`${lastPointer.x*innerWidth}px`;cursor.style.top=`${lastPointer.y*innerHeight}px`;cursor.classList.toggle('is-lost',!pointerTracked);
  const hit=pointerTracked?document.elementFromPoint(lastPointer.x*innerWidth,lastPointer.y*innerHeight)?.closest<HTMLButtonElement>('[data-gesture]'):null;
  const next=hit&&root.contains(hit)&&!hit.disabled?hit:null;
  if(next!==uiTarget||now-lastResult>staleLimit()){clearUiAuthority();uiTarget=next;if(next)uiTargetSince=now;}
  if(!uiTarget)return false;
  uiTarget.classList.add('forest-input__hover');const progress=clamp((now-uiTargetSince)/900);cursor.style.setProperty('--dwell',String(progress));
  if(progress===1&&!uiTargetFired){uiTargetFired=true;emit('gesture-select',{action:uiTarget.dataset.action});uiTarget.click();}
  return true;
 }
 function resetControllers(){walker.reset();oneHand.reset();hose.reset();walkingMode.reset(inputMode);walkingBlocked=true;walkingNeedsBaseline=true;}
 function openMenu(source:string){baseMode='menu';panel.hidden=false;resetControllers();clearUiAuthority();emit('menu-open',{source});setStatus('');}
 function continuePlay(){panel.hidden=true;baseMode='setup';calibrationSince=null;updateFraming(workerReady,0);resetControllers();clearUiAuthority();emit('continue');setStatus(setupInstruction());}
 function resetCalibration(){panel.hidden=true;baseMode='setup';calibrationSince=null;updateFraming(workerReady,0);resetControllers();clearUiAuthority();emit('reset');setStatus(setupInstruction());}
 function toggleInputMode(){inputPreference=inputPreference==='auto'?'one-hand':inputPreference==='one-hand'?'two-hand':'auto';localStorage.setItem('forest-crew-input-preference',inputPreference);if(inputPreference!=='auto')inputMode=inputPreference;updateModeCopy();setHud(false);panel.hidden=true;baseMode='setup';calibrationSince=null;resetControllers();updateFraming(workerReady,0);setStatus(setupInstruction());emit('input-mode',{inputMode,inputPreference,source:'settings'});}
 async function stopRecording(remember=true){
  window.clearInterval(recordTimer);recordTimer=0;countdown.textContent='REC off';if(remember)localStorage.setItem('forest-crew-recording','off');
  if(['undecided','starting'].includes(playtest.state))playtest.optOut();else{recorder.setEnabled(false);await recorder.stopAndFlush('user-opt-out');await playtest.stop();}
  updateRecordingStatus(playtest);
 }
 async function startRecording(explicitConsent:boolean){
  window.clearInterval(recordTimer);recordTimer=0;countdown.textContent='';
  try{if(playtest.state!=='undecided'&&!playtest.reset())return;await playtest.optIn({explicitConsent,buildId:BUILD_ID,scenario:SCENARIO});localStorage.setItem('forest-crew-recording','on');recorder.setEnabled(true);recorder.start();countdown.textContent='● REC';emit('recording-start',{mode:explicitConsent?'explicit':'remembered-default'});}catch(error){recordingError=String(error);localLabel.textContent='LOCAL · SAVE UNAVAILABLE';countdown.textContent='REC unavailable';feedback.textContent='Recording is unavailable; play continues.';}
 }
 function scheduleRecording(){
  if(localStorage.getItem('forest-crew-recording')==='off'){playtest.optOut();countdown.textContent='REC off';return;}
  recordCountdownEnds=performance.now()+5000;countdown.textContent='Game + camera recording in 5s · • to opt out';
  recordTimer=window.setInterval(()=>{const remaining=Math.max(0,Math.ceil((recordCountdownEnds-performance.now())/1000));countdown.textContent=remaining?`Game + camera recording in ${remaining}s · • to opt out`:'● REC';if(!remaining)void startRecording(false);},200);
 }
 async function exportLatest(){
  try{if(playtest.state==='recording')await stopRecording(false);else await playtest.flushTelemetry();const snapshot=await playtest.snapshot({session:playtest.session||undefined});if(!snapshot.session)throw new Error('No saved playtest yet.');const clips=await Promise.all(snapshot.clips.map(async(clip:any)=>({...clip,url:await blobDataUrl(clip.blob)})));const records=JSON.stringify(snapshot.records).replaceAll('<','\\u003c');const html=`<!doctype html><meta charset="utf-8"><title>Forest Crew playtest</title><style>body{font:15px system-ui;max-width:900px;margin:auto;padding:24px;background:#10201c;color:#fff}video{width:100%;max-width:640px}pre{background:#fff;color:#15201d;padding:14px;max-height:420px;overflow:auto}</style><h1>Forest Crew playtest</h1><p>${BUILD_ID} · ${SCENARIO} · no audio</p>${clips.map((clip:any)=>`<video controls muted src="${clip.url}"></video>`).join('')}<button onclick="download()">Download telemetry JSON</button><pre id="data"></pre><script>const records=${records};document.getElementById('data').textContent=JSON.stringify(records.slice(0,100),null,2);function download(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(records,null,2)],{type:'application/json'}));a.download='forest-crew-telemetry.json';a.click()}<\/script>`;const url=URL.createObjectURL(new Blob([html],{type:'text/html'}));const a=document.createElement('a');a.href=url;a.download=`forest-crew-playtest-${snapshot.session.slice(0,8)}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);feedback.textContent='Offline playtest download requested.';}catch(error){feedback.textContent=String(error);}
 }
 async function blobDataUrl(blob:Blob){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return `data:${blob.type||'video/webm'};base64,${btoa(binary)}`;}
 function handleAction(event:Event){const action=(event.currentTarget as HTMLElement).dataset.action;if(action==='menu')openMenu('gesture-or-click');if(action==='hud-open')setHud(true);if(action==='hud-close')setHud(false);if(action==='input-mode')toggleInputMode();if(action==='continue')continuePlay();if(action==='reset')resetCalibration();if(action==='record')void (['recording','starting','undecided'].includes(playtest.state)?stopRecording():startRecording(true));if(action==='export')void exportLatest();}
 root.querySelectorAll<HTMLElement>('[data-action]').forEach(node=>node.addEventListener('click',handleAction));
 function ingest(sampled:any[],landmarks:RawHand[],now:number,sampleLatency=0){
  if(!Number.isFinite(now))return;lastResult=now;latency=sampleLatency;hands=Array.isArray(sampled)?sampled.filter(hand=>hand&&hand.id!==undefined&&['indexFlex','middleFlex','roll'].every(key=>Number.isFinite(hand[key]))):[];rawHands=Array.isArray(landmarks)?landmarks:[];if(baseMode==='setup')updateFraming(true,rawHands.length);if(rawHands.length){noHandsSince=null;zeroHandsWarned=false;}else{noHandsSince??=now;if(!zeroHandsWarned&&now-noHandsSince>=2000){zeroHandsWarned=true;emit('recognition-empty',{durationMs:Math.round(now-noHandsSince),videoWidth:video.videoWidth,videoHeight:video.videoHeight,videoTime:+video.currentTime.toFixed(3),readyState:video.readyState});}}
  if(baseMode==='setup'){
   if(inputPreference==='auto'?hands.length>=1:inputMode==='one-hand'?hands.length>=1:hands.length===2){calibrationSince??=now;const remaining=Math.max(0,2000-(now-calibrationSince));setStatus(remaining?`${(inputPreference==='auto'?hands.length===1:inputMode==='one-hand')?'Hand':'Both hands'} ready · starting in ${Math.ceil(remaining/1000)}…`:'Calibrated · walk your fingers.');if(!remaining){if(inputPreference==='auto'){inputMode=hands.length>=2?'two-hand':'one-hand';walkingMode.reset(inputMode);updateModeCopy();}if(inputMode==='one-hand')oneHand.calibrate(hands,now);else walker.calibrate(hands,now,getHeading());baseMode='walk';suspended=false;updateFraming(false);emit('calibrated',{hands:targetHands(),inputMode});}}
   else{calibrationSince=null;setStatus(inputMode==='two-hand'&&hands.length===1?'Bring your other hand into view.':noHandsSince!==null&&now-noHandsSince>=2000?`Show ${inputMode==='one-hand'?'one hand':'both hands'} below your face.`:setupInstruction());}
  }
  const overUi=updatePointer(now),hoseState=hose.update(hands,now,{overUi});
  const walkers=hands.filter(hand=>!hand.fist&&!hand.open&&!(hand.aimPose??hand.pointing));
  const selected=walkingMode.update(walkers,now,{blocked:baseMode!=='walk'||overUi||hoseState.blockWalking,preference:inputPreference});
  if(selected.changed){inputMode=selected.mode as InputMode;walkingNeedsBaseline=true;updateModeCopy();emit('walking-mode-changed',{inputMode,inputPreference,reason:selected.reason,handCount:selected.count});}
  walkingBlocked=baseMode!=='walk'||overUi||hoseState.blockWalking||(inputMode==='two-hand'?walkers.length!==2:walkers.length===0);
  if(walkingBlocked){walker.reset();oneHand.reset();walkingNeedsBaseline=true;}
  else if(walkingNeedsBaseline){if(inputMode==='one-hand')oneHand.calibrate(walkers,now);else walker.calibrate(walkers,now,getHeading());walkingNeedsBaseline=false;}
  else if(inputMode==='one-hand')oneHand.update(walkers,now);else walker.update(walkers,now);
  drawHands(rawHands);const hoseTelemetry=hose.read(now,{overUi});emit('hands',{timestamp:Math.round(now),latency,mode:baseMode,inputMode,control:inputMode==='one-hand'?oneHand.diagnostics(now):null,stance:hoseTelemetry.blockWalking?'hose':'walk',intentReason:hoseTelemetry.reason,walkingBlocked,inputPreference,walkingSelection:selected,aim:hoseTelemetry.aim,landmarks:rawHands});
 }
 function onWorkerMessage({data}:MessageEvent){
  if(disposed)return;if(data.type==='ready'){workerReady=true;return;}if(data.type==='error'){const wasReady=workerReady;busy=false;workerReady=false;emit('tracker-error',{message:data.message});if(wasReady&&restartAttempts<1)void recoverTracker('worker-error');else if(wasReady)setStatus('Hand tracking stopped. Reload to retry.');return;}if(data.type!=='result')return;if(qaInjected){busy=false;return;}
  busy=false;workerFrame=Number(data.frame)||workerFrame+1;const now=performance.now(),classification=classifyTrackerResult({hidden:document.hidden,captureTime:data.time,receivedAt:now,maxCaptureAgeMs:inputMode==='one-hand'?450:1000});inferenceAge=classification.ageMs??0;if(!classification.accept){emit('stale-inference',{ageMs:classification.ageMs,reason:classification.reason,workerFrame});return;}const landmarks:RawHand[]=data.hands??[],aspect=video.videoWidth&&video.videoHeight?video.videoWidth/video.videoHeight:4/3;const sampled=landmarks.flatMap(hand=>{const sample=withGestureIntent(withNavigationPoint(sampleHand(hand.id,hand.landmarks,aspect),hand.landmarks,aspect),hand.landmarks);return sample?[sample]:[];});ingest(sampled,landmarks,now,Number(data.latency)||0);if(classification.reason==='late-inference')emit('late-inference',{ageMs:classification.ageMs,latency:data.latency,workerFrame});
 }
 async function initializeWorker(token:number){
  const local=new Worker(`${import.meta.env.BASE_URL}hand-worker.js`);worker=local;local.onmessage=onWorkerMessage;
  await new Promise<void>((resolve,reject)=>{const timeout=window.setTimeout(()=>{local.terminate();if(worker===local)worker=null;reject(new Error('The hand model took too long to load.'));},30000);const prior=local.onmessage;local.onmessage=(event)=>{prior?.call(local,event);if(token!==generation)return;if(event.data.type==='ready'){clearTimeout(timeout);resolve();}if(event.data.type==='error'){clearTimeout(timeout);reject(new Error(event.data.message));}};local.onerror=event=>{clearTimeout(timeout);if(workerReady){busy=false;workerReady=false;emit('tracker-error',{message:event.message});if(restartAttempts<1)void recoverTracker('worker-crash');else setStatus('Hand tracking stopped. Reload to retry.');}else reject(new Error(event.message||'Hand tracking could not start.'));};local.postMessage({type:'init'});});
 }
 async function recoverTracker(reason:string){
  if(disposed||recovering||restartAttempts>=1)return;recovering=true;restartAttempts++;busy=false;workerReady=false;worker?.terminate();worker=null;resetControllers();baseMode='setup';calibrationSince=null;clearUiAuthority();setStatus('Hand tracking paused · restarting once…');emit('tracker-restart',{reason,attempt:restartAttempts});
  try{await initializeWorker(++generation);if(disposed)return;lastResult=-Infinity;setStatus(`Tracking restarted · ${setupInstruction().toLowerCase()}`);emit('tracker-recovered',{attempt:restartAttempts});}catch(error){workerReady=false;setStatus('Hand tracking stopped. Reload to retry.');emit('tracker-restart-failed',{message:String(error)});}finally{recovering=false;}
 }
 function suspend(source:string){
  if(disposed)return;suspended=true;resetControllers();baseMode='setup';calibrationSince=null;pointerTracked=false;clearUiAuthority();setStatus(`Paused · return to this window, then ${setupInstruction().toLowerCase()}`);emit('focus',{source,hidden:document.hidden,focused:document.hasFocus()});
 }
 const onVisibility=()=>{if(document.hidden)suspend('hidden');};
 const onBlur=()=>emit('focus',{source:'blur',hidden:document.hidden,focused:document.hasFocus()});
 const onFocus=()=>emit('focus',{source:'focus',hidden:document.hidden,focused:document.hasFocus()});
 const onVisibilityReturn=()=>{if(!document.hidden&&suspended)setStatus(setupInstruction());};
 window.addEventListener('blur',onBlur);window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onVisibility);document.addEventListener('visibilitychange',onVisibilityReturn);
 async function start(){
  if(started)return;started=true;const token=++generation;setStatus('Allow camera access. No microphone is used.');
  try{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera access needs localhost or HTTPS.');stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:30},facingMode:{ideal:'user'}},audio:false});if(token!==generation){stream.getTracks().forEach(track=>track.stop());return;}video.srcObject=stream;await video.play();setStatus('Starting hand tracking…');await initializeWorker(token);if(disposed)return;const settings=stream.getVideoTracks()[0]?.getSettings();updateFraming(true,0);emit('tracker-ready',{inputMode,camera:{width:settings?.width,height:settings?.height,frameRate:settings?.frameRate,facingMode:settings?.facingMode,videoWidth:video.videoWidth,videoHeight:video.videoHeight,readyState:video.readyState},mirrorConfigured:Boolean(mirrorBase)});setStatus(setupInstruction());scheduleRecording();}catch(error){setStatus(error instanceof DOMException&&error.name==='NotAllowedError'?'Camera permission was declined. Allow it, then reload.':`Camera unavailable: ${String(error)}`);emit('camera-error',{message:String(error)});throw error;}
 }
 function frame(now:number):InputFrame{
  if(disposed)return {active:false,forward:0,turn:0,headingTarget:null,gait:emptyGait(),mode:'lost',aim:{...lastPointer},spraying:false};
  const visible=!document.hidden,cameraReady=Boolean(stream)&&video.readyState>=2;
  if(!qaInjected&&now-lastDispatch>=33&&shouldDispatchFrame({hidden:document.hidden,workerReady,cameraReady,busy})){lastDispatch=now;busy=true;createImageBitmap(video).then(bitmap=>{if(disposed||!worker){bitmap.close();busy=false;return;}worker.postMessage({type:'frame',bitmap,time:now},[bitmap]);}).catch(error=>{busy=false;resetControllers();emit('frame-error',{message:String(error)});});}
  if(busy&&now-lastDispatch>2500){if(restartAttempts<1)void recoverTracker('frame-timeout');else{busy=false;workerReady=false;worker?.terminate();worker=null;setStatus('Hand tracking stopped. Reload to retry.');emit('tracker-stopped',{reason:'repeated-frame-timeout'});}}
  const stale=now-lastResult>staleLimit()||hands.length===0||!visible||suspended;if(stale){walkingNeedsBaseline=true;walker.reset();oneHand.read(now);hose.read(now);drawHands(rawHands);pointerTracked=false;cursor.classList.add('is-lost');clearUiAuthority();}
  const overUi=Boolean(uiTarget),single=oneHand.read(now,{overUi}),hoseState=hose.read(now,{overUi}),walking=inputMode==='one-hand'?single:walker.read(now),hoseActive=hoseState.blockWalking,hoseAim=hoseState.aim,hoseSpraying=hoseState.spraying;const mode:Mode=baseMode==='menu'?'menu':baseMode==='setup'?'setup':stale?'lost':hoseActive?'hose':'walk';const active=mode==='walk'||mode==='hose';
  const result:InputFrame={active:active&&visible&&!suspended,forward:mode==='walk'&&!walkingBlocked&&visible&&!suspended?walking.forward:0,turn:mode==='walk'&&!walkingBlocked&&visible&&!suspended?walking.turn:0,headingTarget:mode==='walk'&&!walkingBlocked&&visible&&!suspended?walking.headingTarget:null,gait:mode==='walk'&&!walkingBlocked&&visible&&!suspended?walking.gait:emptyGait(),mode,aim:hoseAim as {x:number;y:number},spraying:mode==='hose'&&visible&&!suspended&&hoseSpraying===true};
  aimNode.style.left=`${result.aim.x*innerWidth}px`;aimNode.style.top=`${result.aim.y*innerHeight}px`;aimNode.classList.toggle('is-idle',mode!=='hose');
  if(mode==='hose'||mode==='walk'||mode==='menu')setStatus('');else if(mode==='lost'&&baseMode==='walk')setStatus(`${inputMode==='one-hand'?'Hand':'Hands'} lost · bring ${inputMode==='one-hand'?'it':'them'} back into view.`);
  if(now-lastTelemetry>100){lastTelemetry=now;emit('input-frame',{timestamp:Math.round(now),inputMode,inputPreference,walkingBlocked,intentReason:hoseState.reason,active:result.active,forward:result.forward,turn:result.turn,headingTarget:result.headingTarget,gait:result.gait,mode:result.mode,aim:result.aim,spraying:result.spraying,trackingAge:Number.isFinite(lastResult)?now-lastResult:null});}
  if(playtest.state==='recording'&&now-lastFlush>5000){lastFlush=now;void playtest.flushTelemetry();}
  const readiness=readinessReason({staleMs:staleLimit(),hidden:document.hidden,cameraReady,workerReady,busy,lastDispatchAgeMs:now-lastDispatch,lastResultAgeMs:Number.isFinite(lastResult)?now-lastResult:Infinity,rawHands:rawHands.length,sampledHands:hands.length});if(readiness!==lastReadiness){emit('input-readiness',{from:lastReadiness,to:readiness,cameraReady,workerReady,busy,inferenceAge,latency,workerFrame,rawHands:rawHands.length,sampledHands:hands.length,noHandsDurationMs:noHandsSince===null?0:Math.max(0,now-noHandsSince),video:{width:video.videoWidth,height:video.videoHeight,time:+video.currentTime.toFixed(3),readyState:video.readyState},focused:document.hasFocus()});lastReadiness=readiness;}
  lastFrameState=result;return result;
 }
 function record(type:string,data:any){emit(type,data);}
 function reset(){resetCalibration();}
 function dispose(){if(disposed)return;disposed=true;generation++;window.clearInterval(recordTimer);window.removeEventListener('blur',onBlur);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisibility);document.removeEventListener('visibilitychange',onVisibilityReturn);root.querySelectorAll<HTMLElement>('[data-action]').forEach(node=>node.removeEventListener('click',handleAction));worker?.terminate();worker=null;stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;recorder.destroy();void playtest.flushTelemetry().then(()=>playtest.stop());root.remove();if(new URLSearchParams(location.search).get('qa')==='1')delete (window as any).__forestInputQA;}
 function diagnostics(){const now=performance.now();return {buildId:BUILD_ID,scenario:SCENARIO,inputMode,inputPreference,walkingBlocked,walkingSelection:walkingMode.read(now),targetHands:targetHands(),mode:lastFrameState.mode,readiness:lastReadiness,lastResultAge:Number.isFinite(lastResult)?now-lastResult:null,inferenceAge,latency,workerFrame,rawHands:rawHands.length,handsVisible:hands.length,noHandsDurationMs:noHandsSince===null?0:Math.max(0,now-noHandsSince),cameraReady:Boolean(stream)&&video.readyState>=2,video:{width:video.videoWidth,height:video.videoHeight,time:video.currentTime,readyState:video.readyState,paused:video.paused},documentHidden:document.hidden,documentFocused:document.hasFocus(),workerReady,busy,recovering,restartAttempts,suspended,recording:{state:playtest.state,savedBytes:playtest.savedBytes,error:playtest.error||recordingError,mirrorConfigured:Boolean(mirrorBase),remoteState:playtest.remoteState},walker:walker.diagnostics(now),oneHand:oneHand.diagnostics(now),hose:hose.read(now,{overUi:Boolean(uiTarget)})};}
 if(new URLSearchParams(location.search).get('qa')==='1'){
  (window as any).__forestInputQA={injectHands(sampled:any[],landmarks:RawHand[]=sampled.flatMap(hand=>Array.isArray(hand.landmarks)?[{id:String(hand.id),landmarks:hand.landmarks}]:[]),now=performance.now()){qaInjected=true;ingest(sampled,landmarks,now,0);return frame(now);},releaseInjection(){qaInjected=false;hands=[];lastResult=-Infinity;resetControllers();},diagnostics};
 }
 updateModeCopy();updateRecordingStatus(playtest);
 return {start,frame,record,reset,dispose,diagnostics,setHoseFeedback:(text:string)=>{if(aimNode.dataset.feedback!==text){aimNode.dataset.feedback=text;aimNode.querySelector('span')!.textContent=text;}}};
}
