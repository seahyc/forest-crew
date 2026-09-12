import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'playtests/grove-01');
const screenshots = path.join(out, 'screenshots');
const logs = path.join(out, 'logs');
const targetUrl = new URL(process.env.FOREST_PLAYTEST_URL || 'http://127.0.0.1:4180/');
targetUrl.searchParams.set('qa', '1');
const expectMirror = process.env.FOREST_EXPECT_MIRROR === '1';
await mkdir(screenshots, { recursive: true });
await mkdir(logs, { recursive: true });

const errors = [];
const requests = [];
const checks = [];
const check = (name, pass, evidence, fixture) => checks.push({ name, pass: Boolean(pass), fixture, evidence });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--use-angle=metal', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

function observe(page) {
  page.on('pageerror', error => errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ type: 'console', message: message.text() });
  });
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  page.on('requestfailed', request => errors.push({ type: 'requestfailed', message: `${request.url()} ${request.failure()?.errorText ?? ''}` }));
}

const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
observe(page);

async function dwellAt(selector) {
  const button = await page.locator(selector).boundingBox();
  if (!button) throw new Error(`Gesture target is not visible: ${selector}`);
  const viewport = page.viewportSize();
  const target = { x: (button.x + button.width / 2) / viewport.width, y: (button.y + button.height / 2) / viewport.height };
  await page.evaluate(async target => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const pointX = .85 - .7 * target.x, pointY = .12 + .7 * target.y;
    const hand = (id, extra) => { const x = id === 'pointer' ? .35 : .65; return { id, indexFlex: .35, middleFlex: .35, roll: 0, wristX: x, wristY: .45, pointX: x, pointY: .45, palmScale: 1, fist: false, open: false, pointing: false, ...extra }; };
    for (let i = 0; i < 75; i++) { window.__forestInputQA.injectHands([hand('pointer', { pointing: true, pointX, pointY }), hand('support', { open: true })], [], performance.now()); await sleep(18); }
  }, target);
}

