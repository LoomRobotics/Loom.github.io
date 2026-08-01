/** Beat system: the journey is a sequence of beats, each owning a slice of
 * scroll, one magnetic hold pose, a camera track, and overlay cue windows.
 *
 * Every beat has the SAME length and the SAME holdAt, so the scroll distance
 * between magnetic anchors is perfectly uniform — cadence variety comes from
 * camera pacing within each beat, never from uneven anchor spacing. */

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

const LEN = 1.2;
const HOLD = 0.5;

/** The journey beats: Act 1 (brand) → Act 2 (swarm) → Act 3 (hero worker)
 * → Act 4 (perception) → Act 6 (place & verify) → Act 5 (the graph, grown out
 * of the placement close-up) → Act 7 (close). */
export const BEATS: BeatDef[] = [
  {
    id: "brand",
    lengthUnits: LEN,
    holdAt: HOLD,
    // Opens aimed just above the horizon: nothing but dust and a far grid
    // dissolving into fog, so the headline lands on empty frame. The arena
    // rises into view as the beat runs out — Act 2 gets a real reveal.
    camera: [
      { t: 0, pos: [1.05, 1.5, 4.95], look: [0, 1.78, 0], fov: 32 },
      { t: 0.5, pos: [1.22, 1.46, 4.72], look: [0, 1.62, 0], fov: 33 },
      { t: 1, pos: [2.8, 1.9, 3.2], look: [0, 0, 0], fov: 46 },
    ],
    // Full alpha from the very first frame — the headline is the landing page.
    cues: [{ id: "brand", from: -0.2, to: 0.66 }],
  },
  {
    id: "swarm",
    lengthUnits: LEN,
    holdAt: HOLD,
    camera: [
      { t: 0, pos: [2.8, 1.9, 3.2], look: [0, 0, 0], fov: 46 },
      { t: 0.5, pos: [1.45, 0.8, 1.65], look: [-0.05, 0.06, -0.05], fov: 44 },
      { t: 1, pos: [0.95, 0.5, 1.25], look: [0, 0.12, 0], fov: 42 },
    ],
    cues: [{ id: "swarm", from: 0.1, to: 0.85 }],
  },
  {
    id: "worker",
    lengthUnits: LEN,
    holdAt: HOLD,
    camera: [
      { t: 0, pos: [0.95, 0.5, 1.25], look: [0, 0.12, 0], fov: 42 },
      { t: 0.5, pos: [0.4, 0.22, 0.48], look: [-0.04, 0.1, 0.03], fov: 40 },
      { t: 1, pos: [0.36, 0.2, 0.44], look: [-0.04, 0.1, 0.03], fov: 40 },
    ],
    explore: {
      target: [0, 0.09, 0],
      minDist: 0.24,
      maxDist: 1.2,
      minPolar: 0.6,
      maxPolar: 1.5,
    },
    cues: [{ id: "worker", from: 0.28, to: 1 }],
  },
  {
    // Act 4 lives entirely in camera space: a real capture covers the frame,
    // so the rails hold Act 3's last pose and hand it straight to `place`.
    id: "perceive",
    lengthUnits: LEN,
    holdAt: HOLD,
    camera: [
      { t: 0, pos: [0.36, 0.2, 0.44], look: [-0.04, 0.1, 0.03], fov: 40 },
      { t: 1, pos: [0.36, 0.2, 0.44], look: [-0.04, 0.1, 0.03], fov: 40 },
    ],
    cues: [
      { id: "perceive", from: 0.24, to: 0.72 },
      { id: "error", from: 0.42, to: 0.72 },
    ],
  },
  {
    id: "place",
    lengthUnits: LEN,
    holdAt: HOLD,
    camera: [
      { t: 0, pos: [0.36, 0.2, 0.44], look: [-0.04, 0.1, 0.03], fov: 40 },
      { t: 0.15, pos: [0.5, 0.16, 0.48], look: [0.55, 0.035, 0], fov: 38 },
      { t: 0.34, pos: [0.73, 0.1, 0.24], look: [0.55, 0.04, 0], fov: 34 },
      // Camera locks here through the payoff AND the whole graph beat:
      // the overlay materializes on the bricks without any camera move.
      { t: 0.5, pos: [0.69, 0.13, 0.28], look: [0.55, 0.04, 0], fov: 35 },
      { t: 1, pos: [0.69, 0.13, 0.28], look: [0.55, 0.04, 0], fov: 35 },
    ],
    cues: [
      { id: "place", from: 0.04, to: 0.26 },
      { id: "verify", from: 0.3, to: 0.46 },
      { id: "grows", from: 0.42, to: 1 },
    ],
  },
  {
    id: "graph",
    lengthUnits: LEN,
    holdAt: HOLD,
    camera: [
      { t: 0, pos: [0.69, 0.13, 0.28], look: [0.55, 0.04, 0], fov: 35 },
      { t: 1, pos: [0.69, 0.13, 0.28], look: [0.55, 0.04, 0], fov: 35 },
    ],
    explore: {
      target: [0.55, 0.05, 0],
      minDist: 0.18,
      maxDist: 1.2,
      minPolar: 0.5,
      maxPolar: 1.5,
    },
    cues: [{ id: "graph", from: 0.18, to: 1 }],
  },
  {
    id: "close",
    lengthUnits: LEN,
    holdAt: HOLD,
    camera: [
      { t: 0, pos: [0.69, 0.13, 0.28], look: [0.55, 0.04, 0], fov: 35 },
      { t: 0.5, pos: [0.92, 0.34, 0.62], look: [0.52, 0.05, 0.02], fov: 40 },
      { t: 1, pos: [1.05, 0.44, 0.8], look: [0.5, 0.06, 0.04], fov: 42 },
    ],
    cues: [{ id: "close", from: 0.2, to: 1 }],
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
