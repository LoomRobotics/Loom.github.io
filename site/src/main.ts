import "./styles/journey.css";
import { detectTier } from "./perf/tier";

/** Boot: tier-probe, then mount the WebGL journey — or hold at the static
 * shell for no-WebGL / reduced-motion (full static variant lands in Phase 3). */

const boot = document.getElementById("boot");
const status = document.getElementById("boot-status");
const report = detectTier();
console.info("[loom] tier report", report);

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function holdShell(message: string) {
  if (status) status.textContent = message;
}

if (!report.webgl) {
  holdShell("WebGL unavailable — the static version will be served here");
} else if (reducedMotion) {
  holdShell("Reduced motion honored — static version coming in a later phase");
} else {
  holdShell("Loading journey…");
  import("./journey/engine")
    .then(({ mountJourney }) => {
      mountJourney(report);
      const end = document.getElementById("journey-end");
      if (end) end.hidden = false;
      boot?.classList.add("boot-done");
      window.setTimeout(() => boot?.remove(), 800);
    })
    .catch((err) => {
      console.error("[loom] journey mount failed", err);
      holdShell("The journey failed to start — the links below still work");
    });
}
