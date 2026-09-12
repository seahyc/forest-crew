import {BrowserPlaytestSession} from './browser-playtest-session.mjs';
import {PlaytestSession} from './playtest-session.mjs';

const MAX_REMOTE_PENDING=2*1024*1024;
const REMOTE_WAIT_MS=3000;
const textBytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
const delay=ms=>new Promise(resolve=>setTimeout(()=>resolve('timeout'),ms));

export function createBoundedFetch(fetchImpl,timeoutMs){
 return async (url,init={})=>{
  const controller=new AbortController(),external=init.signal;
  const forwardAbort=()=>controller.abort(external.reason);
  if(external?.aborted)forwardAbort();
  else external?.addEventListener('abort',forwardAbort,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('Remote request timed out','TimeoutError')),timeoutMs);
  try{return await fetchImpl(url,{...init,signal:controller.signal});}
  finally{clearTimeout(timer);external?.removeEventListener('abort',forwardAbort);}
 };
}

export class MirroredPlaytestSession{
 constructor({now=()=>performance.now(),onStatus=(_status)=>{},store,baseUrl='/',fetchImpl=globalThis.fetch,remoteEnabled=true,remoteTimeoutMs=2500,remoteWaitMs=REMOTE_WAIT_MS}={}){
  this.now=now;
  this.onStatus=onStatus;
  this.local=new BrowserPlaytestSession({now,store,onStatus:()=>this.status()});
  this.remoteEnabled=remoteEnabled&&typeof fetchImpl==='function';
	  const boundedFetch=createBoundedFetch(fetchImpl,remoteTimeoutMs);
  this.createRemote=()=>this.remoteEnabled?new PlaytestSession({now,baseUrl,fetchImpl:boundedFetch,retryDelays:[]}):null;
  this.remote=this.createRemote();
  this.remoteState=this.remoteEnabled?'pending':'unavailable';
  this.remoteError='';
  this.remoteSavedBytes=0;
  this.remotePendingBytes=0;
  this.remoteDroppedBytes=0;
  this.remoteDroppedItems=0;
  this.remoteLimited=false;
  this.remoteCutoff=false;
  this.remoteQueue=[];
  this.remoteGeneration=0;
  this.remoteStart=Promise.resolve();
  this.remoteWork=Promise.resolve();
  this.remoteWaitMs=remoteWaitMs;
 }

 get state(){return this.local.state;}
 get session(){return this.local.session;}
 get started(){return this.local.started;}
 get savedBytes(){return this.local.savedBytes;}
 get queuedBytes(){return this.local.queuedBytes;}
 get error(){return this.local.error;}

 status(extra={}){
  this.onStatus({state:this.state,session:this.session.slice(0,8),savedBytes:this.savedBytes,queuedBytes:this.queuedBytes,error:this.error,remoteState:this.remoteState,remoteError:this.remoteError,remoteSavedBytes:this.remoteSavedBytes,remotePendingBytes:this.remotePendingBytes,remoteDroppedBytes:this.remoteDroppedBytes,remoteDroppedItems:this.remoteDroppedItems,remoteLimited:this.remoteLimited,remoteCutoff:this.remoteCutoff,...extra});
 }

 async optIn(options={}){
  const result=await this.local.optIn(options);
  if(this.local.state!=='recording')return result;
  this.remoteGeneration++;
  this.remoteCutoff=false;
  if(!this.remote||this.remote.state!=='undecided')this.remote=this.createRemote();
  if(this.remote){
   const generation=this.remoteGeneration;
   const remote=this.remote;
   this.remoteState='pending';
   this.remoteStart=this.startRemote(remote,generation,options);
  }else this.remoteState='unavailable';
  this.status();
  return result;
 }

 async startRemote(remote,generation,options){
  try{
   await remote.optIn(options);
   remote.started=this.local.started;
   if(generation!==this.remoteGeneration||this.remoteCutoff||!['recording','starting'].includes(this.local.state)){
    if(remote.state==='recording')await remote.stop();
    return;
   }
   this.remoteState='recording';
   remote.recordAt('session-link',{version:'0.15.1-mirrored',browserSession:this.local.session},0);
   const queued=this.remoteQueue.splice(0);
   this.remotePendingBytes=0;
   for(const item of queued){
    if(generation!==this.remoteGeneration||this.remoteCutoff)break;
    if(item.kind==='record')this.acceptRemoteRecord(remote,item.type,item.data,item.t,item.bytes);
    else if(item.kind==='flush')this.track(remote,remote.flushTelemetry());
    else this.track(remote,remote.uploadClip(item.blob,item.startMs,item.endMs),item.bytes);
   }
  }catch(error){
   if(generation===this.remoteGeneration){this.remoteState='unavailable';this.remoteError=String(error);this.dropQueued();}
  }
  this.status();
 }

 optOut(){
  this.cutoffRemote();
  if(['recording','error'].includes(this.local.state))void this.stop();
  else this.local.optOut();
  this.status();
 }

 reset(){
  if(this.stopping||['starting','stopping'].includes(this.remote?.state))return false;
  if(!this.local.reset())return false;
  this.remoteGeneration++;
  this.remote=this.createRemote();
  this.remoteState=this.remote?'pending':'unavailable';
  this.remoteError='';this.remoteSavedBytes=0;this.remotePendingBytes=0;this.remoteDroppedBytes=0;this.remoteDroppedItems=0;this.remoteLimited=false;this.remoteCutoff=false;this.remoteQueue=[];
  this.status();
  return true;
 }

