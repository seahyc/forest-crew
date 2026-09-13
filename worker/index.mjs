const PREFIX='/api/forest-crew/';
const routes=new Map([['status','GET'],['access','POST'],['session','POST'],['frame','POST'],['stop','POST']]);
const reply=(status,error)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function handleCrewRequest(request,env,fetcher=fetch){
 const url=new URL(request.url),path=url.pathname.slice(PREFIX.length);
 if(url.origin!==env.PUBLIC_ORIGIN||!url.pathname.startsWith(PREFIX)||url.search||!routes.has(path))return reply(404,'not_found');
 if(request.method!==routes.get(path))return reply(405,'method_not_allowed');
 if(!env.FOREST_CREW_EDGE_KEY||env.FOREST_CREW_EDGE_KEY.length<32)return reply(503,'crew_unavailable');
 const origin=request.headers.get('Origin');
 if(origin&&origin!==env.PUBLIC_ORIGIN)return reply(403,'origin_denied');
 const headers=new Headers({'X-Forest-Crew-Edge':env.FOREST_CREW_EDGE_KEY});
 if(origin)headers.set('Origin',origin);
 const cookie=request.headers.get('Cookie');if(cookie)headers.set('Cookie',cookie);
 let body;
 if(request.method==='POST'){
  if(origin!==env.PUBLIC_ORIGIN||request.headers.get('X-Forest-Crew')!=='1'||!request.headers.get('Content-Type')?.startsWith('application/json'))return reply(403,'request_denied');
  if(Number(request.headers.get('Content-Length'))>4096)return reply(413,'body_too_large');
  // Bound streamed bodies too; never buffer an unbounded upload at the edge.
  const reader=request.body?.getReader(),chunks=[];let length=0;
  if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();return reply(413,'body_too_large');}chunks.push(value);}}catch{return reply(400,'invalid_body');}}
  body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  headers.set('Content-Type','application/json');headers.set('X-Forest-Crew','1');
 }
 try{
  const response=await fetcher(`${env.CREW_ORIGIN}/api/crew/${path}`,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(8000)});
  if(response.status>=300&&response.status<400)return reply(502,'crew_unavailable');
  const output=new Headers({'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  for(const cookie of response.headers.getSetCookie())output.append('Set-Cookie',cookie);
  return new Response(response.body,{status:response.status,headers:output});
 }catch{return reply(503,'crew_unavailable');}
}
export default {fetch(request,env){return handleCrewRequest(request,env);}};
