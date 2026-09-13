import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createDailyAdmissions,createHostedAccess,parseHostedConfig} from '../server/hosted-access.mjs';
import {createCrewHttpHandler} from '../server/http-server.mjs';

const EDGE='edge-secret-abcdefghijklmnopqrstuvwxyz-123456';
const INVITE='invite-secret-abcdefghijklmnopqrstuvwxyz-1234';
const ORIGIN='https://seahyingcong.com';
const models=[{id:'gpt-5.6-sol'}];

async function temporary(t){const directory=await mkdtemp(join(tmpdir(),'forest-crew-hosted-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
function hostedConfig(overrides={}){return parseHostedConfig({FOREST_CREW_PUBLIC_ORIGIN:ORIGIN,FOREST_CREW_EDGE_KEY:EDGE,FOREST_CREW_INVITE_KEY:INVITE,FOREST_CREW_DAILY_SESSIONS:'2',...overrides});}
function cookieValue(setCookie){return setCookie.split(';',1)[0];}
async function fixture(t,{limit='2'}={}){
 const directory=await temporary(t),config=hostedConfig({FOREST_CREW_DAILY_SESSIONS:limit});
 const access=createHostedAccess({config,directory});let starts=0,telemetry=0;
 const createSession=()=>{let status='starting';return {start(){starts++;status='running';},async stop(){status='stopped';},tick(){},playerTelemetry(){telemetry++;},snapshot(){return {id:`fixture-${starts}`,status};}};};
 const bridge=createCrewHttpHandler({port:0,bind:'127.0.0.1',config,access,getProviderState:()=>({providerReady:true,models}),createSession});
 const server=createServer(bridge.handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function request(path,{method='GET',cookie,edge=EDGE,origin=ORIGIN,json}={}){const headers={};if(edge!==null)headers['X-Forest-Crew-Edge']=edge;if(origin)headers.Origin=origin;if(cookie)headers.Cookie=cookie;if(json!==undefined){headers['X-Forest-Crew']='1';headers['Content-Type']='application/json';}const response=await fetch(`${base}${path}`,{method,headers,body:json===undefined?undefined:JSON.stringify(json)});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};}
 const login=async()=>cookieValue((await request('/api/crew/access',{method:'POST',json:{invite:INVITE}})).cookie);
 return {request,login,get starts(){return starts;},get telemetry(){return telemetry;},directory};
}

test('hosted configuration fails closed while local defaults remain loopback-compatible',()=>{
 assert.deepEqual(parseHostedConfig({}),{hosted:false,bind:'127.0.0.1',cookiePath:'/api/crew',dailyLimit:null,publicOrigin:null});
 assert.throws(()=>hostedConfig({FOREST_CREW_EDGE_KEY:'short'}),/32 bytes/);
 assert.throws(()=>hostedConfig({FOREST_CREW_INVITE_KEY:EDGE}),/must be different/);
 assert.throws(()=>hostedConfig({FOREST_CREW_BIND:'0.0.0.0'}),/FOREST_CREW_BIND/);
});

test('access tokens are signed, scoped, secure, and expire after 24 hours',async t=>{
 const directory=await temporary(t);let now=1_800_000_000_000;const config=hostedConfig();const access=createHostedAccess({config,directory,now:()=>now});
 assert.equal(access.issueAccessCookie('wrong'),null);
 const cookie=access.issueAccessCookie(INVITE);
 assert.match(cookie,/^crew_access=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Path=\/api\/forest-crew/);
 assert.equal(access.authenticated(cookieValue(cookie)),true);
 assert.equal(access.authenticated(`${cookieValue(cookie)}x`),false);
 now+=86400001;assert.equal(access.authenticated(cookieValue(cookie)),false);
});

test('daily admission reservations serialize and survive a new ledger instance',async t=>{
 const directory=await temporary(t),now=()=>Date.UTC(2026,8,13,12);
 const first=createDailyAdmissions({directory,limit:2,now});
 const results=await Promise.all([first.reserve(),first.reserve(),first.reserve()]);
 assert.equal(results.filter(result=>result.ok).length,2);assert.equal(results.filter(result=>!result.ok).length,1);
 const restarted=createDailyAdmissions({directory,limit:2,now});assert.deepEqual(await restarted.status(),{day:'2026-09-13',limit:2,used:2,remaining:0});assert.equal((await restarted.reserve()).ok,false);
});

test('daily admission ledger rejects malformed counters instead of reopening quota',async t=>{
 const directory=await temporary(t),file=join(directory,'daily-admissions.json'),now=()=>Date.UTC(2026,8,13,12);
 for(const invalid of [-1,1.5,'1',null]){
  await writeFile(file,JSON.stringify({version:1,days:{'2026-09-13':invalid}}));
  const ledger=createDailyAdmissions({directory,limit:8,now});
  await assert.rejects(ledger.status(),/invalid ledger/);
  await assert.rejects(ledger.reserve(),/invalid ledger/);
 }
});

test('hosted HTTP rejects non-edge and unauthenticated calls before actor work',async t=>{
 const app=await fixture(t);
 assert.equal((await app.request('/api/crew/status',{edge:null})).status,403);
 const publicStatus=await app.request('/api/crew/status');assert.equal(publicStatus.status,200);assert.equal(publicStatus.body.authenticated,false);assert.equal(publicStatus.body.localOnly,false);
 assert.equal((await app.request('/api/crew/session',{method:'POST',json:{}})).status,403);assert.equal(app.starts,0);
 assert.equal((await app.request('/api/crew/access',{method:'POST',origin:'https://evil.example',json:{invite:INVITE}})).status,403);
 assert.equal((await app.request('/api/crew/access',{method:'POST',json:{invite:'wrong'}})).status,403);
 assert.equal(app.starts,0);
});

test('session auth, owner isolation, model validation, restart quota, and cookie flags are enforced',async t=>{
 const app=await fixture(t),accessCookie=await app.login();
 const invalid=await app.request('/api/crew/session',{method:'POST',cookie:accessCookie,json:{models:['not-real','gpt-5.6-sol']}});assert.equal(invalid.status,400);assert.equal(invalid.body.error,'model_unavailable');
 let status=await app.request('/api/crew/status',{cookie:accessCookie});assert.equal(status.body.sessionLimit.used,0);
 const created=await app.request('/api/crew/session',{method:'POST',cookie:accessCookie,json:{}});assert.equal(created.status,201);assert.match(created.cookie,/Secure/);assert.match(created.cookie,/Path=\/api\/forest-crew/);assert.equal(app.starts,1);
 const ownerCookie=`${accessCookie}; ${cookieValue(created.cookie)}`;
 assert.equal((await app.request('/api/crew/frame',{method:'POST',cookie:accessCookie,json:{}})).status,401);assert.equal(app.telemetry,0);
 assert.equal((await app.request('/api/crew/session',{method:'POST',cookie:accessCookie,json:{}})).status,409);assert.equal(app.starts,1);
 const restarted=await app.request('/api/crew/session',{method:'POST',cookie:ownerCookie,json:{}});assert.equal(restarted.status,201);assert.equal(app.starts,2);
 const newestOwner=`${accessCookie}; ${cookieValue(restarted.cookie)}`;assert.equal((await app.request('/api/crew/frame',{method:'POST',cookie:newestOwner,json:{}})).status,200);assert.equal(app.telemetry,1);
 const limited=await app.request('/api/crew/session',{method:'POST',cookie:newestOwner,json:{}});assert.equal(limited.status,429);assert.equal(limited.body.sessionLimit.used,2);assert.equal(app.starts,2);
});

test('concurrent admissions preserve the single active session guard',async t=>{
 const app=await fixture(t,{limit:'8'}),accessCookie=await app.login();
 const responses=await Promise.all([
  app.request('/api/crew/session',{method:'POST',cookie:accessCookie,json:{}}),
  app.request('/api/crew/session',{method:'POST',cookie:accessCookie,json:{}}),
 ]);
 assert.deepEqual(responses.map(response=>response.status).sort(),[201,409]);
 assert.equal(app.starts,1);
 const status=await app.request('/api/crew/status',{cookie:accessCookie});
 assert.equal(status.body.sessionLimit.used,1);
});

test('waiting roster requires hosted access and never admits or starts a model session',async t=>{
 const f=await fixture(t);
 const publicStatus=await f.request('/api/crew/status');assert.deepEqual(publicStatus.body.roster,[]);
 const cookie=await f.login(),status=await f.request('/api/crew/status',{cookie});
 assert.equal(status.body.roster.length,2);assert.ok(status.body.roster.every(a=>a.activity==='waiting'&&a.model==='gpt-5.6-sol'));
 assert.equal(status.body.sessionLimit.used,0);assert.equal(f.starts,0);
});