 record(type,data={}){
  const accepted=this.local.record(type,data);
  if(!accepted||this.remoteCutoff)return accepted;
  const t=Math.max(0,Math.round(this.now()-this.local.started)),size=textBytes({t,type,data});
  if(this.remoteState==='pending')this.queueRemote({kind:'record',type,data:structuredClone(data),t,bytes:size},size);
  else if(this.remoteState==='recording')this.acceptRemoteRecord(this.remote,type,data,t,size);
  return accepted;
 }

 acceptRemoteRecord(remote,type,data,t,size){
  if(!remote.recordAt(type,data,t)){this.remoteLimited=true;this.noteGap(size,'Remote review time limit reached');}
 }

 flushTelemetry(){
  const local=this.local.flushTelemetry();
  if(!this.remoteCutoff){
   if(this.remoteState==='pending')this.queueRemote({kind:'flush'},0);
   else if(this.remoteState==='recording'){const remote=this.remote;this.track(remote,remote.flushTelemetry());}
  }
  return local;
 }

 uploadClip(blob,startMs,endMs){
  const local=this.local.uploadClip(blob,startMs,endMs);
  if(!this.remoteCutoff){
   if(this.remoteState==='pending')this.queueRemote({kind:'clip',blob,startMs,endMs,bytes:blob.size},blob.size);
   else if(this.remoteState==='recording'){const remote=this.remote;this.track(remote,remote.uploadClip(blob,startMs,endMs),blob.size);}
  }
  return local;
 }

 queueRemote(item,size){
  if(item.kind==='flush'&&this.remoteQueue.at(-1)?.kind==='flush')return true;
  const reserved=Math.max(32,size);
  if(this.remotePendingBytes+reserved>MAX_REMOTE_PENDING){this.noteGap(reserved,'Remote startup queue full');return false;}
  this.remoteQueue.push({...item,reserved});this.remotePendingBytes+=reserved;this.status();return true;
 }

 track(remote,promise,bytes=0){
  const generation=this.remoteGeneration;
  this.remoteWork=this.remoteWork.then(()=>promise).then(result=>{
   if(generation!==this.remoteGeneration)return;
   if(result===false)throw new Error('Remote review copy rejected data');
   this.remoteSavedBytes=remote.savedBytes;
   this.status();
  }).catch(error=>{
   if(generation!==this.remoteGeneration)return;
   this.remoteState='unavailable';this.remoteError=String(error);this.noteGap(bytes,'Remote review upload failed');
  });
  return this.remoteWork;
 }

 async stop(){
  if(this.stopping)return this.stopping;
  this.remoteCutoff=true;
  this.dropQueued();
  const remote=this.remote,remoteStart=this.remoteStart,generation=this.remoteGeneration;
  if(remote?.state==='starting')remote.optOut();
  this.stopping=this.finishStop(remote,remoteStart,generation);
  try{await this.stopping;}finally{this.stopping=null;}
 }

 async finishStop(remote,remoteStart,generation){
  await this.local.stop();
  const started=await Promise.race([remoteStart.then(()=>true),delay(this.remoteWaitMs)]);
  if(started==='timeout'){this.remoteState='pending';this.remoteError='Private review session is still starting; browser recording is safe.';this.status();this.deferRemoteFinalization(remote,remoteStart,generation);return;}
  if(generation!==this.remoteGeneration)return;
  if(remote&&['recording','error'].includes(remote.state))this.track(remote,remote.stop());
  const finalWork=this.remoteWork,finished=await Promise.race([finalWork.then(()=>true),delay(this.remoteWaitMs)]);
  if(finished==='timeout'){this.remoteState='pending';this.remoteError='Private review upload is still finishing; browser recording is safe.';this.deferRemoteFinalization(remote,finalWork,generation);}
  else this.settleRemoteFinalization(remote,generation);
  this.status();
 }

 deferRemoteFinalization(remote,work,generation){
  void work.then(()=>this.settleRemoteFinalization(remote,generation)).catch(error=>{
   if(generation!==this.remoteGeneration)return;
   this.remoteState='unavailable';this.remoteError=String(error);this.noteGap(0,'Remote review finalization failed');
  });
 }

 settleRemoteFinalization(remote,generation){
  if(generation!==this.remoteGeneration)return;
  if(remote?.state==='stopped'&&!remote.error&&!this.remoteDroppedItems){this.remoteState='uploaded';this.remoteError='';}
  else if(this.remoteState!=='unavailable'&&this.remoteState!=='off'){this.remoteState='unavailable';this.remoteError=remote?.error||this.remoteError||'Private review copy incomplete';}
  this.status();
 }

 cutoffRemote(){this.remoteGeneration++;this.remoteCutoff=true;this.dropQueued();if(this.remote?.state==='starting')this.remote.optOut();else if(this.remote&&['recording','error'].includes(this.remote.state))void this.remote.stop();if(this.remoteState!=='uploaded')this.remoteState='off';}
 dropQueued(){for(const item of this.remoteQueue)if(item.bytes)this.noteGap(item.bytes,'Remote review queue discarded',false);this.remoteQueue=[];this.remotePendingBytes=0;}
 noteGap(bytes,message,notify=true){this.remoteDroppedBytes+=bytes;this.remoteDroppedItems++;this.remoteError=message;if(notify)this.status();}
 fail(message){this.local.fail(message);}
 snapshot(options={}){return this.local.snapshot(options);}
 list(){return this.local.list();}
 clear(){return this.local.clear();}
}
