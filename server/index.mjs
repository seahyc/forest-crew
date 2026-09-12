import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,appendFile,stat,rename,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {CodexProvider} from './codex-provider.mjs';
import {createCrewSession,GAME_OXYGEN_COST} from './crew-session.mjs';
import {createSkillStore} from './skill-store.mjs';

const port=Number(process.env.FOREST_CREW_PORT||4182);
const directory=resolve(process.env.FOREST_CREW_DATA||'.agent-data');
await mkdir(directory,{recursive:true,mode:0o700});
const skills=await createSkillStore({directory:join(directory,'skills')});
const provider=new CodexProvider({binary:process.env.FOREST_CODEX_BINARY||'codex'});
let models=[],providerReady=false,session=null,sessionToken=null,creating=false,closed=false,logChain=Promise.resolve();
const ready=provider.start().then(result=>{models=result.filter(m=>Object.hasOwn(GAME_OXYGEN_COST,m.id));providerReady=true;console.log(`Crew models: ${models.map(m=>m.id).join(', ')}`);}).catch(()=>console.error('Crew provider unavailable. Check codex login and the installed CLI version.'));
function record(event){logChain=logChain.then(async()=>{const file=join(directory,'events.jsonl');if((await stat(file).catch(()=>({size:0}))).size>500000){await rm(file+'.1',{force:true});await rename(file,file+'.1');}await appendFile(file,JSON.stringify(event)+'\n',{mode:0o600});}).catch(()=>{});}
const sameToken=value=>typeof value==='string'&&sessionToken&&value.length===sessionToken.length&&timingSafeEqual(Buffer.from(value),Buffer.from(sessionToken));
const validHost=host=>[`127.0.0.1:${port}`,`localhost:${port}`,'127.0.0.1:4180','localhost:4180'].includes(host);
const validOrigin=origin=>[`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:4180','http://localhost:4180'].includes(origin);
const reply=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));};
async function body(req){let buffer='';for await(const chunk of req){buffer+=chunk;if(buffer.length>4096)throw new Error('body_too_large');}return JSON.parse(buffer||'{}');}
const server=createServer(async(req,res)=>{
 try{
  if(!validHost(req.headers.host)){reply(res,403,{error:'host_not_allowed'});return;}
  if(req.method==='GET'&&req.url==='/api/crew/status'){reply(res,200,{ready:providerReady,models,localOnly:true});return;}
  if(req.method!=='POST'||!validOrigin(req.headers.origin)||req.headers['x-forest-crew']!=='1'||!req.headers['content-type']?.startsWith('application/json')){reply(res,403,{error:'same_origin_required'});return;}
  const data=await body(req);
  if(req.url==='/api/crew/session'){
   if(!providerReady){reply(res,503,{error:'provider_unavailable'});return;}
   const priorToken=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('forest_crew='))?.slice('forest_crew='.length);
   if(session&&sameToken(priorToken))await session.stop('owner_restart');
   if(creating||session&&session.snapshot().status!=='stopped'){reply(res,409,{error:'crew_already_active'});return;}
   const chosen=data.models??['gpt-5.6-sol','gpt-5.6-sol'];
   if(!Array.isArray(chosen)||chosen.length!==2||chosen.some(m=>!models.some(x=>x.id===m))){reply(res,400,{error:'model_unavailable'});return;}
   creating=true;
   try{sessionToken=randomBytes(32).toString('hex');session=createCrewSession({provider,models:chosen,skillStore:skills,onEvent:record});void session.start();reply(res,201,session.snapshot(),{'Set-Cookie':`forest_crew=${sessionToken}; HttpOnly; SameSite=Strict; Path=/api/crew; Max-Age=300`});}
   finally{creating=false;}return;
  }
  const token=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('forest_crew='))?.slice('forest_crew='.length);
  if(!session||!sameToken(token)){reply(res,401,{error:'session_required'});return;}
  if(req.url==='/api/crew/frame'){session.playerTelemetry(data);reply(res,200,session.snapshot());return;}
  if(req.url==='/api/crew/stop'){await session.stop();reply(res,200,{ok:true});return;}
  reply(res,404,{error:'not_found'});
 }catch{reply(res,400,{error:'invalid_request'});}
});
const timer=setInterval(()=>session?.tick(.05),50);
server.listen(port,'127.0.0.1',()=>console.log(`Forest Crew bridge http://127.0.0.1:${port} (loopback only)`));
async function close(){if(closed)return;closed=true;clearInterval(timer);await session?.stop();await provider.close();await logChain;server.close();}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
