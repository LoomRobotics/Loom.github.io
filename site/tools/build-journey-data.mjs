/** Builds public/media/journey-data.json from the real CAD→graph exports in
 * assets-src/models/. Deterministic (seeded); output is committed. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelData } from "./lib/journey-lib.mjs";

const site = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => JSON.parse(readFileSync(join(site, "assets-src", "models", p), "utf8"));

const car = buildModelData(read("car.graph.json"), { workers: 4, seed: 7 });
const pyramid = buildModelData(read("pyramid.graph.json"), { workers: 3, seed: 7 });

// Ground truth from the dev log: car = 61 bricks / 8 waves / 16 free.
const assert = (cond, msg) => { if (!cond) { console.error(`ASSERT FAILED: ${msg}`); process.exit(1); } };
assert(car.nodes.length === 61, `car nodes ${car.nodes.length} != 61`);
assert(car.waveCount === 8, `car waves ${car.waveCount} != 8`);
assert(car.freeCount === 16, `car free ${car.freeCount} != 16`);
assert(pyramid.nodes.length === 13, `pyramid nodes ${pyramid.nodes.length} != 13`);

const out = { generated: "tools/build-journey-data.mjs", car, pyramid };
mkdirSync(join(site, "public", "media"), { recursive: true });
writeFileSync(join(site, "public", "media", "journey-data.json"), JSON.stringify(out));
console.log(
  `journey-data: car ${car.nodes.length} nodes / ${car.waveCount} waves / ${car.freeCount} free / ${car.tape.length} events; ` +
  `pyramid ${pyramid.nodes.length} nodes / ${pyramid.waveCount} waves / ${pyramid.freeCount} free`
);
