import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const extension=path.resolve('dist'),profile=await fs.mkdtemp(path.resolve('artifacts')+'/restart-profile-');
const launch=()=>chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.CHROME_PATH,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--enable-unsafe-extension-debugging']});
const report={date:new Date().toISOString(),checks:[]};
let context;
try{
  context=await launch();
  let [background]=context.serviceWorkers();background??=await context.waitForEvent('serviceworker');
  const id=new URL(background.url()).hostname;
  const page=await context.newPage();
  await page.route('https://www.twitch.tv/**',route=>route.fulfill({contentType:'text/html',body:'<title>Restart fixture</title><button>Play</button><script>document.querySelector("button").onclick=()=>{let a=new AudioContext();let o=a.createOscillator();o.connect(a.destination);o.start();}</script>'}));
  await page.goto('https://www.twitch.tv/mutethebeat-test');await page.click('button');
  const cdp=await context.browser().newBrowserCDPSession();
  const targets=await cdp.send('Target.getTargets',{filter:[{type:'tab'}]});
  await cdp.send('Extensions.triggerAction',{id,targetId:targets.targetInfos.find(t=>t.url===page.url()).targetId});
  const tabId=await background.evaluate(async()=> (await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0].id);
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  const send=command=>popup.evaluate(command=>chrome.runtime.sendMessage({target:'background',command}),command);
  await send({type:'settings',settings:{reduction:60,volume:80,original:true}});
  await background.evaluate(id=>chrome.tabs.update(id,{active:true}),tabId);
  const start=await send({type:'start',tabId});assert.equal(start.ok,true,JSON.stringify(start));
  assert.equal(start.status.phase,'original');
  await context.close();
  context=await launch();
  const second=await context.newPage();await second.goto(`chrome-extension://${id}/popup.html`);
  await second.waitForTimeout(500);
  const after=await second.evaluate(()=>chrome.runtime.sendMessage({target:'background',command:{type:'status'}}));
  assert.equal(after.status.phase,'idle');
  assert.deepEqual(after.status.settings,{reduction:60,volume:80,original:true});
  report.checks.push('Browser restart preserves settings and does not resume capture');
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await context?.close();await fs.writeFile('reports/restart.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
