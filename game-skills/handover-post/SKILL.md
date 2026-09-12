---
name: handover-post
description: Negotiate and verify replacement at a maintained post before changing jobs, recovering if the replacement cannot arrive.
---

# Hand over an active post

Illustrative possible learned output only. Do not preload this authored method or require agents to discover this exact skill.

Version: 0.1.0 authored draft. Current fixture supports messages, claims, releases and maintained pump operation. Physical readiness and atomic transfer are required future mechanics; do not claim the fixture can preserve uninterrupted flow during a release/reclaim sequence.

## Goal

Another firefighter actually assumes your maintained task and you become free for the new job. The new priority justifies the change, and downstream teammates know about any unavoidable interruption.

## Negotiate

Observe current commitments. Identify an actor who can cover, considering their own task and the mission's priority. Ask specifically: which post, why, and whether you need coverage before leaving. Acknowledge replies, but treat "received" separately from "I accept". If declined, ask another available actor or propose a different allocation; do not abandon the post merely because you sent a request.

## Transfer

Continue operating while waiting. When the replacement reports ready, verify their presence/readiness from the world. The future `handover_post` authority must atomically validate both actors, readiness and expected revision, transfer the commitment and publish the new owner. This proposed tool is not currently available.

In the current fixture, only perform a coordinated release followed by the recipient's claim/operation if interruption is acceptable; clearly label that interval as lost supply. Never represent the release/reclaim approximation as seamless.

## Recover

If the recipient takes another job, times out or cannot reach you, keep the original commitment while it is valid and request an alternative. On a stale result, re-observe who owns the post before retrying. If the post itself fails, communicate the observed failure and load the recovery method instead.

## Evidence

Pass in the future physical world: recipient owns/operates the post, previous operator is free, downstream flow remains within the allowed interruption budget, and the new job starts. Acknowledgement without transfer fails. Include delayed, declined and duplicate-message trials. Record the maximum supply gap rather than relying on dialogue.
