import { AbstractMesh, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { finishAstronaut } from './astronaut-finish';
import { createAstronaut, type AstronautPose, type GroundedFeet } from './handwalk/avatar';
import { AssistedGait } from './handwalk/assisted-gait.mjs';

export type CrewActorSnapshot = {
  id: 'firefighter' | 'engineer';
  position: { x: number; y: number; z: number };
  yaw: number;
  activity: string;
  taskId: string | null;
};

export type CrewSnapshot = {
  actors: CrewActorSnapshot[];
  [key: string]: unknown;
};

type ShadowCaster = { addShadowCaster(mesh: AbstractMesh): void };

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0));
const angleDelta = (to: number, from: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const neutralPose = (): AstronautPose => ({
  left: 0, right: 0, leftLift: 0, rightLift: 0,
  stride: 0, cadence: 0, source: 'neutral',
});

export function createCrewVisuals(scene: Scene, shadows: ShadowCaster) {
  const crew = (['firefighter', 'engineer'] as const).map((id) => {
    const root = new TransformNode(`crew-${id}`, scene);
    root.setEnabled(false);
    const avatar = createAstronaut(scene, root);
    const gait = new AssistedGait({ stanceWidth: .22, minStep: .34, maxStep: .55, minLift: .08, maxLift: .15 });
    return {
      id, root, avatar, gait,
      targetPosition: Vector3.Zero(), targetYaw: 0,
      previousPosition: Vector3.Zero(), phase: id === 'engineer' ? Math.PI : 0,
      visible: false, initialized: false, activity: '', taskId: null as string | null,
    };
  });

  let disposed = false;
  const ready = Promise.all(crew.map(async (member) => {
    await member.avatar.ready;
    if (disposed) return;
    const meshes = member.root.getChildMeshes();
    finishAstronaut(meshes);
    for (const mesh of member.root.getChildMeshes()) {
      mesh.receiveShadows = true;
      shadows.addShadowCaster(mesh);
    }
  })).then(() => undefined);

  function hide(member: typeof crew[number]) {
    member.visible = false;
    member.initialized = false;
    member.gait.reset();
    member.root.setEnabled(false);
  }

  function update(dt: number, snapshot: CrewSnapshot | null) {
    if (disposed) return;
    const actors = new Map(snapshot?.actors.map((actor) => [actor.id, actor]) ?? []);
    const elapsed = clamp(dt, 0, .05);

    for (const member of crew) {
      const actor = actors.get(member.id);
      if (!actor || ![actor.position.x, actor.position.y, actor.position.z, actor.yaw].every(Number.isFinite)) {
        hide(member);
        continue;
      }

      member.targetPosition.set(actor.position.x, actor.position.y, actor.position.z);
      member.targetYaw = actor.yaw;
      member.activity = actor.activity;
      member.taskId = actor.taskId;
      if (!member.initialized) {
        member.root.position.copyFrom(member.targetPosition);
        member.root.rotation.y = member.targetYaw;
        member.previousPosition.copyFrom(member.targetPosition);
        member.avatar.reset();
        member.gait.reset();
        member.initialized = true;
      }
      if (!member.visible) {
        member.visible = true;
        member.root.setEnabled(true);
      }

      const follow = 1 - Math.exp(-elapsed / .11);
      member.root.position.copyFrom(Vector3.Lerp(member.root.position, member.targetPosition, follow));
      const previousYaw = member.root.rotation.y;
      member.root.rotation.y += angleDelta(member.targetYaw, member.root.rotation.y) * (1 - Math.exp(-elapsed / .09));
      const displacement = Vector3.Distance(member.root.position, member.previousPosition);
      const speed = elapsed > 0 ? displacement / elapsed : 0;
      const moving = speed > .035;
      if (moving) member.phase += speed * elapsed * 5.2;
      const wave = moving ? Math.sin(member.phase) : 0;
      const stride = moving ? clamp(speed / 2.4, .12, .82) : 0;
      const pose: AstronautPose = moving ? {
        left: wave, right: -wave,
        leftLift: Math.max(0, wave), rightLift: Math.max(0, -wave),
        leftToe: -wave * .22, rightToe: wave * .22,
        stride, cadence: speed * .86, source: 'distance',
      } : neutralPose();
      const support = member.gait.update(
        pose, elapsed,
        { x: member.root.position.x, y: member.root.position.y, z: member.root.position.z, yaw: member.root.rotation.y },
        true, () => member.root.position.y,
        { speed, displacement, active: moving },
      );
      const yawRate = elapsed > 0 ? angleDelta(member.root.rotation.y, previousYaw) / elapsed : 0;
      member.avatar.applyGroundedPose(pose, support.feet as GroundedFeet, true, {
        dt: elapsed, active: moving, yawRate, speed,
        phase: support.assist.phase,
        cycle: ((support.assist.steps ?? 0) + (support.assist.phase ?? 0)) * Math.PI,
        run: 0, supportSide: support.supportSide,
      });
      member.previousPosition.copyFrom(member.root.position);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const member of crew) member.root.dispose(false, true);
  }

  return { ready, update, dispose };
}
