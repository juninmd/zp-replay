import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { parseBsp } from "./bsp";
import { forwardFromAngles, parseAngles, toThree } from "./coords";
import { buildMeshData } from "./geometry";
import type { ReplayData } from "./demo/tracks";
import { durationOf } from "./demo/playback";
import { ReplayView } from "./replay-view";

// Eye height above the player origin. Measured on demotest.dem: viewOrigin - origin
// has a median of 17.03 over 541 frames (range 16.0-19.4, presumably crouching).
const EYE_HEIGHT = 17;

const status = document.getElementById("status") as HTMLElement;
const host = document.getElementById("view") as HTMLElement;
const spawnSelect = document.getElementById("spawn") as HTMLSelectElement;
const playBtn = document.getElementById("play") as HTMLButtonElement;
const timeSlider = document.getElementById("time") as HTMLInputElement;
const clock = document.getElementById("clock") as HTMLElement;
const povBtn = document.getElementById("mode-pov") as HTMLButtonElement;

let replayView: ReplayView | null = null;
let replayEnd = 0;
let playing = false;
let t = 0;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1c1917);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(500, 1500, 300);
scene.add(sun);

const perspective = new THREE.PerspectiveCamera(70, 1, 1, 20000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 20000);
const orbit = new OrbitControls(perspective, renderer.domElement);
orbit.enableDamping = true;

type Mode = "overview" | "orbit" | "first" | "pov";
let mode: Mode = "overview";
let spawns: { origin: THREE.Vector3; angles: [number, number, number] }[] = [];
let mapCenter = new THREE.Vector3();
let mapRadius = 1000;

function resize() {
  const w = host.clientWidth;
  const h = host.clientHeight;
  renderer.setSize(w, h, false);
  perspective.aspect = w / h;
  perspective.updateProjectionMatrix();
  const half = mapRadius;
  ortho.left = (-half * w) / h;
  ortho.right = (half * w) / h;
  ortho.top = half;
  ortho.bottom = -half;
  ortho.updateProjectionMatrix();
}

function setMode(next: Mode) {
  mode = next;
  orbit.enabled = next === "overview" || next === "orbit";
  if (next === "overview") {
    ortho.position.set(mapCenter.x, mapCenter.y + mapRadius * 2, mapCenter.z);
    ortho.up.set(0, 0, -1);
    ortho.lookAt(mapCenter);
  } else if (next === "orbit") {
    perspective.up.set(0, 1, 0);
    perspective.position.copy(mapCenter).add(new THREE.Vector3(mapRadius, mapRadius, mapRadius));
    orbit.target.copy(mapCenter);
  } else if (next === "first") {
    placeFirstPerson(Number(spawnSelect.value));
  } else {
    const sample = replayView?.povAt(t);
    if (sample) placePov(sample);
  }
  status.textContent = describe();
}

// Camera on the recorder's own view, from the demo's ClientData track.
function placePov(sample: { x: number; y: number; z: number; pitch: number; yaw: number }) {
  perspective.up.set(0, 1, 0);
  const [x, y, z] = toThree([sample.x, sample.y, sample.z + EYE_HEIGHT]);
  perspective.position.set(x, y, z);
  const [fx, fy, fz] = forwardFromAngles(sample.pitch, sample.yaw);
  perspective.lookAt(perspective.position.clone().add(new THREE.Vector3(fx, fy, fz)));
}

function setTime(next: number) {
  t = Math.min(Math.max(next, 0), replayEnd);
  timeSlider.value = String(t);
  if (!replayView) return;
  const visible = replayView.update(t);
  clock.textContent = `t=${t.toFixed(1)}s / ${replayEnd.toFixed(0)}s  jogadores visíveis: ${visible}`;
  if (mode === "pov") {
    const sample = replayView.povAt(t);
    if (sample) placePov(sample);
  }
}

