import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const extension=await fs.mkdtemp(path.resolve('artifacts')+'/corrupt-extension-');
await fs.cp('dist',extension,{recursive:true});
await fs.writeFile(path.join(extension,'vendor/df_bg.wasm'),Buffer.from('deliberately invalid test WASM'));
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,executablePath:process.env.CHROME_PATH,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--enable-unsafe-extension-debugging']});
const report={date:new Date().toISOString(),checks:[]};
try{
  let [background]=context.serviceWorkers();background??=await context.waitForEvent('serviceworker');
  const id=new URL(background.url()).hostname;
  const page=await context.newPage();
  await page.route('https://www.twitch.tv/**',route=>route.fulfill({contentType:'text/html',body:'<title>Damaged model test</title>'}));
  await page.goto('https://www.twitch.tv/mutethebeat-test');
  const cdp=await context.browser().newBrowserCDPSession();
  const targets=await cdp.send('Target.getTargets',{filter:[{type:'tab'}]});
  await cdp.send('Extensions.triggerAction',{id,targetId:targets.targetInfos.find(t=>t.url===page.url()).targetId});
  const tabId=await background.evaluate(async()=> (await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0].id);
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
  await background.evaluate(id=>chrome.tabs.update(id,{active:true}),tabId);
  const reply=await popup.evaluate(tabId=>chrome.runtime.sendMessage({target:'background',command:{type:'start',tabId}}),tabId);
  assert.equal(reply.ok,false);assert.equal(reply.status.phase,'error');
  assert.match(reply.error,/WebAssembly|magic word|compile/i);
  const captures=await background.evaluate(()=>new Promise(resolve=>chrome.tabCapture.getCapturedTabs(resolve)));
  assert(!captures.some(c=>c.status==='active'));
  report.checks.push('Invalid packaged WASM reports an error without taking over tab audio');
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await context.close();await fs.writeFile('reports/fault.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
