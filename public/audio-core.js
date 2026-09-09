// Fixed-timeline buffering: late frames are discarded, never appended later.
// Shared by the AudioWorklet and Node tests.
export class Timeline {
  constructor(size = 16384) {
    this.size = size;
    this.values = new Float32Array(size);
    this.tags = new Float64Array(size).fill(-1);
  }
  put(start, samples) {
    for (let i = 0; i < samples.length; i++) {
      const time = start + i, slot = time % this.size;
      this.values[slot] = samples[i];
      this.tags[slot] = time;
    }
  }
  get(time) {
    if (time < 0) return 0;
    const slot = time % this.size;
    return this.tags[slot] === time ? this.values[slot] : undefined;
  }
}
export const MARGIN = 1920; // 40 ms at 48 kHz, including frame accumulation.
export const MAX_PENDING = 8;
export function attenuation(reduction) { return Math.max(0, Math.min(100, reduction)) * 0.4; }
export function limited(sample) { return Math.max(-0.98, Math.min(0.98, Number.isFinite(sample) ? sample : 0)); }
