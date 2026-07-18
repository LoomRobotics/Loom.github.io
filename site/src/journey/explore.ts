import type * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ExploreSpec } from "./beats";

/** Free-explore: constrained OrbitControls over the rail camera at a settled
 * hold. Desktop: wheel is never captured (wheel = scroll intent = exit).
 * Touch: pinch-zoom allowed because page scroll is stopped while active. */

export class ExploreMode {
  readonly controls: OrbitControls;
  active = false;

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enabled = false;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.75;
  }

  enter(spec: ExploreSpec, touch: boolean) {
    const c = this.controls;
    c.target.set(spec.target[0], spec.target[1], spec.target[2]);
    c.minDistance = spec.minDist;
    c.maxDistance = spec.maxDist;
    c.minPolarAngle = spec.minPolar;
    c.maxPolarAngle = spec.maxPolar;
    c.enableZoom = touch; // pinch only; desktop wheel must stay a scroll gesture
    c.enabled = true;
    this.active = true;
  }

  exit() {
    this.controls.enabled = false;
    this.active = false;
  }

  update() {
    if (this.active) this.controls.update();
  }

  dispose() {
    this.controls.dispose();
  }
}
