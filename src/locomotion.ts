import { FreeCamera, Mesh, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { createAstronaut, type AstronautPose } from './handwalk/avatar';
import { AssistedGait } from './handwalk/assisted-gait.mjs';
import { createPhysicsWalker, type PhysicsWalker, WALKER_CAPSULE_RADIUS } from './handwalk/physics-walker';
import { PoseFilter } from './handwalk/pose-filter.mjs';

export type LocomotionGait = {
  left: number;
  right: number;
  leftLift: number;
  rightLift: number;
  stride: number;
  cadence: number;
  leftToe?: number;
  rightToe?: number;
  articulated?: boolean;
  run?: number;
};

export type LocomotionInput = {
  forward: number;
  turn: number;
  headingTarget?: number | null;
  gait?: LocomotionGait;
  toolActive?: boolean;
  active: boolean;
};

const SOLE_OFFSET = 0.0625;
const CAMERA_OFFSET = new Vector3(0, 3.4, -6.6);
const CAMERA_LOOK_HEIGHT = 1.35;
// The physics capsule plus a little room for the astronaut's wider boots.
const OCCUPANCY_RADIUS = Math.max(WALKER_CAPSULE_RADIUS, 0.45 + 0.11) + 0.06;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0));

const wrapAngle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));

/**
 * Adds Hand Walk's grounded astronaut locomotion to an existing level. All
 * supplied surfaces are expected to have their walkable top at world y=0.
 */
