# Gesture interception and replay

This development harness substitutes raw MediaPipe hand landmarks for the webcam worker's output. The game still derives finger flex, walking versus pointing intent, calibration, hand ownership, steering, aim smoothing, UI dwell and movement through its normal code. It does not teleport the avatar or set `forward` or `spraying` directly.

It supports both synthetic gestures and previously captured hand telemetry. The skeleton display shows the injected joints. Run against `npm run dev`, not the production preview: the replay API is only enabled in a development build with `?qa=1&replay=1`. Normal play is unchanged.

## Run a repeatable control check

Start the dev server in one terminal, then run:

```sh
npm run test:gestures -- --recipe hose-sweep
npm run test:gestures -- --recipe walk-turn
npm run test:gestures -- --recipe hand-count
```

`hose-sweep` calibrates, points, sweeps the hose, opens the palm to stop, and loses tracking. `walk-turn` calibrates, alternates two fingers, turns both ways, walks backwards with the thumb extended, and stops. `hand-count` introduces a brief phantom second walking hand, then a sustained second hand and return to one hand. These are synthetic control tests, not real people or model-driven teammates.

Add `--headed` to watch the browser. `--mode auto|one-hand|two-hand` selects the same preference as the game's settings; default is auto. Chrome must be installed for the Playwright runner. The runner opens a separate isolated browser, leaving the player's current camera session alone.

## Reproduce a private recording

The runner accepts exported telemetry JSON arrays, NDJSON, `.json.gz`/`.ndjson.gz`, and version-1 raw joint recordings:

```sh
npm run test:gestures -- --recording /absolute/private/path/telemetry.ndjson.gz --from 0 --to 18000
```

Times are milliseconds relative to the recording's first `hands` event. Original input cadence, empty hand detections and missing-frame gaps are retained. The selected segment begins in a fresh game with normal calibration. If a clip starts after calibration, `--warmup 2300` explicitly repeats its first visible hand pose before replay. Warmup also runs the normal game and can produce movement or spray; it is not restoration of the original calibration or world state. Prefer a segment containing its own calibration when available.

Old recordings can lack camera aspect ratio; the report warns when it assumes 4:3. New `hands` events include the actual aspect. Replay uses the landmark samples already detected in the recording; it cannot recover fingers that the original camera failed to detect. Video-only recordings must first have landmarks extracted; this tool does not do that extraction.

Example portable schema (each landmark array must contain all 21 finite x/y/z points):

```js
{version: 1, frames: [{t: 0, aspect: 4/3, hands: [{id: 'Left', landmarks: joints}]}]}
```

In a local replay tab, browser automation can use `window.__forestGestureReplay.load(recording)`, `.play()`, `.status()`, `.stop()` and `.trace()`. Load validates and copies the whole recording before replacing a running replay. Stop, tracking loss and playback completion clear movement/spray. Reload or call the game's QA reset before another comparable trial; loading input alone does not restore arbitrary world state. The CLI always creates a fresh page.

## Evidence and limits

Each run writes `report.json`, compressed `trace.json.gz`, and up to two screenshots under gitignored `.agent-data/gesture-replays/`. No duplicate webcam video is created. Use `--out /private/path` to choose an output directory. Inputs are limited to 30 MB, each run to a two-minute segment, and browser traces to 25,000 events. Artifacts are private and can contain recorded hand geometry. Remove old run directories when no longer needed; the harness does not delete the original recording or upload artifacts.

The report includes forward/backward and turning ranges, spraying versus actual water flow, displacement, input modes, scheduling lateness, errors, and end-of-run stop checks. Synthetic recipes have behavioral assertions; a saved-recording pass means the replay ran cleanly, not that the player's intended action was understood. Inspect the trace and screenshot against the reported problem.

Camera access and gameplay recording are disabled for replay. AI crew creation is disabled even if the query includes `crew=1`; the CLI also blocks and reports any `/api/` request. This keeps synthetic playtests out of the review archive and avoids spending model quota. Testing real teammate cooperation remains a separate test.

Playback is at 1x wall-clock time through the rendered game. A tab suspension or frame gap above 250 ms interrupts the run instead of injecting a misleading burst of old gestures. This reproduces control interpretation, not the original GPU load, camera recognition, complete game state, AI decisions or human comfort. A successful replay supports a fix; a fresh human playtest still confirms whether it feels right.
