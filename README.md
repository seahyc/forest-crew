# Forest Crew

Forest Crew is an embodied cooperative firefighting and forest-restoration game. Walk with camera-tracked hand gestures, aim a hose, suppress fires, and coordinate with provider-backed AI crewmates through an authoritative game world.

[Play Grove 01](https://seahyingcong.com/making/forest-crew-grove-01/) — the stable gesture playtest. [AI Crew](https://seahyingcong.com/making/forest-crew-ai-crew/) is the invitation-only hosted cooperation demo.

The canonical development repository is [seahyc/forest-crew](https://github.com/seahyc/forest-crew). The milestone copies under `seahyc.github.io/projects-src/forest-crew/` is a publication snapshot used to build the website route; this repository is the development source of truth.

## Run locally

Requirements: Node.js 24 and npm.

```sh
git clone https://github.com/seahyc/forest-crew.git
cd forest-crew
npm ci
npm run dev
```

`npm run dev` starts the browser app and local crew bridge together. Open <http://127.0.0.1:4180/> for AI Crew, or add `?crew=0` for the solo gesture baseline. Allow camera access when the browser asks. Browsers permit camera access on `localhost`/loopback and secure HTTPS pages; use HTTPS if you serve the game from another hostname or device.

Grove 01 runs without model-provider credentials. Camera tracking runs in the browser. Recording starts automatically with a visible opt-out and a bounded local buffer; the owner’s published build also uploads to the optional private review archive. No camera imagery is sent to the AI crew.

The **local AI crew** is enabled by default. The server confirms the waiting roster before the firefighters appear; model calls start only when your hands activate play. Sign into the Codex CLI with your own account first. Two real model actors prepare and maintain your water supply. See [the crew setup and limits](server/README.md). This crew mode is not enabled on the public Grove 01 route.

The teal and amber accents identify teammates, not fixed jobs: either agent can fetch/connect the hose or repair/staff the pump. Work gestures reflect their actual task state. A finite 12-second starter reserve lets you practise aiming while they connect supply; it provides lower pressure and does not refill when crew supply disconnects. Teammates avoid one another while travelling and have separate pump workstations. After setup, one maintains the pump and the other stands by; autonomous fire suppression is not part of this slice.

Useful checks:

```sh
npm test
npm run build
npm run preview
```

## What is here

- `src/main.ts` wires the browser scene, controls, simulation, and telemetry together.
- `src/environment.ts`, `src/fire-effects.ts`, and `src/fire-simulation.mjs` implement the Babylon.js grove and fire loop.
- `src/input-runtime.ts`, `src/one-hand-controller.mjs`, and `src/handwalk/` contain camera input, gesture interpretation, locomotion, and bounded local recording.
- `server/` contains the server-side bridge for real model actors. Provider credentials stay on the server; see [server/README.md](server/README.md) for setup and the currently supported provider.
- `prototype/` contains the earlier deterministic tool-world protocol study. Its scripted callers test rules and are not evidence of AI agency.
- `tests/` covers the simulation, controls, recording boundaries, and agent tool-world contract.
- `public/` contains browser runtime files and redistributable assets with their license records.

The browser remains authoritative for movement and game physics. AI actors receive bounded observations and may choose structured game tools through the server bridge; they never receive provider credentials in client code. See [AGENTS-DESIGN.md](AGENTS-DESIGN.md) for the cooperation contract and [MVP.md](MVP.md) for the evidence gates used when claiming agent behavior.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Please report security or privacy issues through the private process in [SECURITY.md](SECURITY.md), and never attach camera recordings or private playtest artifacts to a public issue.

Forest Crew source licensing is currently unspecified. No license is granted for the project source merely because the repository is public. Third-party software and art retain their stated licenses and attribution; see [the third-party notices](public/licenses/THIRD_PARTY_NOTICES.md) and the linked records under `public/models/` and `public/textures/`.
