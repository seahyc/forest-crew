---
name: recover-pressure
description: Diagnose why water supply failed, coordinate the smallest useful repair and verify that the nozzle's supply is restored.
---

# Recover lost pressure

Illustrative possible learned output only. Do not preload this authored method or require agents to discover this exact skill.

Version: 0.1.0 authored draft. Fixture supports binary pump/connection checks. Rich pressure, fuel, kinked hoses and route constraints are future world mechanics and must not be invented in a live diagnosis.

## Goal

Restore the nozzle teammate's usable supply and communicate the actual cause. Verify the repair through authoritative state and a dependent action, not your intention to repair it.

## Diagnose before assigning work

Observe pump condition, operator/commitment and hose connection. Ask the nozzle teammate what changed if their observation is needed. Interpret the current evidence:

- Working pump with no operator: arrange a qualified/free actor to staff it; do not unnecessarily repair it.
- Damaged pump: claim the repair or ask a teammate to do so, while someone protects the priority front if the world offers a legal alternative.
- Disconnected hose: restore the connection and verify the pump remains staffed.
- All supported prerequisites true: refresh the world and inspect the failed tool result. Report an unresolved or unsupported cause rather than inventing a hidden defect.

Pick a role according to who is nearby/free and who must maintain existing work. Use the ordinary claim/perform/message tools. If the player starts the repair, cover the remaining job instead of duplicating them.

## Recheck the hypothesis

After the chosen repair, observe supply again and ask the nozzle operator to confirm through an actual dependent action. If the symptom persists, use the new evidence to revise the hypothesis. Limit repeated failed attempts and state the specific blocker when outside current skills or budget.

## Evidence

Pass: correct supported fault addressed, dependent suppression resumes, and no active post is silently abandoned. Fail: blindly running all repairs, reporting success on acknowledgement, or repeatedly applying the same ineffective action. Compare damage, no-operator and disconnected-line variants when each is implemented.
