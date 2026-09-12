import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

const serviceKey=process.env.FOREST_PLAYTEST_SERVICE_KEY||'';
if(serviceKey)console.log('Optional private review copy enabled for this local session.');
else console.log('Private review copy unavailable; local browser capture remains enabled.');
const vite=spawn(resolve(root,'node_modules/.bin/vite'),['--host','127.0.0.1','--port','4180'],{cwd:root,stdio:'inherit',env:{...process.env,...(serviceKey?{FOREST_PLAYTEST_SERVICE_KEY:serviceKey,VITE_PLAYTEST_BASE_URL:'/'}:{})}});
let forwarding=false;const forward=signal=>{if(forwarding)return;forwarding=true;if(!vite.killed)vite.kill(signal);};
process.on('SIGINT',()=>forward('SIGINT'));process.on('SIGTERM',()=>forward('SIGTERM'));
vite.once('error',()=>{console.error('Could not start the local development server.');process.exitCode=1;});
vite.once('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGINT'?130:signal==='SIGTERM'?143:signal?1:0);});