try {
  await page.goto(targetUrl.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__forestQA?.ready() === true, null, { timeout: 45_000 });
  await page.waitForFunction(() => window.__forestInputQA?.diagnostics().workerReady === true, null, { timeout: 35_000 });
  const loaded = await page.evaluate(() => ({ avatar: window.__forestQA.avatar(), input: window.__forestQA.input(), render: window.__forestQA.renderSize() }));
  check('model-physics-worker-ready', loaded.avatar.ready && loaded.input.workerReady && loaded.render.width > 0, loaded, 'browser-runtime');
  const collapsedHud = await page.evaluate(() => { const hud = document.querySelector('.forest-input__hud'), details = document.querySelector('.forest-input__record'), style = getComputedStyle(hud); return { ariaHidden: hud?.getAttribute('aria-hidden'), open: hud?.classList.contains('is-open'), visibility: style.visibility, recordingDetailsVisible: Boolean(details && details.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) }; });
  check('playtest-hud-collapsed-by-default', collapsedHud.ariaHidden === 'true' && collapsedHud.open === false && collapsedHud.recordingDetailsVisible === false, collapsedHud, 'browser-runtime');
  const focuslessDispatch = await page.evaluate(async () => { const sleep = ms => new Promise(resolve => setTimeout(resolve, ms)); const before = window.__forestInputQA.diagnostics().workerFrame; Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => false }); await sleep(700); const after = window.__forestInputQA.diagnostics(); delete document.hasFocus; return { before, after: after.workerFrame, hidden: after.documentHidden, reportedFocus: after.documentFocused }; });
  check('visible-focusless-viewport-dispatches-real-worker', focuslessDispatch.hidden === false && focuslessDispatch.reportedFocus === false && focuslessDispatch.after > focuslessDispatch.before, focuslessDispatch, 'real-worker-fake-camera-no-hand-claim');
  await page.evaluate(() => {
    window.__qaCompletionSignals = 0;
    const node = document.querySelector('#completion');
    new MutationObserver(() => { if (!node.hidden) window.__qaCompletionSignals++; }).observe(node, { attributes: true, attributeFilter: ['hidden'] });
  });
  // The real worker/model has loaded. Detach the synthetic camera before hand
  // fixtures so its expected zero-hand frames cannot overwrite injected input.
  await page.evaluate(() => { document.querySelector('.forest-input__camera video').srcObject = null; });

  const handResult = await page.evaluate(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const hand = (id, x, flex = .35) => ({ id, indexFlex: flex, middleFlex: .35, roll: 0, wristX: x, wristY: .45, pointX: x, pointY: .45, palmScale: 1, fist: false, open: false, pointing: false });
    const frames = [];
    for (let i = 0; i < 150; i++) {
      const now = performance.now();
      frames.push(window.__forestInputQA.injectHands([hand('left', .35), hand('right', .65)], [], now));
      await sleep(18);
    }
    const calibrated = window.__forestInputQA.diagnostics();
    const before = window.__forestQA.snapshot();
    for (let i = 0; i < 250; i++) {
      const phase = i % 12 < 6;
      const now = performance.now();
      frames.push(window.__forestInputQA.injectHands([
        hand('left', .35, phase ? .62 : .22),
        hand('right', .65, phase ? .22 : .62),
      ], [], now));
      await sleep(18);
    }
    return { calibrated, before, after: window.__forestQA.snapshot(), maxForward: Math.max(...frames.map(frame => frame.forward || 0)) };
  });
  const handDistance = Math.hypot(handResult.after.position.x - handResult.before.position.x, handResult.after.position.z - handResult.before.position.z);
  check('sampled-hands-calibrate-and-walk', handResult.calibrated.mode === 'walk' && handResult.maxForward > .05 && handDistance > .1, { mode: handResult.calibrated.mode, maxForward: handResult.maxForward, distance: handDistance }, 'continuous-sampled-hands');

  await page.evaluate(async () => {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const hand = (id, extra) => { const x = id === 'pointer' ? .38 : .65; return { id, indexFlex: .35, middleFlex: .35, roll: 0, wristX: x, wristY: .45, pointX: x, pointY: .45, palmScale: 1, fist: false, open: false, pointing: false, ...extra }; };
    for (let i = 0; i < 35; i++) {
      window.__forestInputQA.injectHands([
        hand('pointer', { pointing: true, pointX: .48, pointY: .48 }),
        hand('support', { open: true }),
      ], [], performance.now());
      await sleep(18);
    }
  });
  const hoseFrame = await page.evaluate(() => window.__forestQA.snapshot());
  check('sampled-hands-hose-switch', hoseFrame.input.mode === 'hose' && hoseFrame.input.spraying === true && hoseFrame.tool?.ready === true, { input: hoseFrame.input, tool: hoseFrame.tool }, 'continuous-sampled-hands');
  await page.screenshot({ path: path.join(screenshots, 'gameplay-hose.png') });

  await wait(350);
  const stale = await page.evaluate(() => window.__forestQA.snapshot());
  check('sampled-hands-stale-stop', stale.input.mode === 'lost' && stale.input.active === false && stale.speed < .02, { input: stale.input, speed: stale.speed }, 'continuous-sampled-hands');

  // Simulation-level movement checks exercise world/physics contracts directly.
  await page.evaluate(() => { window.__forestQA.reset(); window.__forestQA.override({ active: true, forward: 1, turn: 0, headingTarget: 0, gait: { run: 0 }, mode: 'walk', aim: { x: .5, y: .5 }, spraying: false }); });
  await wait(4300);
  const forward = await page.evaluate(() => window.__forestQA.snapshot());
  const cameraOffset = { y: forward.camera.position.y - forward.position.y, targetY: forward.camera.target.y - forward.position.y };
  check('forward-displacement-and-level-camera', forward.position.z > 3 && Math.abs(cameraOffset.y - 3.4) < .15 && Math.abs(cameraOffset.targetY - 1.35) < .02, { position: forward.position, cameraOffset }, 'qa-override-simulation');
  await page.screenshot({ path: path.join(screenshots, 'gameplay-near-grove.png') });

  await page.evaluate(() => window.__forestQA.override({ active: true, forward: 0, turn: 0, gait: {}, mode: 'hose', aim: { x: .5, y: .5 }, spraying: false }));
  await wait(1000); // Let the follow camera settle before projecting a fixed screen aim.
  const rayAim = await page.evaluate(() => window.__forestQA.aimFor(-1.3, 15));
  const rayHeatBefore = await page.evaluate(() => window.__forestQA.snapshot().fire.heatRemoved);
  await page.evaluate(aim => window.__forestQA.override({ active: true, forward: 0, turn: 0, gait: {}, mode: 'hose', aim, spraying: true }), rayAim);
  await wait(900);
  const rayResult = await page.evaluate(() => ({ heatRemoved: window.__forestQA.snapshot().fire.heatRemoved, impact: window.__forestQA.snapshot().impact }));
  check('screen-aim-ray-cools-target', rayResult.heatRemoved > rayHeatBefore && rayResult.impact && Math.hypot(rayResult.impact.x + 1.3, rayResult.impact.z - 15) < .3, { aim: rayAim, before: rayHeatBefore, after: rayResult }, 'qa-override-browser-ray');

  await page.evaluate(() => window.__forestQA.override({ active: true, forward: -1, turn: 0, headingTarget: 0, gait: { run: 0 }, mode: 'walk', aim: { x: .5, y: .5 }, spraying: false }));
  const reverseBefore = await page.evaluate(() => window.__forestQA.snapshot().position.z);
  await wait(900);
  const reverse = await page.evaluate(() => window.__forestQA.snapshot());
  check('reverse-direct-input', reverse.position.z < reverseBefore - .25 && reverse.signedSpeed < 0, { beforeZ: reverseBefore, after: reverse.position, signedSpeed: reverse.signedSpeed }, 'qa-override-simulation');

  await page.evaluate(() => { window.__forestQA.reset(); window.__forestQA.override({ active: true, forward: -1, turn: 0, headingTarget: 0, gait: { run: 0 }, mode: 'walk', aim: { x: .5, y: .5 }, spraying: false }); });
  await wait(2500);
  const boundary = await page.evaluate(() => window.__forestQA.snapshot());
  check('bounded-walkable-island-stop', boundary.blocked === true && boundary.position.z >= -7.45, { position: boundary.position, blocked: boundary.blocked, displacement: boundary.displacement }, 'qa-override-simulation');

  // Invalid aim and stopped spray cannot cool the simulation.
  await page.evaluate(() => { window.__forestQA.reset(); window.__forestQA.override({ active: true, forward: 0, turn: 0, gait: {}, mode: 'hose', aim: { x: 0, y: 0 }, spraying: true, impact: { x: 80, z: 80 } }); });
  const invalidBefore = await page.evaluate(() => window.__forestQA.snapshot().fire.heatRemoved);
  await wait(700);
  const invalidAfter = await page.evaluate(() => window.__forestQA.snapshot().fire.heatRemoved);
  check('invalid-aim-cannot-cool', invalidAfter === invalidBefore, { before: invalidBefore, after: invalidAfter }, 'qa-override-simulation');
  await page.evaluate(() => window.__forestQA.override({ active: false, forward: 0, turn: 0, gait: {}, mode: 'hose', aim: { x: .5, y: .5 }, spraying: true, impact: { x: -1.3, z: 15 } }));
  const stoppedBefore = await page.evaluate(() => window.__forestQA.snapshot().fire.heatRemoved);
  await wait(700);
  const stoppedAfter = await page.evaluate(() => window.__forestQA.snapshot().fire.heatRemoved);
  check('inactive-spray-has-no-effect', stoppedAfter === stoppedBefore, { before: stoppedBefore, after: stoppedAfter }, 'qa-override-simulation');

  // Aim each patch through the QA projection helper, while the explicit impact
  // keeps this a deterministic simulation-level fire test.
  await page.evaluate(() => window.__forestQA.reset());
  const fireStart = await page.evaluate(() => window.__forestQA.snapshot().fire);
  const patchEvidence = [];
  for (const patch of fireStart.patches) {
    const aim = await page.evaluate(({ x, z }) => window.__forestQA.aimFor(x, z), patch);
    await page.evaluate(({ patch, aim }) => window.__forestQA.override({ active: true, forward: 0, turn: 0, gait: {}, mode: 'hose', aim, spraying: true, impact: { x: patch.x, z: patch.z } }), { patch, aim });
    const beforeHeat = await page.evaluate(id => window.__forestQA.snapshot().fire.patches.find(p => p.id === id).heat, patch.id);
    await page.waitForFunction(id => window.__forestQA.snapshot()?.fire?.patches.find(p => p.id === id)?.extinguished === true, patch.id, { timeout: 22_000 });
    const afterPatch = await page.evaluate(id => window.__forestQA.snapshot().fire.patches.find(p => p.id === id), patch.id);
    patchEvidence.push({ id: patch.id, aim, beforeHeat, afterHeat: afterPatch.heat, extinguished: afterPatch.extinguished });
  }
  const fireComplete = await page.evaluate(() => window.__forestQA.snapshot().fire);
  check('valid-hose-aim-cools-and-completes', patchEvidence.every(p => p.beforeHeat > p.afterHeat && p.extinguished) && fireComplete.complete && fireComplete.extinguished === 3, { patches: patchEvidence, complete: fireComplete.complete, extinguished: fireComplete.extinguished }, 'qa-override-simulation');
  await page.waitForFunction(() => !document.querySelector('#completion').hidden);
  await wait(400); // Require one transition across multiple HUD refreshes.
  const completionSignals = await page.evaluate(() => window.__qaCompletionSignals);
  check('completion-ui-signalled-once', completionSignals === 1, { completionSignals }, 'browser-runtime');
  await page.screenshot({ path: path.join(screenshots, 'gameplay-complete.png') });

  // The remembered default starts local recording five seconds after camera readiness.
  await wait(12_000);
  const recording = await page.evaluate(async () => {
    const opened = await new Promise((resolve, reject) => { const req = indexedDB.open('forest-crew-recordings'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const rows = await new Promise((resolve, reject) => { const tx = opened.transaction('entries', 'readonly'); const req = tx.objectStore('entries').getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const clips = rows.filter(row => row.kind === 'clip');
    const latest = clips.at(-1);
    let decoded = null;
    if (latest?.blob) {
      const url = URL.createObjectURL(latest.blob);
      try { decoded = await new Promise((resolve, reject) => { const video = document.createElement('video'); const timer = setTimeout(() => reject(new Error('decode timeout')), 8000); video.onloadedmetadata = () => { clearTimeout(timer); resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration, bytes: latest.blob.size, mimeType: latest.blob.type }); }; video.onerror = () => { clearTimeout(timer); reject(new Error('decode failed')); }; video.src = url; video.load(); }); } finally { URL.revokeObjectURL(url); }
    }
    const records = rows.filter(row => row.kind === 'telemetry').flatMap(row => row.records ?? []);
    return { rowCount: rows.length, clipCount: clips.length, kinds: rows.map(row => row.kind), completeEvents: records.filter(record => record.type === 'complete').length, decoded };
  });
  check('bounded-local-recording-decodes', recording.clipCount >= 1 && recording.decoded?.width === 480 && recording.decoded?.height === 270 && recording.decoded.bytes > 0, recording, 'browser-local-recording');
  check('completion-event-persisted-once', recording.completeEvents === 1, { completeEvents: recording.completeEvents }, 'browser-local-recording');

  const remote = requests.filter(({ url }) => { try { const parsed = new URL(url); return !['127.0.0.1', 'localhost'].includes(parsed.hostname) && !['data:', 'blob:'].includes(parsed.protocol); } catch { return false; } });
  const playtestWrites = requests.filter(request => { try { return request.method === 'POST' && new URL(request.url).pathname.includes('/api/playtests/'); } catch { return false; } });
  if (expectMirror) check('mirror-configured-writes-playtest-http', loaded.input.recording.mirrorConfigured === true && playtestWrites.length > 0, { mirrorConfigured: loaded.input.recording.mirrorConfigured, playtestWrites }, 'browser-network');
  else check('mirror-unconfigured-no-remote-playtest-http', loaded.input.recording.mirrorConfigured === false && playtestWrites.length === 0, { mirrorConfigured: loaded.input.recording.mirrorConfigured, playtestWrites, observedThirdPartyRequests: remote }, 'browser-network');

  // Stop the already-inspected recording by pointer dwell, then reload this
  // same context to prove the preference persists without loading two models.
  await dwellAt('.forest-input__hud-open');
  await page.waitForFunction(() => document.querySelector('.forest-input__hud')?.classList.contains('is-open'));
  await dwellAt('.forest-input__record-action');
  const optOut = await page.evaluate(() => ({ stored: localStorage.getItem('forest-crew-recording'), input: window.__forestInputQA.diagnostics(), button: document.querySelector('.forest-input__record-action')?.textContent }));
  await dwellAt('.forest-input__hud-close');
  const collapsedAfterOptOut = await page.evaluate(() => ({ open: document.querySelector('.forest-input__hud')?.classList.contains('is-open'), ariaHidden: document.querySelector('.forest-input__hud')?.getAttribute('aria-hidden') }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__forestQA?.ready() && window.__forestInputQA?.diagnostics().workerReady && /off/i.test(document.querySelector('.forest-input__countdown')?.textContent ?? ''), null, { timeout: 60_000 });
  const persisted = await page.evaluate(() => ({ stored: localStorage.getItem('forest-crew-recording'), countdown: document.querySelector('.forest-input__countdown')?.textContent }));
  check('pointer-dwell-hud-optout-close-persists', optOut.stored === 'off' && collapsedAfterOptOut.open === false && collapsedAfterOptOut.ariaHidden === 'true' && persisted.stored === 'off' && /off/i.test(persisted.countdown), { optOut, collapsedAfterOptOut, persisted }, 'continuous-sampled-hands-ui');
  await page.evaluate(() => window.__forestQA.clear());
} finally {
  await context.close();
  await browser.close();
}

const report = {
  generatedAt: new Date().toISOString(),
  url: targetUrl.href,
  expectedMirror: expectMirror,
  scope: 'Isolated headless browser smoke. Sampled hand fixtures are synthetic and do not establish human gesture usability.',
  passed: checks.filter(item => item.pass).length,
  failed: checks.filter(item => !item.pass).length,
  checks,
  errors,
  artifacts: ['screenshots/gameplay-hose.png', 'screenshots/gameplay-near-grove.png', 'screenshots/gameplay-complete.png'],
};
await writeFile(path.join(out, 'browser-qa.json'), `${JSON.stringify(report, null, 2)}\n`);
const actionableErrors = errors.filter(error => !(error.type === 'console' && error.message.startsWith('INFO: Created TensorFlow Lite')) && !(error.type === 'requestfailed' && error.message.startsWith('blob:') && error.message.includes('ERR_ABORTED')));
await writeFile(path.join(logs, 'browser-console.json'), `${JSON.stringify({ errors, actionableErrors, requests }, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, failed: report.failed, observedConsoleAndRequestDiagnostics: errors.length, actionableErrors: actionableErrors.length, failures: checks.filter(item => !item.pass).map(item => item.name), report: path.join(out, 'browser-qa.json') }, null, 2));
if (report.failed || actionableErrors.length) process.exitCode = 1;
