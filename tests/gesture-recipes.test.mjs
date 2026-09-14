import test from 'node:test';
import assert from 'node:assert/strict';
import {gestureRecipe,recipeNames} from '../scripts/gesture-recipes.mjs';
import {sampleHand} from '../src/handwalk/input/hand-features.mjs';
import {withNavigationPoint,OneHandController} from '../src/one-hand-controller.mjs';
import {withGestureIntent} from '../src/gesture-intent.mjs';
import {HoseGestureController} from '../src/hose-gesture.mjs';
import {WalkingModeController} from '../src/walking-mode.mjs';

const samples=frame=>frame.hands.map(raw=>withGestureIntent(withNavigationPoint(sampleHand(raw.id,raw.landmarks,frame.aspect),raw.landmarks,frame.aspect),raw.landmarks));
const play=(name,controller)=>gestureRecipe(name).frames.map(frame=>({frame,state:controller.update(samples(frame),frame.t)}));

test('recipes contain only valid synthetic raw MediaPipe-shaped frames',()=>{
 assert.deepEqual(recipeNames,['walk-turn','hose-sweep','hand-count']);
 for(const name of recipeNames){const recipe=gestureRecipe(name);assert.equal(recipe.version,1);assert.deepEqual(recipe.metadata,{synthetic:true,name});assert(recipe.frames.length>=80&&recipe.frames.length<=121);for(const frame of recipe.frames){assert.equal(frame.aspect,4/3);for(const hand of frame.hands){assert.equal(hand.landmarks.length,21);assert(hand.landmarks.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)));}assert(samples(frame).every(Boolean));}}
 assert.throws(()=>gestureRecipe('missing'),RangeError);
});

test('walk-turn calibrates, advances, turns both ways, stops, and loses tracking',()=>{
 const played=play('walk-turn',new OneHandController());
 assert(played.some(({frame,state})=>frame.t>=2300&&state.forward>.05));
 assert(played.some(({state})=>state.turn<-.05));
 assert(played.some(({state})=>state.turn>.05));
 assert(played.some(({frame,state})=>frame.t>=6100&&frame.t<7200&&state.forward<-.05));
 assert(played.some(({frame,state})=>frame.t>=7200&&frame.t<8200&&state.forward===0));
 assert.equal(played.at(-1).state.mode,'lost');
});

test('hose-sweep enters spray, moves aim, stops on open palm, then loses hands',()=>{
 const played=play('hose-sweep',new HoseGestureController());
 const active=played.filter(({state})=>state.active);assert(active.length>20);
 const xs=active.map(({state})=>state.aim.x);assert(Math.max(...xs)-Math.min(...xs)>.12);
 assert(played.some(({frame,state})=>frame.t>=7200&&frame.t<8200&&!state.active));
 assert.equal(played.at(-1).state.fresh,true);
 assert.equal(played.at(-1).state.active,false);
});

test('hand-count adds a second raw hand briefly and for a sustained interval',()=>{
 const controller=new WalkingModeController(),history=gestureRecipe('hand-count').frames.map(frame=>{
  const walkers=samples(frame).filter(hand=>!hand.fist&&!hand.open&&!(hand.aimPose??hand.pointing));
  return {t:frame.t,state:controller.update(walkers,frame.t)};
 });
 assert(history.filter(({t,state})=>t>=3500&&t<3700&&state.count===2).length===2);
 assert(history.find(({t})=>t===3700).state.mode==='one-hand');
 assert(history.some(({t,state})=>t>=4000&&t<5200&&state.mode==='two-hand'&&state.count===2));
 assert(history.some(({t,state})=>t>=5200&&state.mode==='one-hand'&&state.count===1));
 assert.equal(history.at(-1).state.count,0);
});
