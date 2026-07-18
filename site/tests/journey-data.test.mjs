import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildModelData, computeWaves, simulateTape } from "../tools/lib/journey-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(join(here, "..", "assets-src", "models", p), "utf8"));
const car = read("car.graph.json");
const pyramid = read("pyramid.graph.json");

describe("computeWaves", () => {
  it("matches the dev-log ground truth for the car (8 waves, 16 free)", () => {
    const { waveCount, freeCount } = computeWaves(car);
    expect(waveCount).toBe(8);
    expect(freeCount).toBe(16);
  });

  it("matches the dev-log ground truth for the pyramid (4 waves)", () => {
    const { waveCount } = computeWaves(pyramid);
    expect(waveCount).toBe(4);
  });
});

describe("simulateTape", () => {
  it("places every node exactly once and is deterministic", () => {
    const a = simulateTape(car, { workers: 4, seed: 7 });
    const b = simulateTape(car, { workers: 4, seed: 7 });
    expect(a.placeOrder.length).toBe(car.nodes.length);
    expect(new Set(a.placeOrder).size).toBe(car.nodes.length);
    expect(a).toEqual(b);
  });

  it("never places a node before its support sources", () => {
    const { placeOrder } = simulateTape(car, { workers: 4, seed: 7 });
    const rank = new Map(placeOrder.map((id, i) => [id, i]));
    for (const e of car.edges) {
      if (e.type !== "support") continue;
      for (const s of e.sources) {
        expect(rank.get(s)).toBeLessThan(rank.get(e.target));
      }
    }
  });

  it("emits ~3 events per job, no polling", () => {
    const { tape } = simulateTape(car, { workers: 4, seed: 7 });
    expect(tape.length).toBe(car.nodes.length * 3);
  });
});

describe("buildModelData", () => {
  it("bakes three.js-space poses and colors for every node", () => {
    const data = buildModelData(car, { workers: 4, seed: 7 });
    for (const n of data.nodes) {
      expect(n.pos).toHaveLength(3);
      expect(n.color).toBeTypeOf("number");
      expect(n.order).toBeGreaterThanOrEqual(0);
      expect(n.wave).toBeLessThan(data.waveCount);
    }
  });
});
