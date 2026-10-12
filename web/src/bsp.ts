// GoldSrc BSP version 30 reader (Half-Life / Counter-Strike 1.6 maps).
// Geometry only: no lightmaps, no BSP tree. Textures are read by name so the
// viewer can hide sky and trigger brushes.

export interface BspFace {
  texName: string;
  // Triangle-list vertices in GoldSrc space (x, y, z, Z-up).
  positions: Float32Array;
}

export interface BspMap {
  version: number;
  faces: BspFace[];
  entities: Record<string, string>[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

const LUMP_ENTITIES = 0;
const LUMP_TEXTURES = 2;
const LUMP_VERTEXES = 3;
const LUMP_TEXINFO = 6;
const LUMP_FACES = 7;
const LUMP_EDGES = 12;
const LUMP_SURFEDGES = 13;
const LUMP_MODELS = 14;
const HEADER_BYTES = 4 + 15 * 8;
const SIZE_VERTEX = 12;
const SIZE_EDGE = 4;
const SIZE_FACE = 20;
const SIZE_TEXINFO = 40;
const SIZE_MODEL = 64;

interface Lump {
  offset: number;
  length: number;
}

function readLump(view: DataView, index: number, fileBytes: number): Lump {
  const at = 4 + index * 8;
  const offset = view.getInt32(at, true);
  const length = view.getInt32(at + 4, true);
  if (offset < 0 || length < 0 || offset + length > fileBytes) {
    throw new Error(`BSP lump ${index} out of range`);
  }
  return { offset, length };
}

function readName(bytes: Uint8Array, start: number): string {
  let end = start;
  while (end < start + 16 && bytes[end] !== 0) end++;
  return new TextDecoder().decode(bytes.subarray(start, end));
}

export function parseEntities(text: string): Record<string, string>[] {
  const blocks: Record<string, string>[] = [];
  for (const chunk of text.split("}")) {
    const open = chunk.indexOf("{");
    if (open === -1) continue;
    const entity: Record<string, string> = {};
    for (const m of chunk.slice(open + 1).matchAll(/"([^"]*)"\s+"([^"]*)"/g)) {
      entity[m[1]] = m[2];
    }
    blocks.push(entity);
  }
  return blocks;
}

export function parseBsp(buffer: ArrayBuffer): BspMap {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (bytes.length < HEADER_BYTES) throw new Error("file too small for a BSP header");

  const version = view.getInt32(0, true);
  if (version !== 30) throw new Error(`unsupported BSP version ${version} (expected 30)`);

  const lump = (i: number) => readLump(view, i, bytes.length);
  const verts = lump(LUMP_VERTEXES);
  const edges = lump(LUMP_EDGES);
  const surfedges = lump(LUMP_SURFEDGES);
  const faces = lump(LUMP_FACES);
  const texinfo = lump(LUMP_TEXINFO);
  const textures = lump(LUMP_TEXTURES);
  const models = lump(LUMP_MODELS);

  const vertexCount = verts.length / SIZE_VERTEX;
  const edgeCount = edges.length / SIZE_EDGE;
  const surfedgeCount = surfedges.length / 4;

  // The world is model 0; its faces are a contiguous range.
  if (models.length < SIZE_MODEL) throw new Error("BSP has no world model");
  const world = { firstFace: view.getInt32(models.offset + 56, true), numFaces: view.getInt32(models.offset + 60, true) };
  const bmin: [number, number, number] = [
    view.getFloat32(models.offset, true),
    view.getFloat32(models.offset + 4, true),
    view.getFloat32(models.offset + 8, true),
  ];
  const bmax: [number, number, number] = [
    view.getFloat32(models.offset + 12, true),
    view.getFloat32(models.offset + 16, true),
    view.getFloat32(models.offset + 20, true),
  ];

  const texCount = textures.length >= 4 ? view.getInt32(textures.offset, true) : 0;
  const texNames: string[] = [];
  for (let i = 0; i < texCount; i++) {
    const rel = view.getInt32(textures.offset + 4 + i * 4, true);
    texNames.push(rel < 0 ? "" : readName(bytes, textures.offset + rel));
  }

  const out: BspFace[] = [];
  for (let f = world.firstFace; f < world.firstFace + world.numFaces; f++) {
    const at = faces.offset + f * SIZE_FACE;
    const firstEdge = view.getInt32(at + 4, true);
    const numEdges = view.getInt16(at + 8, true);
    const texInfoIndex = view.getInt16(at + 10, true);
    const texIdx = view.getInt32(texinfo.offset + texInfoIndex * SIZE_TEXINFO + 32, true);
    const texName = texNames[texIdx] ?? "";

    // Walk the face's surface edges into a vertex loop, then fan-triangulate it.
    const loop: number[] = [];
    for (let k = 0; k < numEdges; k++) {
      if (firstEdge + k >= surfedgeCount) throw new Error(`surfedge index out of range in face ${f}`);
      const se = view.getInt32(surfedges.offset + (firstEdge + k) * 4, true);
      const edgeIdx = se >= 0 ? se : -se;
      if (edgeIdx >= edgeCount) throw new Error(`edge index out of range in face ${f}`);
      const v = se >= 0
        ? view.getUint16(edges.offset + edgeIdx * SIZE_EDGE, true)
        : view.getUint16(edges.offset + edgeIdx * SIZE_EDGE + 2, true);
      if (v >= vertexCount) throw new Error(`vertex index out of range in face ${f}`);
      loop.push(v);
    }

    const positions = new Float32Array((loop.length - 2) * 9);
    let p = 0;
    const put = (v: number) => {
      const o = verts.offset + v * SIZE_VERTEX;
      positions[p++] = view.getFloat32(o, true);
      positions[p++] = view.getFloat32(o + 4, true);
      positions[p++] = view.getFloat32(o + 8, true);
    };
    for (let k = 1; k + 1 < loop.length; k++) {
      put(loop[0]);
      put(loop[k]);
      put(loop[k + 1]);
    }
    out.push({ texName, positions });
  }

  const ent = lump(LUMP_ENTITIES);
  const entText = new TextDecoder().decode(bytes.subarray(ent.offset, ent.offset + ent.length));
  return {
    version,
    faces: out,
    entities: parseEntities(entText.replace(/\0/g, "")),
    bounds: { min: bmin, max: bmax },
  };
}
