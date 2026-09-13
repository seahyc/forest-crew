const MODES = new Set(['one-hand', 'two-hand']);

const normalizeMode = (mode, fallback = 'one-hand') =>
  MODES.has(mode) ? mode : fallback;

const modeForCount = count => count === 2 ? 'two-hand' : 'one-hand';

const eligible = hand =>
  hand != null &&
  Number.isFinite(hand.indexFlex) &&
  Number.isFinite(hand.middleFlex) &&
  hand.fist !== true &&
  hand.open !== true &&
  (hand.aimPose !== undefined || hand.pointing !== true) &&
  hand.aimPose !== true;

export class WalkingModeController {
  constructor({initialMode = 'one-hand', settleMs = 600, staleMs = 450} = {}) {
    this.settleMs = settleMs;
    this.staleMs = staleMs;
    this.reset(initialMode);
  }

  reset(initialMode = 'one-hand') {
    this.mode = normalizeMode(initialMode);
    this.count = 0;
    this.candidateCount = 0;
    this.candidateSince = null;
    this.lastSampleAt = null;
    this.reason = 'reset';
    return this.read();
  }

  clearCandidate() {
    this.candidateCount = 0;
    this.candidateSince = null;
    this.lastSampleAt = null;
  }

  update(hands, now, {blocked = false, preference = 'auto'} = {}) {
    const forcedMode = MODES.has(preference) ? preference : null;
    const changedByPreference = forcedMode !== null && forcedMode !== this.mode;

    if (forcedMode !== null) {
      this.mode = forcedMode;
      this.count = Math.min(2, Array.isArray(hands) ? hands.filter(eligible).length : 0);
      this.clearCandidate();
      this.reason = `preference-${forcedMode}`;
      return this.snapshot(changedByPreference, false);
    }

    const count = Math.min(2, Array.isArray(hands) ? hands.filter(eligible).length : 0);
    this.count = count;

    if (blocked) {
      this.clearCandidate();
      this.reason = 'blocked';
      return this.snapshot(false, false);
    }

    if (!Number.isFinite(now)) {
      this.clearCandidate();
      this.reason = 'invalid-time';
      return this.snapshot(false, false);
    }

    if (count === 0) {
      this.clearCandidate();
      this.reason = 'no-authority';
      return this.snapshot(false, false);
    }

    const requestedMode = modeForCount(count);
    if (requestedMode === this.mode) {
      this.clearCandidate();
      this.reason = 'stable';
      return this.snapshot(false, false);
    }

    const continuous =
      this.candidateCount === count &&
      this.lastSampleAt !== null &&
      now >= this.lastSampleAt &&
      now - this.lastSampleAt <= this.staleMs;

    if (!continuous) {
      this.candidateCount = count;
      this.candidateSince = now;
    }
    this.lastSampleAt = now;

    if (now - this.candidateSince >= this.settleMs) {
      this.mode = requestedMode;
      this.clearCandidate();
      this.reason = `settled-${requestedMode}`;
      return this.snapshot(true, false);
    }

    this.reason = `pending-${requestedMode}`;
    return this.snapshot(false, true);
  }

  read(now) {
    if (
      this.candidateSince !== null &&
      Number.isFinite(now) &&
      this.lastSampleAt !== null &&
      now - this.lastSampleAt > this.staleMs
    ) {
      this.clearCandidate();
      this.reason = 'stale';
    }
    return this.snapshot(false, this.candidateSince !== null);
  }

  snapshot(changed, pending) {
    return {mode: this.mode, changed, pending, count: this.count, reason: this.reason};
  }
}
