import * as THREE from "three";
import gsap from "gsap";
import type { BeatDef, BeatPosition } from "./beats";

/** Per-beat camera tracks compiled to paused GSAP timelines over a flat
 * CamState; the scrub seeks them by beat-local t. Explore hand-back blends
 * the free camera to the rail pose before the rails resume. */

interface CamState {
  px: number; py: number; pz: number;
  tx: number; ty: number; tz: number;
  fov: number;
}

export type DirectorMode = "rails" | "explore" | "blending";

export class CameraDirector {
  mode: DirectorMode = "rails";
  private readonly cam: THREE.PerspectiveCamera;
  private readonly beats: BeatDef[];
  private readonly timelines: gsap.core.Timeline[] = [];
  private readonly state: CamState = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, fov: 45 };
  private readonly look = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, beats: BeatDef[]) {
    this.cam = camera;
    this.beats = beats;
    for (const beat of beats) {
      const tl = gsap.timeline({ paused: true });
      const keys = [...beat.camera].sort((a, b) => a.t - b.t);
      const first = keys[0]!;
      tl.set(this.state, {
        px: first.pos[0], py: first.pos[1], pz: first.pos[2],
        tx: first.look[0], ty: first.look[1], tz: first.look[2],
        fov: first.fov ?? 45,
      }, 0);
      for (let i = 1; i < keys.length; i++) {
        const k = keys[i]!;
        const prev = keys[i - 1]!;
        tl.to(this.state, {
          px: k.pos[0], py: k.pos[1], pz: k.pos[2],
          tx: k.look[0], ty: k.look[1], tz: k.look[2],
          fov: k.fov ?? prev.fov ?? 45,
          duration: Math.max(k.t - prev.t, 1e-4),
          ease: "power1.inOut",
        }, prev.t);
      }
      // Prime off-zero: gsap skips rendering a paused timeline at exactly 0
      // until the playhead first moves, which would leave the camera at the
      // origin on the very first frame.
      tl.progress(1e-6);
      this.timelines.push(tl);
    }

    if (import.meta.env.DEV) this.assertContinuity();
  }

  private assertContinuity() {
    for (let i = 1; i < this.beats.length; i++) {
      const prevEnd = this.beats[i - 1]!.camera.at(-1)!;
      const start = this.beats[i]!.camera[0]!;
      const d = Math.hypot(
        prevEnd.pos[0] - start.pos[0],
        prevEnd.pos[1] - start.pos[1],
        prevEnd.pos[2] - start.pos[2]
      );
      if (d > 1e-3) {
        console.warn(
          `[loom] camera continuity break between beats "${this.beats[i - 1]!.id}" → "${this.beats[i]!.id}" (${d.toFixed(3)} m)`
        );
      }
    }
  }

  /** Rail pose for a beat-local t without touching the live camera. */
  poseAt(beatIndex: number, localT: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
    this.timelines[beatIndex]!.progress(Math.min(Math.max(localT, 0), 1));
    return {
      pos: new THREE.Vector3(this.state.px, this.state.py, this.state.pz),
      look: new THREE.Vector3(this.state.tx, this.state.ty, this.state.tz),
      fov: this.state.fov,
    };
  }

  apply(pos: BeatPosition) {
    if (this.mode !== "rails") return;
    this.timelines[pos.index]!.progress(pos.localT);
    this.cam.position.set(this.state.px, this.state.py, this.state.pz);
    this.look.set(this.state.tx, this.state.ty, this.state.tz);
    this.cam.lookAt(this.look);
    if (Math.abs(this.cam.fov - this.state.fov) > 1e-3) {
      this.cam.fov = this.state.fov;
      this.cam.updateProjectionMatrix();
    }
  }

  beginExplore() {
    this.mode = "explore";
  }

  /** Blend the free camera back onto the rails, then resume rail driving. */
  endExplore(pos: BeatPosition, onDone?: () => void) {
    this.mode = "blending";
    const rail = this.poseAt(pos.index, pos.localT);
    const fromPos = this.cam.position.clone();
    const fromQuat = this.cam.quaternion.clone();
    const fromFov = this.cam.fov;
    const m = new THREE.Matrix4().lookAt(rail.pos, rail.look, new THREE.Vector3(0, 1, 0));
    const toQuat = new THREE.Quaternion().setFromRotationMatrix(m);
    const mix = { t: 0 };
    gsap.to(mix, {
      t: 1,
      duration: 0.7,
      ease: "power2.inOut",
      onUpdate: () => {
        this.cam.position.lerpVectors(fromPos, rail.pos, mix.t);
        this.cam.quaternion.slerpQuaternions(fromQuat, toQuat, mix.t);
        this.cam.fov = fromFov + (rail.fov - fromFov) * mix.t;
        this.cam.updateProjectionMatrix();
      },
      onComplete: () => {
        this.mode = "rails";
        onDone?.();
      },
    });
  }
}
