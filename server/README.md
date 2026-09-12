# Real AI crew — local collaboration preview

Grove 01 remains the stable gesture/fire playtest. `?crew=1` adds two separate
Codex model actors to the same scene. They negotiate supply jobs, walk to the
hose/pump, and execute validated actions. The player still aims and extinguishes
fires. Water pressure depends on a connected hose and a teammate maintaining the
pump. Model responses never block animation or hand tracking.

## Run

Use Node 24, `npm ci`, and a Codex CLI that supports the experimental app-server
protocol (tested with 0.147.0). Run `codex login` using your own account.

```sh
npm run crew:server
# In a second terminal:
npm run dev
```

Open `http://127.0.0.1:4180/?crew=1`. Show your hands to start the crew. Existing
finger walking, point-direction steering, thumb-assisted reverse, and hose
controls are unchanged. The camera permission dialog belongs to the browser.
No game model calls occur when you open the normal Grove 01 route.

The local bridge binds only to `127.0.0.1:4182`. This version is **not a public
multi-user agent service**. The published Grove 01 remains playable without it.
Do not tunnel the local bridge or expose a personal Codex account to visitors.
An authenticated per-player hosted service is a separate deployment step.

## Models and limits

The bridge queries `model/list` from the installed Codex account and rejects
unavailable model IDs. Both teammates default to `gpt-5.6-sol`. The session
endpoint accepts two available IDs; an in-game model selector is not built yet.
Luna, Terra, Sol and Spark have game oxygen costs of 2, 3, 4 and 1 per decision.
These are design constants, **not** provider prices or token conversion rates.
Astra is not exposed unless a future provider advertises and supports it.

Each actor gets at most six decisions, 14 tool calls per decision and 90 seconds
per model turn. A session stops after five minutes or 15 seconds without player
updates. Failed calls still consume that decision's game oxygen. Real Codex
account usage is separate; these limits bound requests, not a guaranteed token
or monetary ceiling. No automatic paid API fallback exists.

## Agent architecture

- `codex-provider.mjs`: official app-server stdio, separate actor threads,
  account-verified model IDs, narrow dynamic tools, deadlines and cancellation.
  Environment access, shell, browsing, plugins, apps and configured MCP servers
  are disabled. No credentials are read, copied, logged or sent to the browser.
- `crew-session.mjs`: host binds actor identity and owns task claims, movement,
  prerequisites, pump pressure, oxygen accounting and bounded public events.
  Role names do not determine which jobs an actor chooses.
- `../prototype/crew-world.mjs`: deterministic supply authority; claims use
  revisions and tool calls use idempotency IDs. Only supply jobs are exposed to
  models in this slice; they cannot mark the rendered fires extinguished.
- `skill-store.mjs`: agents author literal versioned `SKILL.md` files from
  successful events. Evidence must exist and include the author's own outcome.
  Methods have parent links and revisions. No illustrative `game-skills/`
  content is seeded. This is external memory, not model-weight training.
- `../src/crew-client.ts` and `crew-visuals.ts`: asynchronous polling and
  interpolated firefighter rigs. The existing fire simulation stays in the
  player's browser. This is one local player's supply simulation, not a
  cheat-resistant multiplayer architecture.

Tardigrade is not a dependency. The actor/provider/world boundary leaves room
for a durable actor host later. This slice uses bounded Codex thread histories
and explicit skill retrieval; restart recovery, learned-skill transfer between
actors and demonstrated adaptation across scenario variants remain future work.

## Evidence and privacy

```sh
npm test             # Offline protocol/unit fixtures; no real model usage.
npm run crew:smoke   # Two real Codex actors; consumes your account usage.
```

The real smoke writes a private outcome/tool transcript under
`.agent-data/smoke/latest.json`, with model IDs, tool results and token usage.
It does not record hidden reasoning. Local live events rotate around 500 KB per
file with one backup; learned methods are separately capped at 1 MB per store.
`.agent-data/` is ignored and must not be added to public bug reports unreviewed.

Recording remains separate from agent memory. The game retains its existing
visible recording opt-out and optional review backend. Camera images are never
sent to the AI crew: it receives game state and tool outcomes only.

Reference: [official Codex app-server protocol](https://learn.chatgpt.com/docs/app-server).
