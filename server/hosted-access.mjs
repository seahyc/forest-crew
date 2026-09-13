import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const ACCESS_PURPOSE='forest-crew-access-v1';
const DAY_PATTERN=/^\d{4}-\d{2}-\d{2}$/;

function safeEqual(left,right){
 if(typeof left!=='string'||typeof right!=='string')return false;
 const a=Buffer.from(left),b=Buffer.from(right);
 return a.length===b.length&&timingSafeEqual(a,b);
}
function requireStrongSecret(name,value){if(typeof value!=='string'||Buffer.byteLength(value)<32)throw new Error(`${name} must contain at least 32 bytes`);return value;}
function parseCookie(header,name){return (header??'').split(';').map(value=>value.trim()).find(value=>value.startsWith(`${name}=`))?.slice(name.length+1)??null;}

export function parseHostedConfig(env=process.env){
 const publicOrigin=env.FOREST_CREW_PUBLIC_ORIGIN?.trim()||null;
 const bind=env.FOREST_CREW_BIND?.trim()||'127.0.0.1';
 const cookiePath=env.FOREST_CREW_COOKIE_PATH?.trim()||'/api/forest-crew';
 const dailyLimit=Number(env.FOREST_CREW_DAILY_SESSIONS||8);
 if(!publicOrigin)return {hosted:false,bind:'127.0.0.1',cookiePath:'/api/crew',dailyLimit:null,publicOrigin:null};
 let parsed;try{parsed=new URL(publicOrigin);}catch{throw new Error('FOREST_CREW_PUBLIC_ORIGIN must be a valid URL');}
 if(parsed.protocol!=='https:'||parsed.origin!==publicOrigin||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error('FOREST_CREW_PUBLIC_ORIGIN must be an HTTPS origin without a path');
 if(!['127.0.0.1','172.18.0.1'].includes(bind))throw new Error('FOREST_CREW_BIND must be 127.0.0.1 or 172.18.0.1');
 if(!cookiePath.startsWith('/')||/[;\r\n]/.test(cookiePath))throw new Error('FOREST_CREW_COOKIE_PATH must be an absolute cookie path');
 if(!Number.isSafeInteger(dailyLimit)||dailyLimit<1)throw new Error('FOREST_CREW_DAILY_SESSIONS must be a positive integer');
 const edgeKey=requireStrongSecret('FOREST_CREW_EDGE_KEY',env.FOREST_CREW_EDGE_KEY);
 const inviteKey=requireStrongSecret('FOREST_CREW_INVITE_KEY',env.FOREST_CREW_INVITE_KEY);
 if(safeEqual(edgeKey,inviteKey))throw new Error('FOREST_CREW_EDGE_KEY and FOREST_CREW_INVITE_KEY must be different');
 return {hosted:true,bind,cookiePath,dailyLimit,publicOrigin,edgeKey,inviteKey};
}

export function createDailyAdmissions({directory,limit,now=()=>Date.now()}={}){
 const file=join(directory,'daily-admissions.json');let chain=Promise.resolve();
 const day=()=>new Date(now()).toISOString().slice(0,10);
 async function load(){try{const value=JSON.parse(await readFile(file,'utf8'));if(value?.version!==1||typeof value.days!=='object'||value.days===null||Array.isArray(value.days)||Object.entries(value.days).some(([key,count])=>!DAY_PATTERN.test(key)||!Number.isSafeInteger(count)||count<0))throw new Error('invalid ledger');return value;}catch(error){if(error?.code==='ENOENT')return {version:1,days:{}};throw error;}}
 async function persist(value){await mkdir(directory,{recursive:true,mode:0o700});const temporary=`${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;await writeFile(temporary,`${JSON.stringify(value)}\n`,{mode:0o600});await rename(temporary,file);}
 function serialized(operation){const result=chain.then(operation);chain=result.catch(()=>{});return result;}
 const status=()=>serialized(async()=>{const value=await load(),key=day(),used=value.days[key]??0;return {day:key,limit,used,remaining:Math.max(0,limit-used)};});
 const reserve=()=>serialized(async()=>{const value=await load(),key=day(),used=value.days[key]??0;if(used>=limit)return {ok:false,day:key,limit,used,remaining:0};value.days={[key]:used+1};await persist(value);return {ok:true,day:key,limit,used:used+1,remaining:limit-used-1};});
 return {status,reserve};
}

export function createHostedAccess({config,directory,now=()=>Date.now()}={}){
 if(!config?.hosted)return null;
 const admissions=createDailyAdmissions({directory,limit:config.dailyLimit,now});
 const sign=payload=>createHmac('sha256',config.edgeKey).update(`${ACCESS_PURPOSE}.${payload}`).digest('base64url');
 function issueAccessCookie(invite){if(!safeEqual(invite,config.inviteKey))return null;const payload=Buffer.from(JSON.stringify({purpose:ACCESS_PURPOSE,expiresAt:now()+86400000,nonce:randomBytes(16).toString('base64url')})).toString('base64url');return `crew_access=${payload}.${sign(payload)}; HttpOnly; Secure; SameSite=Strict; Path=${config.cookiePath}; Max-Age=86400`;}
 function authenticated(cookieHeader){const token=parseCookie(cookieHeader,'crew_access');if(!token)return false;const separator=token.lastIndexOf('.');if(separator<1)return false;const payload=token.slice(0,separator),signature=token.slice(separator+1);if(!safeEqual(signature,sign(payload)))return false;try{const value=JSON.parse(Buffer.from(payload,'base64url').toString());return value.purpose===ACCESS_PURPOSE&&Number.isFinite(value.expiresAt)&&value.expiresAt>now();}catch{return false;}}
 return {admissions,edgeAllowed:value=>safeEqual(value,config.edgeKey),issueAccessCookie,authenticated};
}

export {parseCookie,safeEqual};
