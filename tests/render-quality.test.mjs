import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRenderQualityPolicy,renderQuality} from '../src/render-quality.mjs';
test('Retina renders above CSS resolution instead of stretching a smaller image',()=>{
 const q=renderQuality({width:1440,height:900,dpr:2,maxSamples:4});
 assert(q.pixelRatio>1.7);assert(q.hardwareScaling<1);assert(1440*900*q.pixelRatio**2<=4_000_001);assert.equal(q.samples,2);assert.equal(q.fxaa,false);
});
test('high-density portrait and landscape phones retain 2x clarity within a bounded buffer',()=>{
 for(const [width,height] of [[390,844],[844,390]]){
  const q=renderQuality({width,height,dpr:3,mobile:true});assert.equal(q.pixelRatio,2);assert.equal(q.hardwareScaling,.5);assert.equal(q.ambientOcclusion,false);assert(width*height*q.pixelRatio**2<1_600_000);
 }
});
test('large displays and invalid DPR never render below CSS resolution',()=>{
 for(const dpr of [1,2,3,NaN,0])assert(renderQuality({width:3840,height:2160,dpr}).hardwareScaling<=1);
});
test('mobile base quality limits frame and reflection cadence while retaining Retina clarity',()=>{
 const q=renderQuality({width:390,height:844,dpr:3,mobile:true});
 assert.equal(q.maxFPS,30);assert.equal(q.reflectionRefreshRate,2);assert.equal(q.bloomEnabled,true);assert.equal(q.pixelRatio,2);
});
test('startup and inactive low frame samples do not reduce quality',()=>{
 const policy=createRenderQualityPolicy({mobile:true});
 for(let i=0;i<20;i++)policy.observe({dt:.25,fps:10,active:false});
 for(let i=0;i<11;i++)policy.observe({dt:.25,fps:10,active:true});
 assert.equal(policy.diagnostics().tier,'base');
});
test('sustained active low FPS reduces offscreen effects before resolution',()=>{
 const policy=createRenderQualityPolicy({mobile:true,startupSeconds:0});
 for(let i=0;i<12;i++)policy.observe({dt:.25,fps:23,active:true});
 assert.deepEqual(policy.diagnostics(),{tier:'reduced-effects',reflectionRefreshRate:3,bloomEnabled:false,maxFPS:30});
 for(let i=0;i<12;i++)policy.observe({dt:.25,fps:19,active:true});
 assert.equal(policy.diagnostics().tier,'reduced-resolution');
 const q=renderQuality({width:390,height:844,dpr:3,mobile:true,tier:policy.diagnostics().tier});
 assert.equal(q.pixelRatio,1.5);assert(q.pixelRatio>=1);
});
test('healthy samples break the sustained-low window and tiers never oscillate upward',()=>{
 const policy=createRenderQualityPolicy({mobile:true,startupSeconds:0});
 for(let i=0;i<8;i++)policy.observe({dt:.25,fps:22,active:true});
 policy.observe({dt:.25,fps:26,active:true});
 for(let i=0;i<8;i++)policy.observe({dt:.25,fps:22,active:true});
 assert.equal(policy.diagnostics().tier,'base');
 for(let i=0;i<12;i++)policy.observe({dt:.25,fps:22,active:true});
 for(let i=0;i<40;i++)policy.observe({dt:.25,fps:30,active:true});
 assert.equal(policy.diagnostics().tier,'reduced-effects');
});
test('desktop retains its full effects regardless of sampled frame rate',()=>{
 const policy=createRenderQualityPolicy({mobile:false,startupSeconds:0});
 for(let i=0;i<100;i++)policy.observe({dt:.25,fps:10,active:true});
 assert.deepEqual(policy.diagnostics(),{tier:'base',reflectionRefreshRate:2,bloomEnabled:true,maxFPS:60});
});
