import { describe, expect, test } from "bun:test";
import { durationOf, positionAt, STALE_AFTER_S } from "../web/src/demo/playback";

const track = [
  { t: 1, x: 0, y: 0, z: 0 },
  { t: 2, x: 10, y: 20, z: 30 },
  { t: 4, x: 10, y: 20, z: 30 },
];

describe("positionAt", () => {
  test("interpolates linearly between two samples", () => {
    expect(positionAt(track, 1.5)).toEqual([5, 10, 15]);
  });

  test("is null before the first sample", () => {
    expect(positionAt(track, 0.5)).toBeNull();
  });

  test("holds the last position while it is fresh, then goes null", () => {
    expect(positionAt(track, 4)).toEqual([10, 20, 30]);
    expect(positionAt(track, 4 + STALE_AFTER_S - 0.1)).toEqual([10, 20, 30]);
    expect(positionAt(track, 4 + STALE_AFTER_S + 0.1)).toBeNull();
  });

  test("an empty track is never visible", () => {
    expect(positionAt([], 1)).toBeNull();
  });
});

describe("durationOf", () => {
  test("is the latest timestamp across all player tracks", () => {
    expect(durationOf({ players: { "1": track, "2": [{ t: 9, x: 0, y: 0, z: 0 }] }, pov: null })).toBe(9);
  });

  test("counts the POV track too, so a POV-only replay can be scrubbed", () => {
    expect(durationOf({ players: {}, pov: [{ t: 0, x: 0, y: 0, z: 0 }, { t: 42, x: 0, y: 0, z: 0 }] })).toBe(42);
  });

  test("is zero for no tracks", () => {
    expect(durationOf({ players: {}, pov: null })).toBe(0);
  });
});
