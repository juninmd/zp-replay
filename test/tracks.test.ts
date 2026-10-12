import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { goldsrcParserEither } from "@cgdangelo/talent-parser-goldsrc";
import { parseBsp } from "../web/src/bsp";
import { extractTracks } from "../web/src/demo/tracks";

const ROOT = join(import.meta.dir, "..");
const DEMO_HLTV = "C:/Users/jr_ac/AppData/Local/Temp/claude/D--Solutions-pessoal/ecabcb38-0ee2-488f-9847-4b7736eab777/scratchpad/dl-hltv-dust2/navi-vs-fx-dust2.dem";
const DEMO_POV = "C:/Users/jr_ac/AppData/Local/Temp/claude/D--Solutions-pessoal/ecabcb38-0ee2-488f-9847-4b7736eab777/scratchpad/dl-khanghugo/demotest.dem";
const DUST2 = join(ROOT, "local-maps/de_dust2.bsp");

// Synthetic frames, built from scratch for the unit tests.
const frame = (time: number, messages: unknown[]) => ({ type: "NetworkMessages", header: { time }, frameData: { messages } });
const serverinfo = { message: { name: "SVC_SERVERINFO", fields: { maxPlayers: 4 } } };
const entities = (time: number, states: { entityIndex: number; entityState: Record<string, number> }[]) =>
  frame(time, [{ message: { name: "SVC_PACKETENTITIES", fields: { entityStates: states } } }]);

describe("entity track accumulation", () => {
  test("a delta that only changes z keeps the last known x and y", () => {
    const dir = {
      "0": {
        frames: [
          frame(0, [serverinfo, { message: { name: "SVC_DELTAPACKETENTITIES", fields: { entityStates: [{ entityIndex: 2, entityState: { "origin[0]": 10, "origin[1]": 20, "origin[2]": 30 } }] } } }]),
          entities(1, [{ entityIndex: 2, entityState: { "origin[2]": 40 } }]),
        ],
      },
    };
    const r = extractTracks(dir as any, "test");
    expect(r.players["2"]).toEqual([
      { t: 0, x: 10, y: 20, z: 30 },
      { t: 1, x: 10, y: 20, z: 40 },
    ]);
  });

  test("baselines seed the state before the first delta", () => {
    const dir = {
      "0": {
        frames: [
          frame(0, [serverinfo, { message: { name: "SVC_SPAWNBASELINE", fields: { entities: [{ index: 1, delta: { "origin[0]": 5, "origin[1]": 6, "origin[2]": 7 } }] } } }]),
          entities(0.5, [{ entityIndex: 1, entityState: { "origin[0]": 9 } }]),
        ],
      },
    };
    expect(extractTracks(dir as any, "test").players["1"][0]).toEqual({ t: 0.5, x: 9, y: 6, z: 7 });
  });

  test("entities outside 1..maxPlayers and entities without an origin are not stored", () => {
    const dir = {
      "0": {
        frames: [
          frame(0, [serverinfo]),
          entities(0, [
            { entityIndex: 0, entityState: { "origin[0]": 1, "origin[1]": 1, "origin[2]": 1 } },
            { entityIndex: 9, entityState: { "origin[0]": 1, "origin[1]": 1, "origin[2]": 1 } },
            { entityIndex: 3, entityState: { animtime: 7 } },
          ]),
        ],
      },
    };
    expect(extractTracks(dir as any, "test").players).toEqual({});
  });

  test("samples closer than 0.1 s apart are thinned", () => {
    const dir = {
      "0": {
        frames: [frame(-1, [serverinfo]), ...[0, 0.02, 0.05, 0.12].map((t) => entities(t, [{ entityIndex: 1, entityState: { "origin[0]": t, "origin[1]": 0, "origin[2]": 0 } }]))],
      },
    };
    const r = extractTracks(dir as any, "test");
    expect(r.players["1"].map((s) => s.t)).toEqual([0, 0.12]);
  });

  test("an all-zero ClientData origin (HLTV spectator) is not a POV track", () => {
    const dir = {
      "0": {
        frames: [{ type: "ClientData", header: { time: 0 }, frameData: { origin: { x: 0, y: 0, z: 0 }, viewAngles: { x: 0, y: 0, z: 0 } } }],
      },
    };
    expect(extractTracks(dir as any, "test").pov).toBeNull();
  });

  test("ClientData gives the POV track with pitch and yaw", () => {
    const dir = {
      "0": {
        frames: [{ type: "ClientData", header: { time: 3 }, frameData: { origin: { x: 1, y: 2, z: 3 }, viewAngles: { x: -10, y: 90, z: 0 } } }],
      },
    };
    const r = extractTracks(dir as any, "test");
    expect(r.pov).toEqual([{ t: 3, x: 1, y: 2, z: 3, pitch: -10, yaw: 90 }]);
  });
});

describe("real demos", () => {
  test.skipIf(!existsSync(DEMO_HLTV) || !existsSync(DUST2))(
    "HLTV de_dust2: 10 player tracks, all inside the map box and moving",
    () => {
      const demo = (goldsrcParserEither(new Uint8Array(readFileSync(DEMO_HLTV)) as any) as any).right.value;
      const r = extractTracks(demo.directory, demo.header.mapName);
      const bsp = readFileSync(DUST2);
      const map = parseBsp(bsp.buffer.slice(bsp.byteOffset, bsp.byteOffset + bsp.byteLength));

      expect(r.map).toBe("de_dust2");
      // Pinned from the first real run; a change means the decoder changed.
      expect(Object.keys(r.players).length).toBe(10);

      const { min, max } = map.bounds;
      let moved = 0;
      for (const samples of Object.values(r.players)) {
        for (const s of samples) {
          expect(s.x).toBeGreaterThanOrEqual(min[0] - 64);
          expect(s.x).toBeLessThanOrEqual(max[0] + 64);
          expect(s.y).toBeGreaterThanOrEqual(min[1] - 64);
          expect(s.y).toBeLessThanOrEqual(max[1] + 64);
        }
        if (new Set(samples.map((s) => Math.round(s.x))).size > 50) moved++;
      }
      expect(moved).toBeGreaterThanOrEqual(8);
    },
    180_000
  );

  test.skipIf(!existsSync(DEMO_POV))("POV demo: the recorder track starts where the demo says", () => {
    const demo = (goldsrcParserEither(new Uint8Array(readFileSync(DEMO_POV)) as any) as any).right.value;
    const r = extractTracks(demo.directory, demo.header.mapName);
    // Same first origin the hldemo reader gave for ClientData (-576, -1120, 900.03125).
    expect(r.pov![0]).toMatchObject({ x: -576, y: -1120, z: 900.03125 });
    expect(Object.keys(r.players)).toEqual([]);
  }, 120_000);
});
