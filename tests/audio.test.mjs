import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Timeline, attenuation, limited } from '../public/audio-core.js';
test('timeline preserves exact sample times through ring wrap', () => {
  const timeline = new Timeline(8);
  timeline.put(6, new Float32Array([1, 2, 3, 4]));
  assert.deepEqual([6,7,8,9].map(t => timeline.get(t)), [1,2,3,4]);
  assert.equal(timeline.get(0), undefined);
  timeline.put(14, new Float32Array([5]));
  assert.equal(timeline.get(6), undefined);
  assert.equal(timeline.get(14), 5);
});
test('missing frames remain missing instead of playing stale audio', () => {
  const timeline = new Timeline(16);
  timeline.put(8, new Float32Array([.25]));
  assert.equal(timeline.get(7), undefined);
  assert.equal(timeline.get(8), .25);
  assert.equal(timeline.get(24), undefined);
  assert.equal(timeline.get(-1), 0);
});
test('attenuation maps the control to a 0–40 dB limit', () => {
  assert.equal(attenuation(0), 0); assert.equal(attenuation(50), 20); assert.equal(attenuation(100), 40);
  assert.equal(attenuation(120), 40); assert.equal(attenuation(-1), 0);
});
test('output protection never emits clipped or invalid samples', () => {
  assert.equal(limited(Infinity), 0); assert.equal(limited(NaN), 0);
  assert.equal(limited(2), .98); assert.equal(limited(-2), -.98); assert.equal(limited(.2), .2);
});
