import test from 'node:test';
import assert from 'node:assert/strict';
import {HoseGestureController} from '../src/hose-gesture.mjs';

const pointing=(id='left',x=.2,y=.6)=>({id,pointX:x,pointY:y,pointing:true,open:false,indexFlex:.1,middleFlex:.7,roll:0});
const open=(id='right')=>({id,pointX:.7,pointY:.4,pointing:false,open:true,indexFlex:.1,middleFlex:.1,roll:0});

test('sustained point plus open palm switches to hose and mirrors aim',()=>{
 const hose=new HoseGestureController();
 assert.equal(hose.update([pointing(),open()],1000).active,false);
 hose.update([pointing(),open()],1200);
 const state=hose.update([pointing('left',.2,.6),open()],1250);
 assert.equal(state.active,true);
 assert.equal(state.spraying,true);
 assert.deepEqual(state.aim,{x:.8,y:.6});
});

test('tracking loss stops hose and spray after the freshness boundary',()=>{
 const hose=new HoseGestureController();
 hose.update([pointing(),open()],0);
 hose.update([pointing(),open()],200);
 hose.update([pointing(),open()],250);
 assert.equal(hose.read(470).spraying,true);
 const lost=hose.read(471);
 assert.equal(lost.active,false);
 assert.equal(lost.spraying,false);
});

test('walking finger pose cannot enter hose mode',()=>{
 const hose=new HoseGestureController();
 const walking=[{...pointing(),pointing:false,indexFlex:.55,middleFlex:.2},{...open(),open:false,indexFlex:.2,middleFlex:.55}];
 hose.update(walking,0);
 const state=hose.update(walking,400);
 assert.equal(state.active,false);
 assert.equal(state.spraying,false);
});

test('pointing at interface suppresses spray without losing the stable stance',()=>{
 const hose=new HoseGestureController();
 hose.update([pointing(),open()],0);
 hose.update([pointing(),open()],200);
 const overUi=hose.update([pointing(),open()],250,{overUi:true});
 assert.equal(overUi.active,true);
 assert.equal(overUi.spraying,false);
 const clear=hose.update([pointing(),open()],270,{overUi:false});
 assert.equal(clear.spraying,true);
});
