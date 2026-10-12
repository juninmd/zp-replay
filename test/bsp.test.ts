import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBsp } from "../web/src/bsp";

const ROOT = join(import.meta.dir, "..");
// Local-only: the official map ships with CS 1.6 and is not committed (see .gitignore).
const DUST2 = join(ROOT, "local-maps/de_dust2.bsp");
const HAVE_MAP = existsSync(DUST2);

function load(path: string): ArrayBuffer {
  const b = readFileSync(path);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe("BSP v30 reader", () => {
  test("rejects a non-GoldSrc version", () => {
    const buf = new ArrayBuffer(4 + 15 * 8);
    new DataView(buf).setInt32(0, 29, true);
    expect(() => parseBsp(buf)).toThrow(/unsupported BSP version 29/);
  });

  test("rejects a truncated file", () => {
    expect(() => parseBsp(new ArrayBuffer(8))).toThrow(/too small/);
  });

  test.skipIf(!HAVE_MAP)("reads de_dust2 geometry, spawns and bounds", () => {
    const map = parseBsp(load(DUST2));

    expect(map.version).toBe(30);
    // Pinned from the first real run; a change here means the reader changed.
    expect(map.faces.length).toBe(5130);
    const tris = map.faces.reduce((n, f) => n + f.positions.length / 9, 0);
    expect(tris).toBe(13198);

    // Every coordinate must be finite; a bad index would show up as NaN or garbage.
    for (const f of map.faces) {
      for (const v of f.positions) expect(Number.isFinite(v)).toBe(true);
    }

    const spawns = map.entities.filter((e) => e.classname?.startsWith("info_player"));
    expect(spawns.filter((e) => e.classname === "info_player_start").length).toBe(20);
    expect(spawns.filter((e) => e.classname === "info_player_deathmatch").length).toBe(20);

    // Spawns must sit inside the world box, or the bounds are wrong.
    const { min, max } = map.bounds;
    for (const s of spawns) {
      const [x, y, z] = (s.origin ?? "0 0 0").split(" ").map(Number);
      expect(x).toBeGreaterThanOrEqual(min[0]);
      expect(x).toBeLessThanOrEqual(max[0]);
      expect(y).toBeGreaterThanOrEqual(min[1]);
      expect(y).toBeLessThanOrEqual(max[1]);
      expect(z).toBeGreaterThanOrEqual(min[2]);
      expect(z).toBeLessThanOrEqual(max[2]);
    }

    // Sky faces are kept in the reader; the viewer hides them, not the parser.
    expect(map.faces.some((f) => f.texName === "sky")).toBe(true);
  });
});
