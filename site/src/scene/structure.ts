import * as THREE from "three";
import type { JModel } from "./bricks";

/** Instanced renderer of a build's physical state: bricks appear in the real
 * placement order with a small scale-pop. `setProgress(k)` shows bricks with
 * order < k; fractional k animates the brick currently landing. */

const easeOutBack = (t: number) => {
  const c1 = 1.4;
  const x = t - 1;
  return 1 + (c1 + 1) * x * x * x + c1 * x * x;
};

interface Batch {
  mesh: THREE.InstancedMesh;
  orders: number[];
  matrices: THREE.Matrix4[];
}

export class Structure {
  readonly group = new THREE.Group();
  private readonly batches: Batch[] = [];
  private readonly tmp = new THREE.Matrix4();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private progress = 0;
  readonly total: number;

  constructor(model: JModel, geometries: Map<string, THREE.BufferGeometry>) {
    this.total = model.nodes.length;
    const byKey = new Map<string, typeof model.nodes>();
    for (const n of model.nodes) {
      const key = `${n.part}|${n.color}|${n.alpha}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(n);
    }
    // LDraw brick origins sit at the top of the body, so a ground-level pose
    // buries the brick below y=0. Find the model's true lowest vertex and
    // lift everything so it rests on the floor plane.
    let minY = Infinity;
    for (const n of model.nodes) {
      const geo = geometries.get(n.part);
      if (!geo) continue;
      if (!geo.boundingBox) geo.computeBoundingBox();
      minY = Math.min(minY, n.pos[1] + geo.boundingBox!.min.y);
    }
    const lift = Number.isFinite(minY) ? -minY : 0;

    for (const [key, nodes] of byKey) {
      const [part, color, alpha] = key.split("|");
      const geo = geometries.get(part!);
      if (!geo) {
        console.warn(`structure: missing geometry for part ${part}`);
        continue;
      }
      const a = Number(alpha);
      const mat = new THREE.MeshStandardMaterial({
        color: Number(color),
        roughness: 0.5,
        metalness: 0.05,
        flatShading: true,
        transparent: a < 1,
        opacity: a,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, nodes.length);
      mesh.frustumCulled = false;
      const orders: number[] = [];
      const matrices: THREE.Matrix4[] = [];
      nodes.forEach((n, i) => {
        const m = new THREE.Matrix4()
          .makeRotationY(n.yawY)
          .setPosition(n.pos[0], n.pos[1] + lift, n.pos[2]);
        matrices.push(m);
        orders.push(n.order);
        mesh.setMatrixAt(i, this.zero);
      });
      this.batches.push({ mesh, orders, matrices });
      this.group.add(mesh);
    }
    this.setProgress(0);
  }

  /** k in [0, total]; fractional part pops the landing brick. */
  setProgress(k: number) {
    this.progress = k;
    for (const b of this.batches) {
      for (let i = 0; i < b.orders.length; i++) {
        const order = b.orders[i]!;
        const s = Math.min(Math.max((k - order) * 1.6, 0), 1);
        if (s <= 0) {
          b.mesh.setMatrixAt(i, this.zero);
        } else if (s >= 1) {
          b.mesh.setMatrixAt(i, b.matrices[i]!);
        } else {
          const scale = Math.max(easeOutBack(s), 0.001);
          this.tmp.copy(b.matrices[i]!).scale(new THREE.Vector3(scale, scale, scale));
          b.mesh.setMatrixAt(i, this.tmp);
        }
      }
      b.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  getProgress() {
    return this.progress;
  }
}
