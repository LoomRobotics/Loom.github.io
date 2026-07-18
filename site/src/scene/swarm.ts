import * as THREE from "three";

/** Background swarm: cheap LOD workers (≈7 draws each) looping the arena on
 * closed splines, some carrying bricks. One worker can fault (red ring, halts)
 * while the rest keep building — the silent fault-tolerance vignette. */

interface SwarmWorker {
  root: THREE.Group;
  ring: THREE.MeshStandardMaterial;
  wheels: THREE.Object3D[];
  curve: THREE.CatmullRomCurve3;
  speed: number;
  phase: number;
  u: number;
}

const RING_WHITE = new THREE.Color(0xffffff);
const RING_BLUE = new THREE.Color(0x4d9fff);
const RING_GREEN = new THREE.Color(0x39d98a);
const RING_RED = new THREE.Color(0xff3b30);

function makeLodWorker(carrying: boolean): { root: THREE.Group; ring: THREE.MeshStandardMaterial; wheels: THREE.Object3D[] } {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2a323c, metalness: 0.35, roughness: 0.55 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x14171b, roughness: 0.9 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff6a13, metalness: 0.25, roughness: 0.5 });
  const ring = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 1.6 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.18), body);
  hull.position.y = 0.055;
  root.add(hull);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.184), accent);
  strip.position.y = 0.078;
  root.add(strip);
  const wheels: THREE.Object3D[] = [];
  for (const side of [1, -1]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 14), tire);
    w.rotation.x = Math.PI / 2;
    w.position.set(-0.055, 0.035, side * 0.1);
    root.add(w);
    wheels.push(w);
  }
  const led = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0045, 8, 24), ring);
  led.rotation.x = Math.PI / 2;
  led.position.set(-0.06, 0.09, 0);
  root.add(led);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.09, 8), body);
  mast.position.set(0.06, 0.13, -0.04);
  root.add(mast);
  if (carrying) {
    const brick = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.0112, 0.016), new THREE.MeshStandardMaterial({ color: 0xc91a09, roughness: 0.5 }));
    brick.position.set(0.09, 0.095, 0.02);
    root.add(brick);
  }
  return { root, ring, wheels };
}

export class Swarm {
  readonly group = new THREE.Group();
  private readonly workers: SwarmWorker[] = [];
  private faultIndex = 2;
  private faulted = false;

  constructor(count: number) {
    // Three closed loops at different radii, flowing around the build zone.
    const loops = [1.1, 1.6, 2.15].map((r, li) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + li * 0.4;
        const jitter = 0.85 + 0.3 * Math.sin(i * 2.3 + li);
        pts.push(new THREE.Vector3(Math.cos(a) * r * jitter, 0, Math.sin(a) * r * jitter));
      }
      return new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.6);
    });
    for (let i = 0; i < count; i++) {
      const { root, ring, wheels } = makeLodWorker(i % 3 === 0);
      const curve = loops[i % loops.length]!;
      const w: SwarmWorker = {
        root,
        ring,
        wheels,
        curve,
        speed: 0.018 + (i % 4) * 0.004,
        phase: i / count,
        u: i / count,
      };
      ring.emissive.copy(i % 3 === 0 ? RING_GREEN : RING_BLUE);
      this.workers.push(w);
      this.group.add(root);
    }
  }

  /** faultActive: the vignette window (one worker halts, ring red). */
  update(time: number, dt: number, faultActive: boolean) {
    this.workers.forEach((w, i) => {
      const isFault = i === this.faultIndex && faultActive;
      if (!isFault) {
        w.u = (w.u + dt * w.speed) % 1;
      }
      const p = w.curve.getPointAt(w.u);
      const t = w.curve.getTangentAt(w.u);
      w.root.position.copy(p);
      w.root.rotation.y = Math.atan2(t.x, t.z) - Math.PI / 2;
      const spin = isFault ? 0 : time * w.speed * 120;
      for (const wheel of w.wheels) wheel.rotation.y = spin;
      if (isFault) {
        w.ring.emissive.copy(RING_RED);
        w.ring.emissiveIntensity = 1.6 + Math.sin(time * 8) * 0.8;
      } else if (i === this.faultIndex && !faultActive && this.faulted) {
        w.ring.emissive.copy(RING_BLUE);
        w.ring.emissiveIntensity = 1.6;
      } else {
        w.ring.emissiveIntensity = 1.5 + Math.sin(time * 1.3 + i) * 0.3;
      }
    });
    this.faulted = faultActive;
  }
}
