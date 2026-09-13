# Real AI Crew

Forest Crew has two ways to run its optional two-agent collaboration preview.
The normal Grove 01 game remains available without AI crew calls, and its
gesture, movement, hose, camera and recording behavior is unchanged.

## Local contributor mode

Use Node 24 for the frontend repository and a Codex CLI with the experimental
app-server protocol. Version 0.148.0 is currently used by the hosted bridge.
Authenticate the CLI with your own ChatGPT account, then run:

```sh
npm ci
npm run dev # starts the browser and local crew bridge together
```

Open `http://127.0.0.1:4180/`. In local mode the bridge binds only to
`127.0.0.1:4182`, accepts the existing local origins, and does not require an
invite. Do not tunnel this mode or expose a personal Codex account to visitors.
The local root URL enables the crew. Add `?crew=0` for the solo baseline. The server-confirmed waiting roster is visible before hands activate play; it does not spend model quota.

## Hosted invitation demo

The published AI Crew build is at
`/making/forest-crew-ai-crew/`. Access is invitation-only: the page consumes the
`#crew=private` fragment, removes it from the address immediately, and exchanges
the invitation for a 24-hour, signed, `HttpOnly`, `Secure`, `SameSite=Strict`
cookie. A fragment is not sent in an HTTP request, but it remains a bearer
privilege until consumed; do not forward or publish an invitation URL.

Browser requests use `/api/forest-crew/*`. A Cloudflare Worker validates the
public origin and request shape, adds a private edge header, and forwards to the
bridge through Oracle. The bridge has no raw public port. Hosted mode starts only
when `FOREST_CREW_PUBLIC_ORIGIN` is set, and then fails startup unless the edge
and invite keys are distinct and at least 32 bytes. The public origin is added
to the request allowlist only in this mode.

The deployed bridge uses Node 20.20.2, Codex 0.148.0 and the service account's
authenticated ChatGPT session. This is a bounded single-session demonstration,
not a multi-tenant production service. One crew session may run at a time. The
durable UTC admission ledger allows eight starts per day by default, including
owner restarts. A session lasts at most five minutes and stops after 15 seconds
without player updates.

## Models and limits

The bridge reads the available models from `model/list` and rejects any model
that is not both advertised by the provider and listed in the game's existing
oxygen table. Both actors default to `gpt-5.6-sol`; no unavailable tier is
silently substituted. Each actor receives at most six decisions, 14 tool calls
per model turn and 90 seconds per turn. These limits bound usage but do not
represent provider prices or guarantee a token or monetary ceiling.

The host remains authoritative for claims, movement, prerequisites, pump
pressure and oxygen accounting. Only validated supply jobs are exposed to the
actors. Camera frames never go to the models; they receive game state and tool
outcomes. Event logs rotate at roughly 500 KB with one backup. Learned methods
are literal, versioned `SKILL.md` files backed by successful event evidence and
the store is bounded to 1 MB. Current demonstrations do not prove adaptation,
skill transfer to another actor, or safe multi-user isolation.

## Verification

```sh
npm test             # Offline tests; no real model calls
npm run crew:smoke   # Two real actors; consumes authenticated account usage
```

The smoke transcript is private under `.agent-data/smoke/latest.json`. It
contains public outcomes, tool calls and usage, never hidden reasoning. Review
it before sharing. Recording storage is separate from agent memory.

Reference: [official Codex app-server protocol](https://learn.chatgpt.com/docs/app-server).
