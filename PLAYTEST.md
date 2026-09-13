# First grove: one clear playtest

Build `grove-01`, scenario `hose-baseline`, scene seed `73011`. The test is: **Can a new player move to the fire, switch naturally to the hose, and enjoy sweeping it out?**

## What is implemented

One volcanic grove, pink deck, open blue water, a grounded embodied avatar using Hand Walk's controller and assisted gait, a supplied hose, three heat patches, and bounded game/webcam/diagnostic recording. This is a physical interaction study. The pump is already supplying water. No teammate shown or claimed as model-driven; there is no learned skill or oxygen reward in this build.

## Run

`npm ci` then `npm run dev` starts standalone local play at http://127.0.0.1:4180/. It needs neither Oracle nor a model provider to run. `npm run dev:review` uses `FOREST_PLAYTEST_SERVICE_KEY` from the maintainer’s environment if supplied; it never obtains credentials over SSH. Without it, local recording continues. No microphone is requested.

The browser's camera permission prompt is a browser setup step. After that:

1. Show one or two hands in front of the camera. Auto walking mode selects a stable hand count after 600 ms; short detection flickers do not change modes. A persistent skeleton-only guide shows exactly what is detected. Desktop two-hand mode remains available.
2. Walk your index and middle fingers to move; quicker steps increase pace. Point those two fingers left/right to steer or pan; the arrow previews the turn. Stop stepping to stop walking and point straight to stop turning. Absolute hand position does not steer. Open palm stops and resets straight ahead. To reverse, extend your thumb outward while finger-walking; tuck it back to walk forward. The guide shows REVERSE when engaged. Keep ring and little fingers relaxed/curling so an intentional full open palm remains a clear stop.
3. Straighten one index finger with the others curled to enter the hose. Hold that entry pose briefly (150 ms); once spraying, bends in the pointing finger are tolerated. Your other hand can be absent or relaxed; the gesture is the same in either walking mode. Sweep the reticle across the fires. Show your walking fingers again for 180 ms to return to walking, or open your palm to stop. Uncertain poses after aiming stop water and keep walking paused. The hose reaches 14 metres; an amber aim ring means move closer or aim lower.
4. Point and dwell on Pause or Settings to access controls and recording opt-out. The optional HUD starts collapsed. The hand skeleton stays visible; the raw webcam image is hidden.
5. Avoid the flames. Contact burns the suit, lowers health and displays a warning. Retreat to cool and recover. At zero health, rescue returns you to the deck without resetting the fires.

Desktop two-hand mode retains Hand Walk's wrist height/depth steering and backward cycles. Settings defaults to Auto, with remembered one-hand and two-hand overrides available. A second hand must remain for 600 ms before Auto switches; aiming freezes walking-mode selection. The two-hand controller never receives a one-hand walking sample. One-hand walking follows the nearest continuing hand rather than handedness labels. The hose bridges sample delays up to 450 ms, but an observed released gesture or missing hands stops it immediately. Browser camera permission remains an unavoidable browser setup action.

Recording starts five seconds after tracking is ready, with a visible opt-out remembered for this browser. Local video and metadata share a 20,000,000-byte rotating buffer. The optional Oracle archive is shared with the existing review service: compression begins above 20,000,000 bytes and oldest recordings are removed at 30,000,000 bytes. The local bridge tags session manifests `forest-crew/0.2.2/local-preview`; telemetry distinguishes `grove-01` / `hose-baseline` from `crew-supply-preview` / `agent-supply`. The stable published Grove 01 retains its own release tag. Neither buffer guarantees every past session is retained.

## Test discipline

First inspect the actual engine frame against the approved concept. Keep that visual feedback separate from the control test. The render has NOT been approved merely because it loads or runs smoothly.

For the control baseline, use the same window size, camera position, lighting, controller defaults, seed and three patches. Give the player only the on-screen instructions. Let them attempt the incident for up to three minutes. Record when they discover walking and the hose, accidental mode changes, missed/lagged steering, tracking losses, water aim versus impact, and whether extinguishing feels satisfying. Note help given instead of treating an assisted finish as independent success.

Change one control mechanism after reviewing the replay. Repeat the baseline, then vary one condition. Agent behaviour is a separate test in Build 2; do not mix synthetic protocol outcomes into human usability results.

## Evidence and limits

Automated hand samples and direct simulation inputs are labelled fixtures. They test wiring, stale-input stops, bounds and effects, not comfort or recogniser performance on a real person. Headless browser frame rate does not certify performance on another device. Camera imagery can only be captured once permission is granted and the visible recording notice has run.

`?view=scene` is an actual live engine establishing view for art review; it does not start the camera or playtest recording. `?qa=1` exposes synthetic testing hooks and must not be presented as human play or real-agent evidence. Private test artifacts live under ignored `playtests/`.

## Separate crew preview

`?crew=1` and the local bridge add two real AI supply teammates. Keep this separate from the gesture baseline: assess requests, acceptance, task outcomes and pressure, then inspect learned methods. See [server/README.md](server/README.md). AI crew behavior is now implemented as a local preview; cross-episode adaptation and human team playtests are still unverified.
