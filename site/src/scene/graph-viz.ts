import * as THREE from "three";
import type { JModel, TapeEvent } from "./bricks";

/** The assembly graph overlaid directly on the physical build: one node per
 * brick, anchored at the brick's real position. Nodes render as DOM text
 * chips (positioned by the engine's projector); this class owns the tape
 * playback, per-node state, message labels, and the faint 3D support edges
 * drawn between brick positions. */

export type NodeState = "blocked" | "available" | "claimed" | "complete";

export interface GraphChipData {
  id: string;
  state: NodeState;
  label: string;
  world: THREE.Vector3;
}

export class GraphViz {
  /** Faint 3D support edges between brick positions. */
  readonly group = new THREE.Group();
  fade = 0;
  private readonly chips: GraphChipData[] = [];
  private readonly byId = new Map<string, GraphChipData>();
  private readonly tape: TapeEvent[];
  private readonly loopSeconds: number;
  private clock = 0;
  private cursor = 0;
  private readonly edgeMat: THREE.LineBasicMaterial;

  constructor(model: JModel, buildPos: THREE.Vector3, buildYaw: number, lift: number) {
    this.tape = model.tape;
    this.loopSeconds = model.makespan + 2.5;

    const Y = new THREE.Vector3(0, 1, 0);
    const worldOf = (p: [number, number, number]) =>
      new THREE.Vector3(p[0], p[1] + lift + 0.014, p[2]).applyAxisAngle(Y, buildYaw).add(buildPos);

    for (const n of model.nodes) {
      const chip: GraphChipData = { id: n.id, state: "blocked", label: `${n.id} · blocked`, world: worldOf(n.pos) };
      this.chips.push(chip);
      this.byId.set(n.id, chip);
    }

    const verts: number[] = [];
    for (const e of model.edges) {
      if (e.type !== "support") continue;
      const to = this.byId.get(e.t);
      if (!to) continue;
      for (const s of e.s) {
        const from = this.byId.get(s);
        if (!from) continue;
        verts.push(from.world.x, from.world.y, from.world.z, to.world.x, to.world.y, to.world.z);
      }
    }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x5b7a99, transparent: true, opacity: 0 });
    this.group.add(new THREE.LineSegments(edgeGeo, this.edgeMat));
    this.group.visible = false;
  }

  private applyEvent(ev: TapeEvent) {
    const chip = this.byId.get(ev.node);
    if (!chip) return;
    chip.state =
      ev.type === "job_available" ? "available" : ev.type === "job_claimed" ? "claimed" : "complete";
    const who = ev.worker !== undefined ? ` · w${ev.worker}` : "";
    chip.label = `${ev.node} · ${ev.type.replace("job_", "").replace("placement_", "")}${who}`;
  }

  private resetLoop() {
    this.cursor = 0;
    for (const chip of this.chips) {
      chip.state = "blocked";
      chip.label = `${chip.id} · blocked`;
    }
  }

  /** targetFade 0..1: the overlay materializes in the graph beat. */
  update(_time: number, dt: number, targetFade: number) {
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
    this.edgeMat.opacity = this.fade * 0.3;
  }

  chipData(): readonly GraphChipData[] {
    return this.chips;
  }
}
