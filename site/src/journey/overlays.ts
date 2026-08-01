import type * as THREE from "three";
import type { BeatDef, BeatPosition } from "./beats";
import {
  ACT_COPY,
  EXPLORE_HINT,
  EXPLORE_HINT_TOUCH,
  HOTSPOTS,
  RESUME_LABEL,
  SCROLL_CUE,
  type HotspotSpec,
} from "../content/journey-content";

/** DOM overlay layer: act copy sections (cue-windowed), hotspot pins projected
 * from 3D anchors, the detail card, explore affordances, the beat-dot rail,
 * and an aria-live mirror for screen readers. All type is DOM for crispness. */

export interface OverlayCallbacks {
  onBeatDot(index: number): void;
  onHotspot(spec: HotspotSpec | null): void;
  onInspectTap(): void;
  onResume(): void;
}

export interface PinProjection {
  x: number;
  y: number;
  visible: boolean;
}

export class Overlays {
  private readonly root: HTMLElement;
  private readonly sections = new Map<string, HTMLElement>();
  private readonly pins = new Map<string, HTMLButtonElement>();
  private readonly card: HTMLElement;
  private readonly cardTitle: HTMLElement;
  private readonly cardBody: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly resumePill: HTMLButtonElement;
  private readonly inspectBtn: HTMLButtonElement;
  private readonly scrollCue: HTMLElement;
  private readonly dots: HTMLButtonElement[] = [];
  private readonly live: HTMLElement;
  private lastLiveBeat = -1;
  private openHotspot: string | null = null;

  constructor(root: HTMLElement, beats: BeatDef[], private readonly cb: OverlayCallbacks) {
    this.root = root;

    // One section per cue id used by any beat (copy keyed by cue id)
    const cueIds = [...new Set(beats.flatMap((b) => b.cues.map((c) => c.id)))];
    for (const id of cueIds) {
      const copy = ACT_COPY[id];
      if (!copy) continue;
      const el = document.createElement("section");
      el.id = `act-${id}`;
      if (copy.variant === "hud") {
        el.className = "act-hud";
        el.textContent = copy.body;
      } else if (copy.variant === "hero") {
        // Act 1 is the page's headline: an h1 over the void, no logo on stage.
        el.className = "act-hero";
        el.innerHTML = `
          ${copy.eyebrow ? `<span class="eyebrow">${copy.eyebrow}</span>` : ""}
          <h1>${copy.heading ?? ""}</h1>
          <p>${copy.body}</p>`;
      } else {
        el.className = copy.variant === "center" ? "act-copy center" : "act-copy";
        const ctas = copy.ctas
          ? `<nav class="act-ctas">${copy.ctas
              .map((c) => `<a href="${c.href}"${c.primary ? ' class="primary"' : ""}>${c.label}</a>`)
              .join("")}</nav>`
          : "";
        el.innerHTML = `
          ${copy.eyebrow ? `<span class="eyebrow">${copy.eyebrow}</span>` : ""}
          ${copy.heading ? `<h2>${copy.heading}</h2>` : ""}
          <p>${copy.body}</p>
          ${copy.sim ? `<span class="sim-chip">simulation</span>` : ""}
          ${ctas}`;
      }
      el.style.opacity = "0";
      root.appendChild(el);
      this.sections.set(id, el);
    }

    // Hotspot pins + card
    for (const spec of HOTSPOTS) {
      const pin = document.createElement("button");
      pin.className = "pin";
      pin.type = "button";
      pin.setAttribute("aria-label", spec.title);
      pin.hidden = true;
      pin.addEventListener("click", () => {
        const opening = this.openHotspot !== spec.id;
        this.openHotspot = opening ? spec.id : null;
        this.renderCard(opening ? spec : null);
        cb.onHotspot(opening ? spec : null);
      });
      root.appendChild(pin);
      this.pins.set(spec.id, pin);
    }

    this.card = document.createElement("aside");
    this.card.className = "hotspot-card";
    this.card.hidden = true;
    this.card.innerHTML = `
      <button class="card-close" type="button" aria-label="Close">×</button>
      <h3></h3><p></p>`;
    this.cardTitle = this.card.querySelector("h3")!;
    this.cardBody = this.card.querySelector("p")!;
    this.card.querySelector(".card-close")!.addEventListener("click", () => {
      this.openHotspot = null;
      this.renderCard(null);
      cb.onHotspot(null);
    });
    root.appendChild(this.card);

    // Opening scroll affordance: a scroll-driven page has to say so once.
    this.scrollCue = document.createElement("div");
    this.scrollCue.className = "scroll-cue";
    this.scrollCue.setAttribute("aria-hidden", "true");
    // Inner span carries the entrance animation: a filled animation on the
    // cue itself would outrank the per-frame opacity the engine writes here.
    this.scrollCue.innerHTML = `<span>${SCROLL_CUE}</span><i></i>`;
    root.appendChild(this.scrollCue);

    // Explore affordances
    this.hint = document.createElement("div");
    this.hint.className = "explore-hint";
    this.hint.textContent = EXPLORE_HINT;
    this.hint.hidden = true;
    root.appendChild(this.hint);

    this.inspectBtn = document.createElement("button");
    this.inspectBtn.className = "explore-hint explore-tap";
    this.inspectBtn.type = "button";
    this.inspectBtn.textContent = EXPLORE_HINT_TOUCH;
    this.inspectBtn.hidden = true;
    this.inspectBtn.addEventListener("click", () => cb.onInspectTap());
    root.appendChild(this.inspectBtn);

    this.resumePill = document.createElement("button");
    this.resumePill.className = "resume-pill";
    this.resumePill.type = "button";
    this.resumePill.textContent = RESUME_LABEL;
    this.resumePill.hidden = true;
    this.resumePill.addEventListener("click", () => cb.onResume());
    root.appendChild(this.resumePill);

    // Beat-dot rail
    const rail = document.createElement("nav");
    rail.className = "beat-rail";
    rail.setAttribute("aria-label", "Journey sections");
    beats.forEach((beat, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", ACT_COPY[beat.id]?.heading ?? beat.id);
      dot.addEventListener("click", () => cb.onBeatDot(i));
      rail.appendChild(dot);
      this.dots.push(dot);
    });
    root.appendChild(rail);

    // aria-live mirror
    this.live = document.createElement("div");
    this.live.className = "sr-only";
    this.live.setAttribute("aria-live", "polite");
    root.appendChild(this.live);
  }

