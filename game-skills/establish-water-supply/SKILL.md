---
name: establish-water-supply
description: Establish and verify a working water supply for a teammate, allocating hose and pump work according to the current incident.
---

# Establish water supply

Illustrative possible learned output only. Do not preload this authored method or require agents to discover this exact skill.

Version: 0.1.0 authored draft. Scope: a single game pump, one hose and a nearby fire. Tool-world prerequisites exist; spatial movement and pressure measurement are pending implementation.

## Goal

A connected hose has a working, staffed pump, and the teammate at the nozzle knows supply is ready. Your work is complete when the world confirms those prerequisites and the teammate confirms the requested support is in place. A chat message alone cannot turn on a pump.

## Read the situation

Use `observe`. Check pump damage, hose location/state, active operator, shared task claims, your own commitment and teammate requests. Do not redo completed work. If occupied at an active post, arrange coverage before abandoning it. Refresh after a stale claim rejection.

## Plan the missing work

- Pump damage and hose preparation can proceed in parallel when two actors are free. Ask a teammate for a specific outcome and retain a useful job yourself.
- With one free actor, complete the available prerequisites before taking a maintained operating post. Do not occupy the pump and then expect to fetch a hose at the same time.
- If someone owns the needed task, ask for status or offer useful support. Do not race their claim or declare it completed on their behalf.
- If the player takes a job, re-evaluate the remaining gap. Their physical action is evidence; the plan may need to change.

Use `claim_task` against the latest revision and `perform_task` for the selected available work (`fetch_hose`, `connect_hose`, `repair_pump`, `operate_pump`). A blocked tool result describes an unsatisfied prerequisite; inspect it and change the plan instead of repeating the same call indefinitely.

## Coordinate and verify

Use `message_actor` to name the help needed and `acknowledge_message` for receipt. Receipt is not acceptance or completion. Wait for the peer's declared commitment and observed task effect. Once supply is available, tell the nozzle teammate and confirm the world still shows a connected hose and active pump. Operating the pump remains an active responsibility until explicitly released or handed over.

## Stop or revise

If a teammate cannot help, choose a legal alternative or explain the exact blocker. If oxygen cannot fund another decision, preserve the already valid action and surface the budget state. Never claim a working supply while prerequisites remain false.

## Evidence

Pass: hose connected, pump repaired and actively operated, dependent suppression succeeds through another actor's tool effect. Fail: duplicate work, unstaffed pump, unsupported completion claims, or player forced to coach every substep. Test again with a different missing prerequisite and reversed actor roles.
