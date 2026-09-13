import {defineConfig} from 'vite';
import {createPlaytestProxy} from './scripts/playtest-proxy.mjs';
export default defineConfig(({mode})=>({
 base:mode==='public'?'/making/forest-crew-ai-crew/':'./',
 define:mode==='public'?{'import.meta.env.VITE_PLAYTEST_BASE_URL':JSON.stringify('/projects/hand-walk/'),'import.meta.env.VITE_CREW_DEFAULT':JSON.stringify('1'),'import.meta.env.VITE_CREW_API_BASE':JSON.stringify('/api/forest-crew')}:undefined,
 server:{host:'127.0.0.1',port:4180,strictPort:true,proxy:{'/api/crew':{target:'http://127.0.0.1:4182'}}},
 plugins:mode==='public'?[]:[{name:'optional-private-review',configureServer(server){server.middlewares.use(createPlaytestProxy({serviceKey:process.env.FOREST_PLAYTEST_SERVICE_KEY}));},configurePreviewServer(server){server.middlewares.use(createPlaytestProxy({serviceKey:process.env.FOREST_PLAYTEST_SERVICE_KEY}));}}],
}));
