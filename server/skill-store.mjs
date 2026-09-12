import {lstat,mkdir,readFile,readdir,rename,rm,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

const ACTORS=new Set(['firefighter','engineer']);
const SKILL_ID=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ok=value=>({ok:true,...value});
const fail=error=>({ok:false,error});
const safeActor=actorId=>ACTORS.has(actorId);
const safeId=id=>typeof id==='string'&&id.length<=48&&SKILL_ID.test(id);

async function safeDirectory(path,{create=false}={}){
 try{const entry=await lstat(path);if(!entry.isDirectory()||entry.isSymbolicLink())throw new Error('unsafe_directory');}
 catch(cause){if(cause?.code!=='ENOENT'||!create)throw cause;await mkdir(path,{recursive:false,mode:0o700});}
 return path;
}
async function safeFile(path){const entry=await lstat(path);if(!entry.isFile()||entry.isSymbolicLink())throw new Error('unsafe_file');return path;}
async function usage(path){let bytes=0;for(const entry of await readdir(path,{withFileTypes:true})){const child=join(path,entry.name);if(entry.isSymbolicLink())throw new Error('unsafe_directory');if(entry.isDirectory())bytes+=await usage(child);else if(entry.isFile())bytes+=(await lstat(child)).size;else throw new Error('unsafe_directory');}return bytes;}
const versionName=version=>String(version).padStart(6,'0');

export async function createSkillStore({directory,maxBytes=1_000_000}={}){
 if(typeof directory!=='string'||!directory||!Number.isSafeInteger(maxBytes)||maxBytes<=0)throw new TypeError('invalid skill store options');
 const root=resolve(directory);await mkdir(dirname(root),{recursive:true});
 try{await safeDirectory(root,{create:true});}catch{throw new TypeError('unsafe skill store directory');}
 const rootIdentity=await lstat(root);const checkRoot=async()=>{const current=await lstat(root);if(!current.isDirectory()||current.isSymbolicLink()||current.dev!==rootIdentity.dev||current.ino!==rootIdentity.ino)throw new Error('unsafe_directory');};
 // This queue provides atomic publication ordering within one process. The directory must have only one writer process.
 let writes=Promise.resolve();
 const actorDirectory=async(actorId,{create=false}={})=>{await checkRoot();if(!safeActor(actorId))throw new Error('invalid_actor');return safeDirectory(join(root,actorId),{create});};
 const skillDirectory=async(actorId,id,{create=false}={})=>{if(!safeId(id))throw new Error('invalid_skill_id');const actor=await actorDirectory(actorId,{create});return safeDirectory(join(actor,id),{create});};
 const versions=async(actorId,id)=>{const path=await skillDirectory(actorId,id);const entries=await readdir(path,{withFileTypes:true});if(entries.some(entry=>entry.isSymbolicLink()))throw new Error('unsafe_directory');return entries.filter(entry=>entry.isDirectory()&&/^\d{6}$/.test(entry.name)).map(entry=>Number(entry.name)).sort((a,b)=>a-b);};
 const currentMetadata=async(actorId,id)=>{const found=await versions(actorId,id),version=found.at(-1);if(!version)return null;const path=join(root,actorId,id,versionName(version));await safeDirectory(path);const file=join(path,'metadata.json');await safeFile(file);return JSON.parse(await readFile(file,'utf8'));};
 const listUnlocked=async actorId=>{
  if(!safeActor(actorId))return fail('invalid_actor');let actor;try{actor=await actorDirectory(actorId);}catch(cause){if(cause?.code==='ENOENT')return ok({skills:[]});return fail(cause.message==='unsafe_directory'?'unsafe_directory':'read_failed');}
  try{const entries=await readdir(actor,{withFileTypes:true}),skills=[];for(const entry of entries){if(entry.isSymbolicLink())return fail('unsafe_directory');if(!entry.isDirectory()||!safeId(entry.name))continue;const metadata=await currentMetadata(actorId,entry.name);if(metadata)skills.push(metadata);}skills.sort((a,b)=>a.id.localeCompare(b.id));return ok({skills});}catch{return fail('read_failed');}
 };
 const readUnlocked=async(actorId,id)=>{
  if(!safeActor(actorId))return fail('invalid_actor');if(!safeId(id))return fail('invalid_skill_id');
  try{const metadata=await currentMetadata(actorId,id);if(!metadata)return fail('skill_not_found');const file=join(root,actorId,id,versionName(metadata.version),'SKILL.md');await safeFile(file);const body=await readFile(file,'utf8');return ok({skill:{...metadata,body}});}catch(cause){return fail(cause?.code==='ENOENT'?'skill_not_found':cause?.message==='unsafe_directory'?'unsafe_directory':cause?.message==='unsafe_file'?'unsafe_file':'read_failed');}
 };
 const saveUnlocked=async(actorId,input,availableEvents)=>{
  if(!safeActor(actorId))return fail('invalid_actor');if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='body,evidence,id,parentIds,title'||!safeId(input.id))return fail('invalid_skill');
  const {id}=input,title=typeof input.title==='string'?input.title.trim():'',body=input.body,evidence=input.evidence,parentIds=input.parentIds;
  if(!title||title.length>120||typeof body!=='string'||!body.trim()||body.length>6000||!Array.isArray(evidence)||!evidence.length||!evidence.every(Number.isSafeInteger)||new Set(evidence).size!==evidence.length||!Array.isArray(parentIds)||new Set(parentIds).size!==parentIds.length||!parentIds.every(safeId)||parentIds.includes(id)||!Array.isArray(availableEvents))return fail('invalid_skill');
  const eligibleEvents=availableEvents.filter(event=>event&&Number.isSafeInteger(event.sequence)),events=new Map(eligibleEvents.map(event=>[event.sequence,event]));if(events.size!==eligibleEvents.length||!evidence.every(sequence=>events.has(sequence)))return fail('invalid_evidence');
  if(!evidence.some(sequence=>{const event=events.get(sequence);return event.actorId===actorId&&(event.type==='TaskCompleted'||event.type==='TaskActivated');}))return fail('invalid_evidence');
  let actorSkills;try{actorSkills=await listUnlocked(actorId);}catch{return fail('read_failed');}if(!actorSkills.ok)return actorSkills;const graph=new Map(actorSkills.skills.map(skill=>[skill.id,skill.parentIds]));if(!parentIds.every(parent=>graph.has(parent)))return fail('parent_not_found');graph.set(id,parentIds);
  const visiting=new Set(),visited=new Set(),cyclic=node=>{if(visiting.has(node))return true;if(visited.has(node))return false;visiting.add(node);for(const parent of graph.get(node)||[])if(cyclic(parent))return true;visiting.delete(node);visited.add(node);return false;};if([...graph.keys()].some(cyclic))return fail('cyclic_parent');
  let priorVersions=[];try{priorVersions=await versions(actorId,id);}catch(cause){if(cause?.code!=='ENOENT')return fail(cause?.message==='unsafe_directory'?'unsafe_directory':'read_failed');}
  const evidenceEvents=evidence.map(sequence=>{const event=events.get(sequence);return {sequence,type:event.type,actorId:event.actorId,taskId:typeof event.taskId==='string'?event.taskId:null,episodeId:typeof event.episodeId==='string'?event.episodeId:null};});
  const version=(priorVersions.at(-1)||0)+1,metadata={id,title,actorId,version,parentIds:[...parentIds],evidence:[...evidence],evidenceEvents,createdAt:new Date().toISOString()},metadataText=JSON.stringify(metadata,null,2),required=Buffer.byteLength(metadataText)+Buffer.byteLength(body);
  try{await checkRoot();if(await usage(root)+required>maxBytes)return fail('capacity_exceeded');const actor=await actorDirectory(actorId,{create:true}),skill=await skillDirectory(actorId,id,{create:true}),stage=join(skill,`.stage-${randomUUID()}`),destination=join(skill,versionName(version));await mkdir(stage,{mode:0o700});try{await Promise.all([writeFile(join(stage,'metadata.json'),metadataText,{flag:'wx',mode:0o600}),writeFile(join(stage,'SKILL.md'),body,{flag:'wx',mode:0o600})]);await rename(stage,destination);}catch(cause){await rm(stage,{recursive:true,force:true});throw cause;}void actor;return ok({skill:metadata});}catch(cause){return fail(cause?.message==='unsafe_directory'?'unsafe_directory':'write_failed');}
 };
 const serialized=fn=>{const result=writes.then(fn,fn);writes=result.then(()=>{},()=>{});return result;};
 return {list:actorId=>writes.then(()=>listUnlocked(actorId)),read:(actorId,id)=>writes.then(()=>readUnlocked(actorId,id)),save:(actorId,input,events)=>serialized(()=>saveUnlocked(actorId,input,events))};
}
