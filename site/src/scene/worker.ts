import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** Procedural styled-greybox Worker V1.
 *
 * Dimensions come from the real URDF (legoswarm_description/worker.urdf.xacro):
 * base 0.22×0.18×0.06 m, wheels r0.035 at ±0.10 lateral (rear-biased), front
 * caster r0.018, 4-DOF arm links 0.10/0.10/0.08/0.06 (0.03 square section).
 *
 * The rig implements the hero-model contract — meters, +X forward, origin at
 * floor under base center, named nodes — so the authored hero GLB can replace
 * this file's output with zero changes elsewhere.
 */

export interface WorkerRig {
  root: THREE.Group;
  nodes: Record<string, THREE.Object3D>;
  /** Idle micro-motion + highlight pulse; call every frame. */
  update(elapsed: number): void;
  /** Emissive-pulse the named contract node's subtree (null clears). */
  setHighlight(name: string | null): void;
  setRingColor(color: THREE.ColorRepresentation): void;
  /** 0 = folded display pose, 1 = extended placement pose (blended). */
  setArmExtend(k: number): void;
  /** Spin the drive wheels (rad advance per call frame). */
  spinWheels(delta: number): void;
}

const BASE = { x: 0.22, y: 0.06, z: 0.18 };
const WHEEL = { r: 0.035, w: 0.02, lateral: 0.1, back: -BASE.x / 4 };
const CASTER_R = 0.018;
const BASE_BOTTOM = 0.025;
const ARM_LINKS = [0.1, 0.1, 0.08, 0.06];
const ARM_SECTION = 0.026;

function mat(opts: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(opts);
}

