import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const serviceKey=process.env.FOREST_PLAYTEST_SERVICE_KEY||'';
if(serviceKey)console.log('Optional private review copy enabled for this local session.');
else console.log('Private review copy unavailable; local browser capture remains enabled.');
// A normal development launch includes the crew. Reuse an already-running
// loopback bridge and stop only children this launcher owns.
let bridge=null;
const existing=await fetch('http://127.0.0.1:4182/api/crew/status',{signal:AbortSignal.timeout(1000)}).then(r=>r.ok?r.json():null).catch(()=>null);
if(existing?.localOnly)console.log('Using the running local crew bridge.');
else bridge=spawn(process.execPath,['server/index.mjs'],{cwd:root,stdio:'inherit',env:process.env});
const vite=spawn(resolve(root,'node_modules/.bin/vite'),['--host','127.0.0.1','--port','4180'],{cwd:root,stdio:'inherit',env:{...process.env,...(serviceKey?{FOREST_PLAYTEST_SERVICE_KEY:serviceKey,VITE_PLAYTEST_BASE_URL:'/'}:{})}});
let forwarding=false;const forward=signal=>{if(forwarding)return;forwarding=true;if(!vite.killed)vite.kill(signal);if(bridge&&!bridge.killed)bridge.kill(signal);};
process.on('SIGINT',()=>forward('SIGINT'));process.on('SIGTERM',()=>forward('SIGTERM'));
bridge?.once('error',()=>console.error('Crew bridge could not start. Check the Node installation.'));
vite.once('error',()=>{console.error('Could not start the local development server.');if(bridge&&!bridge.killed)bridge.kill('SIGTERM');process.exitCode=1;});
vite.once('exit',(code,signal)=>{if(bridge&&!bridge.killed)bridge.kill('SIGTERM');process.exitCode=code??(signal==='SIGINT'?130:signal==='SIGTERM'?143:signal?1:0);});
