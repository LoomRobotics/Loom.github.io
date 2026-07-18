import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  VignetteEffect,
} from "postprocessing";
import type { TierReport } from "../perf/tier";

/** Renderer + camera + filmic post chain. LOW tier bypasses the composer
 * entirely (MSAA + CSS grain/vignette instead). */

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  render(deltaSeconds: number): void;
  dispose(): void;
}

const DPR_CAP: Record<TierReport["tier"], number> = { high: 2, mid: 1.5, low: 1 };

export function createStage(canvas: HTMLCanvasElement, tier: TierReport): Stage {
  const usePost = tier.tier !== "low";

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !usePost,
    powerPreference: "high-performance",
    stencil: false,
    depth: true,
    // Dev-only: lets verification tooling read frames via toDataURL.
    preserveDrawingBuffer: import.meta.env.DEV,
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15191e);
  scene.fog = new THREE.Fog(0x15191e, 3.0, 9.5);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 50);
  camera.position.set(2.4, 1.5, 2.8);

  // Soft studio env for PBR response (no shadow maps anywhere — contact
  // shadows are baked/faked per the perf plan).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  let composer: EffectComposer | null = null;
  if (usePost) {
    composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new BloomEffect({
      intensity: 0.75,
      luminanceThreshold: 0.72,
      luminanceSmoothing: 0.18,
      mipmapBlur: true,
    });
    const vignette = new VignetteEffect({ offset: 0.26, darkness: 0.58 });
    const noise = new NoiseEffect({ premultiply: true });
    noise.blendMode.opacity.value = 0.22;
    composer.addPass(new EffectPass(camera, bloom, vignette, noise));
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (!w || !h) return; // layout not ready yet — the observer will re-fire
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP[tier.tier]);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);
  // Window 'resize' alone misses late layout (mount before first paint) and
  // container-only changes (mobile dvh, embedded panes) — observe the element.
  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas.parentElement ?? canvas);

  function render(deltaSeconds: number) {
    if (composer) composer.render(deltaSeconds);
    else renderer.render(scene, camera);
  }

  function dispose() {
    observer.disconnect();
    window.removeEventListener("resize", resize);
    composer?.dispose();
    envTex.dispose();
    renderer.dispose();
  }

  return { renderer, scene, camera, render, dispose };
}
