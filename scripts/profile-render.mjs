import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.addInitScript(()=>localStorage.setItem('forest-crew-recording','off'));
 await page.goto('http://127.0.0.1:4180/?qa=1&crew=0');await page.waitForFunction(()=>window.__forestQA?.input().workerReady,null,{timeout:60000});await page.waitForTimeout(3000);
 const metrics=await page.evaluate(async()=>{const s=window.__forestQA.scene,e=s.getEngine();async function sample(){const times=[];let previous=performance.now();await new Promise(resolve=>{function step(now){times.push(now-previous);previous=now;if(times.length<180)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});times.sort((a,b)=>a-b);return {fps:e.getFps(),p50:times[90],p95:times[171],meshes:s.meshes.length,active:s.getActiveMeshes().length,render:{width:e.getRenderWidth(),height:e.getRenderHeight()}};}const baseline=await sample();const rtt=s.customRenderTargets[0];const old=rtt.refreshRate;rtt.refreshRate=2;const halfReflection=await sample();rtt.refreshRate=old;s.postProcessesEnabled=false;const noPost=await sample();return {baseline,halfReflection,noPost};});console.log(JSON.stringify(metrics,null,2));await writeFile('playtests/grove-01/render-profile-after.json',JSON.stringify(metrics,null,2));
}finally{await browser.close();}
