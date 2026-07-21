/** Single source of truth for journey copy. All terminology is sourced
 * verbatim from the LEGOSwarm knowledge base — keep the register calm,
 * technical, and honest (sim results are labeled sim). */

export interface ActCopy {
  eyebrow?: string;
  heading?: string;
  body: string;
  sim?: boolean;
  /** "hud" = compact telemetry chip; "center" = centered hero block */
  variant?: "hud" | "center";
  ctas?: Array<{ label: string; href: string; primary?: boolean }>;
}

export interface HotspotSpec {
  id: string;
  /** Named node on the worker rig the pin anchors to */
  anchor: string;
  title: string;
  body: string;
}

export const ACT_COPY: Record<string, ActCopy> = {
  brand: {
    eyebrow: "Loom Robotics",
    heading: "Decentralized robotic construction.",
    body: "WEAVE — the Workload Execution and Autonomous Verification Engine. A swarm that builds from a replicated assembly graph, with no one in charge.",
    variant: "center",
  },
  swarm: {
    eyebrow: "The swarm",
    heading: "No central controller.",
    body: "Every worker carries its own copy of the build plan and pulls its own work — jobs are claimed, never assigned. About three events per job, no polling. Lose a robot, and its lease simply expires.",
    sim: true,
  },
  worker: {
    eyebrow: "Worker V1",
    heading: "One worker.",
    body: "A differential-drive base, a 4-DOF arm, one camera. The base does coarse positioning; the arm does fine placement. Drag to inspect — tap a marker for the details.",
  },
  place: {
    eyebrow: "Build → Verify → Continue",
    heading: "Place, then prove it.",
    body: "A placement is never complete until it is verified against the plan. Pass, and dependents unlock. Fail, and the job is released for another worker to retry.",
    sim: true,
  },
  verify: {
    body: "verify · drift 3.2 mm ≤ 5.0 mm — PASS · placement_complete",
    variant: "hud",
  },
  grows: {
    eyebrow: "The payoff",
    heading: "The structure grows.",
    body: "Thirteen bricks across four dependency waves, assembled in the real build order from the real assembly graph — zero double-placements.",
    sim: true,
  },
  graph: {
    eyebrow: "The assembly graph",
    heading: "The blueprint is the brain.",
    body: "Every robot carries this graph — replicated, versioned, event-sourced, convergent. Jobs unlock as their supports complete; a claim is three events on the wire; a dead worker's lease simply expires. Drag to orbit the plan.",
    sim: true,
  },
  close: {
    eyebrow: "This is WEAVE",
    heading: "No single robot holds the master plan.",
    body: "Yet every robot knows exactly where the project stands. Everything above is our simulation, rendered live — hardware bring-up is underway.",
    ctas: [
      { label: "Read the WEAVE paper", href: "/technical.html", primary: true },
      { label: "Dev Log", href: "/devlog.html" },
    ],
  },
};

export const HOTSPOTS: HotspotSpec[] = [
  {
    id: "camera",
    anchor: "hotspot_camera",
    title: "Perception camera",
    body: "Raspberry Pi Camera Module 3 — Sony IMX708. The worker's only eye: it segments a part, reads depth, and deprojects to a 3-D world point. No motion capture, no ground truth.",
  },
  {
    id: "arm",
    anchor: "hotspot_arm",
    title: "4-DOF arm + compliant gripper",
    body: "Reach 0.24 m. The mobile base provides coarse positioning while the arm handles fine placement; the force-limited gripper keeps insertion forces gentle.",
  },
  {
    id: "drive",
    anchor: "hotspot_drive",
    title: "Differential drive",
    body: "Two Pololu 25D gearmotors with 48 CPR quadrature encoders and a rear caster. Wheel-velocity PID runs on real-time firmware, not the Linux brain.",
  },
  {
    id: "compute",
    anchor: "hotspot_compute",
    title: "Two-tier compute",
    body: "A Raspberry Pi 5 (8 GB) runs the ROS 2 peer stack — perception, planning, the swarm protocol. A Pico 2 W handles motors and encoders in real time, with a watchdog that halts the wheels if the Pi ever goes quiet.",
  },
  {
    id: "ring",
    anchor: "hotspot_ring",
    title: "Status ring",
    body: "A 24-LED ring is the robot's face: white idle, blue navigating, green carrying, red fault. You can read the swarm's state from across the room.",
  },
];

export const EXPLORE_HINT = "Drag to inspect · scroll to continue";
export const EXPLORE_HINT_TOUCH = "Inspect in 3D";
export const RESUME_LABEL = "Resume journey";
