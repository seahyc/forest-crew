const DEFAULT_PATCHES = [
  {id: 'fire-1', x: -1.3, z: 15, radius: 1.25},
  {id: 'fire-2', x: 0.6, z: 16, radius: 1.4},
  {id: 'fire-3', x: 2.6, z: 15, radius: 1.15},
];

const STEP_SECONDS = 0.05;
const WATER_EVENT_SECONDS = 0.2;
const FALLOFF_RADIUS = 1.4;
const COOLING_PER_SECOND = 0.085;
const WETTING_PER_SECOND = 0.24;
const COOL_MARKS = [0.75, 0.5, 0.25];

const clamp01 = value => Math.max(0, Math.min(1, value));

function normalizePatches(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new TypeError('patches must be a non-empty array');
  }

  const ids = new Set();
  return input.map((patch, index) => {
    if (!patch || typeof patch !== 'object' || typeof patch.id !== 'string' || patch.id.length === 0 ||
        !Number.isFinite(patch.x) || !Number.isFinite(patch.z) ||
        !Number.isFinite(patch.radius) || patch.radius <= 0 ||
        (patch.heat !== undefined && !Number.isFinite(patch.heat))) {
      throw new TypeError(`invalid fire patch at index ${index}`);
    }
    if (ids.has(patch.id)) throw new TypeError(`duplicate fire patch id: ${patch.id}`);
    ids.add(patch.id);
    return Object.freeze({
      id: patch.id,
      x: patch.x,
      z: patch.z,
      radius: patch.radius,
      initialHeat: clamp01(patch.heat ?? 1),
    });
  });
}

function impactWeight(patch, impact) {
  const distance = Math.hypot(impact.x - patch.x, impact.z - patch.z);
  if (distance <= patch.radius) return 1;
  if (distance >= patch.radius + FALLOFF_RADIUS) return 0;
  const t = (distance - patch.radius) / FALLOFF_RADIUS;
  return 1 - t * t * (3 - 2 * t);
}

export function createFireSimulation({patches = DEFAULT_PATCHES, onEvent} = {}) {
  if (onEvent !== undefined && typeof onEvent !== 'function') {
    throw new TypeError('onEvent must be a function');
  }

  const definitions = normalizePatches(patches);
  let state;
  let waterEventAccumulator;
  let pendingWaterImpact;
  let completedEventSent;

  const emit = (type, data) => {
    if (!onEvent) return;
    try { onEvent(type, data); } catch { /* Observers cannot alter simulation. */ }
  };

  const makeSnapshot = () => {
    const extinguished = state.patches.filter(patch => patch.extinguished).length;
    const total = state.patches.length;
    const initialHeat = definitions.reduce((sum, patch) => sum + patch.initialHeat, 0);
    const remainingHeat = state.patches.reduce((sum, patch) => sum + patch.heat, 0);
    return {
      patches: state.patches.map(({id, x, z, radius, heat, wetness, extinguished}) => ({
        id, x, z, radius, heat, wetness, extinguished,
      })),
      progress: initialHeat === 0 ? 1 : clamp01(1 - remainingHeat / initialHeat),
      total,
      extinguished,
      complete: extinguished === total,
      elapsed: state.elapsed,
      waterSeconds: state.waterSeconds,
      heatRemoved: state.heatRemoved,
    };
  };

  const reset = () => {
    state = {
      patches: definitions.map(patch => ({
        id: patch.id,
        x: patch.x,
        z: patch.z,
        radius: patch.radius,
        heat: patch.initialHeat,
        wetness: patch.initialHeat === 0 ? 1 : 0,
        extinguished: patch.initialHeat === 0,
        coolingStage: 0,
        receivingWater: false,
      })),
      elapsed: 0,
      waterSeconds: 0,
      heatRemoved: 0,
    };
    waterEventAccumulator = 0;
    pendingWaterImpact = null;
    completedEventSent = state.patches.every(patch => patch.extinguished);
    return makeSnapshot();
  };

  const update = (dt, input = {}) => {
    if (!Number.isFinite(dt) || dt <= 0 || !input || typeof input !== 'object' || input.active === false) {
      return makeSnapshot();
    }

    const duration = Math.min(dt, STEP_SECONDS);
    state.elapsed += duration;
    const impact = input.impact;
    const pressure = input.pressure;
    const validImpact = impact && Number.isFinite(impact.x) && Number.isFinite(impact.z);
    const flowing = input.spraying === true && validImpact && Number.isFinite(pressure) && pressure > 0;
    if (!flowing) {
      for (const patch of state.patches) patch.receivingWater = false;
      return makeSnapshot();
    }

    const effectivePressure = clamp01(pressure);
    let updateRemoved = 0;
    let hitCount = 0;
    for (const patch of state.patches) {
      if (patch.extinguished) {
        patch.receivingWater = false;
        continue;
      }
      const weight = impactWeight(patch, impact);
      if (weight <= 0) {
        patch.receivingWater = false;
        continue;
      }

      hitCount += 1;
      if (!patch.receivingWater) emit('hit', {id: patch.id, heat: patch.heat, weight});
      patch.receivingWater = true;
      const removed = Math.min(patch.heat, COOLING_PER_SECOND * effectivePressure * weight * duration);
      patch.heat = clamp01(patch.heat - removed);
      patch.wetness = clamp01(patch.wetness + WETTING_PER_SECOND * effectivePressure * weight * duration);
      state.heatRemoved += removed;
      updateRemoved += removed;

      while (patch.coolingStage < COOL_MARKS.length && patch.heat <= COOL_MARKS[patch.coolingStage]) {
        emit('cool', {id: patch.id, heat: patch.heat, threshold: COOL_MARKS[patch.coolingStage]});
        patch.coolingStage += 1;
      }
      if (patch.heat <= Number.EPSILON) {
        patch.heat = 0;
        patch.wetness = 1;
        patch.extinguished = true;
        patch.receivingWater = false;
        emit('extinguish', {id: patch.id, elapsed: state.elapsed});
      }
    }

    if (hitCount > 0) {
      state.waterSeconds += duration;
      waterEventAccumulator += duration;
      pendingWaterImpact = {
        x: impact.x,
        z: impact.z,
        heatRemoved: (pendingWaterImpact?.heatRemoved ?? 0) + updateRemoved,
        patchCount: hitCount,
      };
      if (waterEventAccumulator >= WATER_EVENT_SECONDS) {
        emit('water-impact', {...pendingWaterImpact, duration: waterEventAccumulator});
        waterEventAccumulator %= WATER_EVENT_SECONDS;
        pendingWaterImpact = null;
      }
    }

    const result = makeSnapshot();
    if (result.complete && !completedEventSent) {
      completedEventSent = true;
      emit('complete', {elapsed: result.elapsed, waterSeconds: result.waterSeconds});
    }
    return result;
  };

  reset();
  return {update, snapshot: makeSnapshot, reset};
}
