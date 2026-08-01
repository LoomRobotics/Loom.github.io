import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RIG_NODES, attachRigBehaviours, type WorkerRig } from "./worker";

/** Drop-in slot for the authored Worker V1 model.
 *
 * If `public/media/worker.glb` exists and satisfies the rig contract, it
 * replaces the procedural greybox with no other change anywhere. If the file
 * is absent (the normal state while the CAD is in progress) the journey uses
 * the greybox and says nothing. If the file is present but wrong, the journey
 * still uses the greybox and prints exactly what to fix — a half-wired hero
 * model on the live site is worse than an honest greybox.
 *
 * The frame, node hierarchy, budgets and materials are specified in "Worker
 * Hero Model Export Contract" (LEGOSwarm vault, 12-Loom Robotics).
 */

/** Names the exporter may plausibly use instead of the contract name. */
const ALIASES: Record<string, string[]> = {
  wheel_L: ["wheel_left", "wheel.l", "drive_wheel_l"],
  wheel_R: ["wheel_right", "wheel.r", "drive_wheel_r"],
  arm_link1: ["arm_shoulder", "arm_j1_link", "shoulder"],
  arm_j2: ["arm_elbow", "elbow"],
  arm_j3: ["arm_wrist", "wrist"],
  arm_j4: ["arm_wrist2", "wrist_roll"],
  led_ring: ["status_ring", "neopixel_ring"],
  camera: ["camera_head", "imx708"],
};

export interface HeroReport {
  ok: boolean;
  missing: string[];
  triangles: number;
  problems: string[];
}

const MAX_TRIANGLES = 60_000;
/** Base is 0.22 m long and about 0.30 m tall with the mast; allow slack. */
const HEIGHT_RANGE = [0.12, 0.6];

function indexNodes(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const byName = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o.name) byName.set(o.name.toLowerCase(), o);
  });
  return byName;
}

function resolve(byName: Map<string, THREE.Object3D>, contractName: string): THREE.Object3D | undefined {
  const candidates = [contractName, ...(ALIASES[contractName] ?? [])];
  for (const name of candidates) {
    const hit = byName.get(name.toLowerCase());
    if (hit) return hit;
  }
  return undefined;
}

export function validateHero(root: THREE.Object3D): { report: HeroReport; nodes: Record<string, THREE.Object3D> } {
  const byName = indexNodes(root);
  const nodes: Record<string, THREE.Object3D> = {};
  const missing: string[] = [];
  for (const name of RIG_NODES) {
    const hit = resolve(byName, name);
    if (hit) nodes[name] = hit;
    else missing.push(name);
  }

  let triangles = 0;
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const geo = o.geometry as THREE.BufferGeometry;
    triangles += (geo.index ? geo.index.count : geo.getAttribute("position").count) / 3;
  });
  triangles = Math.round(triangles);

  const problems: string[] = [];
  if (triangles > MAX_TRIANGLES) problems.push(`${triangles} triangles exceeds the ${MAX_TRIANGLES} budget`);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (size.y < HEIGHT_RANGE[0]! || size.y > HEIGHT_RANGE[1]!) {
    problems.push(`height ${size.y.toFixed(3)} m is outside ${HEIGHT_RANGE[0]}-${HEIGHT_RANGE[1]} m: is the export in meters?`);
  }
  if (Math.abs(box.min.y) > 0.01) {
    problems.push(`floor sits at y=${box.min.y.toFixed(3)}, expected 0: put the origin under the base, on the ground`);
  }
  if (size.x < size.z) {
    problems.push(`depth (${size.z.toFixed(3)}) exceeds length (${size.x.toFixed(3)}): +X must be forward`);
  }

  return { report: { ok: missing.length === 0 && problems.length === 0, missing, triangles, problems }, nodes };
}

/** Emissive material of the status ring, so `setRingColor` keeps working. */
function ringMaterial(ledRing: THREE.Object3D): THREE.MeshStandardMaterial {
  let found: THREE.MeshStandardMaterial | null = null;
  ledRing.traverse((o) => {
    if (!found && o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
      found = o.material;
    }
  });
  if (found) return found;
  // No standard material under the ring: give it one so state colour still reads.
  const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 2 });
  ledRing.traverse((o) => {
    if (o instanceof THREE.Mesh) o.material = mat;
  });
  return mat;
}

export async function loadHeroWorker(base: string): Promise<WorkerRig | null> {
  const url = `${base}media/worker.glb`;
  let gltf;
  try {
    const head = await fetch(url, { method: "HEAD" });
    // Not authored yet: greybox, quietly. In dev the server answers unknown
    // paths with the index HTML rather than a 404, so check the type too.
    if (!head.ok || (head.headers.get("content-type") ?? "").includes("text/html")) return null;
    gltf = await new GLTFLoader().loadAsync(url);
  } catch (err) {
    console.warn(`[loom] hero model at ${url} could not be loaded; using the greybox`, err);
    return null;
  }

  const root = new THREE.Group();
  root.name = "worker";
  root.add(gltf.scene);

  const { report, nodes } = validateHero(root);
  if (!report.ok) {
    console.warn(
      `[loom] hero model rejected, using the greybox. See "Worker Hero Model Export Contract" in the LEGOSwarm vault\n` +
        (report.missing.length ? `  missing nodes: ${report.missing.join(", ")}\n` : "") +
        report.problems.map((p) => `  ${p}\n`).join("")
    );
    return null;
  }

  console.info(`[loom] hero model loaded (${report.triangles} triangles)`);
  return attachRigBehaviours(root, nodes, ringMaterial(nodes["led_ring"]!));
}
