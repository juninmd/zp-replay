const status = document.getElementById("status");
const canvas = document.getElementById("view");
const scrub = document.getElementById("scrub");
const ctx = canvas.getContext("2d");

const wasmReady = WebAssembly.instantiateStreaming(fetch("zp_replay_wasm.wasm"))
  .then(({ instance }) => instance.exports);

let samples = null; // flat [t, x, y, z, ...]

function draw(index) {
  const w = canvas.width;
  const h = canvas.height;
  const n = samples.length / 4;
  const pad = 24;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < samples.length; i += 4) {
    minX = Math.min(minX, samples[i + 1]); maxX = Math.max(maxX, samples[i + 1]);
    minY = Math.min(minY, samples[i + 2]); maxY = Math.max(maxY, samples[i + 2]);
  }
  const scale = Math.min((w - 2 * pad) / (maxX - minX || 1), (h - 2 * pad) / (maxY - minY || 1));
  const px = (x) => pad + (x - minX) * scale;
  // Y is flipped so north is up, as in the in-game overview.
  const py = (y) => h - pad - (y - minY) * scale;

  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted");
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = px(samples[i * 4 + 1]), y = py(samples[i * 4 + 2]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  const j = index * 4;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent");
  ctx.beginPath();
  ctx.arc(px(samples[j + 1]), py(samples[j + 2]), 6, 0, Math.PI * 2);
  ctx.fill();

  status.textContent = `t=${samples[j].toFixed(2)}s  x=${samples[j + 1].toFixed(0)}  y=${samples[j + 2].toFixed(0)}  (${index + 1}/${n})`;
}

document.getElementById("file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const wasm = await wasmReady;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const ptr = wasm.alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  const count = wasm.parse_origins(ptr, bytes.length);
  wasm.dealloc(ptr, bytes.length);

  if (count < 0) {
    status.textContent = "Não é um demo GoldSrc válido.";
    return;
  }
  if (count === 0) {
    status.textContent = "Demo válido, mas sem posições do gravador.";
    return;
  }
  // Copy out: the view detaches if memory grows later.
  samples = new Float32Array(wasm.memory.buffer, wasm.samples_ptr(), count * 4).slice();
  scrub.max = count - 1;
  scrub.value = 0;
  scrub.disabled = false;
  draw(0);
});

scrub.addEventListener("input", () => {
  if (samples) draw(Number(scrub.value));
});