export function createWorkerGreybox(): WorkerRig {
  const body = mat({ color: 0x2a323c, metalness: 0.35, roughness: 0.55 });
  const panel = mat({ color: 0x1f252d, metalness: 0.3, roughness: 0.65 });
  const arm = mat({ color: 0x46586b, metalness: 0.5, roughness: 0.42 });
  const accent = mat({ color: 0xff6a13, metalness: 0.25, roughness: 0.5 });
  const tire = mat({ color: 0x14171b, metalness: 0.1, roughness: 0.9 });
  const lens = mat({ color: 0x0a0d12, metalness: 0.85, roughness: 0.18, emissive: 0x24405c, emissiveIntensity: 0.5 });
  const ring = mat({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 2.0 });

  const root = new THREE.Group();
  root.name = "worker";
  const nodes: Record<string, THREE.Object3D> = {};
  const register = (name: string, obj: THREE.Object3D) => {
    obj.name = name;
    nodes[name] = obj;
    return obj;
  };

  // ---- Base -----------------------------------------------------------
  const baseGroup = register("base", new THREE.Group());
  root.add(baseGroup);

  const hull = new THREE.Mesh(new RoundedBoxGeometry(BASE.x, BASE.y, BASE.z, 3, 0.008), body);
  hull.position.y = BASE_BOTTOM + BASE.y / 2;
  baseGroup.add(hull);

  // Inset top deck + orange chamfer strip (concept-sheet surface language)
  const deck = new THREE.Mesh(new RoundedBoxGeometry(BASE.x * 0.86, 0.008, BASE.z * 0.82, 2, 0.003), panel);
  deck.position.y = BASE_BOTTOM + BASE.y + 0.004;
  baseGroup.add(deck);

  const chamfer = new THREE.Mesh(new THREE.BoxGeometry(BASE.x * 0.9, 0.004, 0.006), accent);
  chamfer.position.set(0, BASE_BOTTOM + BASE.y - 0.006, BASE.z / 2 + 0.001);
  baseGroup.add(chamfer);
  const chamfer2 = chamfer.clone();
  chamfer2.position.z = -(BASE.z / 2 + 0.001);
  baseGroup.add(chamfer2);

  // ---- Drive ----------------------------------------------------------
  const wheelGeo = new THREE.CylinderGeometry(WHEEL.r, WHEEL.r, WHEEL.w, 28);
  const hubGeo = new THREE.CylinderGeometry(WHEEL.r * 0.45, WHEEL.r * 0.45, WHEEL.w + 0.004, 20);
  for (const side of [1, -1] as const) {
    const wheel = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tire);
    const hub = new THREE.Mesh(hubGeo, accent);
    wheel.add(tyre, hub);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(WHEEL.back, WHEEL.r, side * WHEEL.lateral);
    register(side === 1 ? "wheel_L" : "wheel_R", wheel);
    root.add(wheel);
  }
  const caster = new THREE.Mesh(new THREE.SphereGeometry(CASTER_R, 20, 16), tire);
  caster.position.set(BASE.x / 4, CASTER_R, 0);
  register("caster", caster);
  root.add(caster);

  // ---- LED status ring (rear deck) ------------------------------------
  const ringHub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.012, 24), panel);
  ringHub.position.set(-BASE.x * 0.28, BASE_BOTTOM + BASE.y + 0.014, 0);
  baseGroup.add(ringHub);
  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0038, 12, 48), ring);
  ledRing.rotation.x = Math.PI / 2;
  ledRing.position.copy(ringHub.position).y += 0.009;
  register("led_ring", ledRing);
  baseGroup.add(ledRing);

  // ---- Camera mast (front) -------------------------------------------
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.13, 16), arm);
  mast.position.set(BASE.x * 0.3, BASE_BOTTOM + BASE.y + 0.065, -BASE.z * 0.22);
  baseGroup.add(mast);
  const camHead = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.022, 0.026, 2, 0.004), body);
  camHead.position.copy(mast.position).y += 0.075;
  register("camera", camHead);
  baseGroup.add(camHead);
  const lensDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.006, 20), lens);
  lensDisc.rotation.z = Math.PI / 2;
  lensDisc.position.set(0.016, 0, 0);
  camHead.add(lensDisc);

  // ---- 4-DOF arm ------------------------------------------------------
  const j1 = register("arm_j1", new THREE.Group());
  j1.position.set(BASE.x / 4, BASE_BOTTOM + BASE.y + 0.004, BASE.z * 0.14);
  baseGroup.add(j1);
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.03, 24), arm);
  turret.position.y = 0.015;
  j1.add(turret);

  let parent: THREE.Object3D = j1;
  let jointY = 0.03;
  const jointNames = ["arm_j2", "arm_j3", "arm_j4"];
  const linkMats = [arm, arm, arm, body];
  for (let i = 0; i < ARM_LINKS.length; i++) {
    const joint = new THREE.Group();
    joint.position.y = jointY;
    if (i > 0) joint.position.set(0, jointY, 0);
    parent.add(joint);
    const len = ARM_LINKS[i]!;
    const section = ARM_SECTION - i * 0.003;
    const link = new THREE.Mesh(new RoundedBoxGeometry(section, len, section, 2, 0.004), linkMats[i]);
    link.position.y = len / 2;
    joint.add(link);
    if (i > 0) {
      const elbow = new THREE.Mesh(
        new THREE.CylinderGeometry(section * 0.72, section * 0.72, section * 1.5, 18),
        panel
      );
      elbow.rotation.x = Math.PI / 2;
      joint.add(elbow);
    }
    if (i === 0) register("arm_j2_geom", link);
    const name = i === 0 ? "arm_link1" : jointNames[i - 1]!;
    register(name, joint);
    parent = joint;
    jointY = len;
  }

  // Gripper at the wrist tip
  const gripper = register("gripper", new THREE.Group());
  gripper.position.y = ARM_LINKS[3]!;
  parent.add(gripper);
  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.014, 0.05, 2, 0.003), body);
  gripper.add(palm);
  for (const side of [1, -1] as const) {
    const finger = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.034, 0.008, 2, 0.002), accent);
    finger.position.set(0, 0.02, side * 0.018);
    gripper.add(finger);
  }

  // Display pose: compactly folded, alert (kept low so the hero framing
  // holds the whole robot)
  const POSE = { link1: -0.15, j2: 1.55, j3: -2.05, j4: 0.85, yaw: -0.35 };
  nodes["arm_link1"]!.rotation.z = POSE.link1;
  nodes["arm_j2"]!.rotation.z = POSE.j2;
  nodes["arm_j3"]!.rotation.z = POSE.j3;
  nodes["arm_j4"]!.rotation.z = POSE.j4;
  j1.rotation.y = POSE.yaw;

  // ---- Hotspot anchors (empties) --------------------------------------
  const anchor = (name: string, target: THREE.Object3D, offset: THREE.Vector3) => {
    const a = new THREE.Object3D();
    a.position.copy(offset);
    target.add(a);
    register(name, a);
  };
  anchor("hotspot_camera", camHead, new THREE.Vector3(0.02, 0.02, 0));
  anchor("hotspot_arm", nodes["arm_j3"]!, new THREE.Vector3(0, 0.02, 0.02));
  anchor("hotspot_drive", nodes["wheel_L"]!, new THREE.Vector3(0, 0, 0.03));
  anchor("hotspot_compute", hull, new THREE.Vector3(-0.04, 0.02, -0.05));
  anchor("hotspot_imu", hull, new THREE.Vector3(0.02, 0.025, 0.03));
  anchor("hotspot_ring", ledRing, new THREE.Vector3(0, 0.012, 0));

  // ---- Behaviors ------------------------------------------------------
  let highlightRoot: THREE.Object3D | null = null;
  const flashable = new Map<THREE.MeshStandardMaterial, { color: THREE.Color; intensity: number }>();

  function collectMaterials(objName: string): THREE.MeshStandardMaterial[] {
    const target = nodes[objName];
    const out: THREE.MeshStandardMaterial[] = [];
    target?.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        out.push(o.material);
      }
    });
    return out;
  }

  function setHighlight(name: string | null) {
    // restore previous
    for (const [m, orig] of flashable) {
      m.emissive.copy(orig.color);
      m.emissiveIntensity = orig.intensity;
    }
    flashable.clear();
    highlightRoot = null;
    if (!name) return;
    highlightRoot = nodes[name] ?? null;
    // Highlight maps hotspot anchors to their visible subtree
    const visual = name.replace("hotspot_", "");
    const lookup: Record<string, string> = {
      camera: "camera",
      arm: "arm_j1",
      drive: "wheel_L",
      compute: "base",
      imu: "base",
      ring: "led_ring",
    };
    for (const m of collectMaterials(lookup[visual] ?? name)) {
      if (m === ring) continue; // keep the ring's own emissive
      flashable.set(m, { color: m.emissive.clone(), intensity: m.emissiveIntensity });
    }
  }

  // Extended placement pose (arm reaches forward-down toward a stud)
  const PLACE_POSE = { link1: -0.05, j2: 0.75, j3: -0.85, j4: 0.55, yaw: 0.15 };
  let extendK = 0;
  const mix = (a: number, b: number) => a + (b - a) * extendK;

  function setArmExtend(k: number) {
    extendK = Math.min(Math.max(k, 0), 1);
  }

  function spinWheels(delta: number) {
    for (const name of ["wheel_L", "wheel_R"]) {
      // wheel groups are rotated x=PI/2; rolling = local y spin
      nodes[name]!.rotation.y += delta;
    }
  }

  function update(elapsed: number) {
    // Ring breathing
    ring.emissiveIntensity = 1.9 + Math.sin(elapsed * 1.4) * 0.45;
    // Idle arm micro-sway blended toward the placement pose when extended
    const sway = (1 - extendK);
    nodes["arm_link1"]!.rotation.z = mix(POSE.link1, PLACE_POSE.link1);
    nodes["arm_j2"]!.rotation.z = mix(POSE.j2, PLACE_POSE.j2);
    nodes["arm_j4"]!.rotation.z = mix(POSE.j4, PLACE_POSE.j4);
    nodes["arm_j3"]!.rotation.z = mix(POSE.j3, PLACE_POSE.j3) + Math.sin(elapsed * 0.7) * 0.02 * sway;
    nodes["arm_j1"]!.rotation.y = mix(POSE.yaw, PLACE_POSE.yaw) + Math.sin(elapsed * 0.31) * 0.035 * sway;
    // Highlight pulse
    if (highlightRoot && flashable.size) {
      const pulse = (Math.sin(elapsed * 6) * 0.5 + 0.5) * 0.55;
      for (const [m] of flashable) {
        m.emissive.setHex(0xff6a13);
        m.emissiveIntensity = pulse;
      }
    }
  }

  function setRingColor(color: THREE.ColorRepresentation) {
    ring.emissive.set(color);
  }

  return { root, nodes, update, setHighlight, setRingColor, setArmExtend, spinWheels };
}
