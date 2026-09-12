import test from 'node:test';
import assert from 'node:assert/strict';
import {createFireSimulation} from '../src/fire-simulation.mjs';

const sprayFor = (simulation, seconds, impact, options = {}) => {
  const dt = options.dt ?? 0.05;
  let snapshot;
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) {
    snapshot = simulation.update(dt, {spraying: true, impact, pressure: options.pressure ?? 1});
  }
  return snapshot;
};

test('spray cools only patches inside the forgiving impact falloff', () => {
  const simulation = createFireSimulation();
  sprayFor(simulation, 5, {x: 100, z: 100});
  assert.deepEqual(simulation.snapshot().patches.map(patch => patch.heat), [1, 1, 1]);
  const hit = sprayFor(simulation, 2, {x: -1.3, z: 15});
  assert.ok(hit.patches[0].heat < 1);
  assert.ok(hit.patches[0].wetness > 0);
  assert.equal(hit.complete, false);
});

test('inactive, absent pressure, non-positive pressure, and invalid updates cannot complete a fire', () => {
  const simulation = createFireSimulation({patches: [{id: 'only', x: 0, z: 0, radius: 1}]});
  for (let i = 0; i < 1000; i++) {
    simulation.update(1, {spraying: true, impact: {x: 0, z: 0}});
    simulation.update(1, {spraying: true, impact: {x: 0, z: 0}, pressure: 1, active: false});
    simulation.update(Infinity, {spraying: true, impact: {x: 0, z: 0}, pressure: 1});
    simulation.update(1, {spraying: true, impact: {x: NaN, z: 0}, pressure: 1});
    simulation.update(1, {spraying: true, impact: {x: 0, z: 0}, pressure: 0});
  }
  const snapshot = simulation.snapshot();
  assert.equal(snapshot.patches[0].heat, 1);
  assert.ok(Math.abs(snapshot.elapsed - 150) < 1e-9);
  assert.equal(snapshot.waterSeconds, 0);
});

test('three default patches complete after a deliberate roughly half-minute sweep', () => {
  const simulation = createFireSimulation();
  let snapshot;
  for (const impact of [{x: -1.3, z: 15}, {x: 0.6, z: 16}, {x: 2.6, z: 15}]) {
    snapshot = sprayFor(simulation, 11, impact);
  }
  assert.equal(snapshot.complete, true);
  assert.equal(snapshot.extinguished, 3);
  assert.equal(snapshot.total, 3);
  assert.ok(snapshot.waterSeconds >= 25 && snapshot.waterSeconds <= 40);
  assert.equal(snapshot.progress, 1);
});

test('small update interval variation produces broadly invariant cooling', () => {
  const run = dt => {
    const simulation = createFireSimulation({patches: [{id: 'only', x: 0, z: 0, radius: 1}]});
    return sprayFor(simulation, 8, {x: 0, z: 0}, {dt}).patches[0].heat;
  };
  assert.ok(Math.abs(run(1 / 60) - run(0.05)) < 0.006);
  assert.ok(Math.abs(run(0.02) - run(0.05)) < 0.006);
});

test('extinguished patches stay secure and complete is emitted once', () => {
  const events = [];
  const simulation = createFireSimulation({
    patches: [{id: 'only', x: 0, z: 0, radius: 1}],
    onEvent: (type, data) => events.push({type, data}),
  });
  sprayFor(simulation, 14, {x: 0, z: 0});
  for (let i = 0; i < 500; i++) simulation.update(0.05, {spraying: false, impact: null, pressure: 1});
  assert.equal(simulation.snapshot().patches[0].heat, 0);
  assert.equal(events.filter(event => event.type === 'extinguish').length, 1);
  assert.equal(events.filter(event => event.type === 'complete').length, 1);
  assert.ok(events.filter(event => event.type === 'water-impact').length <= 70);
});

test('reset deterministically restores initial heat and counters', () => {
  const simulation = createFireSimulation({patches: [{id: 'warm', x: 2, z: 3, radius: 1, heat: 0.6}]});
  const initial = simulation.snapshot();
  sprayFor(simulation, 3, {x: 2, z: 3});
  assert.deepEqual(simulation.reset(), initial);
  assert.deepEqual(simulation.snapshot(), initial);
});

test('validates patch definitions and snapshots cannot mutate simulation state', () => {
  assert.throws(() => createFireSimulation({patches: []}), /non-empty array/);
  assert.throws(() => createFireSimulation({patches: [{id: 'x', x: 0, z: 0, radius: -1}]}), /invalid fire patch/);
  const simulation = createFireSimulation();
  const snapshot = simulation.snapshot();
  snapshot.patches[0].heat = 0;
  assert.equal(simulation.snapshot().patches[0].heat, 1);
});
