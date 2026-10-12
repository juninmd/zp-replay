import type { Sample } from "./tracks";

// A player whose last update is older than this is treated as not visible.
export const STALE_AFTER_S = 5;

export type Vec3 = [number, number, number];

// Position of one track at time t, linearly interpolated between stored samples.
// Returns null before the first sample and after the track has gone stale.
export function positionAt(samples: Sample[], t: number): Vec3 | null {
  if (samples.length === 0 || t < samples[0].t) return null;

  // Last sample with s.t <= t.
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }

  const a = samples[lo];
  if (t - a.t > STALE_AFTER_S) return null;
  const b = samples[lo + 1];
  if (!b || b.t === a.t) return [a.x, a.y, a.z];

  const k = (t - a.t) / (b.t - a.t);
  return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k];
}

// Last timestamp in any track (players or POV), in seconds.
export function durationOf(replay: { players: Record<string, Sample[]>; pov: Sample[] | null }): number {
  let end = 0;
  for (const samples of [...Object.values(replay.players), replay.pov ?? []]) {
    if (samples.length) end = Math.max(end, samples[samples.length - 1].t);
  }
  return end;
}
