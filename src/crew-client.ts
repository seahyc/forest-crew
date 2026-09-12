type PlayerFrame={active:boolean;spraying:boolean;progress:number;complete:boolean};
/** Optional local crew mode. No network or model work runs in the render loop. */
export function createCrewClient(){
 let snapshot:any=null,starting=false,started=false,stopped=false,pending=false,lastPoll=0,lastReceived=0,generation=0;
 let startRequest:Promise<unknown>|null=null;
 const notice=document.createElement('div');notice.className='crew-status';notice.setAttribute('role','status');notice.textContent='CREW · waiting for your hands';document.body.append(notice);
 const post=async(path:string,body:unknown)=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);try{const response=await fetch(`/api/crew/${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Forest-Crew':'1'},body:JSON.stringify(body),signal:controller.signal});if(!response.ok)throw new Error(String(response.status));return await response.json();}finally{clearTimeout(timer);}};
 const say=(text:string)=>{if(notice.textContent!==text)notice.textContent=text;};
 function update(now:number,frame:PlayerFrame){
  if(stopped)return;
  if(!started&&!starting&&frame.active){const current=generation;starting=true;say('CREW · calling two firefighters…');void (startRequest=post('session',{}).then(s=>{if(current!==generation)return;snapshot=s;started=true;lastReceived=performance.now();}).catch(()=>{if(current!==generation)return;say('CREW OFFLINE · start the local crew bridge');stopped=true;}).finally(()=>{if(current===generation)starting=false;}));}
  if(!started||pending||now-lastPoll<200)return;lastPoll=now;pending=true;const current=generation;
  void post('frame',{spraying:frame.spraying,progress:frame.progress,complete:frame.complete}).then(s=>{
   if(current!==generation)return;snapshot=s;lastReceived=performance.now();
   const message=s.world?.mailboxes?.player?.at(-1);
   say(s.status==='stopped'?'CREW · session ended':s.error?'CREW · teammate unavailable':s.pressure?'CREW · water pressure ready':message?`CREW · ${String(message.text).slice(0,140)}`:'CREW · setting up your water supply…');
  }).catch(()=>{if(current===generation)say('CREW · connection lost, water paused');}).finally(()=>{if(current===generation)pending=false;});
 }
 return {update,async reset(){const current=++generation,needsStop=started||starting||!!startRequest;stopped=true;try{await startRequest;if(needsStop)await post('stop',{});}catch{}if(current!==generation)return;started=false;starting=false;pending=false;snapshot=null;startRequest=null;stopped=false;say('CREW · waiting for your hands');},snapshot:()=>snapshot,telemetry:()=>snapshot?{id:snapshot.id,status:snapshot.status,pressure:snapshot.pressure,actors:snapshot.actors.map((a:any)=>({id:a.id,model:a.model,position:a.position,activity:a.activity,decisions:a.decisions}))}:null,pressure:()=>performance.now()-lastReceived<2000?(snapshot?.pressure??0):0,
  dispose(){generation++;stopped=true;notice.remove();const stop=()=>fetch('/api/crew/stop',{method:'POST',headers:{'Content-Type':'application/json','X-Forest-Crew':'1'},body:'{}',keepalive:true}).catch(()=>{});if(started||starting||startRequest)void Promise.resolve(startRequest).then(stop,stop);}};
}
