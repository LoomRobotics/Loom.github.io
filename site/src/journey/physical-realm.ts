import * as THREE from "three";
import type { BeatPosition } from "./beats";
import type { BrickAssets } from "../scene/bricks";
import { Structure } from "../scene/structure";
import { Swarm } from "../scene/swarm";
import { createBlueprintFloor } from "../scene/floor";
import { createWorkerGreybox, type WorkerRig } from "../scene/worker";
import type { TierReport } from "../perf/tier";

/** The continuous physical world for Acts 2 (swarm) → 3 (hero) → 6 (place).
 * Hero worker home = origin (Act 3 camera framing); the car build sits at
 * BUILD_POS; the swarm loops the arena around both. */

export const BUILD_POS = new THREE.Vector3(-0.55, 0, -0.35);
const BUILD_YAW = 0.5;

/** Structure progress before the hero placement (~40% of 61). */
const BASE_PROGRESS = 24;

const SWARM_COUNT: Record<TierReport["tier"], number> = { high: 12, mid: 8, low: 5 };

export class PhysicalRealm {
  readonly worker: WorkerRig;
  private readonly structure: Structure;
  private readonly swarm: Swarm;
  private readonly heroBrick: THREE.Mesh;
  private timelapseDone = 0;

  constructor(scene: THREE.Scene, assets: BrickAssets, tier: TierReport) {
    scene.add(createBlueprintFloor());

    this.structure = new Structure(assets.data.car, assets.geometries);
    this.structure.group.position.copy(BUILD_POS);
    this.structure.group.rotation.y = BUILD_YAW;
    scene.add(this.structure.group);

    this.worker = createWorkerGreybox();
    scene.add(this.worker.root);

    this.swarm = new Swarm(SWARM_COUNT[tier.tier]);
    scene.add(this.swarm.group);

    // The hero brick (red 2×4) the worker carries into Act 6.
    const geo = assets.geometries.get("3001") ?? new THREE.BoxGeometry(0.032, 0.0112, 0.016);
    this.heroBrick = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: 0xc91a09, roughness: 0.5, flatShading: true })
    );
    this.heroBrick.visible = false;
    this.worker.nodes["gripper"]!.add(this.heroBrick);
    this.heroBrick.position.set(0, 0.028, 0);

    const keyLight = new THREE.DirectionalLight(0xcfe0f0, 2.6);
    keyLight.position.set(1.6, 2.4, 1.2);
    const rimLight = new THREE.DirectionalLight(0xff6a13, 0.8);
    rimLight.position.set(-1.4, 0.5, -1.6);
    scene.add(keyLight, rimLight);
  }

  update(pos: BeatPosition, time: number, dt: number) {
    const beat = pos.beat.id;
    const t = pos.localT;

    // Swarm runs everywhere; the fault vignette lives in the swarm beat.
    const faultActive = beat === "swarm" && t > 0.45;
    this.swarm.update(time, dt, faultActive);
    this.worker.update(time);

    if (beat === "place") {
      this.placeChoreo(t, dt);
    } else {
      // Reset the hero to home whenever we're on the rails before Act 6.
      const before = beat === "swarm" || beat === "worker";
      if (before) {
        this.worker.root.position.set(0, 0, 0);
        this.worker.root.rotation.y = 0;
        this.worker.setArmExtend(0);
        this.worker.setRingColor(0xffffff);
        this.heroBrick.visible = false;
        this.structure.setProgress(BASE_PROGRESS);
        this.timelapseDone = 0;
      } else if (this.timelapseDone > 0) {
        // outro: hold the finished build
        this.structure.setProgress(this.structure.total);
      }
    }
  }

  /** Act 6: drive in with the claimed brick → arm gesture → snap → verify →
   * wave-ordered timelapse completes the car. */
  private placeChoreo(t: number, dt: number) {
    const w = this.worker;

    // Path from home toward the build zone (stops short, facing it).
    const driveEnd = 0.34;
    const target = BUILD_POS.clone().add(new THREE.Vector3(0.34, 0, 0.22));
    const k = Math.min(t / driveEnd, 1);
    const ease = k * k * (3 - 2 * k);
    w.root.position.lerpVectors(new THREE.Vector3(0, 0, 0), target, ease);
    const heading = Math.atan2(BUILD_POS.x - w.root.position.x, BUILD_POS.z - w.root.position.z);
    w.root.rotation.y = THREE.MathUtils.lerp(0, heading, ease);
    if (k < 1) w.spinWheels(dt * 9);
    w.setRingColor(k < 1 ? 0x4d9fff : 0x39d98a); // navigating → carrying/placing

    this.heroBrick.visible = t < 0.56;

    // Arm gesture window
    const gesture = THREE.MathUtils.smoothstep(t, 0.36, 0.52) - THREE.MathUtils.smoothstep(t, 0.6, 0.72);
    w.setArmExtend(gesture);

    // Snap: the hero brick becomes structure progress BASE+1
    const snapped = t >= 0.56;
    // Timelapse from 0.62 → 0.95 completes the remaining bricks
    const lapse = THREE.MathUtils.smoothstep(t, 0.62, 0.95);
    const progress = snapped
      ? BASE_PROGRESS + 1 + lapse * (this.structure.total - BASE_PROGRESS - 1)
      : BASE_PROGRESS;
    this.structure.setProgress(progress);
    this.timelapseDone = lapse;

    if (t >= 0.56 && t < 0.68) w.setRingColor(0x39d98a); // verified green
    if (t >= 0.68) w.setRingColor(0xffffff); // back to idle white
  }
}
