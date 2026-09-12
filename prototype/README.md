# Forest Crew tool world

This prototype is a deterministic, authoritative world for future model-driven actors. It contains no fake agent dialogue, scripted AI, provider integration, transport, or timers. Tests use scripted callers only as protocol fixtures; passing them is not evidence that agents can coordinate.

The demo contains a pump, hose, and burning grove. Any of `player`, `firefighter`, or `engineer` may claim and perform any job. There are no role assignments embedded in the world.

The minimum dependency graph is:

```text
fetch_hose -> connect_hose ----\
                                -> suppress_fire
repair_pump -> operate_pump ---/
```

`operate_pump` is a maintained commitment: its owner remains busy and the pump stays active until `release_task`. Busy state is enforced again when performing any previously claimed task, so an operator cannot advance another job while maintaining pressure. A hose carrier cannot operate the pump. Failed `perform_task` calls return structured blockers and make no progress. Completed tasks award their score once.

All calls carry `actorId`, `callId`, `tool`, and `args`. A repeated `callId` with the same request returns the first result; changed arguments produce `call_id_conflict`. Claims require `expectedRevision`, are exclusive revision-based leases, and can be renewed by claiming again or released for reassignment. The default lease lasts 20 subsequent world revisions. Active pump operation does not expire in this prototype; it requires explicit release. This is a known limitation until a durable host supplies a heartbeat or authoritative clock, and this in-memory world does not claim crash recovery. Messages require explicit acknowledgement, which confirms receipt only. `observe` includes the caller's bounded inbox and sent-message outbox so senders can see acknowledgement state.

Oxygen is a game integer ledger rather than inferred provider tokens. `begin_decision` atomically reserves `maxCost`; `settle_decision` charges `actualCost` once and releases the remainder. Overspend and insufficient available oxygen are rejected. A later model adapter must measure its own usage and translate it into this explicit contract.

`observe` returns bounded authoritative state plus only the caller's 20 most recent mailbox messages. It never exposes hidden reasoning. `events` supplies the deterministic telemetry timeline.
