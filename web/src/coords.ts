// GoldSrc is Z-up, angles are [pitch, yaw, roll] in degrees, pitch > 0 looks down.
// three.js is Y-up, so the map is re-axed once here and nowhere else.

export type Vec3 = [number, number, number];

// GoldSrc (x, y, z) -> three (x, z, -y)
export function toThree(p: Vec3): Vec3 {
  return [p[0], p[2], -p[1]];
}

// Unit forward vector for GoldSrc view angles, already in three.js space.
export function forwardFromAngles(pitchDeg: number, yawDeg: number): Vec3 {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  const gx = Math.cos(p) * Math.cos(y);
  const gy = Math.cos(p) * Math.sin(y);
  const gz = -Math.sin(p);
  return toThree([gx, gy, gz]);
}

// Parses "pitch yaw roll" from a BSP entity key such as `angles`.
export function parseAngles(text: string | undefined): Vec3 {
  const parts = (text ?? "0 0 0").trim().split(/\s+/).map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}
