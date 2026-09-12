import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const targetUrl=new URL(process.env.FOREST_PLAYTEST_URL||'http://127.0.0.1:4180/');targetUrl.searchParams.set('qa','1');
const expectMirror=process.env.FOREST_EXPECT_MIRROR==='1';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const phone=process.env.FOREST_PHONE==='1';
const page=await browser.newPage(phone?{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}:{viewport:{width:1280,height:720}});
const writes=[],errors=[];let sessionId='';
page.on('pageerror',error=>errors.push(error.message));
page.on('requestfailed',request=>errors.push({url:request.url(),failure:request.failure()}));
page.on('response',async response=>{if(response.url().includes('/api/playtests/')&&response.request().method()==='POST'){writes.push({path:new URL(response.url()).pathname,status:response.status()});if(new URL(response.url()).pathname.endsWith('/sessions')){const data=await response.json().catch(()=>({}));sessionId=data.sessionId??data.session??data.id??'';}}});
try{
 if(process.env.FOREST_FORCE_MP4==='1')await page.addInitScript(()=>{const supported=MediaRecorder.isTypeSupported.bind(MediaRecorder);MediaRecorder.isTypeSupported=type=>type.startsWith('video/mp4')&&supported(type);});
 if(process.env.FOREST_FOCUSLESS==='1')await page.addInitScript(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false}));
 await page.goto(targetUrl.href);
 await page.waitForFunction(()=>window.__forestQA?.input().workerReady,null,{timeout:60000});
 const collapsed=await page.evaluate(()=>{const hud=document.querySelector('.forest-input__hud'),details=document.querySelector('.forest-input__record');return {ariaHidden:hud?.getAttribute('aria-hidden'),open:hud?.classList.contains('is-open'),detailsVisible:Boolean(details&&details.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))};});
 await page.waitForFunction(expectMirror?()=>window.__forestQA.input().recording.savedBytes>0&&window.__forestQA.input().recording.remoteState==='recording':()=>window.__forestQA.input().recording.savedBytes>0,null,{timeout:40000});
 await page.waitForTimeout(12000);
 const during=await page.evaluate(()=>({recording:window.__forestQA.input().recording,label:document.querySelector('[data-kind=remote]').textContent}));
 // This is an infrastructure fixture, not a gesture usability test.
 await page.locator('.forest-input__hud-open').click();
 await page.waitForFunction(()=>document.querySelector('.forest-input__hud')?.classList.contains('is-open'));
 await page.locator('.forest-input__record-action').click();
 if(expectMirror)await page.waitForFunction(()=>/SAVED/.test(document.querySelector('[data-kind=remote]').textContent),null,{timeout:25000});
 else await page.waitForFunction(()=>/SAVED|OFF/.test(document.querySelector('[data-kind=local]').textContent),null,{timeout:25000});
 await page.locator('.forest-input__hud-close').click();
 const after=await page.evaluate(()=>({recording:window.__forestQA.input().recording,label:document.querySelector('[data-kind=remote]').textContent}));
 const hasClip=writes.some(x=>x.path.includes('/clips')&&x.status===201),hasTelemetry=writes.some(x=>x.path.includes('/telemetry')&&x.status===201),mirrorPass=expectMirror?hasClip&&hasTelemetry&&after.recording.remoteState==='uploaded':writes.length===0&&after.recording.mirrorConfigured===false;
 const mime=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('forest-crew-recordings');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const rows=await new Promise((resolve,reject)=>{const r=db.transaction('entries').objectStore('entries').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return rows.filter(x=>x.kind==='clip').map(x=>x.blob.type);});
 const mimePass=process.env.FOREST_FORCE_MP4!=='1'||(mime.length>0&&mime.every(type=>type.startsWith('video/mp4')));
 const pass=mimePass&&errors.length===0&&collapsed.ariaHidden==='true'&&collapsed.open===false&&collapsed.detailsVisible===false&&mirrorPass;
 const report={synthetic:true,scope:'Fake-camera recording infrastructure fixture; no real-hand or human usability claim',url:targetUrl.href,expectedMirror:expectMirror,phone,mime,sessionId,pass,collapsed,during,after,writes,errors};
 await writeFile('playtests/grove-01/browser-recording.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));if(!pass)process.exitCode=1;
}catch(error){
 const state=await page.evaluate(()=>({input:window.__forestQA?.input(),remote:document.querySelector('[data-kind=remote]')?.textContent})).catch(()=>null);
 const report={pass:false,error:String(error),sessionId,state,writes,errors};
 await writeFile('playtests/grove-01/browser-recording.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exitCode=1;
}finally{await browser.close();}
