import test from 'node:test';
import assert from 'node:assert/strict';
import {withGestureIntent} from '../src/gesture-intent.mjs';
import {HoseGestureController} from '../src/hose-gesture.mjs';
const landmarks=()=>Array.from({length:21},(_,i)=>({x:i===0?0:i===16||i===20?.7:1,y:0,z:0}));
const hand=extra=>({id:'hand',pointX:.5,pointY:.4,indexCurl:.06,middleCurl:.32,indexFlex:.1,middleFlex:.63,open:false,fist:false,pointing:false,...extra});
test('a folded middle finger is recognized despite a nearly straight middle joint',()=>{
 const p=withGestureIntent(hand(),landmarks());assert(p.aimPose);assert(p.aimHoldPose);assert(!p.walkingPose);
});
test('bent-index finger walking cannot enter hose via the looser hold shape',()=>{
 const hose=new HoseGestureController();for(let t=0;t<1000;t+=100){const p=withGestureIntent(hand({indexFlex:t%200?.3:.18}),landmarks());assert(!p.aimPose);const s=hose.update([p],t);assert(!s.active);assert(!s.blockWalking);}
});
test('a straight entry holds through finger bends, then requires clear walking to release',()=>{
 const hose=new HoseGestureController(),p=withGestureIntent(hand(),landmarks());hose.update([p],0);assert(hose.update([p],160).active);
 for(let t=200;t<1000;t+=100)assert(hose.update([withGestureIntent(hand({indexFlex:.36,middleFlex:.66,indexCurl:.1}),landmarks())],t).active);
 const walk=withGestureIntent(hand({indexFlex:.2,middleFlex:.22}),landmarks());assert(walk.walkingPose);
 assert(hose.update([walk],1000).blockWalking);assert(!hose.read(1000).spraying);assert(!hose.update([walk],1200).blockWalking);
});
test('open hands, fists and invalid geometry cannot enter aiming',()=>{
 for(const extra of [{open:true},{fist:true},{indexFlex:NaN}]){const p=withGestureIntent(hand(extra),landmarks());assert(!p.aimPose);assert(!p.walkingPose);}
});
