import test from 'node:test';
import assert from 'node:assert/strict';
import {HoseGestureController} from '../src/hose-gesture.mjs';

const pointing=(id='left',x=.2,y=.6,extra={})=>({id,pointX:x,pointY:y,pointing:true,open:false,fist:false,indexFlex:.1,middleFlex:.7,...extra});
const open=(id='right',x=.7,y=.4)=>({id,pointX:x,pointY:y,pointing:false,open:true,fist:false,indexFlex:.1,middleFlex:.1});

test('one pointing hand activates after 150ms with comfortable aim mapping',()=>{
 const hose=new HoseGestureController();
 assert.equal(hose.update([pointing()],1000).active,false);
 const state=hose.update([pointing()],1150);
 assert.equal(state.active,true);assert.equal(state.spraying,true);assert.equal(state.dwell,1);
 assert.deepEqual(state.aim,{x:(.85-.2)/.7,y:(.6-.12)/.7});
});

test('one/two hand transitions retain a held spatial pointer',()=>{
 const hose=new HoseGestureController();hose.update([pointing()],0);hose.update([pointing()],150);
 assert.equal(hose.update([open(),pointing('left',.21,.6)],180).active,true);
 const one=hose.update([pointing('left',.22,.59)],210);
 assert.equal(one.active,true);assert.equal(one.dwell,1);
});

test('UI overlap stops authority and return requires fresh dwell',()=>{
 const hose=new HoseGestureController();hose.update([pointing()],0);hose.update([pointing()],150);
 const ui=hose.update([pointing()],170,{overUi:true});
 assert.equal(ui.active,false);assert.equal(ui.spraying,false);assert.equal(ui.dwell,0);
 assert.equal(hose.update([pointing()],180).active,false);
 assert.equal(hose.update([pointing()],329).active,false);
 assert.equal(hose.update([pointing()],330).active,true);
});

test('fist, open palm, non-point, and explicit hand loss stop immediately',()=>{
 for(const lost of [[],[{...pointing(),pointing:false,fist:true}],[open('left',.2,.6)],[{...pointing(),pointing:false}]]){
  const hose=new HoseGestureController();hose.update([pointing()],0);hose.update([pointing()],150);
  const state=hose.update(lost,160);
  assert.equal(state.active,false);assert.equal(state.spraying,false);assert.equal(state.pointerId,null);
 }
});

test('300ms sample gap preserves continuity and a gap beyond 450ms requires dwell',()=>{
 const hose=new HoseGestureController();hose.update([pointing()],0);hose.update([pointing()],150);
 assert.equal(hose.update([pointing('left',.21,.6)],450).active,true);
 assert.equal(hose.read(901).active,false);
 assert.equal(hose.update([pointing('left',.21,.6)],901).active,false);
 assert.equal(hose.update([pointing('left',.21,.6)],1051).active,true);
});

test('walking finger poses and alternating flex samples never accumulate hose dwell',()=>{
 const hose=new HoseGestureController();
 const walking=[{...pointing(),pointing:false,indexFlex:.55,middleFlex:.2},{...open(),open:false,indexFlex:.2,middleFlex:.55}];
 hose.update(walking,0);assert.equal(hose.update(walking,400).active,false);
 const flapping=new HoseGestureController();
 for(let now=0;now<=600;now+=50){const flex=now%100===0?.1:.4;assert.equal(flapping.update([pointing('left',.2,.6,{indexFlex:flex,middleFlex:.2})],now).active,false);}
});

test('array reorder and handedness label swap preserve nearby owner',()=>{
 const hose=new HoseGestureController();hose.update([pointing('Left'),open('Right')],0);hose.update([open('Right'),pointing('Left')],150);
 const swapped=hose.update([pointing('Right',.21,.59),open('Left')],180);
 assert.equal(swapped.active,true);assert.equal(swapped.pointerId,'Right');assert.equal(swapped.dwell,1);
});

test('distant pointer handoff requires a fresh dwell',()=>{
 const hose=new HoseGestureController();hose.update([pointing('left',.15,.55)],0);hose.update([pointing('left',.15,.55)],150);
 const revoked=hose.update([open('left',.15,.55),pointing('right',.8,.2)],170);
 assert.equal(revoked.active,false);
 const candidate=hose.update([pointing('right',.8,.2)],180);
 assert.equal(candidate.active,false);assert.equal(candidate.pointerId,'right');assert.equal(candidate.dwell,0);
 assert.equal(hose.update([pointing('right',.8,.2)],330).active,true);
});
