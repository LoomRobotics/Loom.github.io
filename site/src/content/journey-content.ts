/** Single source of truth for journey copy. All terminology is sourced
 * verbatim from the LEGOSwarm knowledge base — keep the register calm,
 * technical, and honest (sim results are labeled sim). */

export interface ActCopy {
  eyebrow: string;
  heading: string;
  body: string;
  sim?: boolean;
}

export interface HotspotSpec {
  id: string;
  /** Named node on the worker rig the pin anchors to */
  anchor: string;
  title: string;
  body: string;
}

export const ACT_COPY: Record<string, ActCopy> = {
  approach: {
    eyebrow: "Worker V1",
    heading: "One worker.",
    body: "A differential-drive base, a 4-DOF arm, and one camera. Every worker is a peer — it carries its own copy of the build plan and claims its own work.",
  },
  worker: {
    eyebrow: "Hands on",
    heading: "Drag to inspect.",
    body: "The base does coarse positioning; the arm does fine placement. Tap a marker to see what each part is for.",
  },
  pullback: {
    eyebrow: "Vertical slice",
    heading: "This is the feel test.",
    body: "Magnetic scroll, one settle, one free-explore. The full seven-act journey builds on exactly this rig.",
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
