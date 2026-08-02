import * as THREE from "three";
import gsap from "gsap";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BEATS, buildBeatTable, locate, type BeatPosition } from "./beats";
import { createStage } from "./stage";
import { CameraDirector } from "./camera-director";
import { ExploreMode } from "./explore";
import { Overlays, type PinProjection } from "./overlays";
import { createScrollRig } from "./scroll";
import { PhysicalRealm } from "./physical-realm";
import { PerceptionRealm } from "./perception-realm";
import { FeedSource } from "../scene/feed";
import { loadHeroWorker } from "../scene/hero-model";
import { loadBrickAssets } from "../scene/bricks";
import { Structure } from "../scene/structure";
import { bindKeys } from "../a11y/keys";
import type { TierReport } from "../perf/tier";

/** Journey engine: owns the beat table, the render loop, and the wiring
 * between scroll, camera rails, free-explore, and the DOM overlays. */

export interface JourneyHandle {
  destroy(): void;
}

export async function mountJourney(tier: TierReport): Promise<JourneyHandle> {
  const container = document.getElementById("journey");
  const canvasEl = document.getElementById("stage-canvas") as HTMLCanvasElement | null;
  const ui = document.getElementById("journey-ui");
  if (!container || !canvasEl || !ui) throw new Error("journey mounts missing");
  // Re-bound so the narrowing survives into the closures below.
  const canvas = canvasEl;
  container.hidden = false;

  const assets = await loadBrickAssets();
  const stage = createStage(canvas, tier);

  // One-time axis/pose calibration view: renders the full car + pyramid from
  // the real assembly data under free orbit. `/next/?debug=assembly`
  if (new URLSearchParams(location.search).get("debug") === "assembly") {
    return mountAssemblyDebug(stage, assets, canvas);
  }

  const table = buildBeatTable(BEATS);
  // Authored hero model if one has been exported and passes the contract;
  // otherwise the procedural greybox, silently.
  const hero = await loadHeroWorker(import.meta.env.BASE_URL);
  const realm = new PhysicalRealm(stage.scene, assets, tier, hero);
  const worker = realm.worker;

  // Act 4 renders in camera space, so the camera has to be in the graph.
  stage.scene.add(stage.camera);
  const feed = await FeedSource.load(import.meta.env.BASE_URL).catch((err) => {
    console.warn("[loom] camera feed unavailable; Act 4 falls back to the stage", err);
    return null;
  });
  const perception = new PerceptionRealm(stage.camera, assets, feed);

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
      canvas.style.touchAction = "none";
    }
  }

  function exitExplore(): boolean {
    if (!explore.active) return false;
    explore.exit();
    if (isTouch) {
      scroll.resumeInput();
      canvas.style.touchAction = "";
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

  // The chrome mark is a real link (middle-click, right-click, no-JS all work),
  // but while the journey is mounted "home" means the top of the journey.
  const brandLink = document.querySelector<HTMLAnchorElement>("#chrome .brand");
  const onBrandClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    exitExplore();
    scroll.scrollToHold(0);
  };
  brandLink?.addEventListener("click", onBrandClick);

  const unbindKeys = bindKeys({
    next: () => scroll.scrollToHold(scroll.state.holdIndex + 1),
    prev: () => scroll.scrollToHold(scroll.state.holdIndex - 1),
    first: () => scroll.scrollToHold(0),
    last: () => scroll.scrollToHold(table.holds.length - 1),
    exitExplore,
  });

  const tmp = new THREE.Vector3();
  /** World point → screen px. Anchors behind the camera project to mirrored
   * coordinates, and off-frame anchors would pile up against the viewport
   * edges (into the fixed chrome), so both are culled here. */
  const projectPoint = (world: THREE.Vector3): PinProjection => {
    tmp.copy(world).applyMatrix4(stage.camera.matrixWorldInverse);
    const inFront = tmp.z < -stage.camera.near;
    tmp.applyMatrix4(stage.camera.projectionMatrix);
    const x = ((tmp.x + 1) / 2) * canvas.clientWidth;
    const y = ((1 - tmp.y) / 2) * canvas.clientHeight;
    const inFrame = x >= 0 && y >= 0 && x <= canvas.clientWidth && y <= canvas.clientHeight;
    return { x, y, visible: inFront && inFrame };
  };
  const worldTmp = new THREE.Vector3();
  const project = (anchor: string): PinProjection | null => {
    const obj = worker.nodes[anchor];
    if (!obj) return null;
    return projectPoint(obj.getWorldPosition(worldTmp));
  };

  // DEV route: export the static-variant stills from every beat's hold pose.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get("capture") === "stills") {
    const { exportStills } = await import("./still-export");
    console.info("[loom] stills exported", await exportStills({ table, canvas, renderFrame }));
  }

  if (import.meta.env.DEV) {
    const { captureComposite } = await import("../dev/capture");
    (window as unknown as Record<string, unknown>).__loom = {
      table,
      scroll,
      explore,
      director,
      camera: stage.camera,
      beat: () => pos,
      realm,
      // Lets verification tooling drive frames when the host pane freezes rAF.
      gsap,
      capture: (name: string) => captureComposite(name, canvas),
    };
  }

  /** One frame at a given beat position. Shared by the scroll-driven loop and
   * the still exporter, so an exported still is the same frame the journey
   * would draw and cannot drift from it. */
  function renderFrame(at: BeatPosition, time: number, dt: number, settled: boolean) {
    director.apply(at);
    realm.update(at, time, dt);
    perception.update(at, time, stage.camera);
    const graphFade = realm.graph.fade;
    // Thirteen chips is a thicket on a phone. Blocked nodes are the least
    // informative of the four states, so they drop out first.
    const narrow = canvas.clientWidth < 700;
    const graphChips =
      graphFade > 0.02
        ? realm.graph
            .chipData()
            .filter((chip) => !(narrow && chip.state === "blocked"))
            .map((chip) => {
            const s = projectPoint(chip.world);
            return {
              id: chip.id,
              x: s.x,
              y: s.y,
              visible: s.visible,
              state: chip.state,
              label: chip.label,
              opacity: graphFade * (chip.state === "blocked" ? 0.45 : 1),
            };
          })
        : undefined;
    const boxes = perception.boxes(canvas.clientWidth, canvas.clientHeight);
    overlays.update(at, {
      settled,
      exploring: explore.active,
      touch: isTouch,
      project,
      graphChips,
      feed: { alpha: perception.hudAlpha, boxes, lines: perception.hudLines() },
    });
    stage.render(dt);
  }

  const loop = (time: number, deltaMs: number) => {
    pos = locate(table, scroll.state.progress);
    // Scrollbar drags and programmatic jumps break the settle — leave explore.
    if (explore.active && !scroll.state.settled) exitExplore();
    explore.update();
    renderFrame(pos, time, deltaMs / 1000, scroll.state.settled);
  };
  gsap.ticker.add(loop);

  return {
    destroy() {
      gsap.ticker.remove(loop);
      unbindKeys();
      brandLink?.removeEventListener("click", onBrandClick);
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

function mountAssemblyDebug(
  stage: ReturnType<typeof createStage>,
  assets: Awaited<ReturnType<typeof loadBrickAssets>>,
  canvas: HTMLCanvasElement
): JourneyHandle {
  const car = new Structure(assets.data.car, assets.geometries);
  car.setProgress(car.total);
  const pyramid = new Structure(assets.data.pyramid, assets.geometries);
  pyramid.setProgress(pyramid.total);
  pyramid.group.position.set(0.35, 0, 0);
  stage.scene.add(car.group, pyramid.group);
  stage.scene.add(new THREE.AxesHelper(0.1));
  const key = new THREE.DirectionalLight(0xcfe0f0, 2.6);
  key.position.set(1.6, 2.4, 1.2);
  stage.scene.add(key);

  stage.camera.position.set(0.4, 0.35, 0.5);
  const controls = new OrbitControls(stage.camera, canvas);
  controls.target.set(0.1, 0.05, 0);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__loom = { camera: stage.camera, gsap, debug: "assembly" };
  }

  const loop = (_t: number, deltaMs: number) => {
    controls.update();
    stage.render(deltaMs / 1000);
  };
  gsap.ticker.add(loop);
  return {
    destroy() {
      gsap.ticker.remove(loop);
      controls.dispose();
      stage.dispose();
    },
  };
}
