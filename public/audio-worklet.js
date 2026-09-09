import { Timeline, MARGIN, MAX_PENDING, limited } from './audio-core.js';

class SpeechProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions;
    this.frameLength = config.frameLength;
    this.delay = MARGIN + config.modelDelay;
    this.frame = new Float32Array(this.frameLength);
    this.fill = 0;
    this.time = 0;
    this.pending = 0;
    this.dry = new Timeline();
    this.wet = new Timeline();
    this.mix = config.original || config.reduction === 0 ? 0 : 1;
    this.targetMix = this.mix;
    this.gain = config.volume / 100;
    this.targetGain = this.gain;
    this.missed = 0;
    this.failed = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'port') {
        this.workerPort = data.port;
        this.workerPort.onmessage = ({ data: result }) => {
          this.pending = Math.max(0, this.pending - 1);
          if (result.start + MARGIN >= this.time && result.start + MARGIN < this.time + this.wet.size - this.frameLength) this.wet.put(result.start + MARGIN, result.samples);
        };
        this.workerPort.start();
      } else if (data.type === 'settings') {
        this.targetMix = data.original || data.reduction === 0 ? 0 : 1;
        this.targetGain = data.volume / 100;
      }
    };
  }
  fail() {
    if (this.failed) return;
    this.failed = true;
    this.targetMix = 0;
    this.port.postMessage({ type: 'overload' });
  }
  process(inputs, outputs) {
    const channels = inputs[0] ?? [], output = outputs[0];
    const length = output[0]?.length ?? 128;
    for (let i = 0; i < length; i++) {
      let mono = 0;
      for (const channel of channels) mono += channel[i] ?? 0;
      mono /= Math.max(1, channels.length);
      if (!Number.isFinite(mono)) mono = 0;
      const slot = this.time % this.dry.size;
      this.dry.values[slot] = mono; this.dry.tags[slot] = this.time;
      this.frame[this.fill++] = mono;
      if (this.fill === this.frameLength) {
        if (this.workerPort && !this.failed) {
          if (this.pending >= MAX_PENDING) this.fail();
          else {
            this.pending++;
            this.workerPort.postMessage({ start: this.time + 1 - this.frameLength, samples: this.frame }, [this.frame.buffer]);
            this.frame = new Float32Array(this.frameLength);
          }
        }
        this.fill = 0;
      }
      const original = this.dry.get(this.time - this.delay) ?? 0;
      const enhanced = this.wet.get(this.time);
      if (this.time >= MARGIN && enhanced === undefined && !this.failed) {
        if (++this.missed >= 2400) this.fail(); // 50 ms consecutive missed deadlines.
      } else this.missed = 0;
      this.mix += Math.max(-1 / 960, Math.min(1 / 960, this.targetMix - this.mix));
      this.gain += Math.max(-1 / 960, Math.min(1 / 960, this.targetGain - this.gain));
      const value = limited((original * (1 - this.mix) + (enhanced ?? original) * this.mix) * this.gain);
      for (const channel of output) channel[i] = value;
      this.time++;
    }
    return true;
  }
}
// Keep the legacy name registered for users who reload an older unpacked build
// while the service worker is being updated. New builds request the branded name.
registerProcessor('mutethebeat-speech', SpeechProcessor);
registerProcessor('twitchmute-speech', SpeechProcessor);
