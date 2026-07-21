import "./styles/journey.css";
import { detectTier } from "./perf/tier";

/** Boot: tier-probe, then mount the WebGL journey, or fall back to the
 * static panels for no-WebGL / reduced-motion. */

const boot = document.getElementById("boot");
const status = document.getElementById("boot-status");
const report = detectTier();
console.info("[loom] tier report", report);

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function holdShell(message: string) {
  if (status) status.textContent = message;
}

function showStatic() {
  const s = document.getElementById("static-journey");
  const end = document.getElementById("journey-end");
  if (s) s.hidden = false;
  if (end) end.hidden = false;
  boot?.classList.add("boot-done");
  window.setTimeout(() => boot?.remove(), 800);
}

if (!report.webgl) {
  showStatic();
} else if (reducedMotion) {
  showStatic();
} else {
  holdShell("Loading journey…");
  import("./journey/engine")
    .then(({ mountJourney }) => mountJourney(report))
    .then(() => {
      const end = document.getElementById("journey-end");
      if (end) end.hidden = false;
      boot?.classList.add("boot-done");
      window.setTimeout(() => boot?.remove(), 800);
    })
    .catch((err) => {
      console.error("[loom] journey mount failed", err);
      holdShell("The journey failed to start. The links below still work");
    });
}
