/** Beat system: the journey is a sequence of beats, each owning a slice of
 * scroll (lengthUnits ≈ viewport-heights), one magnetic hold pose, a camera
 * track, and overlay cue windows. Cadence is deliberately uneven. */

export type Vec3 = [number, number, number];

export interface CameraKey {
  /** Beat-local position 0..1 */
  t: number;
  pos: Vec3;
  look: Vec3;
  fov?: number;
}

export interface OverlayCue {
  /** DOM section id suffix (rendered by overlays.ts) */
  id: string;
  from: number;
  to: number;
}

export interface ExploreSpec {
  target: Vec3;
  minDist: number;
  maxDist: number;
  minPolar: number;
  maxPolar: number;
}

export interface BeatDef {
  id: string;
  lengthUnits: number;
  /** Beat-local t of the magnetic settle pose */
  holdAt: number;
  camera: CameraKey[];
  explore?: ExploreSpec;
  cues: OverlayCue[];
}

/** Phase 2 beats — the physical spine: Act 2 (swarm) → Act 3 (hero worker)
 * → Act 6 (place & verify) → outro. Acts 1/4/5/7 land in later phases. */
export const BEATS: BeatDef[] = [
  {
    id: "swarm",
    lengthUnits: 1.4,
    holdAt: 0.5,
    camera: [
      { t: 0, pos: [2.8, 1.9, 3.2], look: [-0.2, 0, -0.1], fov: 46 },
      { t: 0.5, pos: [1.35, 0.75, 1.55], look: [-0.42, 0.05, -0.26], fov: 44 },
      { t: 1, pos: [0.95, 0.5, 1.25], look: [0, 0.12, 0], fov: 42 },
    ],
    cues: [{ id: "swarm", from: 0.1, to: 0.85 }],
  },
  {
    id: "worker",
    lengthUnits: 1.5,
    holdAt: 0.6,
    camera: [
      { t: 0, pos: [0.95, 0.5, 1.25], look: [0, 0.12, 0], fov: 42 },
      { t: 0.6, pos: [0.52, 0.28, 0.64], look: [-0.06, 0.13, 0.04], fov: 40 },
      { t: 1, pos: [0.47, 0.26, 0.58], look: [-0.06, 0.13, 0.04], fov: 40 },
    ],
    explore: {
      target: [0, 0.12, 0],
      minDist: 0.32,
      maxDist: 1.5,
      minPolar: 0.6,
      maxPolar: 1.5,
    },
    cues: [{ id: "worker", from: 0.35, to: 1 }],
  },
  {
    id: "place",
    lengthUnits: 1.6,
    holdAt: 0.8,
    camera: [
      { t: 0, pos: [0.47, 0.26, 0.58], look: [-0.06, 0.13, 0.04], fov: 40 },
      { t: 0.28, pos: [0.12, 0.2, 0.72], look: [-0.42, 0.07, -0.24], fov: 40 },
      { t: 0.55, pos: [-0.12, 0.24, 0.5], look: [-0.55, 0.09, -0.35], fov: 37 },
      { t: 0.8, pos: [0.35, 0.55, 1.05], look: [-0.5, 0.12, -0.3], fov: 42 },
      { t: 1, pos: [0.75, 0.75, 1.45], look: [-0.42, 0.14, -0.26], fov: 44 },
    ],
    cues: [
      { id: "place", from: 0.06, to: 0.4 },
      { id: "verify", from: 0.54, to: 0.74 },
      { id: "grows", from: 0.78, to: 1 },
    ],
  },
  {
    id: "outro",
    lengthUnits: 0.9,
    holdAt: 0.65,
    camera: [
      { t: 0, pos: [0.75, 0.75, 1.45], look: [-0.42, 0.14, -0.26], fov: 44 },
      { t: 0.65, pos: [1.7, 1.25, 2.2], look: [-0.35, 0.1, -0.22], fov: 46 },
      { t: 1, pos: [2.1, 1.5, 2.6], look: [-0.3, 0.1, -0.2], fov: 46 },
    ],
    cues: [{ id: "outro", from: 0.3, to: 1 }],
  },
];

export interface BeatTable {
  beats: BeatDef[];
  totalUnits: number;
  /** Master-progress [start, end) per beat */
  spans: Array<{ start: number; end: number }>;
  /** Master-progress of each beat's hold pose (the snap points) */
  holds: number[];
}

export function buildBeatTable(beats: BeatDef[]): BeatTable {
  const totalUnits = beats.reduce((s, b) => s + b.lengthUnits, 0);
  const spans: Array<{ start: number; end: number }> = [];
  const holds: number[] = [];
  let acc = 0;
  for (const b of beats) {
    const start = acc / totalUnits;
    const end = (acc + b.lengthUnits) / totalUnits;
    spans.push({ start, end });
    holds.push(start + (b.holdAt * b.lengthUnits) / totalUnits);
    acc += b.lengthUnits;
  }
  return { beats, totalUnits, spans, holds };
}

export interface BeatPosition {
  index: number;
  beat: BeatDef;
  localT: number;
}

export function locate(table: BeatTable, progress: number): BeatPosition {
  const p = Math.min(Math.max(progress, 0), 1);
  for (let i = 0; i < table.spans.length; i++) {
    const span = table.spans[i]!;
    if (p < span.end || i === table.spans.length - 1) {
      const localT = (p - span.start) / (span.end - span.start);
      return { index: i, beat: table.beats[i]!, localT: Math.min(Math.max(localT, 0), 1) };
    }
  }
  throw new Error("unreachable");
}
