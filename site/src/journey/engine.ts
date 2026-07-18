import * as THREE from "three";
import gsap from "gsap";
import { BEATS, buildBeatTable, locate, type BeatPosition } from "./beats";
import { createStage } from "./stage";
import { CameraDirector } from "./camera-director";
import { ExploreMode } from "./explore";
import { Overlays, type PinProjection } from "./overlays";
import { createScrollRig } from "./scroll";
import { createWorkerGreybox } from "../scene/worker";
import { createBlueprintFloor } from "../scene/floor";
import { bindKeys } from "../a11y/keys";
import type { TierReport } from "../perf/tier";

/** Journey engine: owns the beat table, the render loop, and the wiring
 * between scroll, camera rails, free-explore, and the DOM overlays. */

export interface JourneyHandle {
  destroy(): void;
}

export function mountJourney(tier: TierReport): JourneyHandle {
  const container = document.getElementById("journey");
  const canvas = document.getElementById("stage-canvas") as HTMLCanvasElement | null;
  const ui = document.getElementById("journey-ui");
  if (!container || !canvas || !ui) throw new Error("journey mounts missing");
  container.hidden = false;

  const table = buildBeatTable(BEATS);
  const stage = createStage(canvas, tier);

  // ---- Physical realm (Phase 1 scope: floor + one worker) --------------
  stage.scene.add(createBlueprintFloor());
  const worker = createWorkerGreybox();
  stage.scene.add(worker.root);

  const keyLight = new THREE.DirectionalLight(0xcfe0f0, 2.6);
  keyLight.position.set(1.6, 2.4, 1.2);
  const rimLight = new THREE.DirectionalLight(0xff6a13, 0.8);
  rimLight.position.set(-1.4, 0.5, -1.6);
  stage.scene.add(keyLight, rimLight);

  const director = new CameraDirector(stage.camera, table.beats);
  const explore = new ExploreMode(stage.camera, canvas);
  const scroll = createScrollRig(container, table);
  const isTouch = matchMedia("(pointer: coarse)").matches;

  let pos: BeatPosition = locate(table, 0);

  const overlays = new Overlays(ui, table.beats, {
    onBeatDot(i) {
      exitExplore();
      scroll.scrollToHold(i);
    },
    onHotspot(spec) {
      worker.setHighlight(spec ? spec.anchor : null);
    },
    onInspectTap: () => enterExplore(),
    onResume: () => exitExplore(),
  });

  function enterExplore() {
    const spec = pos.beat.explore;
    if (!spec || explore.active || !scroll.state.settled || director.mode !== "rails") return;
    director.beginExplore();
    explore.enter(spec, isTouch);
    if (isTouch) {
      scroll.stopInput();
      canvas!.style.touchAction = "none";
    }
  }

  function exitExplore(): boolean {
    if (!explore.active) return false;
    explore.exit();
    if (isTouch) {
      scroll.resumeInput();
      canvas!.style.touchAction = "";
    }
    director.endExplore({ index: pos.index, beat: pos.beat, localT: pos.beat.holdAt });
    return true;
  }

  // Desktop: a real drag on the canvas (while settled on an explore beat)
  // enters free-explore; wheel anywhere exits it and resumes the journey.
  let downAt: { x: number; y: number } | null = null;
  const onPointerDown = (e: PointerEvent) => {
    if (e.isPrimary) downAt = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!downAt || explore.active || isTouch) return;
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) enterExplore();
  };
  const onPointerUp = () => {
    downAt = null;
  };
  const onWheel = () => {
    if (explore.active && !isTouch) exitExplore();
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("wheel", onWheel, { passive: true });

  const unbindKeys = bindKeys({
    next: () => scroll.scrollToHold(scroll.state.holdIndex + 1),
    prev: () => scroll.scrollToHold(scroll.state.holdIndex - 1),
    first: () => scroll.scrollToHold(0),
    last: () => scroll.scrollToHold(table.holds.length - 1),
    exitExplore,
  });

  const tmp = new THREE.Vector3();
  const project = (anchor: string): PinProjection | null => {
    const obj = worker.nodes[anchor];
    if (!obj) return null;
    obj.getWorldPosition(tmp).project(stage.camera);
    return {
      x: ((tmp.x + 1) / 2) * window.innerWidth,
      y: ((1 - tmp.y) / 2) * window.innerHeight,
      visible: tmp.z < 1,
    };
  };

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__loom = {
      table,
      scroll,
      explore,
      director,
      camera: stage.camera,
      beat: () => pos,
      // Lets verification tooling drive frames when the host pane freezes rAF.
      gsap,
    };
  }

  const loop = (time: number, deltaMs: number) => {
    pos = locate(table, scroll.state.progress);
    // Scrollbar drags and programmatic jumps break the settle — leave explore.
    if (explore.active && !scroll.state.settled) exitExplore();
    director.apply(pos);
    explore.update();
    worker.update(time);
    overlays.update(pos, {
      settled: scroll.state.settled,
      exploring: explore.active,
      touch: isTouch,
      project,
    });
    stage.render(deltaMs / 1000);
  };
  gsap.ticker.add(loop);

  return {
    destroy() {
      gsap.ticker.remove(loop);
      unbindKeys();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("wheel", onWheel);
      scroll.destroy();
      explore.dispose();
      stage.dispose();
    },
  };
}
