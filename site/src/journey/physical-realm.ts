import * as THREE from "three";
import type { BeatPosition } from "./beats";
import type { BrickAssets } from "../scene/bricks";
import { Structure } from "../scene/structure";
import { Swarm } from "../scene/swarm";
import { GraphViz } from "../scene/graph-viz";
import { createBlueprintFloor } from "../scene/floor";
import { createWorkerGreybox, type WorkerRig } from "../scene/worker";
import type { TierReport } from "../perf/tier";

/** The continuous physical world for Acts 2 (swarm) → 3 (hero) → 6 (place).
 * Hero worker home = origin (Act 3 camera framing); the car build sits at
 * BUILD_POS, centered in front of the hero; the swarm lanes circle both.
 * Robots render at 0.7× to soften the robot-vs-LEGO scale contrast. */

export const BUILD_POS = new THREE.Vector3(0.55, 0, 0);
const BUILD_YAW = -0.6;
const ROBOT_SCALE = 0.7;

/** Structure progress before the hero placement (~40% of the pyramid's 13). */
const BASE_PROGRESS = 5;

const SWARM_COUNT: Record<TierReport["tier"], number> = { high: 8, mid: 7, low: 6 };

export class PhysicalRealm {
  readonly worker: WorkerRig;
  readonly graph: GraphViz;
  private readonly structure: Structure;
  private readonly swarm: Swarm;
  private readonly heroBrick: THREE.Mesh;
  private timelapseDone = 0;

  private readonly dust: THREE.Points;
  private readonly dustMat: THREE.PointsMaterial;

  constructor(scene: THREE.Scene, assets: BrickAssets, tier: TierReport) {
    scene.add(createBlueprintFloor());

    // Act 1 is DOM type over an empty stage: the mark lives in the fixed
    // chrome, not in the scene, so the open is dust, grid and distance.
    const dustGeo = new THREE.BufferGeometry();
    const n = 1200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 1] = Math.random() * 2.2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.PointsMaterial({
      color: 0x5b7a99,
      size: 0.006,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.dust = new THREE.Points(dustGeo, this.dustMat);
    scene.add(this.dust);

    this.structure = new Structure(assets.data.pyramid, assets.geometries);
    this.structure.group.position.copy(BUILD_POS);
    this.structure.group.rotation.y = BUILD_YAW;
    scene.add(this.structure.group);

    // Act 5: the pyramid's real assembly graph, overlaid on the bricks.
    this.graph = new GraphViz(assets.data.pyramid, BUILD_POS, BUILD_YAW, this.structure.lift);
    scene.add(this.graph.group);

    this.worker = createWorkerGreybox();
    this.worker.root.scale.setScalar(ROBOT_SCALE);
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

    this.dust.rotation.y = time * 0.008;
    this.dustMat.opacity = beat === "brand" ? 0.4 : 0.18;

    // Swarm runs everywhere; the fault vignette lives in the swarm beat.
    const faultActive = beat === "swarm" && t > 0.45;
    this.swarm.update(time, dt, faultActive);
    this.worker.update(time);

    // Act 5: the graph ghost materializes over the finished build.
    const graphFade = beat === "graph" ? 1 : beat === "close" && t < 0.3 ? 0.3 : 0;
    this.graph.update(time, dt, graphFade);

    if (beat === "graph") {
      // Hold the finished build under the living graph.
      this.structure.setProgress(this.structure.total);
      this.timelapseDone = 1;
      return;
    }

    if (beat === "place") {
      this.placeChoreo(t, dt);
    } else {
      // Reset the hero to home whenever we're on the rails before Act 6.
      // The build stays hidden until the place beat — it enters with its
      // own catch-up assembly as the camera dives in.
      const before = beat === "brand" || beat === "swarm" || beat === "worker";
      if (before) {
        this.worker.root.position.set(0, 0, 0);
        this.worker.root.rotation.y = 0;
        this.worker.setArmExtend(0);
        this.worker.setRingColor(0xffffff);
        this.heroBrick.visible = false;
        this.structure.setProgress(0);
        this.timelapseDone = 0;
      } else if (this.timelapseDone > 0) {
        // outro: hold the finished build
        this.structure.setProgress(this.structure.total);
      }
    }
  }

  /** Act 6: the build assembles as the camera dives in, the hero drives up
   * with the claimed brick → arm gesture → snap → verify → wave-ordered
   * timelapse completes the car. */
  private placeChoreo(t: number, dt: number) {
    const w = this.worker;

    // Short approach: the hero rolls forward to arm's reach of the build.
    // The whole sequence completes by the hold at localT 0.5.
    const driveEnd = 0.2;
    const target = new THREE.Vector3(0.3, 0, 0.07);
    const k = Math.min(t / driveEnd, 1);
    const ease = k * k * (3 - 2 * k);
    w.root.position.lerpVectors(new THREE.Vector3(0, 0, 0), target, ease);
    const heading = Math.atan2(BUILD_POS.x - w.root.position.x, BUILD_POS.z - w.root.position.z);
    w.root.rotation.y = THREE.MathUtils.lerp(0, heading, ease);
    if (k < 1) w.spinWheels(dt * 9);
    w.setRingColor(k < 1 ? 0x4d9fff : 0x39d98a); // navigating → carrying/placing

    this.heroBrick.visible = t >= 0.04 && t < 0.34;

    // Arm gesture window
    const gesture = THREE.MathUtils.smoothstep(t, 0.22, 0.3) - THREE.MathUtils.smoothstep(t, 0.36, 0.44);
    w.setArmExtend(gesture);

    // Catch-up assembly: the in-progress build materializes (0 → BASE) as
    // the camera arrives, then the hero snaps brick BASE+1 at 0.34, then the
    // timelapse (0.36 → 0.48) completes the build in real placement order —
    // finished exactly as the magnetic hold settles.
    const catchup = THREE.MathUtils.smoothstep(t, 0.02, 0.18) * BASE_PROGRESS;
    const snapped = t >= 0.34;
    const lapse = THREE.MathUtils.smoothstep(t, 0.36, 0.48);
    const progress = snapped
      ? BASE_PROGRESS + 1 + lapse * (this.structure.total - BASE_PROGRESS - 1)
      : catchup;
    this.structure.setProgress(progress);
    this.timelapseDone = lapse;

    if (t >= 0.34 && t < 0.46) w.setRingColor(0x39d98a); // verified green
    if (t >= 0.46) w.setRingColor(0xffffff); // back to idle white
  }
}
