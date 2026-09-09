# MuteTheBeat

A Chrome extension that processes Twitch audio locally with DeepFilterNet3 to reduce music and other background sounds while keeping speech audible. It enhances all speech; it does not identify a particular streamer or reliably remove singing.

## Install

1. Extract `MuteTheBeat-1.0.0.zip` to a permanent folder, or use this project's `dist` folder.
2. Open `chrome://extensions` in Chrome 116 or newer and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Open and play a stream on `https://www.twitch.tv`, then click the MuteTheBeat extension button and **Enable speech focus**.

If Chrome shows an error about `twitchmute-speech` not being defined after an update, open `chrome://extensions`, click **Reload** on MuteTheBeat, close any old popup, and enable it again. The current build registers both names while stale unpacked service workers expire.

Model initialization takes a moment. The popup can be closed while audio continues. Only one tab is processed at a time. Enabling another Twitch tab transfers the session. After restarting Chrome, enable it again manually.

## Controls

- **Music reduction:** 50% is the default (a 20 dB maximum suppression setting). This is a model parameter, **not a measurement or guarantee of music removal**. Increase it for more suppression; reduce it if speech sounds unnatural. At 0%, the aligned original audio is used.
- **Output volume:** 0–150%, with output limiting. Twitch's own volume and mute controls still apply.
- **Original / Enhanced:** compare the same mono, time-aligned signal paths with a short crossfade. Use **Disable** to restore Twitch's native stereo output and remove the processing delay.
- The delay display is an estimate from model timing, buffering, and Web Audio base latency. It is not a physical loopback measurement and excludes some device/OS latency.

All scripts, model weights, and WASM are in the extension folder. It makes no network requests for audio or model processing. No account, microphone permission, server, or companion application is needed. Model inference uses CPU WebAssembly SIMD, not a GPU.

## What to expect

Instrumental music can become substantially quieter, especially beneath clear speech. Game effects and other background audio can also be reduced. Overlapping voices and song vocals may remain. Quiet speech, highly compressed streams, and complex music can produce artifacts. This is speech enhancement, not perfect music-stem separation.

The default pipeline adds 70 ms before browser/device overhead: 30 ms of model delay and 40 ms of buffering. The Chrome test browser reported an estimated 86 ms including its base latency and compressor lookahead. Real devices may differ. Video is not delayed, so a small lip-sync offset is possible.

If the computer cannot sustain processing, the extension stops capture and restores original audio with an error. Close expensive applications and click Enable to retry. Missing model files, blocked audio startup, or a failed worker also restore native playback. Muted or paused Twitch playback remains muted or paused.


## Development

Requires Node.js 22+ and pnpm. Dependencies are pinned in `pnpm-lock.yaml`; vendored assets are hash-checked during the build.

```sh
pnpm install
pnpm run build
pnpm test
pnpm run benchmark
```

`dist/` is the load-unpacked extension. Reload it in `chrome://extensions` after rebuilding. Do not load the repository root.

## Architecture

- The service worker validates the selected Twitch tab and coordinates capture, settings, and the action badge. It reconstructs state from the offscreen document instead of assuming its own memory survives.
- The offscreen document owns the audio session, the 48 kHz AudioContext, and cleanup. Settings persist in local storage; live capture does not.
- The AudioWorklet downmixes audio, accumulates 480-sample frames, and sends them directly to a dedicated worker through a MessageChannel. Web Audio resamples the captured source to the context rate.
- The worker runs the packaged model. Output frames retain absolute sample timestamps. A fixed timeline avoids accumulating delay; late output is discarded. Original audio is delayed to match the processed path, including model lookahead.
- At most eight inference requests are pending. A stalled worker or 50 ms of consecutive missing output triggers cleanup. During isolated missing frames, aligned original audio fills the gap.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for source provenance and licensing.

To package on Windows after building and completing validation, run `scripts/package.ps1` in PowerShell. It copies the documentation and reports into `dist/` and creates `MuteTheBeat-1.0.0.zip`.
