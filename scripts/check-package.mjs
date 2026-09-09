import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'));
assert.equal(manifest.name, 'MuteTheBeat');
assert.equal(manifest.version, '1.0.0');
assert(manifest.description.length <= 132);
assert.deepEqual(manifest.permissions, ['activeTab', 'tabCapture', 'offscreen', 'storage']);
assert(!manifest.host_permissions);
const assets = JSON.parse(await readFile('dist/vendor/assets.json', 'utf8'));
for (const [file, expected] of Object.entries(assets.sha256)) {
  assert.equal(createHash('sha256').update(await readFile(`dist/vendor/${file}`)).digest('hex'), expected, `Changed model asset: ${file}`);
}
for (const file of ['background.js', 'popup.html', 'offscreen.html', 'privacy.html', 'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png', 'audio-worklet.js', 'inference-worker.js', 'audio-core.js', 'vendor/df.js', 'vendor/df_bg.wasm', 'vendor/DeepFilterNet3_onnx.tar.gz']) assert((await readFile(`dist/${file}`)).length > 0, file);
const js = (await readdir('dist', { recursive: true })).filter(f => f.endsWith('.js'));
for (const file of js) {
  const source = await readFile(`dist/${file}`, 'utf8');
  assert(!/https?:\/\//.test(source), `${file} has a remote URL`);
  assert(!/new Function\(|\beval\(|createObjectURL\(/.test(source), `${file} dynamically generates code`);
}
const worklet = await readFile('dist/audio-worklet.js', 'utf8');
assert(worklet.includes("registerProcessor('mutethebeat-speech'"));
assert(worklet.includes("registerProcessor('twitchmute-speech'"));
console.log('Package checks passed: required files, minimal permissions, local scripts/assets.');
