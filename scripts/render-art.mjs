import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-angle=metal']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4180/?view=scene&qa=1');
 await page.waitForFunction(()=>window.__forestQA?.ready(),null,{timeout:60000});await page.locator('#loading').waitFor({state:'hidden',timeout:60000});await page.waitForTimeout(3000);
 await page.screenshot({path:'playtests/grove-01/art-candidate.png'});
 console.log(JSON.stringify({errors,loading:await page.locator('#loading').isVisible(),diagnostics:await page.evaluate(()=>({fps:window.__forestQA.scene.getEngine().getFps(),meshes:window.__forestQA.scene.meshes.length,active:window.__forestQA.scene.getActiveMeshes().length}))}));
}finally{await browser.close();}
