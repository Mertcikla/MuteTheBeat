import { DEFAULTS, isTwitch, normalizeSettings, type AudioCommand, type Command, type Reply, type Status } from './shared';

let creating: Promise<void> | undefined;
let starting = false;
let generation = 0;
async function exists() {
  return (await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })).length > 0;
}
async function ensureAudio() {
  if (await exists()) return;
  creating ??= chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: 'Process user-selected Twitch tab audio locally.' }).finally(() => { creating = undefined; });
  await creating;
}
async function audio(command: AudioCommand): Promise<Reply> {
  return chrome.runtime.sendMessage({ target: 'audio', command });
}
async function status(): Promise<Status> {
  if (await exists()) {
    const response = await audio({ type: 'status' });
    if (response.status) return response.status;
  }
  const stored = await chrome.storage.local.get('settings');
  return { phase: 'idle', settings: normalizeSettings(stored.settings ?? DEFAULTS) };
}
async function stop() {
  generation++;
  if (await exists()) await audio({ type: 'stop' });
  await badge('idle');
}
async function badge(phase: string) {
  await chrome.action.setBadgeText({ text: phase === 'active' ? 'ON' : phase === 'original' ? 'A/B' : phase === 'error' ? '!' : phase === 'initializing' ? '…' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: phase === 'error' ? '#D65B66' : '#7357EC' });
}
async function handle(command: Command): Promise<Reply> {
  if (command.type === 'status') return { ok: true, status: await status() };
  if (command.type === 'stop') { await stop(); return { ok: true, status: await status() }; }
  if (command.type === 'settings') {
    const settings = normalizeSettings(command.settings);
    await chrome.storage.local.set({ settings });
    if (await exists()) await audio({ type: 'settings', settings });
    return { ok: true, status: await status() };
  }
  if (starting) return { ok: false, error: 'Audio is already starting. Please wait.' };
  starting = true;
  const token = ++generation;
  try {
    const tab = await chrome.tabs.get(command.tabId);
    if (!tab.active || !isTwitch(tab.url)) throw new Error('Open a twitch.tv stream in the active tab first.');
    const current = await status();
    if (current.tabId === tab.id && ['active', 'original'].includes(current.phase)) return { ok: true, status: current };
    await ensureAudio();
    if (token !== generation) throw new Error('Start cancelled.');
    const prepared = await audio({ type: 'prepare', tabId: command.tabId, title: tab.title ?? 'Twitch', settings: current.settings });
    if (!prepared.ok) throw new Error(prepared.error);
    if (token !== generation) throw new Error('Start cancelled.');
    const latest = await chrome.tabs.get(command.tabId);
    if (!isTwitch(latest.url)) throw new Error('The selected tab left Twitch.');
    const streamId = await new Promise<string>((resolve, reject) => chrome.tabCapture.getMediaStreamId({ targetTabId: command.tabId }, id => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message)); else resolve(id);
    }));
    if (token !== generation) throw new Error('Start cancelled.');
    const connected = await audio({ type: 'connect', streamId });
    if (!connected.ok) throw new Error(connected.error);
    return connected;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (token === generation && await exists()) await audio({ type: 'failure', error: message });
    return { ok: false, error: message, status: await status() };
  } finally { starting = false; }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message.target === 'background' && message.command) {
    handle(message.command).then(respond).catch(error => respond({ ok: false, error: String(error) }));
    return true;
  }
  if (message.target === 'state' && sender.url === chrome.runtime.getURL('offscreen.html')) void badge(message.status.phase);
});
chrome.tabs.onRemoved.addListener(tabId => { void status().then(s => { if (s.tabId === tabId) return stop(); }); });
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  // Losing URL visibility on navigation means activeTab permission was revoked.
  // Stop conservatively rather than continuing capture on an unknown origin.
  if ((change.url && !isTwitch(change.url)) || (change.status === 'loading' && !isTwitch(tab.url))) void status().then(s => { if (s.tabId === tabId) return stop(); });
});
chrome.runtime.onStartup.addListener(() => { void stop(); });
