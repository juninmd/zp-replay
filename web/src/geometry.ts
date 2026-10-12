import type { BspFace } from "./bsp";
import { toThree } from "./coords";

// Textures that are not visible world geometry: sky dome and invisible clip/trigger brushes.
const HIDDEN = new Set(["sky", "null", "clip", "origin", "hint", "skip", "bevel", "aaatrigger"]);

export function isVisibleTexture(name: string): boolean {
  if (name === "" || HIDDEN.has(name.toLowerCase())) return false;
  return !name.startsWith("aaa");
}

// Stable color per texture so the map reads as surfaces, without loading WADs.
export function colorForTexture(name: string): [number, number, number] {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  return hslToRgb(hue / 360, 0.18, 0.55);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

export interface MeshData {
  positions: Float32Array; // three.js space
  normals: Float32Array;
  colors: Float32Array;
  triangles: number;
}

// Merges visible faces into one buffer, flat-shaded (one normal per triangle).
export function buildMeshData(faces: BspFace[]): MeshData {
  let total = 0;
  const visible = faces.filter((f) => isVisibleTexture(f.texName));
  for (const f of visible) total += f.positions.length / 9;

  const positions = new Float32Array(total * 9);
  const normals = new Float32Array(total * 9);
  const colors = new Float32Array(total * 9);
  let w = 0;

  for (const face of visible) {
    const [r, g, b] = colorForTexture(face.texName);
    const src = face.positions;
    for (let t = 0; t < src.length; t += 9) {
      const a = toThree([src[t], src[t + 1], src[t + 2]]);
      const bv = toThree([src[t + 3], src[t + 4], src[t + 5]]);
      const c = toThree([src[t + 6], src[t + 7], src[t + 8]]);
      const ux = bv[0] - a[0], uy = bv[1] - a[1], uz = bv[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      for (const v of [a, bv, c]) {
        positions[w] = v[0]; positions[w + 1] = v[1]; positions[w + 2] = v[2];
        normals[w] = nx; normals[w + 1] = ny; normals[w + 2] = nz;
        colors[w] = r; colors[w + 1] = g; colors[w + 2] = b;
        w += 3;
      }
    }
  }
  return { positions, normals, colors, triangles: total };
}
