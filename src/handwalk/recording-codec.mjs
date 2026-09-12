export const RECORDING_MIME_TYPES=[
 'video/webm;codecs=vp8',
 'video/webm',
 'video/mp4;codecs=avc1.42E01E',
 'video/mp4',
];

export function selectRecordingMimeType(isTypeSupported){
 if(typeof isTypeSupported!=='function')return '';
 for(const type of RECORDING_MIME_TYPES){
  try{if(isTypeSupported(type))return type;}catch{}
 }
 return '';
}
