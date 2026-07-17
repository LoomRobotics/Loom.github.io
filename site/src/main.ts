import "./styles/journey.css";
import { detectTier } from "./perf/tier";

/** Phase 0 boot shell: proves the build/deploy pipeline, the brand-token
 * bridge, and the tier probe. The journey engine mounts here from Phase 1. */

const status = document.getElementById("boot-status");
const report = detectTier();

console.info("[loom] tier report", report);

if (status) {
  status.textContent = report.webgl
    ? `Preview channel · WebGL ready · tier ${report.tier}`
    : "Preview channel · WebGL unavailable — static version will be served here";
}