export function createLocomotion(
  scene: Scene,
  camera: FreeCamera,
  colliders: Mesh[],
  spawn: Vector3,
  canOccupy: (x: number, z: number) => boolean,
) {
  const player = new TransformNode('player', scene);
  const avatar = createAstronaut(scene, player);
  const poseFilter = new PoseFilter();
  const assistedGait = new AssistedGait();

  let physics: PhysicsWalker | null = null;
  let physicsGrounded = false;
  let physicsFeet = new Vector3(spawn.x, SOLE_OFFSET, spawn.z);
  let physicsVerticalVelocity = 0;
  let supportState: any = null;
  let heading = 0;
  let yawTarget: number | null = null;
  let velocity = 0;
  let displacement = 0;
  let blocked = false;
  let fallbackPhase = 0;
  let disposed = false;
  const groundSamples = new Map<string, number>();

  function cameraLookTarget() {
    return player.position.add(new Vector3(0, CAMERA_LOOK_HEIGHT, 0));
  }

  function cameraDestination() {
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    return player.position.add(new Vector3(
      CAMERA_OFFSET.x * cos + CAMERA_OFFSET.z * sin,
      CAMERA_OFFSET.y,
      -CAMERA_OFFSET.x * sin + CAMERA_OFFSET.z * cos,
    ));
  }

  function aimCamera() {
    camera.setTarget(cameraLookTarget());
  }

  function occupiesWithMargin(x: number, z: number) {
    if (!canOccupy(x, z)) return false;
    // Cardinal samples protect both the capsule and the astronaut's soles at an
    // edge. Diagonals close the gaps without making narrow causeways unusable.
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      if (!canOccupy(x + Math.cos(angle) * OCCUPANCY_RADIUS, z + Math.sin(angle) * OCCUPANCY_RADIUS)) return false;
    }
    return true;
  }

  function boundedDelta(origin: Vector3, desired: Vector3) {
    if (desired.lengthSquared() <= 1e-12) return desired;
    const targetX = origin.x + desired.x;
    const targetZ = origin.z + desired.z;
    if (occupiesWithMargin(targetX, targetZ)) return desired;

    // Let the walker slide along shorelines and platform edges. Trying the
    // larger component first makes diagonal input feel stable at corners.
    const candidates = Math.abs(desired.x) >= Math.abs(desired.z)
      ? [new Vector3(desired.x, 0, 0), new Vector3(0, 0, desired.z)]
      : [new Vector3(0, 0, desired.z), new Vector3(desired.x, 0, 0)];
    return candidates.find((candidate) => occupiesWithMargin(origin.x + candidate.x, origin.z + candidate.z)) ?? Vector3.Zero();
  }

  function soleGroundAt(x: number, z: number) {
    if (!physics) return SOLE_OFFSET;
    const key = `${x.toFixed(4)}:${z.toFixed(4)}`;
    const cached = groundSamples.get(key);
    if (cached !== undefined) return cached;
    let surface = -Infinity;
    for (const [dx, dz] of [[0, 0], [.17, 0], [-.17, 0], [0, .19], [0, -.19]]) {
      const hit = physics.groundAt(x + dx, z + dz, player.position.y + 2.6);
      if (hit !== null) surface = Math.max(surface, hit);
    }
    const result = Number.isFinite(surface) ? surface : player.position.y;
    groundSamples.set(key, result);
    return result;
  }

  function settlePhysics() {
    if (!physics) return;
    physics.reset(new Vector3(spawn.x, SOLE_OFFSET, spawn.z));
    let state = physics.step(1 / 60, Vector3.Zero(), true);
    for (let i = 0; i < 8 && !state.grounded; i++) state = physics.step(1 / 60, Vector3.Zero(), true);
    physicsFeet.copyFrom(state.position);
    physicsGrounded = state.grounded;
    physicsVerticalVelocity = state.verticalVelocity;
    player.position.copyFromFloats(state.position.x, state.position.y - SOLE_OFFSET, state.position.z);
  }

  function reset() {
    heading = 0;
    yawTarget = null;
    velocity = 0;
    displacement = 0;
    blocked = false;
    fallbackPhase = 0;
    poseFilter.reset();
    assistedGait.reset();
    avatar.reset();
    player.position.copyFromFloats(spawn.x, spawn.y, spawn.z);
    player.rotation.set(0, heading, 0);
    settlePhysics();
    camera.minZ = 0.08;
    camera.position.copyFrom(cameraDestination());
    aimCamera();
  }

  const physicsReady = createPhysicsWalker(scene, colliders, new Vector3(spawn.x, SOLE_OFFSET, spawn.z)).then((walker) => {
    if (disposed) {
      walker.dispose();
      return;
    }
    physics = walker;
    settlePhysics();
    assistedGait.reset();
  });
  const ready = Promise.all([avatar.ready, physicsReady]).then(() => undefined);

  function update(dt: number, input: LocomotionInput) {
    groundSamples.clear();
    const simDt = clamp(dt, 0, 0.05);
    const active = !!input.active;
    const oldPosition = player.position.clone();
    const previousHeading = heading;

    if (!active) velocity = 0;
    const requestedHeading = active && typeof input.headingTarget === 'number' && Number.isFinite(input.headingTarget)
      ? wrapAngle(input.headingTarget)
      : null;
    if (requestedHeading !== null) {
      yawTarget = requestedHeading;
      heading = wrapAngle(heading + wrapAngle(yawTarget - heading) * (1 - Math.exp(-simDt / 0.08)));
    } else {
      yawTarget = null;
      heading = wrapAngle(heading + (active ? clamp(input.turn, -1, 1) : 0) * 1.1 * simDt);
    }
    player.rotation.y = heading;

    const run = active ? clamp(input.gait?.run ?? 0, 0, 1) : 0;
    const targetVelocity = active ? clamp(input.forward, -1, 1) * (2.6 + 1.3 * run) : 0;
    velocity = targetVelocity === 0 ? 0 : velocity + (targetVelocity - velocity) * (1 - Math.exp(-simDt / 0.06));

    let pose: AstronautPose;
    const gait = input.gait;
    if (!active) {
      pose = { left: 0, right: 0, leftLift: 0, rightLift: 0, stride: 0, cadence: 0, source: 'neutral' };
    } else if (gait) {
      pose = {
        left: clamp(gait.left, -1, 1), right: clamp(gait.right, -1, 1),
        leftLift: clamp(gait.leftLift, 0, 1), rightLift: clamp(gait.rightLift, 0, 1),
        leftToe: clamp(gait.leftToe ?? 0, -1, 1), rightToe: clamp(gait.rightToe ?? 0, -1, 1),
        stride: clamp(gait.stride, 0, 1), cadence: Math.max(0, Number.isFinite(gait.cadence) ? gait.cadence : 0),
        articulated: gait.articulated === true, source: 'measured',
      };
    } else {
      const walking = Math.abs(targetVelocity) > 1e-4;
      if (walking) fallbackPhase += Math.abs(targetVelocity) * simDt * 5.4;
      const wave = walking ? Math.sin(fallbackPhase) : 0;
      pose = {
        left: wave, right: -wave, leftLift: walking ? Math.max(0, wave) : 0,
        rightLift: walking ? Math.max(0, -wave) : 0,
        stride: walking ? Math.min(1, Math.abs(targetVelocity) / 2.6) : 0,
        cadence: walking ? Math.abs(targetVelocity) * 0.86 : 0, source: 'distance',
      };
    }
    pose = poseFilter.update(pose, simDt);

    const requestedDelta = new Vector3(Math.sin(heading) * velocity * simDt, 0, Math.cos(heading) * velocity * simDt);
    const desiredDelta = boundedDelta(oldPosition, requestedDelta);
    blocked = requestedDelta.lengthSquared() > 1e-12 && desiredDelta.subtract(requestedDelta).lengthSquared() > 1e-12;
    if (physics) {
      const desiredVelocity = simDt > 0 ? desiredDelta.scale(1 / simDt) : Vector3.Zero();
      const physical = physics.step(simDt, desiredVelocity, active);
      physicsFeet.copyFrom(physical.position);
      physicsGrounded = physical.grounded;
      physicsVerticalVelocity = physical.verticalVelocity;
      player.position.copyFromFloats(physical.position.x, physical.position.y - SOLE_OFFSET, physical.position.z);
    }
    displacement = Math.hypot(player.position.x - oldPosition.x, player.position.z - oldPosition.z);
    const actualSpeed = simDt > 0 ? displacement / simDt : 0;

    supportState = assistedGait.update(
      pose, simDt,
      { x: player.position.x, y: physicsFeet.y, z: player.position.z, yaw: heading },
      physicsGrounded, soleGroundAt as any,
      { speed: actualSpeed, displacement, active },
    );
    const yawRate = simDt > 0 ? wrapAngle(heading - previousHeading) / simDt : 0;
    avatar.applyGroundedPose(pose, supportState.feet, physicsGrounded, {
      dt: simDt, active, yawRate, speed: actualSpeed,
      phase: supportState.assist.phase,
      cycle: (supportState.assist.steps + supportState.assist.phase) * Math.PI,
      run, supportSide: supportState.supportSide,
    });
    const tool = input.toolActive ? avatar.applyHosePose() : null;

    const follow = 1 - Math.exp(-simDt / 0.14);
    if (active) camera.position.copyFrom(Vector3.Lerp(camera.position, cameraDestination(), follow));
    aimCamera();

    const feet = avatar.worldFeet().map((foot) => ({ ...foot, groundY: soleGroundAt(foot.x, foot.z) }));
    const direction = camera.getForwardRay().direction;
    return {
      position: { x: player.position.x, y: player.position.y, z: player.position.z },
      yaw: heading,
      yawTarget,
      speed: actualSpeed,
      signedSpeed: velocity,
      displacement,
      blocked,
      tool,
      gait: {
        ...pose,
        run,
        locomotionMode: run > 0.55 && actualSpeed > 2.65 ? 'running' : actualSpeed > 0.04 ? 'walking' : 'idle',
        grounded: physicsGrounded,
        feet,
        joints: avatar.snapshot(),
        support: supportState,
        ik: avatar.ikStatus(),
        physics: { ...physics?.diagnostics(), ready: !!physics, feetY: physicsFeet.y, surfaceY: soleGroundAt(player.position.x, player.position.z), verticalVelocity: physicsVerticalVelocity },
      },
      camera: {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
        target: { x: player.position.x, y: player.position.y + CAMERA_LOOK_HEIGHT, z: player.position.z },
      },
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    physics?.dispose();
    player.dispose(false, true);
  }

  reset();
  return { player, avatar, ready, update, reset, dispose };
}
