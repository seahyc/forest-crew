import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const base=process.env.FOREST_PLAYTEST_URL||'http://127.0.0.1:4180/';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal']});
const checks=[],errors=[];
try{
 for(const [name,viewport,dpr,mobile] of [['retina',{width:1440,height:900},2,false],['phone-portrait',{width:390,height:844},3,true]]){
  const context=await browser.newContext({viewport,deviceScaleFactor:dpr,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>localStorage.setItem('forest-crew-recording','off'));
  await page.goto(new URL('?view=scene&qa=1',base).href);await page.waitForFunction(()=>window.__forestQA?.ready(),null,{timeout:60000});await page.locator('#loading').waitFor({state:'hidden'});await page.waitForTimeout(800);
  const measure=()=>page.evaluate(()=>{const e=window.__forestQA.scene.getEngine(),c=document.querySelector('#world');return {css:{w:c.clientWidth,h:c.clientHeight},render:{w:e.getRenderWidth(),h:e.getRenderHeight()},scaling:e.getHardwareScalingLevel(),fovMode:window.__forestQA.scene.activeCamera.fovMode,dpr:devicePixelRatio};});
  const size=await measure();checks.push({name,pass:size.render.w>size.css.w*1.5&&size.render.h>size.css.h*1.5,evidence:size});
  await page.screenshot({path:`playtests/grove-01/${name}-sharp.png`});
  // Test actual game's picking path at high DPR, with a reachable ground target.

  await page.waitForTimeout(100);
  await page.evaluate(()=>{const q=window.__forestQA;q.override({active:true,forward:0,turn:0,gait:{},mode:'hose',spraying:true,aim:q.aimFor(0,1)});});await page.waitForTimeout(250);
  const hit=await page.evaluate(()=>window.__forestQA.snapshot().impact);checks.push({name:`${name}-actual-hose-ray`,pass:hit&&Math.hypot(hit.x,hit.z-1)<.2,evidence:hit});
  if(mobile){await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);const rotated=await measure();checks.push({name:'phone-rotation',pass:rotated.css.w===844&&rotated.render.w===1688&&rotated.fovMode===0,evidence:rotated});await page.screenshot({path:'playtests/grove-01/phone-landscape-sharp.png'});}
  await context.close();
 }
 const report={scope:'Real renderer and picking path in emulated viewports; not physical phone performance',checks,errors,pass:checks.every(x=>x.pass)&&!errors.length};await writeFile('playtests/grove-01/resolution-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.pass)process.exitCode=1;
}finally{await browser.close();}
