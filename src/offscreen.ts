import { DEFAULTS, normalizeSettings, type AudioCommand, type Status } from './shared';
let state: Status = { phase: 'idle', settings: DEFAULTS };
let context: AudioContext | undefined, stream: MediaStream | undefined, worker: Worker | undefined, node: AudioWorkletNode | undefined;
let epoch = 0;
let model: { frameLength: number; modelDelay: number } | undefined;
let cancelReady: (() => void) | undefined;
function publish() { void chrome.runtime.sendMessage({ target: 'state', status: state }).catch(() => {}); }
async function release() {
  epoch++;
  cancelReady?.(); cancelReady = undefined;
  worker?.terminate(); worker = undefined;
  node?.disconnect(); node?.port.close(); node = undefined;
  stream?.getTracks().forEach(track => { track.onended = null; track.stop(); }); stream = undefined;
  const old = context; context = undefined; model = undefined;
  if (old && old.state !== 'closed') await old.close();
}
async function failure(error: string) {
  await release();
  state = { phase: 'error', settings: state.settings, error: `${error} Original tab audio has been restored. Try Enable again.` };
  publish();
}
async function handle(command: AudioCommand) {
  if (command.type === 'status') return;
  if (command.type === 'stop') { await release(); state = { phase: 'idle', settings: state.settings }; publish(); return; }
  if (command.type === 'failure') { await failure(command.error); return; }
  if (command.type === 'settings') {
    state.settings = normalizeSettings(command.settings);
    worker?.postMessage({ type: 'settings', ...state.settings });
    node?.port.postMessage({ type: 'settings', ...state.settings });
    if (['active', 'original'].includes(state.phase)) state.phase = state.settings.original ? 'original' : 'active';
    publish(); return;
  }
  if (command.type === 'prepare') {
    await release();
    const token = epoch;
    state = { phase: 'initializing', tabId: command.tabId, title: command.title, settings: normalizeSettings(command.settings) };
    publish();
    const ownedWorker = new Worker(chrome.runtime.getURL('inference-worker.js'), { type: 'module' });
    worker = ownedWorker;
    model = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Model initialization timed out.')), 45000);
      const rejectReady = (error: Error) => { clearTimeout(timeout); reject(error); };
      cancelReady = () => rejectReady(new Error('Start cancelled.'));
      ownedWorker.onerror = event => {
        if (token !== epoch) return;
        rejectReady(new Error(event.message || 'Audio worker crashed.'));
        void failure('Audio worker crashed.');
      };
      ownedWorker.onmessage = ({ data }) => {
        if (token !== epoch) return;
        if (data.type === 'ready') { clearTimeout(timeout); cancelReady = undefined; resolve(data); }
        if (data.type === 'error') { rejectReady(new Error(data.error)); void failure(data.error); }
        if (data.type === 'metric') state.inferenceMs = data.inferenceMs;
      };
      ownedWorker.postMessage({ type: 'init', reduction: state.settings.reduction });
    });
    if (token !== epoch) throw new Error('Start cancelled.');
    context = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    if (context.sampleRate !== 48000) throw new Error('This audio device cannot initialize at 48 kHz.');
    await context.audioWorklet.addModule(chrome.runtime.getURL('audio-worklet.js'));
    return;
  }
  if (command.type === 'connect') {
    if (!context || !worker || !model || state.phase !== 'initializing') throw new Error('Audio is not ready.');
    const token = epoch, ownedContext = context;
    const acquired = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: command.streamId } } as MediaTrackConstraints,
      video: false
    });
    if (token !== epoch) { acquired.getTracks().forEach(t => t.stop()); throw new Error('Start cancelled.'); }
    stream = acquired;
    stream.getAudioTracks().forEach(t => { t.onended = () => { void handle({ type: 'stop' }); }; });
    node = new AudioWorkletNode(ownedContext, 'mutethebeat-speech', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { ...model, ...state.settings } });
    node.onprocessorerror = () => { void failure('Audio processor stopped.'); };
    node.port.onmessage = ({ data }) => { if (data.type === 'overload') void failure('Your computer could not keep up with real-time processing.'); };
    const channel = new MessageChannel();
    node.port.postMessage({ type: 'port', port: channel.port1 }, [channel.port1]);
    worker.postMessage({ type: 'port', port: channel.port2 }, [channel.port2]);
    const source = ownedContext.createMediaStreamSource(stream);
    // A fast compressor ahead of the final destination softens peaks; the worklet
    // also clamps output to guarantee finite samples and avoid digital clipping.
    const limiter = ownedContext.createDynamicsCompressor();
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.003; limiter.release.value = 0.08;
    source.connect(node).connect(limiter).connect(ownedContext.destination);
    await ownedContext.resume();
    if (token !== epoch) return;
    if (ownedContext.state !== 'running') throw new Error('Chrome did not allow audio playback.');
    state.phase = state.settings.original ? 'original' : 'active';
    state.latencyMs = (1920 + model.modelDelay) / 48 + ownedContext.baseLatency * 1000 + 6;
    publish();
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'audio') return;
  handle(message.command).then(() => respond({ ok: true, status: state })).catch(async error => {
    const detail = error instanceof Error ? error.message : String(error);
    if (detail !== 'Start cancelled.') await failure(detail);
    respond({ ok: false, status: state, error: detail });
  });
  return true;
});
