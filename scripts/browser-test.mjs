import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
await fs.mkdir('artifacts', { recursive: true });
const extensionPath = path.resolve('dist');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true,
  executablePath: process.env.CHROME_PATH,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--enable-unsafe-extension-debugging'],
});
const errors = [], requests = [];
context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
context.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
const report = { date: new Date().toISOString(), checks: [] };
try {
  let [background] = context.serviceWorkers();
  background ??= await context.waitForEvent('serviceworker');
  const id = new URL(background.url()).hostname;
  const page = await context.newPage();
  await page.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<title>Navigation away fixture</title>' }));
  await page.route('https://www.twitch.tv/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<title>Synthetic Twitch test — not a live stream</title><button id="play">Play test signal</button><script>let ctx;document.querySelector("button").onclick=()=>{ctx=new AudioContext({sampleRate:44100});let osc=ctx.createOscillator();osc.frequency.value=220;let g=ctx.createGain();g.gain.value=.05;osc.connect(g).connect(ctx.destination);osc.start();window.audio=ctx;};</script>' }));
  await page.goto('https://www.twitch.tv/mutethebeat-test');
  await page.click('#play');
  const tabId = await background.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
  const cdp = await context.newCDPSession(page);
  const browserCdp = await context.browser().newBrowserCDPSession();
  const { targetInfos } = await browserCdp.send('Target.getTargets', { filter: [{ type: 'tab' }] });
  const tabTarget = targetInfos.find(t => t.url === page.url());
  assert(tabTarget, JSON.stringify(targetInfos));
  await browserCdp.send('Extensions.triggerAction', { id, targetId: tabTarget.targetId });
  let popup = context.pages().find(p => p.url().endsWith('/popup.html'));
  if (!popup) { popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`); }
  // Messages to the same service worker are not delivered back to their sender;
  // issue normal popup commands from the extension page instead.
  const send = command => popup.evaluate(command => chrome.runtime.sendMessage({ target: 'background', command }), command);
  await background.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), tabId);
  let reply = await send({ type: 'start', tabId });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  assert.equal(reply.status.phase, 'active');
  report.checks.push({ name: 'capture + CSP + packaged model initialization', status: 'pass', latencyEstimateMs: reply.status.latencyMs });
  await popup.waitForTimeout(4000);
  reply = await send({ type: 'status' });
  assert.equal(reply.status.phase, 'active', JSON.stringify(reply));
  report.checks.push({ name: '44.1 kHz source into 48 kHz pipeline', status: 'pass', inferenceMs: reply.status.inferenceMs });
  await popup.locator('main').screenshot({ path: 'artifacts/popup.png' });
  reply = await send({ type: 'start', tabId });
  assert.equal(reply.ok, true);
  report.checks.push({ name: 'repeated activation', status: 'pass' });
  reply = await send({ type: 'settings', settings: { reduction: 75, volume: 90, original: true } });
  assert.equal(reply.status.phase, 'original');
  await send({ type: 'settings', settings: { reduction: 50, volume: 100, original: false } });
  report.checks.push({ name: 'settings and comparison mode', status: 'pass' });
  await popup.close();
  await page.waitForTimeout(1500);
  popup = await context.newPage(); await popup.goto(`chrome-extension://${id}/popup.html`);
  reply = await send({ type: 'status' });
  assert.equal(reply.status.phase, 'active');
  report.checks.push({ name: 'popup closure keeps processing', status: 'pass' });
  if (process.env.TEST_RESTART === '1') {
    let versions = [];
    cdp.on('ServiceWorker.workerVersionUpdated', event => { versions.push(...event.versions); });
    await cdp.send('ServiceWorker.enable');
    await page.waitForTimeout(300);
    const version = versions.find(v => v.scriptURL === `chrome-extension://${id}/background.js` && v.runningStatus === 'running');
    assert(version, JSON.stringify(versions));
    await cdp.send('ServiceWorker.stopWorker', { versionId: version.versionId });
    reply = await send({ type: 'status' });
    assert.equal(reply.status.phase, 'active');
    background = context.serviceWorkers().find(w => w.url() === `chrome-extension://${id}/background.js`);
    assert(background);
    report.checks.push({ name: 'service worker restart reconciles active offscreen session', status: 'pass' });
  }
  const seconds = Number(process.env.SOAK_SECONDS || 60);
  for (let elapsed = 0; elapsed < seconds; elapsed += 5) {
    await page.waitForTimeout(Math.min(5, seconds - elapsed) * 1000);
    reply = await send({ type: 'status' });
    assert.equal(reply.status.phase, 'active', `At ${elapsed}s: ${JSON.stringify(reply)}`);
    if (elapsed % 60 === 0) console.log(`Synthetic browser soak: ${elapsed + 5}/${seconds}s`);
  }
  report.checks.push({ name: 'synthetic tab-capture soak (not live Twitch)', status: 'pass', seconds });
  await send({ type: 'stop' });
  assert.equal((await send({ type: 'status' })).status.phase, 'idle');
  const captures = await background.evaluate(() => new Promise(resolve => chrome.tabCapture.getCapturedTabs(resolve)));
  assert(!captures.some(t => t.status === 'active'));
  report.checks.push({ name: 'disable releases capture', status: 'pass' });
  await background.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), tabId);
  reply = await send({ type: 'start', tabId });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  await popup.evaluate(() => chrome.runtime.sendMessage({ target: 'audio', command: { type: 'failure', error: 'Injected model failure for lifecycle test.' } }));
  reply = await send({ type: 'status' });
  assert.equal(reply.status.phase, 'error');
  assert.match(reply.status.error, /Original tab audio has been restored/);
  report.checks.push({ name: 'injected failure releases capture and reports recovery', status: 'pass' });
  await background.evaluate(tabId => chrome.tabs.update(tabId, { active: true }), tabId);
  assert.equal((await send({ type: 'start', tabId })).ok, true);
  await page.goto('https://example.com');
  await popup.waitForTimeout(500);
  assert.equal((await send({ type: 'status' })).status.phase, 'idle');
  report.checks.push({ name: 'navigation away from Twitch stops capture', status: 'pass' });
  assert.deepEqual(errors, []);
  report.network = requests;
  // The only HTTP request belongs to the synthetic Twitch page, intercepted locally.
  assert(requests.every(url => url.startsWith('https://www.twitch.tv/') || url.startsWith('https://example.com')));
  report.checks.push({ name: 'no remote model or audio requests', status: 'pass' });
} catch (error) {
  report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  report.pageErrors = errors;
  await fs.writeFile(process.env.BROWSER_REPORT || 'reports/browser.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await context.close();
}
