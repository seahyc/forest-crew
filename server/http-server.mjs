import {randomBytes} from 'node:crypto';
import {GAME_OXYGEN_COST} from './crew-session.mjs';
import {parseCookie,safeEqual} from './hosted-access.mjs';

const reply=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));};
async function body(req){let buffer='';for await(const chunk of req){buffer+=chunk;if(buffer.length>4096)throw new Error('body_too_large');}return JSON.parse(buffer||'{}');}

export function createCrewHttpHandler({port,bind,config,access,getProviderState,createSession}={}){
 let session=null,sessionToken=null,creating=false;
 const hosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`,'127.0.0.1:4180','localhost:4180',`${bind}:${port}`]);
 const origins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:4180','http://localhost:4180']);if(config.hosted)origins.add(config.publicOrigin);
 const sameSessionToken=value=>typeof value==='string'&&typeof sessionToken==='string'&&safeEqual(value,sessionToken);
 const occupied=()=>Boolean(creating||session&&session.snapshot().status!=='stopped');
 async function handler(req,res){
  try{
   if(config.hosted&&!access.edgeAllowed(req.headers['x-forest-crew-edge'])){reply(res,403,{error:'edge_required'});return;}
   if(!hosts.has(req.headers.host)&&req.headers.host!==`${bind}:${req.socket.localPort}`){reply(res,403,{error:'host_not_allowed'});return;}
   const authenticated=config.hosted?access.authenticated(req.headers.cookie):true;
   if(req.method==='GET'&&req.url==='/api/crew/status'){
    const {providerReady,models}=getProviderState();
    if(!config.hosted){reply(res,200,{ready:providerReady,models,localOnly:true});return;}
    reply(res,200,{ready:providerReady,models,localOnly:false,authenticated,busy:occupied(),sessionLimit:await access.admissions.status()});return;
   }
   if(req.method!=='POST'||!origins.has(req.headers.origin)||req.headers['x-forest-crew']!=='1'||!req.headers['content-type']?.startsWith('application/json')){reply(res,403,{error:'same_origin_required'});return;}
   const data=await body(req);
   if(config.hosted&&req.url==='/api/crew/access'){
    const cookie=typeof data.invite==='string'?access.issueAccessCookie(data.invite):null;
    if(!cookie){reply(res,403,{error:'invite_required'});return;}reply(res,200,{ok:true},{'Set-Cookie':cookie});return;
   }
   if(config.hosted&&!authenticated){reply(res,403,{error:'access_required'});return;}
   if(req.url==='/api/crew/session'){
    const {providerReady,models}=getProviderState();if(!providerReady){reply(res,503,{error:'provider_unavailable'});return;}
    const chosen=data.models??['gpt-5.6-sol','gpt-5.6-sol'];
    if(!Array.isArray(chosen)||chosen.length!==2||chosen.some(model=>!Object.hasOwn(GAME_OXYGEN_COST,model)||!models.some(entry=>entry.id===model))){reply(res,400,{error:'model_unavailable'});return;}
    const priorToken=parseCookie(req.headers.cookie,'forest_crew');if(session&&sameSessionToken(priorToken))await session.stop('owner_restart');
    if(occupied()){reply(res,409,{error:'crew_already_active'});return;}
    creating=true;
    try{
     if(config.hosted){const reservation=await access.admissions.reserve();if(!reservation.ok){reply(res,429,{error:'daily_session_limit',sessionLimit:reservation});return;}}
     sessionToken=randomBytes(32).toString('hex');session=createSession(chosen);void session.start();const secure=config.hosted?'; Secure':'';reply(res,201,session.snapshot(),{'Set-Cookie':`forest_crew=${sessionToken}; HttpOnly${secure}; SameSite=Strict; Path=${config.cookiePath}; Max-Age=300`});
    }finally{creating=false;}return;
   }
   const token=parseCookie(req.headers.cookie,'forest_crew');if(!session||!sameSessionToken(token)){reply(res,401,{error:'session_required'});return;}
   if(req.url==='/api/crew/frame'){session.playerTelemetry(data);reply(res,200,session.snapshot());return;}
   if(req.url==='/api/crew/stop'){await session.stop();reply(res,200,{ok:true});return;}
   reply(res,404,{error:'not_found'});
  }catch{reply(res,400,{error:'invalid_request'});}
 }
 return {handler,tick:dt=>session?.tick(dt),stop:()=>session?.stop(),snapshot:()=>session?.snapshot()??null};
}
