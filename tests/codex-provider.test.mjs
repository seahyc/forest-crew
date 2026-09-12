import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexProvider} from '../server/codex-provider.mjs';

// This is a protocol fixture. It does not start Codex or call a real model.
test('executes dynamic tools only for the known matching current turn',async()=>{
  const provider=new CodexProvider({timeoutMs:5000});
  const sent=[];
  provider.send=message=>{sent.push(message);};
  let resolveTurnStart;
  provider.request=(method)=>method==='turn/start'
    ? new Promise(resolve=>{resolveTurnStart=resolve;})
    : Promise.resolve({});
  const actor={id:'firefighter',threadId:'thread-a',model:'fixture-model',turn:null};
  provider.actors.set(actor.threadId,actor);
  const executions=[];
  const decision=provider.decide(actor,'fixture prompt',async(...args)=>{executions.push(args);return {ok:true};});

  await provider.receive({id:1,method:'item/tool/call',params:{threadId:'thread-a',turnId:'prior-turn',tool:'observe',arguments:{},callId:'stale-before-id'}});
  assert.equal(executions.length,0,'a tool call must not run before the current turn ID is known');

  resolveTurnStart({turn:{id:'current-turn'}});
  await Promise.resolve();
  await provider.receive({id:2,method:'item/tool/call',params:{threadId:'thread-a',turnId:'prior-turn',tool:'observe',arguments:{},callId:'stale-after-id'}});
  assert.equal(executions.length,0,'a prior turn must not execute against the current decision');

  await provider.receive({id:3,method:'item/tool/call',params:{threadId:'thread-a',turnId:'current-turn',tool:'observe',arguments:{},callId:'matching'}});
  assert.equal(executions.length,1);
  assert.deepEqual(executions[0].slice(0,3),['observe',{},'matching']);
  assert.equal(executions[0][3] instanceof AbortSignal,true);
  assert.equal(sent.filter(message=>message.id===3).length,1);

  await provider.receive({method:'turn/completed',params:{threadId:'thread-a',turn:{id:'current-turn',status:'completed'}}});
  assert.equal((await decision).calls,1);
});

test('disposing an actor removes its registry entry and unsubscribes its thread',async()=>{
  const provider=new CodexProvider();
  const requests=[];
  provider.request=async(method,params)=>{requests.push({method,params});return {};};
  const actor={id:'engineer',threadId:'thread-dispose',model:'fixture-model',turn:null};
  provider.actors.set(actor.threadId,actor);

  await provider.disposeActor(actor);

  assert.equal(provider.actors.has(actor.threadId),false);
  assert.deepEqual(requests,[{method:'thread/unsubscribe',params:{threadId:'thread-dispose'}}]);
});
