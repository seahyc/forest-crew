type PlayerFrame={active:boolean;spraying:boolean;progress:number;complete:boolean};
type CrewStatus={authenticated?:boolean;ready?:boolean;localOnly?:boolean};
type CrewClientOptions={invite?:string|null};

const API_BASE=(import.meta.env.VITE_CREW_API_BASE||'/api/crew').replace(/\/+$/,'');

class CrewHttpError extends Error{
 constructor(readonly status:number){super(String(status));}
}

/** Optional local or hosted crew mode. No network or model work runs in the render loop. */
export function createCrewClient({invite=null}:CrewClientOptions={}){
 let snapshot:any=null,starting=false,started=false,stopped=false,pending=false,resetting=false,lastPoll=0,lastReceived=0,generation=0,disposed=false;
 let access:'checking'|'ready'|'denied'|'offline'='checking';
 let startRequest:Promise<unknown>|null=null;
 const notice=document.createElement('div');notice.className='crew-status';notice.setAttribute('role','status');notice.textContent='AI CREW · checking access';document.body.append(notice);
 const request=async(path:string,init:RequestInit={})=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);try{const response=await fetch(`${API_BASE}/${path}`,{credentials:'same-origin',...init,signal:controller.signal});if(!response.ok)throw new CrewHttpError(response.status);return await response.json();}finally{clearTimeout(timer);}};
 const post=(path:string,body:unknown)=>request(path,{method:'POST',headers:{'Content-Type':'application/json','X-Forest-Crew':'1'},body:JSON.stringify(body)});
 const say=(text:string)=>{if(notice.textContent!==text)notice.textContent=text;};
 const explain=(error:unknown,action:'access'|'start'|'connection')=>{
  const status=error instanceof CrewHttpError?error.status:0;
  if(status===409)return 'AI CREW · another crew session is already active';
  if(status===429)return 'AI CREW · today’s session limit has been reached';
  if(status===503)return 'AI CREW OFFLINE · service is unavailable';
  if(status===401||status===403)return 'AI CREW · invitation required';
  return action==='connection'?'AI CREW · connection lost, water paused':'AI CREW OFFLINE · could not start the crew';
 };
 const hadInvite=Boolean(invite);
 const bootstrap=(async()=>{
  try{
   if(invite)await post('access',{invite});
   invite=null;
   const status=await request('status') as CrewStatus;
   if(disposed)return;
   if(!status.localOnly&&!status.authenticated){access='denied';say('AI CREW · invitation required');return;}
   if(!status.ready){access='offline';say('AI CREW OFFLINE · service is unavailable');return;}
   access='ready';if(!resetting)stopped=false;say('CREW · waiting for your hands');
  }catch(error){
   invite=null;
   if(disposed)return;
   access=error instanceof CrewHttpError&&(error.status===401||error.status===403)?'denied':'offline';say(explain(error,hadInvite?'access':'connection'));
  }
 })();
 function update(now:number,frame:PlayerFrame){
  if(stopped||access!=='ready')return;
  if(!started&&!starting&&frame.active){const current=generation;starting=true;say('CREW · calling two firefighters…');void (startRequest=post('session',{}).then(s=>{if(current!==generation)return;snapshot=s;started=true;lastReceived=performance.now();}).catch(error=>{if(current!==generation)return;lastReceived=Number.NEGATIVE_INFINITY;say(explain(error,'start'));stopped=true;}).finally(()=>{if(current===generation)starting=false;}));}
  if(!started||pending||now-lastPoll<200)return;lastPoll=now;pending=true;const current=generation;
  void post('frame',{spraying:frame.spraying,progress:frame.progress,complete:frame.complete}).then(s=>{
   if(current!==generation)return;snapshot=s;lastReceived=performance.now();
   const message=s.world?.mailboxes?.player?.at(-1);
   say(s.status==='stopped'?'CREW · session ended':s.error?'CREW · teammate unavailable':s.pressure?'CREW · water pressure ready':message?`CREW · ${String(message.text).slice(0,140)}`:'CREW · setting up your water supply…');
  }).catch(error=>{if(current===generation){lastReceived=Number.NEGATIVE_INFINITY;say(explain(error,'connection'));}}).finally(()=>{if(current===generation)pending=false;});
 }
 return {update,async reset(){const current=++generation,needsStop=started||starting||!!startRequest;resetting=true;stopped=true;try{await startRequest;if(needsStop)await post('stop',{});}catch{}if(current!==generation)return;started=false;starting=false;pending=false;snapshot=null;startRequest=null;lastReceived=Number.NEGATIVE_INFINITY;resetting=false;stopped=access!=='ready';if(access==='ready')say('CREW · waiting for your hands');},snapshot:()=>snapshot,telemetry:()=>snapshot?{id:snapshot.id,status:snapshot.status,pressure:snapshot.pressure,actors:(snapshot.actors??[]).map((a:any)=>({id:a.id,model:a.model,position:a.position,activity:a.activity,decisions:a.decisions}))}:null,pressure:()=>access==='ready'&&performance.now()-lastReceived<2000?(snapshot?.pressure??0):0,
  dispose(){generation++;disposed=true;stopped=true;invite=null;notice.remove();const stop=()=>fetch(`${API_BASE}/stop`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Forest-Crew':'1'},body:'{}',keepalive:true}).catch(()=>{});if(started||starting||startRequest)void Promise.resolve(startRequest).then(stop,stop);void bootstrap.catch(()=>{});}};
}
