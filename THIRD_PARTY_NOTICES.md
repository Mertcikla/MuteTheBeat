# Third-party notices

## DeepFilterNet3 browser bindings and assets

The vendored `public/vendor/df.js` binding is from [mezonai/mezon-noise-suppression](https://github.com/mezonai/mezon-noise-suppression), commit `a5212661245a2184370fc3c3dd1f52dc4dffb2a5`.

The WASM binary and pretrained model were retrieved on 2026-09-09 from that project's configured asset locations:

- `https://cdn.mezon.ai/AI/models/datas/noise_suppression/deepfilternet3/v3/pkg/df_bg.wasm`
- `https://cdn.mezon.ai/AI/models/datas/noise_suppression/deepfilternet3/v3/models/DeepFilterNet3_onnx.tar.gz`

These URLs are provenance records only. The extension loads the local copies, never these URLs. SHA-256 hashes are recorded in `public/vendor/assets.json` and checked at build time to pin the actual binary content independently of mutable upstream URLs.

The project is dual licensed under Apache-2.0 or MIT. The MIT option is used here; both supplied license texts are retained in `public/vendor/`. The upstream browser project identifies its binaries and model as governed by the same licenses.

The underlying [DeepFilterNet](https://github.com/Rikorose/DeepFilterNet) framework and pretrained models are by Hendrik Schröter and contributors. The upstream MIT and Apache notices are included as `DEEPFILTERNET-LICENSE-MIT` and `DEEPFILTERNET-LICENSE-APACHE` alongside the browser project's notices.

Reference: Schröter et al., *DeepFilterNet: Perceptually Motivated Real-Time Speech Enhancement*, 2023, [paper](https://arxiv.org/abs/2305.08227).

MuteTheBeat's own worker and worklet code replaces the upstream CDN loader and in-worklet inference integration. It does not bundle LiveKit.

## Build dependencies

TypeScript (Apache-2.0), Vite (MIT), and Chrome TypeScript definitions (MIT) are development dependencies. Their dependency notices remain in the installed packages. They are not required at extension runtime. Vite's generated module-preload helper is covered by its MIT notice, retained in `public/vendor/VITE-LICENSE`.
