export function createRuntimePolicy({publicMode=false,recordingPreference='on'}={}){
 const isPublic=Boolean(publicMode),recordingDefault=recordingPreference!=='off';
 return Object.freeze({isPublic,requiresPlaytestChoice:false,recordingDefault,allowDiagnostics:false,allowRecording:true,recordingEnabledByPreference:recordingDefault,showLocalControls:!isPublic});
}
function stored(key,fallback){try{return typeof globalThis.localStorage?.getItem==='function'?globalThis.localStorage.getItem(key)??fallback:fallback;}catch{return fallback;}}

export const runtimePolicy=createRuntimePolicy({
 publicMode:import.meta.env?.MODE==='public',
 recordingPreference:stored('hand-walk-browser-recording',stored('hand-walk-public-recording','on')),
});
