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


// Smallest valid v30 BSP: one world face (a triangle) with one texinfo and one texture.
function buildBsp(opts: { numEdges?: number; texInfoIndex?: number; numFaces?: number } = {}): ArrayBuffer {
  const { numEdges = 3, texInfoIndex = 0, numFaces = 1 } = opts;
  const lumps: Record<number, Uint8Array> = {};
  const bytes = (n: number, fill: (v: DataView) => void) => {
    const a = new Uint8Array(n);
    fill(new DataView(a.buffer));
    return a;
  };
  lumps[0] = new TextEncoder().encode('{ "classname" "worldspawn" }\0');
  lumps[2] = bytes(4 + 4 + 16 + 40, (v) => {
    v.setInt32(0, 1, true);
    v.setInt32(4, 8, true);
    new Uint8Array(v.buffer).set(new TextEncoder().encode("wall"), 8);
  });
  lumps[3] = bytes(36, (v) => [0, 0, 0, 10, 0, 0, 0, 10, 0].forEach((n, i) => v.setFloat32(i * 4, n, true)));
  lumps[6] = bytes(40, (v) => v.setInt32(32, 0, true));
  lumps[7] = bytes(20, (v) => {
    v.setInt32(4, 0, true);
    v.setInt16(8, numEdges, true);
    v.setInt16(10, texInfoIndex, true);
  });
  lumps[12] = bytes(12, (v) => {
    [0, 1, 1, 2, 2, 0].forEach((n, i) => v.setUint16(i * 2, n, true));
  });
  lumps[13] = bytes(12, (v) => [0, 1, 2].forEach((n, i) => v.setInt32(i * 4, n, true)));
  lumps[14] = bytes(64, (v) => {
    v.setInt32(56, 0, true);
    v.setInt32(60, numFaces, true);
  });
  let total = 4 + 15 * 8;
  const offsets: number[] = [];
  for (let i = 0; i < 15; i++) {
    offsets.push(total);
    total += lumps[i]?.length ?? 0;
  }
  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  view.setInt32(0, 30, true);
  for (let i = 0; i < 15; i++) {
    view.setInt32(4 + i * 8, offsets[i], true);
    view.setInt32(8 + i * 8, lumps[i]?.length ?? 0, true);
    if (lumps[i]) new Uint8Array(buf).set(lumps[i], offsets[i]);
  }
  return buf;
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

  test("reads a minimal synthetic map", () => {
    const map = parseBsp(buildBsp());
    expect(map.faces.length).toBe(1);
    expect(map.faces[0].texName).toBe("wall");
    expect(map.faces[0].positions.length).toBe(9);
  });

  test("skips a degenerate face with fewer than 3 edges", () => {
    expect(parseBsp(buildBsp({ numEdges: 2 })).faces.length).toBe(0);
  });

  test("rejects a face range outside the faces lump", () => {
    expect(() => parseBsp(buildBsp({ numFaces: 2 }))).toThrow(/world faces out of range/);
  });

  test("rejects a texinfo index outside the texinfo lump", () => {
    expect(() => parseBsp(buildBsp({ texInfoIndex: 5 }))).toThrow(/texinfo index out of range/);
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
