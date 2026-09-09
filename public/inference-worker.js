import init, { df_create, df_get_frame_length, df_process_frame, df_set_atten_lim } from './vendor/df.js';
import { attenuation } from './audio-core.js';

let handle, port, frameLength;
function fail(error) { self.postMessage({ type: 'error', error: String(error?.message ?? error) }); }
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const [wasm, model] = await Promise.all([
        fetch(new URL('./vendor/df_bg.wasm', import.meta.url)).then(r => { if (!r.ok) throw Error('Missing local WASM'); return r.arrayBuffer(); }),
        fetch(new URL('./vendor/DeepFilterNet3_onnx.tar.gz', import.meta.url)).then(r => { if (!r.ok) throw Error('Missing local model'); return r.arrayBuffer(); })
      ]);
      await init({ module_or_path: wasm });
      handle = df_create(new Uint8Array(model), 0.01);
      frameLength = df_get_frame_length(handle);
      if (frameLength !== 480) throw Error(`Unsupported model frame size: ${frameLength}`);
      // Near-zero suppression preserves the impulse while retaining model lookahead.
      // Exactly zero invokes an upstream bypass that would invalidate calibration.
      let peak = 0, delay = -1;
      const frame = new Float32Array(frameLength);
      for (let n = 0; n < 100; n++) {
        frame.fill(0); if (n === 0) frame[0] = 0.5;
        const output = df_process_frame(handle, frame);
        for (let i = 0; i < output.length; i++) if (Math.abs(output[i]) > peak) { peak = Math.abs(output[i]); delay = n * frameLength + i; }
      }
      if (peak < 0.1 || delay < 0 || delay > 2400) throw Error('Model delay calibration failed.');
      df_set_atten_lim(handle, Math.max(0.01, attenuation(data.reduction)));
      self.postMessage({ type: 'ready', frameLength, modelDelay: delay });
    } else if (data.type === 'port') {
      port = data.port;
      port.onmessage = ({ data: input }) => {
        try {
          const started = performance.now();
          const result = df_process_frame(handle, input.samples);
          if (result.length !== frameLength || result.some(x => !Number.isFinite(x))) throw Error('Invalid model output.');
          // Own the buffer independently of WASM memory.
          const samples = new Float32Array(result);
          port.postMessage({ type: 'frame', start: input.start, samples }, [samples.buffer]);
          if (input.start % 48000 === 0) self.postMessage({ type: 'metric', inferenceMs: performance.now() - started });
        } catch (error) { fail(error); port.close(); }
      };
      port.start();
    } else if (data.type === 'settings' && handle !== undefined) {
      df_set_atten_lim(handle, Math.max(0.01, attenuation(data.reduction)));
    }
  } catch (error) { fail(error); }
};
