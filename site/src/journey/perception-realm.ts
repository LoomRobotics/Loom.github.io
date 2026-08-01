import * as THREE from "three";
import type { BeatPosition } from "./beats";
import type { BrickAssets } from "../scene/bricks";
import { FeedSource, type Detection } from "../scene/feed";

/** Act 4, the PERCEPTION realm. Everything here is parented to the camera, so
 * it covers the frame no matter where the rails have left the physical world.
 *
 * The beat reads: dive into the lens → a real frame from worker-001 → the
 * detections the pipeline actually made on it (current state) → the plan
 * rising over it as neon linework, wave by wave (desired state).
 *
 * Timeline in beat-local t (the magnetic hold is 0.5, so everything must be
 * settled by then):
 *   0.00-0.12  feed pulls in from the lens
 *   0.12-0.34  detections stagger in
 *   0.34-0.48  the plan materializes, one dependency wave at a time
 *   0.50       hold
 *   0.60-0.92  plan and detections retire, the feed dissolves back to the world
 */

export interface FeedBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  alpha: number;
}

const NEON = 0xff6a13;
/** Highest-confidence detections to draw; the rest stay in the count. */
const MAX_BOXES = 8;

export class PerceptionRealm {
  private readonly feed: FeedSource | null;
  private readonly plan = new THREE.Group();
  private readonly waves: THREE.LineSegments[] = [];
  private readonly waveMats: THREE.LineBasicMaterial[] = [];
  private planAlpha = 0;
  private detAlpha = 0;
  private feedAlpha = 0;

  constructor(camera: THREE.PerspectiveCamera, assets: BrickAssets, feed: FeedSource | null) {
    this.feed = feed;
    if (feed) camera.add(feed.group);

    // The plan ghost: the real pyramid graph as edge linework, grouped by
    // dependency wave so it can build up in the order the swarm would.
    const model = assets.data.pyramid;
    const edgesCache = new Map<string, THREE.BufferGeometry>();
    const perWave = new Map<number, THREE.BufferGeometry[]>();
    const bounds = new THREE.Box3();
    for (const node of model.nodes) {
      const geo = assets.geometries.get(node.part);
      if (!geo) continue;
      let edges = edgesCache.get(node.part);
      if (!edges) {
        // Brick envelopes, not mesh edges: every stud would contribute a ring
        // of segments and the plan would read as a scribble, not a plan.
        if (!geo.boundingBox) geo.computeBoundingBox();
        const box = geo.boundingBox!;
        const size = box.getSize(new THREE.Vector3());
        const mid = box.getCenter(new THREE.Vector3());
        const envelope = new THREE.BoxGeometry(size.x, size.y, size.z).translate(mid.x, mid.y, mid.z);
        edges = new THREE.EdgesGeometry(envelope);
        envelope.dispose();
        edgesCache.set(node.part, edges);
      }
      const placed = edges.clone();
      placed.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(...node.pos),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), node.yawY),
          new THREE.Vector3(1, 1, 1)
        )
      );
      placed.computeBoundingBox();
      bounds.union(placed.boundingBox!);
      if (!perWave.has(node.wave)) perWave.set(node.wave, []);
      perWave.get(node.wave)!.push(placed);
    }

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    for (const wave of [...perWave.keys()].sort((a, b) => a - b)) {
      const merged = mergeGeometries(perWave.get(wave)!);
      merged.translate(-center.x, -center.y, -center.z);
      const mat = new THREE.LineBasicMaterial({
        color: NEON,
        transparent: true,
        opacity: 0,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const lines = new THREE.LineSegments(merged, mat);
      lines.renderOrder = 11;
      this.waves.push(lines);
      this.waveMats.push(mat);
      this.plan.add(lines);
    }

    // Sit the plan in the upper right, clear of the act copy on the left.
    const viewH = 2 * 0.42 * Math.tan((40 * Math.PI) / 360);
    this.plan.scale.setScalar((viewH * 0.2) / Math.max(size.y, 1e-4));
    this.plan.position.set(0.104, 0.062, -0.42);
    this.plan.rotation.x = -0.3;
    this.plan.visible = false;
    camera.add(this.plan);
  }

  get detections(): readonly Detection[] {
    return this.feed?.meta.detections ?? [];
  }

  get meta() {
    return this.feed?.meta ?? null;
  }

  /** Telemetry line for the HUD: real provenance, no invented numbers. */
  hudLines(): string[] {
    const m = this.feed?.meta;
    if (!m) return [];
    return [
      `worker-001 · ${m.camera}`,
      `capture ${m.capture_id} · ${m.frame}`,
      `${m.detections.length} parts · detector v5`,
    ];
  }

  update(pos: BeatPosition, time: number, camera: THREE.PerspectiveCamera) {
    const active = pos.beat.id === "perceive";
    const t = pos.localT;

    this.feedAlpha = active ? ramp(t, 0, 0.12) * (1 - ramp(t, 0.78, 0.94)) : 0;
    const zoom = active ? 0.62 + 0.38 * ease(ramp(t, 0, 0.16)) : 1;
    this.feed?.set(this.feedAlpha, zoom);
    this.feed?.layout(camera);

    this.detAlpha = active ? ramp(t, 0.12, 0.2) * (1 - ramp(t, 0.62, 0.76)) : 0;

    this.planAlpha = active ? ramp(t, 0.34, 0.4) * (1 - ramp(t, 0.66, 0.82)) : 0;
    this.plan.visible = this.planAlpha > 0.004;
    if (this.plan.visible) {
      this.plan.rotation.y = time * 0.22;
      const waves = this.waveMats.length;
      this.waveMats.forEach((mat, i) => {
        // Waves unlock in dependency order across the build window.
        const from = 0.34 + (i / waves) * 0.12;
        mat.opacity = this.planAlpha * ramp(t, from, from + 0.05) * 0.85;
      });
    }
  }

  /** Screen rects for the DOM detection boxes, staggered by confidence rank.
   * Capped: every box the detector found at once is a thicket, and the point
   * of the beat is legibility, not a density contest. */
  boxes(vw: number, vh: number): FeedBox[] {
    if (!this.feed || this.detAlpha <= 0.004) return [];
    const dets = this.feed.meta.detections.slice(0, MAX_BOXES);
    return dets.map((det, i) => {
      const rect = this.feed!.boxRect(det, vw, vh);
      const stagger = Math.min(Math.max((this.detAlpha - (i / dets.length) * 0.55) / 0.45, 0), 1);
      return {
        ...rect,
        label: `${det.part} · ${det.score.toFixed(2)}`,
        alpha: stagger,
      };
    });
  }

  /** Opacity of the feed chrome (brackets + telemetry). */
  get hudAlpha(): number {
    return this.feedAlpha;
  }
}

/** Concatenate BufferGeometries that share an attribute layout (position only
 * here) — saves pulling in the BufferGeometryUtils addon for one call. */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let total = 0;
  for (const g of list) total += g.getAttribute("position").count;
  const out = new Float32Array(total * 3);
  let offset = 0;
  for (const g of list) {
    const attr = g.getAttribute("position") as THREE.BufferAttribute;
    out.set(attr.array as Float32Array, offset);
    offset += attr.array.length;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(out, 3));
  return geo;
}

const ramp = (t: number, from: number, to: number) =>
  Math.min(Math.max((t - from) / Math.max(to - from, 1e-4), 0), 1);
const ease = (t: number) => t * t * (3 - 2 * t);
