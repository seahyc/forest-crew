import test from 'node:test';
import assert from 'node:assert/strict';
import {WalkingModeController} from '../src/walking-mode.mjs';

const hand = (overrides = {}) => ({indexFlex: .2, middleFlex: .3, ...overrides});

test('one eligible hand settles to two hands only after 600ms', () => {
  const c = new WalkingModeController();
  assert.deepEqual(c.update([hand(), hand()], 0), {mode: 'one-hand', changed: false, pending: true, count: 2, reason: 'pending-two-hand'});
  assert.equal(c.update([hand(), hand()], 300).mode, 'one-hand');
  assert.equal(c.update([hand(), hand()], 599).mode, 'one-hand');
  assert.deepEqual(c.update([hand(), hand()], 600), {mode: 'two-hand', changed: true, pending: false, count: 2, reason: 'settled-two-hand'});
});

test('short phantom second hand does not change mode', () => {
  const c = new WalkingModeController();
  assert.equal(c.update([hand(), hand()], 0).pending, true);
  assert.deepEqual(c.update([hand()], 300), {mode: 'one-hand', changed: false, pending: false, count: 1, reason: 'stable'});
  assert.equal(c.read(900).mode, 'one-hand');
});

test('two-hand mode settles back to one hand with the same dwell', () => {
  const c = new WalkingModeController({initialMode: 'two-hand'});
  assert.equal(c.update([hand()], 100).pending, true);
  assert.equal(c.update([hand()], 400).pending, true);
  assert.deepEqual(c.update([hand()], 700), {mode: 'one-hand', changed: true, pending: false, count: 1, reason: 'settled-one-hand'});
});

test('blocked and aim hands clear a transition and preserve mode', () => {
  const c = new WalkingModeController();
  c.update([hand(), hand()], 0);
  assert.deepEqual(c.update([hand(), hand()], 300, {blocked: true}), {mode: 'one-hand', changed: false, pending: false, count: 2, reason: 'blocked'});
  assert.deepEqual(c.update([hand(), hand({aimPose: true})], 700), {mode: 'one-hand', changed: false, pending: false, count: 1, reason: 'stable'});
  assert.equal(c.update([hand(), hand()], 800).pending, true);
  assert.equal(c.update([hand(), hand()], 1100).mode, 'one-hand');
});

test('zero eligible hands have no authority and never flip mode', () => {
  const c = new WalkingModeController({initialMode: 'two-hand'});
  c.update([hand()], 0);
  assert.deepEqual(c.update([], 500), {mode: 'two-hand', changed: false, pending: false, count: 0, reason: 'no-authority'});
  assert.equal(c.update([], 2000).mode, 'two-hand');
});

test('a stale sample gap cannot accumulate dwell', () => {
  const c = new WalkingModeController();
  c.update([hand(), hand()], 0);
  assert.equal(c.update([hand(), hand()], 400).pending, true);
  assert.deepEqual(c.read(851), {mode: 'one-hand', changed: false, pending: false, count: 2, reason: 'stale'});
  assert.equal(c.update([hand(), hand()], 1000).pending, true);
  assert.equal(c.update([hand(), hand()], 1400).mode, 'one-hand');
  assert.equal(c.update([hand(), hand()], 1600).mode, 'two-hand');
});

test('forced preferences apply immediately and clear pending auto selection', () => {
  const c = new WalkingModeController();
  c.update([hand(), hand()], 0);
  assert.deepEqual(c.update([], 100, {preference: 'two-hand'}), {mode: 'two-hand', changed: true, pending: false, count: 0, reason: 'preference-two-hand'});
  assert.deepEqual(c.update([hand()], 200, {preference: 'two-hand'}), {mode: 'two-hand', changed: false, pending: false, count: 1, reason: 'preference-two-hand'});
  assert.deepEqual(c.update([hand(), hand()], 300, {preference: 'one-hand'}), {mode: 'one-hand', changed: true, pending: false, count: 2, reason: 'preference-one-hand'});
});

test('only finite, unreserved hand samples count and count caps at two', () => {
  const c = new WalkingModeController();
  const invalid = [hand({indexFlex: NaN}), hand({middleFlex: Infinity}), hand({fist: true}), hand({open: true}), hand({pointing: true}), hand({aimPose: true})];
  assert.equal(c.update([...invalid, hand(), hand(), hand()], 0).count, 2);
});

test('explicit non-aim geometry overrides the legacy pointing flag', () => {
  const c = new WalkingModeController();
  assert.equal(c.update([hand({pointing: true})], 0).count, 0);
  assert.equal(c.update([hand({pointing: true, aimPose: false, walkingPose: false})], 10).count, 1);
});
