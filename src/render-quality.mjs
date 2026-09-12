// Babylon's hardware scaling is the inverse of rendered pixels per CSS pixel.
// Keep a sharp base image; bound high-DPI fill cost instead of scaling backwards.
export const QUALITY_TIERS={BASE:'base',REDUCED_EFFECTS:'reduced-effects',REDUCED_RESOLUTION:'reduced-resolution'};

export function renderQuality({width,height,dpr=1,mobile=false,maxSamples=1,tier=QUALITY_TIERS.BASE}){
 const cssPixels=Math.max(1,width)*Math.max(1,height);
 const maximumRatio=tier===QUALITY_TIERS.REDUCED_RESOLUTION?1.5:2;
 const requested=Math.min(maximumRatio,Math.max(1,Number.isFinite(dpr)?dpr:1));
 const budget=mobile?1_600_000:4_000_000;
 const pixelRatio=Math.max(1,Math.min(requested,Math.sqrt(budget/cssPixels)));
 const samples=!mobile&&maxSamples>=2?2:1;
 return {pixelRatio,hardwareScaling:1/pixelRatio,samples,fxaa:samples===1,
  reflectionSize:mobile?768:1024,ambientOcclusion:!mobile,
  tier,reflectionRefreshRate:2,bloomEnabled:true,maxFPS:mobile?30:60};
}

export function createRenderQualityPolicy({mobile=false,startupSeconds=3,degradeSeconds=3}={}){
 let tier=QUALITY_TIERS.BASE,activeElapsed=0,lowElapsed=0,severeElapsed=0;
 const diagnostics=()=>({
  tier,
  reflectionRefreshRate:mobile&&(tier===QUALITY_TIERS.REDUCED_EFFECTS||tier===QUALITY_TIERS.REDUCED_RESOLUTION)?3:2,
  bloomEnabled:tier===QUALITY_TIERS.BASE,
  maxFPS:mobile?30:60,
 });
 return {
  observe({dt=0,fps=0,active=false}={}){
   const elapsed=Number.isFinite(dt)?Math.min(.25,Math.max(0,dt)):0;
   if(!mobile||!active||!Number.isFinite(fps)||fps<=0){lowElapsed=0;severeElapsed=0;return diagnostics();}
   activeElapsed+=elapsed;
   if(activeElapsed<startupSeconds)return diagnostics();
   if(tier===QUALITY_TIERS.BASE){
    lowElapsed=fps<24?lowElapsed+elapsed:0;
    if(lowElapsed>=degradeSeconds){tier=QUALITY_TIERS.REDUCED_EFFECTS;lowElapsed=0;severeElapsed=0;}
   }else if(tier===QUALITY_TIERS.REDUCED_EFFECTS){
    severeElapsed=fps<20?severeElapsed+elapsed:0;
    if(severeElapsed>=degradeSeconds){tier=QUALITY_TIERS.REDUCED_RESOLUTION;severeElapsed=0;}
   }
   return diagnostics();
  },
  diagnostics,
 };
}
