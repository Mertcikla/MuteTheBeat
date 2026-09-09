import './popup.css';
import { DEFAULTS, isTwitch, type Command, type Reply, type Settings, type Status } from './shared';
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
let selected: chrome.tabs.Tab | undefined, state: Status = { phase: 'idle', settings: { ...DEFAULTS } };
let settings: Settings = { ...DEFAULTS }, busy = false, editingUntil = 0;
const call = (command: Command): Promise<Reply> => chrome.runtime.sendMessage({ target: 'background', command });
function render() {
  const running = ['active', 'original', 'initializing'].includes(state.phase);
  el('phase').textContent = { idle: 'Ready when you are', initializing: 'Preparing speech focus…', active: 'Speech focus is on', original: 'Playing original audio', error: 'Speech focus paused' }[state.phase];
  el('dot').className = `dot ${running ? 'active' : state.phase === 'error' ? 'error' : ''}`;
  el('tab').textContent = state.title ?? (isTwitch(selected?.url) ? selected?.title ?? 'Twitch' : 'Open a Twitch stream to begin.');
  el('error').textContent = state.error ?? ''; el('error').hidden = !state.error;
  const toggle = el<HTMLButtonElement>('toggle');
  toggle.textContent = running ? 'Disable speech focus' : 'Enable speech focus ↗';
  toggle.disabled = busy || (!running && !isTwitch(selected?.url));
  for (const key of ['reduction', 'volume'] as const) {
    el<HTMLInputElement>(key).value = String(settings[key]);
    el(`${key}-value`).textContent = `${settings[key]}%`;
  }
  el('original').setAttribute('aria-pressed', String(settings.original));
  el('enhanced').setAttribute('aria-pressed', String(!settings.original));
  el('latency').textContent = state.latencyMs ? `Estimated audio delay: ${Math.round(state.latencyMs)} ms${state.inferenceMs !== undefined ? ` · Model: ${state.inferenceMs.toFixed(1)} ms/frame` : ''}` : 'Processing starts only when you enable it.';
}
async function refresh() {
  try {
    const reply = await call({ type: 'status' });
    if (reply.status) { state = reply.status; if (Date.now() > editingUntil) settings = { ...state.settings }; render(); }
  } catch { el('error').textContent = 'Could not reach the extension. Reload it in chrome://extensions.'; el('error').hidden = false; }
}
let saveTimer: ReturnType<typeof setTimeout>;
function save() {
  editingUntil = Date.now() + 1500;
  render(); clearTimeout(saveTimer);
  // Persist immediately on pointer release/change, debounce intermediate input.
  saveTimer = setTimeout(() => { void call({ type: 'settings', settings }).catch(() => {}); }, 80);
}
for (const key of ['reduction', 'volume'] as const) {
  el<HTMLInputElement>(key).addEventListener('input', event => { settings[key] = Number((event.target as HTMLInputElement).value); save(); });
  el<HTMLInputElement>(key).addEventListener('change', () => { clearTimeout(saveTimer); void call({ type: 'settings', settings }); });
}
for (const id of ['original', 'enhanced']) el(id).addEventListener('click', () => { settings.original = id === 'original'; save(); });
el('toggle').addEventListener('click', async () => {
  busy = true; render();
  try {
    const reply = await call(['active', 'original', 'initializing'].includes(state.phase) ? { type: 'stop' } : { type: 'start', tabId: selected!.id! });
    if (reply.status) state = reply.status;
    if (!reply.ok) state = { ...state, phase: 'error', error: reply.error };
  } catch (error) { state = { ...state, phase: 'error', error: String(error) }; }
  finally { busy = false; render(); }
});
void chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => { selected = tabs[0]; return refresh(); });
setInterval(() => { void refresh(); }, 750);
