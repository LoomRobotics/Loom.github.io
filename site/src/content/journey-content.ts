/** Single source of truth for journey copy. All terminology is sourced
 * verbatim from the LEGOSwarm knowledge base — keep the register calm,
 * technical, and honest (sim results are labeled sim). */

export interface ActCopy {
  eyebrow?: string;
  heading?: string;
  body: string;
  sim?: boolean;
  /** "hud" renders as a compact telemetry chip instead of an act-copy block */
  variant?: "hud";
}

export interface HotspotSpec {
  id: string;
  /** Named node on the worker rig the pin anchors to */
  anchor: string;
  title: string;
  body: string;
}

export const ACT_COPY: Record<string, ActCopy> = {
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
    body: "61 bricks across 8 dependency waves, assembled in the real build order from the real assembly graph — zero double-placements.",
    sim: true,
  },
  outro: {
    eyebrow: "Continue",
    heading: "This is WEAVE.",
    body: "A replicated assembly graph, self-expiring leases, and workers that verify their own work. The full story is below.",
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
];

export const EXPLORE_HINT = "Drag to inspect · scroll to continue";
export const EXPLORE_HINT_TOUCH = "Inspect in 3D";
export const RESUME_LABEL = "Resume journey";
