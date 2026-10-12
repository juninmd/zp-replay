import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const WASM = join(ROOT, "crate/target/wasm32-unknown-unknown/release/zp_replay_wasm.wasm");
// Third-party fixture from the upstream hldemo test suite, not project data.
const DEMO = join(ROOT, "vendor/hldemo/test-demos/basic.dem");
const HAVE_DEMO = existsSync(DEMO);

type Exports = {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  parse_origins(ptr: number, len: number): number;
  samples_ptr(): number;
};

async function load(): Promise<Exports> {
  const { instance } = await WebAssembly.instantiate(readFileSync(WASM));
  return instance.exports as unknown as Exports;
}

function parse(wasm: Exports, bytes: Uint8Array): Float32Array | null {
  const ptr = wasm.alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  const count = wasm.parse_origins(ptr, bytes.length);
  wasm.dealloc(ptr, bytes.length);
  if (count < 0) return null;
  // Copy out: a later alloc can grow memory and detach the view.
  const view = new Float32Array(wasm.memory.buffer, wasm.samples_ptr(), count * 4);
  return view.slice();
}

describe("zp-replay wasm PoC", () => {
  test("rejects bytes that are not a GoldSrc demo", async () => {
    const wasm = await load();
    const garbage = new TextEncoder().encode("this is not a demo file at all");
    expect(parse(wasm, garbage)).toBeNull();
  });

  test.skipIf(!HAVE_DEMO)("extracts recorder positions from basic.dem", async () => {
    const wasm = await load();
    const samples = parse(wasm, new Uint8Array(readFileSync(DEMO)));

    // Golden values from the native hldemo run (examples/origins, 288 ClientData frames).
    expect(samples).not.toBeNull();
    expect(samples!.length / 4).toBe(288);

    const first = Array.from(samples!.slice(0, 4));
    expect(first).toEqual([0, 484, 318, -203.96875]);

    // The player moves: x spans ~435..550 in the native run.
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < samples!.length; i += 4) {
      minX = Math.min(minX, samples![i + 1]);
      maxX = Math.max(maxX, samples![i + 1]);
    }
    expect(minX).toBeCloseTo(435.6875, 3);
    expect(maxX).toBeCloseTo(550.7422, 3);
  });
});
