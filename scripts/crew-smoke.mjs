// Real provider test, deliberately separate from the offline npm test suite.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {CodexProvider} from '../server/codex-provider.mjs';
import {createCrewSession} from '../server/crew-session.mjs';
import {createSkillStore} from '../server/skill-store.mjs';
const directory=resolve('.agent-data/smoke');await mkdir(directory,{recursive:true});
const provider=new CodexProvider();let session,timer;const events=[];
try{
 const models=await provider.start();console.log('Provider models:',models.map(m=>m.id).join(', '));
 const skills=await createSkillStore({directory:join(directory,'skills')});
 session=createCrewSession({provider,skillStore:skills,maxDecisions:3,onEvent:e=>{events.push(e);if(e.type==='tool-result')console.log(e.actorId,e.tool,JSON.stringify(e.args),e.result.ok? 'OK':e.result.error);else if(e.type!=='decision-completed')console.log(e.type);}});
 timer=setInterval(()=>{session.tick(.05);session.playerTelemetry({spraying:false,progress:0});},50);
 await session.start();const deadline=Date.now()+150000;
 while(Date.now()<deadline){await new Promise(r=>setTimeout(r,1000));const s=session.snapshot();if(s.pressure===1&&!s.actors.some(a=>a.thinking))break;if(['degraded','unavailable'].includes(s.status))break;}
 const s=session.snapshot();const sent=s.world.outboxes.firefighter.concat(s.world.outboxes.engineer);
 const proof={models:s.actors.map(a=>({id:a.id,model:a.model,decisions:a.decisions})),pressure:s.pressure,status:s.status,world:s.world,skills:await Promise.all(['firefighter','engineer'].map(a=>skills.list(a))),events};
 await writeFile(join(directory,'latest.json'),JSON.stringify(proof,null,2));
 console.log(JSON.stringify({pressure:s.pressure,status:s.status,actorDecisions:proof.models,messages:sent.length,acknowledged:sent.filter(x=>x.acknowledged).length,skills:proof.skills.map(x=>x.skills?.length??0)}));
 if(s.pressure!==1||!sent.some(x=>x.to==='engineer'||x.to==='firefighter')||!s.actors.every(a=>a.decisions>0))process.exitCode=1;
}finally{clearInterval(timer);await session?.stop();await provider.close();}
