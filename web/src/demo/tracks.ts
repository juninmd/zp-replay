// Turns a parsed GoldSrc demo into per-entity position tracks.
// Entity updates are delta-compressed: an origin only appears when it changes,
// so each entity's last known state is carried forward.

export interface Sample {
  t: number; // seconds into the demo
  x: number;
  y: number;
  z: number;
}

export interface PovSample extends Sample {
  pitch: number;
  yaw: number;
}

export interface ReplayData {
  map: string;
  maxPlayers: number;
  players: Record<string, Sample[]>; // key: entity index as string
  pov: PovSample[] | null; // recorder's own track, when the demo is a POV recording
}

// Minimum spacing between stored samples; the viewer does not need more than 10 Hz.
const MIN_STEP = 0.1;

type Vec = Record<"x" | "y" | "z", number>;
type Frame = { type: string; header: { time: number }; frameData?: any };

function originFrom(delta: Record<string, number>, prev: Partial<Vec>): Partial<Vec> {
  const out: Partial<Vec> = { ...prev };
  if (delta["origin[0]"] !== undefined) out.x = delta["origin[0]"];
  if (delta["origin[1]"] !== undefined) out.y = delta["origin[1]"];
  if (delta["origin[2]"] !== undefined) out.z = delta["origin[2]"];
  return out;
}

export function extractTracks(directory: Record<string, { frames?: Frame[] }>, map: string): ReplayData {
  const state = new Map<number, Partial<Vec>>();
  const lastStored = new Map<number, number>();
  const players: Record<string, Sample[]> = {};
  const pov: PovSample[] = [];
  let maxPlayers = 0;

  const store = (index: number, t: number, v: Partial<Vec>) => {
    if (v.x === undefined || v.y === undefined || v.z === undefined) return;
    const last = lastStored.get(index);
    if (last !== undefined && t - last < MIN_STEP) return;
    lastStored.set(index, t);
    (players[String(index)] ??= []).push({ t, x: v.x, y: v.y, z: v.z });
  };

  for (const entry of Object.values(directory)) {
    for (const frame of entry.frames ?? []) {
      const t = frame.header.time;

      if (frame.type === "ClientData") {
        const o = frame.frameData?.origin;
        const a = frame.frameData?.viewAngles;
        // HLTV (spectator) demos send an all-zero origin; that is not a POV track.
        const isSpectator = !o || (o.x === 0 && o.y === 0 && o.z === 0);
        if (!isSpectator && a && (pov.length === 0 || t - pov[pov.length - 1].t >= MIN_STEP)) {
          pov.push({ t, x: o.x, y: o.y, z: o.z, pitch: a.x, yaw: a.y });
        }
        continue;
      }
      if (frame.type !== "NetworkMessages") continue;

      for (const wrapped of frame.frameData?.messages ?? []) {
        const msg = wrapped.message;
        if (!msg) continue;

        if (msg.name === "SVC_SERVERINFO") {
          maxPlayers = msg.fields.maxPlayers;
        } else if (msg.name === "SVC_SPAWNBASELINE") {
          for (const e of msg.fields.entities ?? []) {
            const next = originFrom(e.delta ?? {}, state.get(e.index) ?? {});
            state.set(e.index, next);
          }
        } else if (msg.name === "SVC_PACKETENTITIES" || msg.name === "SVC_DELTAPACKETENTITIES") {
          for (const e of msg.fields.entityStates ?? []) {
            const prev = state.get(e.entityIndex) ?? {};
            const next = originFrom(e.entityState ?? {}, prev);
            state.set(e.entityIndex, next);
            if (e.entityIndex >= 1 && e.entityIndex <= maxPlayers) store(e.entityIndex, t, next);
          }
        }
      }
    }
  }

  return { map, maxPlayers, players, pov: pov.length ? pov : null };
}
