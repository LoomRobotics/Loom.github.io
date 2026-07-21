import * as THREE from "three";
import type { JModel, TapeEvent } from "./bricks";

/** The assembly graph as living data: one node per brick, laid out as an
 * exploded ghost of the build itself — wave index becomes height, each node
 * hovers over its brick's real footprint. The deterministic event tape
 * (simulated over the real dependency graph) free-runs on loop: nodes go
 * blocked → available → claimed → complete while the log ticks. */

type NodeState = "blocked" | "available" | "claimed" | "complete";

const COLORS: Record<NodeState, { color: number; emissive: number; intensity: number }> = {
  blocked: { color: 0x252b33, emissive: 0x252b33, intensity: 0.15 },
  available: { color: 0x5b7a99, emissive: 0x5b7a99, intensity: 0.6 },
  claimed: { color: 0xff6a13, emissive: 0xff6a13, intensity: 1.6 },
  complete: { color: 0xf3f4f5, emissive: 0xf3f4f5, intensity: 0.9 },
};

const FOOTPRINT_SCALE = 2.4;
const WAVE_HEIGHT = 0.14;
const BASE_HEIGHT = 0.22;

export class GraphViz {
  readonly group = new THREE.Group();
  /** Most recent tape lines for the DOM ticker (newest last). */
  readonly ticker: string[] = [];
  private readonly nodeMeshes = new Map<string, THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshStandardMaterial>>();
  private readonly states = new Map<string, NodeState>();
  private readonly tape: TapeEvent[];
  private readonly loopSeconds: number;
  private clock = 0;
  private cursor = 0;
  private fade = 0;

  constructor(model: JModel, center: THREE.Vector3) {
    this.tape = model.tape;
    this.loopSeconds = model.makespan + 2.5;

    const positions = new Map<string, THREE.Vector3>();
    for (const n of model.nodes) {
      const p = new THREE.Vector3(
        center.x + n.pos[0] * FOOTPRINT_SCALE,
        BASE_HEIGHT + n.wave * WAVE_HEIGHT,
        center.z + n.pos[2] * FOOTPRINT_SCALE
      );
      positions.set(n.id, p);
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS.blocked.color,
        emissive: COLORS.blocked.emissive,
        emissiveIntensity: COLORS.blocked.intensity,
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), mat);
      mesh.position.copy(p);
      this.nodeMeshes.set(n.id, mesh);
      this.group.add(mesh);
    }

    // Support edges as steel lines from source to target nodes.
    const verts: number[] = [];
    for (const e of model.edges) {
      if (e.type !== "support") continue;
      const to = positions.get(e.t);
      if (!to) continue;
      for (const s of e.s) {
        const from = positions.get(s);
        if (!from) continue;
        verts.push(from.x, from.y, from.z, to.x, to.y, to.z);
      }
    }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x5b7a99, transparent: true, opacity: 0 });
    this.group.add(new THREE.LineSegments(edgeGeo, edgeMat));
    this.edgeMat = edgeMat;
    this.group.visible = false;
  }

  private edgeMat: THREE.LineBasicMaterial;

  private applyEvent(ev: TapeEvent) {
    const next: NodeState =
      ev.type === "job_available" ? "available" : ev.type === "job_claimed" ? "claimed" : "complete";
    this.states.set(ev.node, next);
    const who = ev.worker !== undefined ? ` · worker_${ev.worker}` : "";
    this.ticker.push(`[${ev.t.toFixed(1).padStart(4)}] ${ev.type} ${ev.node}${who} (lamport ${ev.lamport})`);
    if (this.ticker.length > 7) this.ticker.shift();
  }

  private resetLoop() {
    this.states.clear();
    this.cursor = 0;
    this.ticker.length = 0;
  }

  /** targetFade 0..1: the ghost materializes in the graph beat. */
  update(time: number, dt: number, targetFade: number) {
    this.fade += (targetFade - this.fade) * Math.min(dt * 4, 1);
    const visible = this.fade > 0.01;
    this.group.visible = visible;
    if (!visible) return;

    this.clock = (this.clock + dt) % this.loopSeconds;
    if (this.clock < dt) this.resetLoop();
    while (this.cursor < this.tape.length && this.tape[this.cursor]!.t <= this.clock) {
      this.applyEvent(this.tape[this.cursor]!);
      this.cursor++;
    }

    const pulse = Math.sin(time * 6) * 0.5 + 0.5;
    for (const [id, mesh] of this.nodeMeshes) {
      const state = this.states.get(id) ?? "blocked";
      const c = COLORS[state];
      mesh.material.color.setHex(c.color);
      mesh.material.emissive.setHex(c.emissive);
      mesh.material.emissiveIntensity =
        state === "claimed" ? c.intensity * (0.6 + pulse * 0.8) : c.intensity;
      mesh.material.opacity = this.fade * (state === "blocked" ? 0.45 : 0.95);
      const s = state === "claimed" ? 1 + pulse * 0.35 : 1;
      mesh.scale.setScalar(s);
      mesh.rotation.y = time * 0.4;
    }
    this.edgeMat.opacity = this.fade * 0.35;
  }
}
