import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
await mkdir('.agent-data/visual-pass',{recursive:true});
const b=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal']});
try{
 const p=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});const errors=[];let modelStarts=0;p.on('pageerror',e=>errors.push(String(e)));p.on('request',r=>{if(r.url().endsWith('/api/crew/session'))modelStarts++;});await p.addInitScript(()=>localStorage.setItem('forest-crew-recording','off'));
 await p.goto('http://127.0.0.1:4180/?qa=1');await p.waitForFunction(()=>window.__forestQA?.ready()&&window.__forestQA.scene.transformNodes.filter(n=>n.name.startsWith('crew-')&&n.isEnabled()).length===2,null,{timeout:60000});await p.locator('#loading').waitFor({state:'hidden'});await p.waitForTimeout(2500);
 // Denied camera access must not put the full-screen loader over the ready world.
 const state=await p.evaluate(()=>({loading:!document.querySelector('#loading').hidden,notice:document.querySelector('.crew-status')?.textContent,actors:window.__forestQA.scene.transformNodes.filter(n=>n.name.startsWith('crew-')).map(n=>({name:n.name,enabled:n.isEnabled(),meshes:n.getChildMeshes().length})),crew:window.__forestQA.snapshot().crew,fps:window.__forestQA.scene.getEngine().getFps(),avatar:window.__forestQA.avatar().ready}));
 await p.screenshot({path:'.agent-data/visual-pass/local-waiting-crew.png'});
 const report={state,modelStarts,errors};await writeFile('.agent-data/visual-pass/local-waiting-crew.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(state.loading||modelStarts||state.crew||errors.length||!state.actors.every(a=>a.enabled))process.exitCode=1;
 await p.goto('http://127.0.0.1:4180/?qa=1&crew=0');await p.waitForFunction(()=>window.__forestQA?.ready(),null,{timeout:60000});console.log('Explicit solo override',await p.locator('.crew-status').count()===0?'PASS':'FAIL');
}finally{await b.close();}
