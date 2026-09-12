import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin.js";
import "@babylonjs/core/Physics/physicsEngineComponent.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import {
  CharacterSupportedState,
  PhysicsCharacterController,
} from "@babylonjs/core/Physics/v2/characterController.js";

export const WALKER_CAPSULE_HEIGHT = 1.65;
export const WALKER_CAPSULE_RADIUS = 0.38;
export const WALKER_FOOT_OFFSET = WALKER_CAPSULE_HEIGHT * 0.5;

export type PhysicsWalkerStep = {
  /** World-space position of the bottom of the capsule. */
  position: Vector3;
  grounded: boolean;
  verticalVelocity: number;
  supportedState: CharacterSupportedState;
};

export type PhysicsWalkerDiagnostics = {
  engine: "Havok";
  colliderCount: number;
  capsuleHeight: number;
  capsuleRadius: number;
  positionIsFeet: true;
  paused: boolean;
  grounded: boolean;
  supportedState: CharacterSupportedState;
};

export type PhysicsWalker = {
  step(dt: number, desiredXZ: Vector3, active: boolean): PhysicsWalkerStep;
  reset(feetPosition: Vector3): void;
  groundAt(x: number, z: number, fromY?: number): number | null;
  dispose(): void;
  diagnostics(): PhysicsWalkerDiagnostics;
};

let havokPromise: ReturnType<typeof HavokPhysics> | undefined;

function loadHavok() {
  havokPromise ??= HavokPhysics({ locateFile: () => havokWasmUrl });
  return havokPromise;
}

/**
 * Builds a manually stepped Havok character controller. `start` and all returned
 * positions refer to the character's feet; Babylon's controller internally uses
 * the capsule center. Collider meshes must already have their final world transforms.
 */
export async function createPhysicsWalker(
  scene: Scene,
  colliders: AbstractMesh[],
  start: Vector3,
): Promise<PhysicsWalker> {
  let engine = scene.getPhysicsEngine();
  if (!engine) {
    const havok = await loadHavok();
    if (!scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havok))) {
      throw new Error("Could not enable Havok physics");
    }
    engine = scene.getPhysicsEngine();
  }
  if (!engine || engine.getPhysicsPluginName() !== "HavokPlugin") {
    throw new Error("Physics walker requires a Havok v2 physics engine");
  }

  // Static triangle meshes retain the authored terrain/path/curb shape. Because
  // they have zero mass, the render loop cannot move them or double-integrate them.
  const aggregates = colliders.map((mesh) => {
    mesh.computeWorldMatrix(true);
    const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.MESH, {
      mass: 0,
      friction: 0.85,
      restitution: 0,
      mesh: mesh as Mesh,
    }, scene);
    aggregate.shape.filterMembershipMask = 1;
    aggregate.shape.filterCollideMask = 0xffffffff;
    return aggregate;
  });

  const center = start.add(new Vector3(0, WALKER_FOOT_OFFSET, 0));
  const controller = new PhysicsCharacterController(center, {
    capsuleHeight: WALKER_CAPSULE_HEIGHT,
    capsuleRadius: WALKER_CAPSULE_RADIUS,
  }, scene);
  controller.footOffset = WALKER_FOOT_OFFSET;
  controller.shape.filterMembershipMask = 2;
  controller.shape.filterCollideMask = 0xffffffff;
  controller.maxStepHeight = 0.18;
  controller.maxSlopeCosine = Math.cos(Math.PI * 50 / 180);
  controller.keepDistance = 0.005;
  controller.keepContactTolerance = 0.02;
  controller.staticFriction = 0.25;
  controller.dynamicFriction = 0.25;
  controller.acceleration = 1;
  controller.maxAcceleration = 80;

  const gravity = new Vector3(0, -9.81, 0);
  const down = new Vector3(0, -1, 0);
  const up = Vector3.Up();
  const forward = Vector3.Forward();
  let paused = false;
  let grounded = false;
  let supportedState = CharacterSupportedState.UNSUPPORTED;
  let disposed = false;

  const feet = () => controller.getPosition().subtract(new Vector3(0, WALKER_FOOT_OFFSET, 0));
  const result = (): PhysicsWalkerStep => ({
    position: feet(),
    grounded,
    verticalVelocity: controller.getVelocity().y,
    supportedState,
  });

  return {
    step(dt, desiredXZ, active) {
      if (disposed) throw new Error("Physics walker has been disposed");
      if (!Number.isFinite(dt) || dt <= 0) return result();
      const frame = Math.min(dt, 1 / 20);
      if (!active) {
        paused = true;
        controller.setVelocity(Vector3.Zero());
        return result();
      }
      paused = false;
      const support = controller.checkSupport(frame, down);
      supportedState = support.supportedState;
      grounded = supportedState === CharacterSupportedState.SUPPORTED;
      const current = controller.getVelocity();
      const desired = new Vector3(
        Number.isFinite(desiredXZ.x) ? desiredXZ.x : 0,
        0,
        Number.isFinite(desiredXZ.z) ? desiredXZ.z : 0,
      );
      // Gesture intent already applies its own release envelope. Once it reaches
      // zero, discard residual planar character velocity so a grounded avatar
      // stops on that exact frame while vertical support solving still runs.
      const movementCurrent = grounded && desired.lengthSquared() < 1e-12
        ? new Vector3(0, current.y, 0)
        : current;
      const velocity = grounded
        ? controller.calculateMovement(
          frame,
          forward,
          support.averageSurfaceNormal,
          movementCurrent,
          support.averageSurfaceVelocity,
          desired,
          up,
        )
        : new Vector3(desired.x, current.y + gravity.y * frame, desired.z);
      if (grounded && velocity.y < support.averageSurfaceVelocity.y) {
        velocity.y = support.averageSurfaceVelocity.y;
      }
      controller.setVelocity(velocity);
      controller.integrate(frame, support, gravity);

      const after = controller.checkSupport(frame, down);
      supportedState = after.supportedState;
      grounded = supportedState === CharacterSupportedState.SUPPORTED;
      return result();
    },

    reset(feetPosition) {
      if (disposed) throw new Error("Physics walker has been disposed");
      controller.setPosition(feetPosition.add(new Vector3(0, WALKER_FOOT_OFFSET, 0)));
      controller.setVelocity(Vector3.Zero());
      grounded = false;
      supportedState = CharacterSupportedState.UNSUPPORTED;
      paused = false;
    },

    groundAt(x, z, fromY = feet().y + 3) {
      if (disposed) throw new Error("Physics walker has been disposed");
      const hit = engine.raycast(new Vector3(x, fromY, z), new Vector3(x, fromY - 20, z), {
        membership: 0xffffffff,
        collideWith: 1,
      });
      return hit.hasHit ? hit.hitPointWorld.y : null;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      controller.dispose();
      for (const aggregate of aggregates) aggregate.dispose();
    },

    diagnostics: () => ({
      engine: "Havok",
      colliderCount: aggregates.length,
      capsuleHeight: WALKER_CAPSULE_HEIGHT,
      capsuleRadius: WALKER_CAPSULE_RADIUS,
      positionIsFeet: true,
      paused,
      grounded,
      supportedState,
    }),
  };
}
