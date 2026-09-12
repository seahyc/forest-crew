# MVP progression and playtest gates

The product advances through three playable builds. Visual quality is an invariant across all three, not a polish stage at the end. The approved concept direction is the pink deck and volcanic grove; the generated concepts are design references, not proof that the in-engine target has been attained. The user must approve an actual in-engine render before the world expands beyond the first grove. The gates below are provisional acceptance targets, not results.

| Playable build | Deliverable | Evidence gate |
| --- | --- | --- |
| 1: Beautiful first fire | The approved pink-deck/volcanic-grove direction rendered in-engine; preserved Hand Walk controls, physics, avatar and camera; one hose and a three-patch incident; full bounded recording; a physical-playtest baseline | A fresh player can enter, walk, aim, sweep and finish the incident without keyboard or mouse; broad gestures are stable, fire response feels connected, and the recording can stop, reload and replay. Review the actual render with the user before adding another grove |
| 2: Crew that learns | The same scene with the player and two separately identified real model actors coordinating authoritative pump/hose tasks; one actor authors a reusable `SKILL.md` from an actual episode and retrieves, reuses or adapts it in the next supported variation | Observe a request, acknowledgement and useful action; remove or change one prerequisite and observe recovery. Show the originating episode before the learned method's later application, and compare retained with reset memory. Do not prescribe the division of labour or preload a firefighting method |
| 3: Restore and expand | A restored grove visibly produces bounded oxygen income; that capacity enables a recruit and expansion to the next volcanic grove; the agent-created skill graph branches and sharing develops gradually through experience | Income and spending are legible, new capacity changes the next incident, and manual recovery remains possible at zero oxygen. A recipient applies shared knowledge and adapts it through its own outcome evidence |

Do not postpone the Build 2 cooperation work until Build 1 is polished. Its backend and protocol study can proceed alongside the Build 1 gesture/water study, but it remains supporting work for Build 2 rather than a separate user-facing stage. Scripted fixture callers verify task rules only. Build 2 is not complete until two real provider-backed actors choose and coordinate tools under perturbation.

## 90-second ambition

0–15 s: enter the reference-inspired scene with visible teammates at work.
15–35 s: sweep water and finish a patch; see and hear the result.
35–60 s: communicate a priority or physically leave a post. One teammate requests a handoff; the other accepts and changes job.
60–80 s: staffed pump enables a stronger stream; complete the shared incident.
80–90 s: restoration transition, oxygen income, and a visible newly available recruit/upgrade.

This is an ambition for a combined later demonstration, not a claim that every build already contains all five beats or an acceptance shortcut. Build 1 proves the physical fire loop. Build 2 adds the cooperation and learning beats. Build 3 adds restoration, oxygen and expansion.

Any demonstration making a cooperation claim must show actual model calls and authoritative actions. If live AI is not ready, label what is shown as a control/protocol study. Do not disguise prerecorded dialogue, a scripted planner or canned success as agent intelligence. One verified model tier and one progression purchase can demonstrate the concept; five verified backends and a broad skill graph are later scope. Show the first experience before the learned method's second application when claiming live learning. Do not compress away that evidence merely to fit 90 seconds.

## Playtesting from the first slice

Carry forward Hand Walk's gesture tracking confidence, input features, intended motion, effective motion, gating reason, camera state, per-frame timing, video and timestamped replay. Add hand stance/target, water impact, heat removed, pump pressure and task state.

For each agent log: public observation revision; role/goal; model ID and provider; decision start/end; structured tool call/result; request/ack/commit/cancel messages; blocked reasons; leases; oxygen reservation/charge/refund; training-memory changes. Never log hidden chain-of-thought, credentials or unrelated raw context. Use one shared monotonic event timeline and stable IDs to correlate video, world state and decisions.

Recording starts automatically after a visible notice/countdown, with a gesture-accessible opt-out remembered across visits. The user clarified that this is what they mean by "default opt in". Camera permission remains a browser setup step. Mirror recordings to Oracle for the owner's private review; retain the 20,000,000-byte on-device rotating fallback, so an outage cannot block gameplay. Compression starts above an aggregate Oracle archive size of 20,000,000 bytes; oldest-recording removal enforces 30,000,000 bytes. These are whole-archive thresholds, not allowances multiplied by visitor count. Show local-save and remote-upload status separately. Clearing browser storage does not delete the Oracle archive. Retention is best-effort recent history, not a guarantee that every session remains available.

Ask one question per playtest. Version every run with build, scenario, seed and control settings, plus environment and model configuration when applicable. Establish a fixed baseline first, then rerun with one changed condition; use an unseen variation only after the direct comparison. Review the replay, identify one failure and change one mechanism. Keep the outcome and unresolved failures in the versioned playtest record.

Treat aesthetic comments, control scores and agent evidence as separate findings. Passing one does not establish the others, and they must not be combined into a blanket build pass.

First human target: four of five new players complete the three-patch incident without operator coaching. In Build 2, separately test whether they can explain who is doing each job. Record intervention counts, accidental stance switches, tracking losses, task idle time and completion, not just subjective ratings. Do not claim either target met from unit tests.

Cooperation variants: player leaves pump; hose location changes; both agents claim the same job; a teammate is blocked; a message arrives twice; model reply arrives late; oxygen is exhausted; game state advances before a tool result. Run the same seeded states with agents communicating and with mailbox disabled to measure whether communication actually helps. An improvement claim requires observed success/idle-time differences, not dialogue volume.

## Reuse boundary

Hand Walk remains its own repository and hosted prototype. Port the input, movement, avatar, camera and recorder modules from Hand Walk tag `v0.15.1-prototype` (commit `39fde78`); preserve attribution and tests. Keep v0.15.0 / 9454665 as the browser-only rollback baseline. New gameplay/agent modules belong here. Keep game simulation, gesture interpretation, model harness and telemetry storage as separate modules so an unavailable model/backend cannot freeze movement.

## Current implementation: local crew preview (0.2.0)

The optional `?crew=1` mode now runs two separate Sol actor contexts through a local Codex app-server bridge. Real tests observed conflicting requests followed by negotiated hose/pump job division, completed supply tasks, pressure in the rendered scene, and one persisted agent-authored method. Offline protocol tests also cover cancellation, task timing and oxygen accounting.

This is partial Build 2: the player still performs suppression; teammates handle supply. It does not yet demonstrate skill sharing, transfer to recruits, adaptation across variants, or successful human team play. Public Grove 01 remains the stable gesture baseline; external contributors can run the crew preview with their own local Codex account.
