import * as THREE from "three";
import { toThree } from "./coords";
import { positionAt } from "./demo/playback";
import type { PovSample, ReplayData } from "./demo/tracks";

// One cylinder per player, placed at the hull centre (GoldSrc origin is the hull centre).
// Deliberately larger than the real 32x72 hull so players stay readable at overview zoom.
const HULL_RADIUS = 36;
const HULL_HEIGHT = 110;

export class ReplayView {
  private markers = new Map<string, THREE.Mesh>();

  constructor(scene: THREE.Scene, private readonly replay: ReplayData) {
    const geometry = new THREE.CylinderGeometry(HULL_RADIUS, HULL_RADIUS, HULL_HEIGHT, 12);
    for (const index of Object.keys(replay.players)) {
      // Colour by slot so the same player keeps its colour through the match.
      const hue = ((Number(index) - 1) * 0.618) % 1;
      const material = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue, 0.8, 0.55) });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      this.markers.set(index, mesh);
    }
  }

  get playerCount(): number {
    return this.markers.size;
  }

  update(t: number): number {
    let visible = 0;
    for (const [index, mesh] of this.markers) {
      const pos = positionAt(this.replay.players[index], t);
      mesh.visible = pos !== null;
      if (pos) {
        mesh.position.set(...toThree(pos));
        visible++;
      }
    }
    return visible;
  }

  // Recorder's own position and view at time t, or null when the demo has no POV track.
  povAt(t: number): PovSample | null {
    const pov = this.replay.pov;
    if (!pov || pov.length === 0 || t < pov[0].t) return null;
    let lo = 0;
    let hi = pov.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pov[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return pov[lo];
  }

  get hasPov(): boolean {
    return this.replay.pov !== null;
  }
}
