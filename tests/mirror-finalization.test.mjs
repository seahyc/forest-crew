import test from 'node:test';
import assert from 'node:assert/strict';
import {MirroredPlaytestSession} from '../src/handwalk/mirrored-playtest-session.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

function fixture(){
 const statuses=[],session=new MirroredPlaytestSession({remoteEnabled:false,remoteWaitMs:2,onStatus:status=>statuses.push({...status})});
 session.local={state:'stopped',session:'local-session',started:0,savedBytes:10,queuedBytes:0,error:'',stop:async()=>{}};
 session.remoteGeneration=1;session.remoteState='recording';session.remoteDroppedItems=0;return {session,statuses};
}

test('bounded stop reports pending then eventually reports uploaded',async()=>{
 const {session,statuses}=fixture(),gate=deferred();
 const remote={state:'recording',error:'',savedBytes:42,stop:async()=>{await gate.promise;remote.state='stopped';}};
 await session.finishStop(remote,Promise.resolve(),1);
 assert.equal(session.remoteState,'pending');
 assert.match(session.remoteError,/still finishing/);
 gate.resolve();await tick();await tick();
 assert.equal(session.remoteState,'uploaded');
 assert.equal(session.remoteError,'');
 assert.equal(statuses.at(-1).remoteState,'uploaded');
});

test('late finalization failure becomes unavailable and preserves a gap',async()=>{
 const {session,statuses}=fixture(),gate=deferred();
 const remote={state:'recording',error:'',savedBytes:0,stop:async()=>{await gate.promise;throw new Error('fixture upload failed');}};
 await session.finishStop(remote,Promise.resolve(),1);
 assert.equal(session.remoteState,'pending');
 gate.resolve();await tick();await tick();
 assert.equal(session.remoteState,'unavailable');
 assert.ok(session.remoteDroppedItems>0);
 assert.equal(statuses.at(-1).remoteState,'unavailable');
});

test('late completion from an old generation cannot alter newer state',async()=>{
 const {session}=fixture(),gate=deferred();
 const remote={state:'recording',error:'',savedBytes:42,stop:async()=>{await gate.promise;remote.state='stopped';}};
 await session.finishStop(remote,Promise.resolve(),1);
 assert.equal(session.remoteState,'pending');
 session.remoteGeneration=2;session.remoteState='recording';session.remoteError='new session';
 gate.resolve();await tick();await tick();
 assert.equal(session.remoteState,'recording');
 assert.equal(session.remoteError,'new session');
});
