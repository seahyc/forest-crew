import {createServer} from 'node:http';
import {mkdir,appendFile,stat,rename,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {CodexProvider} from './codex-provider.mjs';
import {createCrewSession,GAME_OXYGEN_COST} from './crew-session.mjs';
import {createSkillStore} from './skill-store.mjs';
import {createHostedAccess,parseHostedConfig} from './hosted-access.mjs';
import {createCrewHttpHandler} from './http-server.mjs';

const port=Number(process.env.FOREST_CREW_PORT||4182);
const directory=resolve(process.env.FOREST_CREW_DATA||'.agent-data');
const config=parseHostedConfig();
await mkdir(directory,{recursive:true,mode:0o700});
const access=createHostedAccess({config,directory});
const skills=await createSkillStore({directory:join(directory,'skills')});
const provider=new CodexProvider({binary:process.env.FOREST_CODEX_BINARY||'codex'});
let models=[],providerReady=false,closed=false,logChain=Promise.resolve();
provider.start().then(result=>{models=result.filter(model=>Object.hasOwn(GAME_OXYGEN_COST,model.id));providerReady=true;console.log(`Crew models: ${models.map(model=>model.id).join(', ')}`);}).catch(()=>console.error('Crew provider unavailable. Check codex login and the installed CLI version.'));
function record(event){logChain=logChain.then(async()=>{const file=join(directory,'events.jsonl');if((await stat(file).catch(()=>({size:0}))).size>500000){await rm(file+'.1',{force:true});await rename(file,file+'.1');}await appendFile(file,JSON.stringify(event)+'\n',{mode:0o600});}).catch(()=>{});}
const bridge=createCrewHttpHandler({port,bind:config.bind,config,access,getProviderState:()=>({providerReady,models}),createSession:chosen=>createCrewSession({provider,models:chosen,skillStore:skills,onEvent:record})});
const server=createServer(bridge.handler);
const timer=setInterval(()=>bridge.tick(.05),50);
server.listen(port,config.bind,()=>console.log(`Forest Crew bridge http://${config.bind}:${port} (${config.hosted?'hosted edge only':'loopback only'})`));
async function close(){if(closed)return;closed=true;clearInterval(timer);await bridge.stop();await provider.close();await logChain;server.close();}
process.on('SIGINT',()=>void close());process.on('SIGTERM',()=>void close());
