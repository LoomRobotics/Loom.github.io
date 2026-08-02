import type { BeatPosition, BeatTable } from "./beats";
import { captureComposite } from "../dev/capture";

/** DEV route `?capture=stills`: exports one still per beat for the static
 * variant (reduced motion, no WebGL, crawlers).
 *
 * It deliberately does not touch the scroll rig. Each beat is posed directly
 * from the beat table and drawn through the engine's own `renderFrame`, which
 * is both deterministic and immune to the frozen rAF that makes scroll-driven
 * capture unreliable when the host pane is not compositing.
 *
 * What lands in the image: the stage plus the *data* overlays that are the
 * point of their beats (graph chips, detection boxes, the feed HUD). What does
 * not: the act copy, the chrome and the navigation. The static panel already
 * carries that copy as real HTML, so baking it in would duplicate it and break
 * at other widths.
 *
 * Output size follows the viewport at export time. Run it at 1280x720.
 */

/** Fixed clock and step, so two runs produce the same frames. */
const DT = 1 / 60;
const CLOCK = 8.4;

/** Beats whose look depends on accumulated state rather than beat-local t:
 * the swarm has to spread along its lanes, and the graph's event tape has to
 * advance out of "everything blocked" into a mid-build state. */
const WARMUP_FRAMES: Record<string, number> = {
  swarm: 900,
  place: 60,
  graph: 1500,
  close: 900,
};

/** Beat-local t to export, where the hold pose does not make a useful picture.
 * Act 1's hold is deliberately an empty frame, because its headline carries
 * it; as a standalone panel image that is a black rectangle, so the still is
 * taken from the reveal instead, as the arena rises into view. */
const STILL_T: Record<string, number> = {
  brand: 0.8,
};

export interface StillExportDeps {
  table: BeatTable;
  canvas: HTMLCanvasElement;
  renderFrame: (pos: BeatPosition, time: number, dt: number, settled: boolean) => void;
}

export async function exportStills({ table, canvas, renderFrame }: StillExportDeps): Promise<string[]> {
  const ui = document.getElementById("journey-ui");
  ui?.classList.add("stills-export");
  const written: string[] = [];

  try {
    for (let index = 0; index < table.beats.length; index++) {
      const beat = table.beats[index]!;
      const pos: BeatPosition = { index, beat, localT: STILL_T[beat.id] ?? beat.holdAt };

      // Replay from a clean clock so each still is reproducible. `settled` is
      // true: a still is the settled hold pose by definition.
      let clock = 0;
      for (let f = 0, n = WARMUP_FRAMES[beat.id] ?? 30; f < n; f++) {
        clock += DT;
        renderFrame(pos, clock, DT, true);
      }
      renderFrame(pos, CLOCK, DT, true);

      written.push(
        await captureComposite(`act-${beat.id}`, canvas, {
          roots: ["journey-ui"],
          dir: "public/media/stills",
          quality: 0.8,
        })
      );
    }
  } finally {
    ui?.classList.remove("stills-export");
  }

  return written;
}
