import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Only game dynamic tools are exposed. Authentication stays in the user's
// existing Codex installation; this bridge never reads or copies credentials.
const DISABLED=['shell_tool','unified_exec','apply_patch_freeform','apps','plugins','connectors','browser_use','computer_use','image_generation','imagegenext','view_image','multi_agent','collab','goals','memories','memory_tool','skill_search','tool_search','web_search','web_search_request','web_search_cached','standalone_web_search','js_repl','in_app_browser','hooks','codex_hooks','plugin_hooks'];
export class CodexProvider {
 constructor({binary='codex',timeoutMs=90000,maxToolCalls=14}={}){this.binary=binary;this.timeoutMs=timeoutMs;this.maxToolCalls=maxToolCalls;this.pending=new Map();this.actors=new Map();this.sequence=0;this.closed=false;}
 async start(){
  this.cwd=await mkdtemp(join(tmpdir(),'forest-crew-agent-'));
  const args=['app-server','--stdio',...DISABLED.flatMap(name=>['-c',`features.${name}=false`]),'-c','features.code_mode_host=true','-c','features.skip_host_skill_discovery=true','-c','web_search="disabled"','-c','project_doc_max_bytes=0','-c','approval_policy="never"','-c','sandbox_mode="read-only"'];
  // Deliberately do not pass the host's unrelated API keys to this child.
  const env=Object.fromEntries(['PATH','HOME','CODEX_HOME','TMPDIR','LANG','SSL_CERT_FILE','SSL_CERT_DIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  this.child=spawn(this.binary,args,{cwd:this.cwd,env,stdio:['pipe','pipe','pipe']});
  this.child.stderr.on('data',()=>{}); // May contain private host config; never relay to browser.
  this.child.on('error',()=>this.failAll(new Error('Codex could not start. Install and log in with codex login.')));
  this.child.on('exit',()=>this.failAll(new Error('Codex disconnected.')));
  this.lines=createInterface({input:this.child.stdout});this.lines.on('line',line=>{try{void this.receive(JSON.parse(line)).catch(()=>this.failAll(new Error('Codex protocol handler failed.')));}catch{this.failAll(new Error('Invalid Codex protocol response.'));}});
  await this.request('initialize',{clientInfo:{name:'forest-crew',version:'0.2.0'},capabilities:{experimentalApi:true}});
  this.send({method:'initialized'});
  const config=await this.request('config/read',{includeLayers:false});
  this.threadConfig=Object.fromEntries(Object.keys(config.config?.mcp_servers??{}).map(name=>[`mcp_servers.${name}.enabled`,false]));
  this.models=[];let cursor;
  do {const page=await this.request('model/list',{limit:100,includeHidden:false,...(cursor?{cursor}:{})});this.models.push(...page.data);cursor=page.nextCursor;}while(cursor);
  return this.models.map(m=>({id:m.model,displayName:m.displayName,efforts:m.supportedReasoningEfforts}));
 }
 send(message){if(this.closed||!this.child?.stdin.writable)throw new Error('Codex disconnected.');this.child.stdin.write(JSON.stringify(message)+'\n');}
 request(method,params){return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timed out`));},15000);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
 async receive(message){
  if(message.method&&message.id!==undefined){
   if(message.method!=='item/tool/call'){this.send({id:message.id,error:{code:-32601,message:'Only game tools are supported'}});return;}
   const p=message.params,actor=this.actors.get(p.threadId),turn=actor?.turn;
   let result={ok:false,error:'turn_inactive'};
   if(turn&&!turn.finished&&(turn.id&&turn.id===p.turnId)&&++turn.calls<=this.maxToolCalls){try{result=await turn.execute(p.tool,p.arguments,p.callId,turn.controller.signal);}catch{result={ok:false,error:'game_tool_failed'};}}
   else if(turn)result={ok:false,error:'tool_budget_exhausted',instruction:'End this turn now.'};
   if(!this.closed)this.send({id:message.id,result:{contentItems:[{type:'inputText',text:JSON.stringify(result)}],success:result.ok!==false}});
   if(turn?.calls>this.maxToolCalls)void this.interrupt(actor);
   return;
  }
  if(message.id!==undefined){const p=this.pending.get(message.id);if(p){clearTimeout(p.timer);this.pending.delete(message.id);message.error?p.reject(new Error(String(message.error.message))):p.resolve(message.result);}return;}
  const p=message.params??{};if(message.method==='error'){this.lastError=p.error?.message??'provider_error';if(process.env.FOREST_CREW_DEBUG)console.error('Provider error:',this.lastError);}const actor=this.actors.get(p.threadId),turn=actor?.turn;
  if(!turn)return;
  if(message.method==='turn/started')turn.id=p.turn?.id;
  if(message.method==='thread/tokenUsage/updated')turn.usage=p.tokenUsage?.last??null;
  if(message.method==='item/completed'&&p.item?.type==='agentMessage')turn.text=p.item.text;
  if(message.method==='turn/completed'){
   turn.finished=true;clearTimeout(turn.timer);turn.controller.abort();actor.turn=null;
   p.turn?.status==='completed'?turn.resolve({text:turn.text??'',usage:turn.usage,calls:turn.calls}):turn.reject(new Error('Model turn interrupted or failed.'));
  }
 }
 async createActor({id,model,instructions,tools}){
  if(!this.models.some(m=>m.model===model))throw new Error(`Model not advertised by this Codex account: ${model}`);
  const result=await this.request('thread/start',{model,allowProviderModelFallback:false,environments:[],cwd:this.cwd,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',baseInstructions:instructions,developerInstructions:'Use only the supplied game tools. No file, shell, network, browser or external tools. End a turn when waiting for the player or a teammate.',config:this.threadConfig,dynamicTools:tools});
  const actor={id,threadId:result.thread.id,model,turn:null};this.actors.set(actor.threadId,actor);return actor;
 }
 async decide(actor,prompt,execute){
  if(actor.turn)throw new Error('Actor already thinking');
  return new Promise((resolve,reject)=>{
   const turn={resolve,reject,execute,calls:0,controller:new AbortController(),finished:false};actor.turn=turn;
   turn.timer=setTimeout(()=>{void this.interrupt(actor);},this.timeoutMs);
   this.request('turn/start',{threadId:actor.threadId,environments:[],input:[{type:'text',text:prompt}],effort:'low',summary:'none'}).then(r=>{turn.id=r.turn?.id;}).catch(e=>{clearTimeout(turn.timer);actor.turn=null;turn.controller.abort();reject(e);});
  });
 }
 async interrupt(actor){const turn=actor?.turn;if(!turn)return;turn.finished=true;turn.controller.abort();clearTimeout(turn.timer);actor.turn=null;turn.reject(new Error('Model turn stopped by time or tool limit.'));if(turn.id&&!this.closed)await this.request('turn/interrupt',{threadId:actor.threadId,turnId:turn.id}).catch(()=>{});}
 async disposeActor(actor){if(!actor)return;await this.interrupt(actor);this.actors.delete(actor.threadId);if(!this.closed)await this.request('thread/unsubscribe',{threadId:actor.threadId}).catch(()=>{});}
 failAll(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();for(const actor of this.actors.values()){const turn=actor.turn;if(turn){clearTimeout(turn.timer);turn.controller.abort();turn.reject(error);actor.turn=null;}}}
 async close(){if(this.closed)return;this.closed=true;this.failAll(new Error('Crew stopped'));this.lines?.close();this.child?.kill();if(this.cwd)await rm(this.cwd,{recursive:true,force:true});}
}