  /** Graph-node text chips, keyed by node id (created on first use). */
  private readonly chipPool = new Map<string, HTMLElement>();

  private renderCard(spec: HotspotSpec | null) {
    if (!spec) {
      this.card.hidden = true;
      return;
    }
    this.cardTitle.textContent = spec.title;
    this.cardBody.textContent = spec.body;
    this.card.hidden = false;
  }

  private static cueAlpha(t: number, from: number, to: number): number {
    const ramp = 0.08;
    if (t < from || t > to) return 0;
    const up = Math.min((t - from) / ramp, 1);
    const down = Math.min((to - t) / ramp, 1);
    return Math.min(up, down);
  }

  update(
    pos: BeatPosition,
    opts: {
      settled: boolean;
      exploring: boolean;
      touch: boolean;
      project: (anchor: string) => PinProjection | null;
      graphChips?: Array<{ id: string; x: number; y: number; visible: boolean; state: string; label: string; opacity: number }>;
    }
  ) {
    // Graph-node text chips, overlaid on the bricks
    const chips = opts.graphChips ?? [];
    const active = new Set<string>();
    for (const chip of chips) {
      active.add(chip.id);
      let el = this.chipPool.get(chip.id);
      if (!el) {
        el = document.createElement("div");
        el.className = "graph-chip";
        el.setAttribute("aria-hidden", "true");
        this.root.appendChild(el);
        this.chipPool.set(chip.id, el);
      }
      if (!chip.visible || chip.opacity <= 0.02) {
        el.hidden = true;
        continue;
      }
      el.hidden = false;
      if (el.textContent !== chip.label) el.textContent = chip.label;
      const cls = `graph-chip ${chip.state}`;
      if (el.className !== cls) el.className = cls;
      el.style.opacity = chip.opacity.toFixed(2);
      el.style.transform = `translate(${chip.x.toFixed(1)}px, ${chip.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [id, el] of this.chipPool) {
      if (!active.has(id)) el.hidden = true;
    }
    // Copy sections: alpha from the active beat's cue windows
    for (const [id, el] of this.sections) {
      let alpha = 0;
      for (const cue of pos.beat.cues) {
        if (cue.id === id) alpha = Math.max(alpha, Overlays.cueAlpha(pos.localT, cue.from, cue.to));
      }
      if (opts.exploring) alpha = 0;
      el.style.opacity = alpha.toFixed(3);
      el.style.setProperty("--rise", `${((1 - alpha) * 14).toFixed(1)}px`);
      el.style.visibility = alpha > 0.01 ? "visible" : "hidden";
    }

    // Scroll cue: only before the first gesture on the opening beat.
    const cueAlpha = pos.index === 0 ? 1 - Math.min(pos.localT / 0.05, 1) : 0;
    this.scrollCue.style.opacity = cueAlpha.toFixed(3);
    this.scrollCue.style.visibility = cueAlpha > 0.01 ? "visible" : "hidden";

    // aria-live on beat change
    if (pos.index !== this.lastLiveBeat) {
      this.lastLiveBeat = pos.index;
      const copy = ACT_COPY[pos.beat.id];
      if (copy) this.live.textContent = `${copy.heading ?? ""} ${copy.body}`;
    }

    // Hotspot pins: only on the explore beat when settled or exploring
    const showPins = pos.beat.explore !== undefined && (opts.settled || opts.exploring);
    for (const spec of HOTSPOTS) {
      const pin = this.pins.get(spec.id)!;
      const proj = showPins ? opts.project(spec.anchor) : null;
      if (!proj || !proj.visible) {
        pin.hidden = true;
        continue;
      }
      pin.hidden = false;
      pin.style.transform = `translate(${proj.x.toFixed(1)}px, ${proj.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
    if (!showPins && this.openHotspot) {
      this.openHotspot = null;
      this.renderCard(null);
      this.cb.onHotspot(null);
    }

    // Affordances
    const canExplore = pos.beat.explore !== undefined && opts.settled && !opts.exploring;
    this.hint.hidden = !(canExplore && !opts.touch);
    this.inspectBtn.hidden = !(canExplore && opts.touch);
    this.resumePill.hidden = !(opts.exploring && opts.touch);

    // Rail
    this.dots.forEach((d, i) => d.classList.toggle("active", i === pos.index));
  }
}