async function loadReplay(name: string) {
  const res = await fetch(`/replays/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`replay ${name} não encontrado (${res.status})`);
  const data = (await res.json()) as ReplayData;
  replayView = new ReplayView(scene, data);
  replayEnd = durationOf(data);
  timeSlider.max = String(replayEnd);
  timeSlider.disabled = false;
  playBtn.disabled = false;
  povBtn.disabled = !replayView.hasPov;
}

playBtn.addEventListener("click", () => {
  playing = !playing;
  playBtn.textContent = playing ? "Pausar" : "Tocar";
  if (playing && t >= replayEnd) setTime(0);
});
timeSlider.addEventListener("input", () => {
  setTime(Number(timeSlider.value));
});
povBtn.addEventListener("click", () => setMode("pov"));

function placeFirstPerson(index: number) {
  const s = spawns[index];
  if (!s) return;
  perspective.up.set(0, 1, 0);
  perspective.position.copy(s.origin).add(new THREE.Vector3(0, EYE_HEIGHT, 0));
  const [pitch, yaw] = s.angles;
  const [fx, fy, fz] = forwardFromAngles(pitch, yaw);
  perspective.lookAt(perspective.position.clone().add(new THREE.Vector3(fx, fy, fz)));
}

function describe(): string {
  if (mode === "overview") return "Visão geral (de cima)";
  if (mode === "orbit") return "3D livre: arraste para girar, scroll para zoom";
  if (mode === "pov") return "Visão do gravador da demo (ClientData)";
  return `1ª pessoa no spawn ${Number(spawnSelect.value) + 1}/${spawns.length} (altura dos olhos assumida: ${EYE_HEIGHT})`;
}

document.getElementById("mode-overview")?.addEventListener("click", () => setMode("overview"));
document.getElementById("mode-orbit")?.addEventListener("click", () => setMode("orbit"));
document.getElementById("mode-first")?.addEventListener("click", () => setMode("first"));
spawnSelect.addEventListener("change", () => { if (mode === "first") setMode("first"); });

async function main() {
  const res = await fetch("/maps/de_dust2.bsp");
  if (!res.ok) {
    status.textContent = `Mapa não encontrado (${res.status}). Copie de_dust2.bsp para local-maps/.`;
    return;
  }
  const map = parseBsp(await res.arrayBuffer());
  const mesh = buildMeshData(map.faces);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(mesh.colors, 3));
  geometry.computeBoundingSphere();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));

  const bmin = toThree(map.bounds.min);
  const bmax = toThree(map.bounds.max);
  mapCenter = new THREE.Vector3((bmin[0] + bmax[0]) / 2, (bmin[1] + bmax[1]) / 2, (bmin[2] + bmax[2]) / 2);
  mapRadius = Math.max(bmax[0] - bmin[0], bmax[2] - bmin[2]) / 2 + 200;

  spawns = map.entities
    .filter((e) => e.classname === "info_player_start" || e.classname === "info_player_deathmatch")
    .map((e) => {
      const [x, y, z] = (e.origin ?? "0 0 0").split(" ").map(Number);
      const [pitch, yaw, roll] = parseAngles(e.angles);
      return { origin: new THREE.Vector3(...toThree([x, y, z])), angles: [pitch, yaw, roll] as [number, number, number] };
    });
  spawnSelect.innerHTML = "";
  spawns.forEach((_, i) => spawnSelect.add(new Option(`Spawn ${i + 1}`, String(i))));

  const replayName = new URLSearchParams(location.search).get("replay");
  if (replayName) await loadReplay(replayName);

  resize();
  window.addEventListener("resize", resize);
  setMode("overview");
  if (replayView) setTime(0);
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = (now - last) / 1000;
    last = now;
    if (playing) {
      setTime(t + dt);
      if (t >= replayEnd) {
        playing = false;
        playBtn.textContent = "Tocar";
      }
    }
    orbit.update();
    renderer.render(scene, mode === "overview" ? ortho : perspective);
  });
  status.dataset.ready = "1";
  status.textContent = describe();
  console.info(`faces=${map.faces.length} triangles=${mesh.triangles} spawns=${spawns.length}`);
}

main().catch((err) => {
  status.textContent = `Erro: ${(err as Error).message}`;
});
