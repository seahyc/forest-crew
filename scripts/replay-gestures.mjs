import {chromium} from 'playwright';
import {readFile,mkdir,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {normalizeGestureRecording} from '../src/gesture-replay-data.mjs';
import {gestureRecipe} from './gesture-recipes.mjs';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){const key=args[i];if(!['--recording','--recipe','--url','--out','--from','--to','--warmup','--mode','--headed'].includes(key))throw new Error(`Unknown option ${key}`);if(key==='--headed')options.headed=true;else{const value=args[++i];if(!value||value.startsWith('--'))throw new Error(`Missing value for ${key}`);options[key.slice(2)]=value;}}
if(options.recording&&options.recipe)throw new Error('Choose a recording or a synthetic recipe');
const url=new URL(options.url||'http://127.0.0.1:4180/');
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Gesture replay runs only against a local development server');
url.searchParams.set('qa','1');url.searchParams.set('replay','1');url.searchParams.set('crew','0');
const mode=options.mode||'auto';if(!['auto','one-hand','two-hand'].includes(mode))throw new Error('Invalid --mode');
const out=resolve(options.out||`.agent-data/gesture-replays/${new Date().toISOString().replaceAll(':','-')}`);
let value;
if(options.recording){const path=resolve(options.recording);if((await stat(path)).size>30_000_000)throw new Error('Input exceeds 30 MB');let bytes=await readFile(path);if(path.endsWith('.gz'))bytes=gunzipSync(bytes,{maxOutputLength:30_000_000});const text=bytes.toString('utf8');try{value=JSON.parse(text);}catch{value=text.split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line));}}
else value=gestureRecipe(options.recipe||'hose-sweep');
let recording=normalizeGestureRecording(value);
const numberOption=(key,fallback)=>{const n=options[key]===undefined?fallback:Number(options[key]);if(!Number.isFinite(n)||n<0)throw new Error(`Invalid --${key}`);return n;};
const from=numberOption('from',0),to=numberOption('to',recording.durationMs),warmupMs=numberOption('warmup',0);
if(to<from)throw new Error('--to must follow --from');
const warnings=recording.warnings;
recording=normalizeGestureRecording({...recording,frames:recording.frames.filter(frame=>frame.t>=from&&frame.t<=to)});
recording.warnings=[...new Set([...warnings,...recording.warnings])];
if(recording.durationMs+warmupMs>120000)throw new Error('Select a segment under two minutes with --from and --to (milliseconds)');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:!options.headed,channel:'chrome',args:['--use-angle=metal']});
const errors=[],forbidden=[];
let page;
try{
 page=await browser.newPage({viewport:{width:960,height:720},deviceScaleFactor:1});
 page.on('pageerror',error=>errors.push(String(error)));
 await page.route('**/api/**',route=>{forbidden.push(new URL(route.request().url()).pathname);return route.abort();});
 await page.addInitScript(({mode})=>{localStorage.setItem('forest-crew-recording','off');localStorage.setItem('forest-crew-input-preference',mode);window.__replayCameraCalls=0;navigator.mediaDevices.getUserMedia=()=>{window.__replayCameraCalls++;return Promise.reject(new Error('Camera forbidden in landmark replay'));};},{mode});
 await page.goto(url.href);await page.waitForFunction(()=>window.__forestQA?.ready()&&window.__forestGestureReplay,null,{timeout:60000});await page.locator('#loading').waitFor({state:'hidden'});
 await page.evaluate(({recording,warmupMs})=>{window.__forestGestureReplay.load(recording,{warmupMs});window.__forestGestureReplay.play();},{recording,warmupMs});
 let status,actionShot=false;const deadline=Date.now()+recording.durationMs+warmupMs+10000;
 do{
  if(Date.now()>deadline)throw new Error('Playback exceeded its wall-clock deadline');
  await page.waitForTimeout(200);
  const current=await page.evaluate(()=>({status:window.__forestGestureReplay.status(),input:window.__forestQA.snapshot()?.input}));status=current.status;
  if(!actionShot&&(current.input?.spraying||Math.abs(current.input?.forward)>.1)){await page.screenshot({path:resolve(out,'action.png')});actionShot=true;}
 }while(status.state==='playing');
 const evidence=await page.evaluate(()=>({trace:window.__forestGestureReplay.trace(),final:window.__forestQA.snapshot(),diagnostics:window.__forestInputQA.diagnostics(),cameraCalls:window.__replayCameraCalls}));
 await page.screenshot({path:resolve(out,'final.png')});
 const inputs=evidence.trace.filter(event=>event.type==='input-frame').map(event=>event.data),world=evidence.trace.filter(event=>event.type==='world-state').map(event=>event.data),handEvents=evidence.trace.filter(event=>event.type==='hands');
 const values=key=>inputs.map(input=>input[key]||0);
 const summary={forwardMax:Math.max(0,...values('forward')),forwardMin:Math.min(0,...values('forward')),turnMin:Math.min(0,...values('turn')),turnMax:Math.max(0,...values('turn')),sprayingFrames:inputs.filter(input=>input.spraying).length,waterFlowFrames:world.filter(state=>state.water?.flowing).length,modes:[...new Set(inputs.map(input=>input.inputMode))],displacement:world.length>1?Math.hypot(world.at(-1).position.x-world[0].position.x,world.at(-1).position.z-world[0].position.z):0,handFrames:handEvents.length};
 const checks={completed:status.state==='complete',noBrowserErrors:errors.length===0,noCamera:evidence.cameraCalls===0,noBackendRequests:forbidden.length===0,recordingOff:evidence.diagnostics.recording.state==='opted-out',stopped:!evidence.final.input.spraying&&evidence.final.input.forward===0};
 if(options.recording){checks.calibrated=evidence.trace.some(event=>event.type==='calibrated');checks.interpreted=inputs.some(input=>input.active&&(input.mode==='walk'||input.mode==='hose'));}
 const name=options.recording?null:options.recipe||'hose-sweep';
 if(name==='hose-sweep'){checks.sprayed=summary.sprayingFrames>0;checks.waterFlowed=summary.waterFlowFrames>0;}
 if(name==='walk-turn'){checks.forward=summary.forwardMax>.05;checks.backward=summary.forwardMin<-.05;checks.left=summary.turnMin<-.05;checks.right=summary.turnMax>.05;checks.avatarMoved=summary.displacement>.1;}
 if(name==='hand-count'&&mode==='auto')checks.bothModes=summary.modes.includes('one-hand')&&summary.modes.includes('two-hand');
 const report={pass:Object.values(checks).every(Boolean),source:options.recording?'recorded-landmarks':`synthetic:${name}`,scope:'Raw landmarks through live gesture controls and rendered game, 1x timing; fresh world; crew disabled. Does not test camera recognition or human comfort.',segment:{from,to,warmupMs},warnings:recording.warnings,status,summary,checks,errors,forbidden};
 await writeFile(resolve(out,'trace.json.gz'),gzipSync(JSON.stringify(evidence),{level:6}));await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,artifacts:out},null,2));if(!report.pass)process.exitCode=1;
}catch(error){await writeFile(resolve(out,'failure.json'),JSON.stringify({pass:false,error:String(error),errors,forbidden},null,2));throw error;}finally{await browser.close();}
