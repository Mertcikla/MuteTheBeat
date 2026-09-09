import fs from 'node:fs/promises';
import os from 'node:os';
import init, { df_create, df_get_frame_length, df_process_frame, df_set_atten_lim } from '../public/vendor/df.js';
const started = performance.now();
await init({ module_or_path: await fs.readFile('public/vendor/df_bg.wasm') });
const handle = df_create(await fs.readFile('public/vendor/DeepFilterNet3_onnx.tar.gz'), 0.01);
const frameLength = df_get_frame_length(handle);
let peak = 0, delay = -1;
const timings = [], frame = new Float32Array(frameLength);
for (let n = 0; n < 3100; n++) {
  if (n === 100) df_set_atten_lim(handle, 20);
  frame.fill(0); if (n === 0) frame[0] = 0.5;
  // Synthetic non-speech signal exercises inference, not speech quality.
  if (n >= 100) for (let i = 0; i < frame.length; i++) frame[i] = 0.1 * Math.sin((n * frameLength + i) * 0.035) + 0.02 * Math.sin(i * 0.27);
  const start = performance.now();
  const output = df_process_frame(handle, frame);
  if (n >= 100) timings.push(performance.now() - start);
  if (n < 100) for (let i = 0; i < output.length; i++) if (Math.abs(output[i]) > peak) { peak = Math.abs(output[i]); delay = n * frameLength + i; }
  if (output.some(x => !Number.isFinite(x))) throw Error('Nonfinite model output');
}
timings.sort((a, b) => a - b);
const report = {
  date: new Date().toISOString(), runtime: process.version, cpu: os.cpus()[0].model,
  logicalCores: os.cpus().length, frameLength, modelDelaySamples: delay, modelDelayMs: delay / 48,
  processingMarginMs: 40, algorithmicDelayMs: 40 + delay / 48,
  frames: timings.length, inferenceMeanMs: timings.reduce((a,b) => a+b,0)/timings.length,
  inferenceP95Ms: timings[Math.floor(timings.length*.95)], inferenceP99Ms: timings[Math.floor(timings.length*.99)], inferenceMaxMs: timings.at(-1),
  elapsedMs: performance.now() - started,
  limitation: 'Node WASM microbenchmark on synthetic input. Not a browser, live-stream, speech quality, or end-to-end latency measurement.'
};
await fs.writeFile('reports/benchmark.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
