import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import type { BeatTable } from "./beats";

gsap.registerPlugin(ScrollTrigger);

/** Scroll rig: Lenis smoothing + one pinless ScrollTrigger for progress, plus
 * a custom magnetic-snap controller (lenis.scrollTo with input lock) — one
 * scroll gesture carries the camera to the next beat hold and settles. Using
 * lenis for the snap tween (instead of ScrollTrigger's snap) avoids the two
 * libraries fighting over scrollTop. */

export interface ScrollState {
  progress: number;
  /** normalized progress units / second */
  velocity: number;
  snapping: boolean;
  settled: boolean;
  holdIndex: number;
}

export interface ScrollRig {
  state: ScrollState;
  scrollToHold(index: number, opts?: { duration?: number }): void;
  /** Temporarily take scroll input away (touch free-explore). */
  stopInput(): void;
  resumeInput(): void;
  destroy(): void;
}

const IDLE_MS = 130;
const SETTLE_EPS = 0.004;

const easeInOutPow3 = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createScrollRig(container: HTMLElement, table: BeatTable): ScrollRig {
  container.style.height = `${Math.round(table.totalUnits * 100)}vh`;

  const state: ScrollState = { progress: 0, velocity: 0, snapping: false, settled: false, holdIndex: 0 };

  const lenis = new Lenis({ smoothWheel: true, syncTouch: false, autoRaf: false });
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  let lastMoveAt = 0;
  let lastDir = 1;
  let inputStopped = false;

  const st = ScrollTrigger.create({
    trigger: container,
    start: "top top",
    end: "bottom bottom",
    scrub: true,
    onUpdate(self) {
      const prev = state.progress;
      state.progress = self.progress;
      const spanPx = Math.max(self.end - self.start, 1);
      state.velocity = self.getVelocity() / spanPx;
      if (Math.abs(self.progress - prev) > 1e-5) {
        lastMoveAt = performance.now();
        if (Math.abs(state.velocity) > 1e-4) lastDir = state.velocity > 0 ? 1 : -1;
      }
    },
  });

  function nearestHold(p: number): number {
    let best = 0;
    let bestD = Infinity;
    table.holds.forEach((h, i) => {
      const d = Math.abs(h - p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** Directional target: the next hold in the travel direction; when idle
   * between holds with no clear direction, the nearest one. Returns -1 for
   * "no snap" (past the last hold heading out of the journey). */
  function snapTarget(p: number, dir: number): number {
    const holds = table.holds;
    const last = holds[holds.length - 1]!;
    if (p > last + SETTLE_EPS && dir >= 0) return -1; // exiting the journey
    if (dir > 0) {
      for (let i = 0; i < holds.length; i++) if (holds[i]! > p + SETTLE_EPS) return i;
      return -1;
    }
    for (let i = holds.length - 1; i >= 0; i--) if (holds[i]! < p - SETTLE_EPS) return i;
    return p < holds[0]! - SETTLE_EPS ? 0 : -1;
  }

  function snapNow(index: number, duration?: number) {
    const target = table.holds[index];
    if (target === undefined) return;
    const px = st.start + target * (st.end - st.start);
    const dist = Math.abs(target - state.progress);
    state.snapping = true;
    state.holdIndex = index;
    lenis.scrollTo(px, {
      duration: duration ?? Math.min(1.1, Math.max(0.35, dist * 3.2)),
      easing: easeInOutPow3,
      lock: true,
      onComplete: () => {
        state.snapping = false;
        lastMoveAt = 0;
      },
    });
  }

  // Idle watcher: after IDLE_MS without movement, magnetize to a hold.
  const watcher = () => {
    if (state.snapping || inputStopped) {
      state.settled = state.snapping ? false : state.settled;
      return;
    }
    const idle = lastMoveAt !== 0 && performance.now() - lastMoveAt > IDLE_MS;
    const nh = nearestHold(state.progress);
    const atHold = Math.abs(table.holds[nh]! - state.progress) <= SETTLE_EPS;
    state.settled = atHold && (idle || lastMoveAt === 0);
    if (atHold) state.holdIndex = nh;
    if (!idle || atHold) return;
    const target = snapTarget(state.progress, lastDir);
    if (target >= 0) snapNow(target);
    else lastMoveAt = 0; // free exit — stop watching until next move
  };
  gsap.ticker.add(watcher);

  return {
    state,
    scrollToHold(index, opts) {
      const clamped = Math.min(Math.max(index, 0), table.holds.length - 1);
      snapNow(clamped, opts?.duration ?? 0.9);
    },
    stopInput() {
      inputStopped = true;
      lenis.stop();
    },
    resumeInput() {
      inputStopped = false;
      lenis.start();
    },
    destroy() {
      gsap.ticker.remove(watcher);
      gsap.ticker.remove(tick);
      st.kill();
      lenis.destroy();
    },
  };
}
