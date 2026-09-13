import {createHash} from 'node:crypto';

const PREFIX='/api/playtests';
const UPSTREAM='https://oracle.seahyingcong.com/hand-walk-api/api/playtests';
const SESSION_VERSION='forest-crew/0.2.2/local-preview';
const ROUTE=/^\/sessions(?:\/[a-f0-9-]{36}\/(?:telemetry|end|clips\/\d{1,9}))?$/;
const json=(res,status,value)=>{const body=JSON.stringify(value);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-length':Buffer.byteLength(body)});res.end(body);};

async function readBody(req,limit){
 const declared=Number(req.headers['content-length']);if(Number.isFinite(declared)&&declared>limit)throw new Error('large');
 const chunks=[];let bytes=0;for await(const chunk of req){const value=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=value.length;if(bytes>limit)throw new Error('large');chunks.push(value);}return Buffer.concat(chunks,bytes);
}

function clientHash(allowedOrigin){return createHash('sha256').update(`forest-crew-local-review:${allowedOrigin}`).digest('hex');}

/** Closed Connect middleware for the Forest Crew local review-copy route. */
export function createPlaytestProxy({serviceKey,fetchImpl=fetch,allowedOrigin='http://127.0.0.1:4180'}={}){
 const anonymousClient=clientHash(allowedOrigin);
 return async function playtestProxy(req,res,next){
  const url=new URL(req.url||'/',allowedOrigin),isPrefix=url.pathname===PREFIX||url.pathname.startsWith(PREFIX+'/');
  if(!isPrefix){next?.();return;}
  if(req.method!=='POST'){json(res,405,{error:'Method not allowed'});return;}
  const suffix=url.pathname.slice(PREFIX.length);if(!ROUTE.test(suffix)){json(res,404,{error:'Not found'});return;}
  if(req.headers.origin!==allowedOrigin){json(res,403,{error:'Origin not allowed'});return;}
  if(typeof serviceKey!=='string'||serviceKey.length===0){json(res,503,{error:'Private review copy unavailable. Browser recording continues.'});return;}
  let body;try{body=await readBody(req,suffix.includes('/clips/')?1024*1024:256*1024);}catch{req.resume();json(res,413,{error:'Upload too large'});return;}
  const headers=new Headers({'x-playtest-service-key':serviceKey,'x-playtest-client':anonymousClient});
  for(const name of ['content-type','content-encoding']){const value=req.headers[name];if(typeof value==='string')headers.set(name,value);}
  const authorization=req.headers.authorization;if(typeof authorization==='string'&&/^Bearer\s+\S+$/i.test(authorization))headers.set('authorization',authorization);
  if(suffix==='/sessions'){
   if(req.headers['content-encoding']){json(res,400,{error:'Invalid session request'});return;}
   try{const input=JSON.parse(body.toString('utf8'));if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('invalid');body=Buffer.from(JSON.stringify({...input,version:SESSION_VERSION}));if(body.length>256*1024){json(res,413,{error:'Upload too large'});return;}headers.set('content-type','application/json');headers.delete('content-encoding');}catch{json(res,400,{error:'Invalid session request'});return;}
  }
  const upstream=new URL(UPSTREAM+suffix);upstream.search=url.search;
  try{
   const result=await fetchImpl(upstream,{method:'POST',headers,body,redirect:'manual',signal:AbortSignal.timeout(12000)});
   if(result.status>=300&&result.status<400||result.status>=500){json(res,503,{error:'Private review copy unavailable. Browser recording continues.'});return;}
   const response=Buffer.from(await result.arrayBuffer());
   if(response.length>2*1024*1024||response.includes(Buffer.from(serviceKey))){json(res,503,{error:'Private review copy unavailable. Browser recording continues.'});return;}
   const type=result.headers.get('content-type');res.writeHead(result.status,{'cache-control':'no-store','x-content-type-options':'nosniff',...(type?{'content-type':type}:{})});res.end(response);
  }catch{json(res,503,{error:'Private review copy unavailable. Browser recording continues.'});}
 };
}
