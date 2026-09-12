# Contributing to Forest Crew

Thanks for helping with Forest Crew. The most useful contributions improve one observable part of the game while preserving its privacy and evidence boundaries.

## Set up

Use Node.js 24 (the version in `.nvmrc`) and npm:

```sh
nvm use
npm ci
npm test
npm run build
```

Run `npm run dev` and open <http://127.0.0.1:4180/> for interactive work. Camera input needs localhost/loopback or HTTPS. Most simulation and protocol changes can be tested without granting camera permission.

## Good entry points

- Gesture and movement behavior: `src/one-hand-controller.mjs`, `src/hose-gesture.mjs`, and `src/handwalk/`
- Grove rendering and effects: `src/environment.ts`, `src/fire-effects.ts`, and `src/render-quality.mjs`
- Deterministic game rules: `src/fire-simulation.mjs`, `prototype/crew-world.mjs`, and their tests
- Real agent bridge and tools: `server/` and [server/README.md](server/README.md)
- Accessibility, instructions, and HUD: `src/input-runtime.ts`, `src/controls.css`, and `src/style.css`

Keep simulation, gesture interpretation, model access, and storage separated. Do not put provider credentials in browser code. Scripted fixtures and deterministic callers must be described as tests; a live-agent claim requires provider-backed model calls and resulting authoritative world actions.

## Send a change

1. Open a focused issue or pull request that states the player-visible problem.
2. Add or update a meaningful test when game rules, safety bounds, or protocol behavior change.
3. Run `npm test` and `npm run build`.
4. Describe manual browser checks separately from automated checks. A headless fixture does not establish camera comfort, visual quality, or live AI behavior.
5. Keep private recordings, screenshots containing people, credentials, `.env` files, and `playtests/` artifacts out of commits and public issues.

New assets must be original or redistributable under clear terms. Add source, author, license, modification details, and a stable source link beside the asset's license record. Existing attribution is indexed in [public/licenses/THIRD_PARTY_NOTICES.md](public/licenses/THIRD_PARTY_NOTICES.md), with detailed records in [public/models/ASTRONAUT-LICENSE.md](public/models/ASTRONAUT-LICENSE.md), [public/models/COAST-ROCKS-LICENSE.md](public/models/COAST-ROCKS-LICENSE.md), [public/models/FERN-LICENSE.md](public/models/FERN-LICENSE.md), and [public/textures/LICENSE.md](public/textures/LICENSE.md).

The project source currently has no declared license. Third-party components and assets remain governed by their own licenses.
