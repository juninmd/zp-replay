import { describe, expect, test } from "bun:test";
import { forwardFromAngles, parseAngles, toThree } from "../web/src/coords";

// Expected values use the Quake/GoldSrc convention: yaw 0 looks along +X,
// yaw 90 along +Y, and positive pitch looks down. Checked against the spawn
// angles of de_dust2 in bsp.test.ts, not only against the formula.

const near = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe("GoldSrc -> three.js axes", () => {
  test("Z-up becomes Y-up with Y flipped to Z", () => {
    expect(toThree([1, 2, 3])).toEqual([1, 3, -2]);
  });
});

describe("view angles", () => {
  test("yaw 0 looks along +X", () => near(forwardFromAngles(0, 0), [1, 0, 0]));

  test("yaw 90 looks along +Y in GoldSrc, which is -Z in three.js", () => {
    near(forwardFromAngles(0, 90), [0, 0, -1]);
  });

  test("positive pitch looks down, negative pitch looks up", () => {
    near(forwardFromAngles(90, 0), [0, -1, 0]);
    near(forwardFromAngles(-90, 0), [0, 1, 0]);
  });

  test("forward is a unit vector for any angle", () => {
    for (const [p, y] of [[10, 33], [-45, 200], [70, 359]]) {
      const [x, yy, z] = forwardFromAngles(p, y);
      expect(Math.hypot(x, yy, z)).toBeCloseTo(1, 6);
    }
  });

  test("parseAngles reads pitch yaw roll and tolerates a missing key", () => {
    expect(parseAngles("0 255 0")).toEqual([0, 255, 0]);
    expect(parseAngles(undefined)).toEqual([0, 0, 0]);
  });
});
