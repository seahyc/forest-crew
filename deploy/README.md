# Hosted AI Crew deployment

This directory contains the systemd and environment templates for the invited
Forest Crew AI demo. The deployed request path is:

```text
seahyingcong.com/api/forest-crew/*
  -> Cloudflare Worker
  -> Oracle HTTPS origin
  -> Caddy on the private host
  -> 172.18.0.1:4182
```

The Node bridge must not have a raw public port. Caddy rewrites the upstream
`Host` to the loopback/private listener expected by the bridge. The Worker route
and fixed upstream are defined in `../wrangler.jsonc`; the narrow forwarding
logic is in `../worker/index.mjs`.

## Host setup

Install the repository at `/opt/forest-crew`, place the persistent data directory
at `/var/lib/forest-crew`, and install the service template as
`/etc/systemd/system/forest-crew.service`. Copy `crew.env.example` to
`/etc/forest-crew/crew.env`, owned by root and readable only by the service.

Create two different random secrets of at least 32 bytes for
`FOREST_CREW_EDGE_KEY` and `FOREST_CREW_INVITE_KEY`. Put their actual values only
in the host environment and secret store. Set the matching edge key as the
Worker secret; never add either value to this repository, Caddy configuration,
logs, command history, or client code.

The template enables hosted mode with:

- public origin `https://seahyingcong.com`
- private bind address `172.18.0.1:4182`
- public cookie path `/api/forest-crew`
- eight durable admissions per UTC day
- state under `/var/lib/forest-crew`

The backend deployment is tested on Node 20.20.2 with Codex 0.148.0. The
frontend build continues to use Node 24. Authenticate Codex as the service user
with the intended ChatGPT account before starting systemd. No API-key fallback
is configured.

```sh
sudo install -d -m 0700 -o ubuntu -g ubuntu /var/lib/forest-crew
sudo install -d -m 0750 -o root -g ubuntu /etc/forest-crew
sudo install -m 0644 deploy/forest-crew.service /etc/systemd/system/forest-crew.service
sudo install -m 0640 -o root -g ubuntu deploy/crew.env.example /etc/forest-crew/crew.env
# Edit /etc/forest-crew/crew.env and load both secrets from the approved store.
sudo systemctl daemon-reload
sudo systemctl enable --now forest-crew
```

## Edge setup

Configure `FOREST_CREW_EDGE_KEY` as an encrypted Worker secret with the same
value as the bridge. The remaining non-secret Worker settings live in
`../wrangler.jsonc`. Deploying the Worker attaches only the explicit
`/api/forest-crew/*` route; preview URLs and `workers.dev` are disabled.

```sh
npx wrangler secret put FOREST_CREW_EDGE_KEY
npx wrangler deploy
```

Every hosted request must cross the Worker and carry its edge header. POST
requests additionally require the exact public origin, JSON content type and
`X-Forest-Crew: 1`. `/access` verifies the invitation and issues the access
cookie. `/session`, `/frame` and `/stop` then require that cookie; frame and stop
also require the current session-owner cookie. `/status` is readable without an
invite after the edge check and reports readiness without returning tokens.

## Operational boundaries

Only one session can be active. The restart-proof ledger admits eight session
starts per UTC day by default; malformed ledger data fails closed. Owner restarts
also consume an admission. Each session ends after five minutes or 15 seconds of
player inactivity, and each actor is limited to six decisions and 14 tool calls
per turn. Event and learned-skill storage remain bounded as described in
`../server/README.md`.

This deployment is an invitation-only demonstration backed by one authenticated
account. It is not a multi-tenant service, and the invitation is a bearer
privilege. Preserve the ordinary Grove 01 route and local contributor mode when
updating the hosted build. Do not describe unit tests or saved methods as proof
that the crew adapts across players or scenarios.
