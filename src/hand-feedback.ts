type Point={x:number;y:number};
const links=[[0,1,2,3,4],[0,5,6,7,8],[0,9,10,11,12],[0,13,14,15,16],[0,17,18,19,20],[5,9,13,17,0]];
export function drawHandFeedback(ctx:CanvasRenderingContext2D,hands:{landmarks:Point[]}[],{single,decision,fresh,turn=0,reverse=false}:{single:boolean;decision:string;fresh:boolean;turn?:number;reverse?:boolean}){
 const w=320,h=240;ctx.clearRect(0,0,w,h);
 for(const [index,hand] of hands.entries()){
  const points=hand.landmarks;if(points?.length!==21||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))continue;
  ctx.lineWidth=2.3;ctx.strokeStyle=ctx.fillStyle=fresh?(index?'#9ccddf':'#89b69b'):'#64746a';
  for(const chain of links){ctx.beginPath();chain.forEach((n,i)=>{const p=points[n];i?ctx.lineTo((1-p.x)*w,p.y*h):ctx.moveTo((1-p.x)*w,p.y*h);});ctx.stroke();}
  for(const p of points){ctx.beginPath();ctx.arc((1-p.x)*w,p.y*h,2.7,0,Math.PI*2);ctx.fill();}
 }
 if(single){
  // A command preview, not a joystick: finger direction owns the arrow.
  const angle=Math.max(-1,Math.min(1,fresh?turn:0))*Math.PI*.42,x=160,y=179;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.strokeStyle=fresh?'#fff3b0':'#64746a';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,12);ctx.lineTo(0,-17);ctx.moveTo(-8,-8);ctx.lineTo(0,-17);ctx.lineTo(8,-8);ctx.stroke();ctx.restore();
 }
 const labels:Record<string,string>={'finger-walk-ready':'WALK YOUR FINGERS','finger-walk-idle':'WALK YOUR FINGERS','finger-walk-forward':'↑ WALKING','finger-walk-reverse':'↓ REVERSING','point-steer':turn<0?'← TURN LEFT':'TURN RIGHT →',ready:'WALK YOUR FINGERS','open-palm-stop':'PALM · STOPPED','open-palm-recenter':'PALM · STOPPED','fist-stop':'STOPPED',forward:'↑ WALKING',backward:'↓ REVERSING',left:'← TURN LEFT',right:'TURN RIGHT →','forward-left':'↑ WALK + LEFT','forward-right':'↑ WALK + RIGHT','back-left':'↓ BACK + LEFT','back-right':'↓ BACK + RIGHT',spraying:'WATER ON','ui-dwell':'CHOOSING','point-dwell':'AIM TO SPRAY'};
 ctx.fillStyle=fresh?'#e1f0d6':'#99ad9e';ctx.textAlign='center';ctx.font='bold 18px system-ui';ctx.fillText(single?(!fresh?'SHOW TWO FINGERS':labels[decision]??'WALK YOUR FINGERS'):fresh?'HANDS TRACKED':'SHOW YOUR HANDS',160,23);
 if(single){ctx.font='15px system-ui';ctx.fillText(reverse?'REVERSE · walk fingers':'Walk fingers · thumb out = back',160,221);}
}
