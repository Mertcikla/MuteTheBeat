import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const extension=path.resolve('dist');
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,executablePath:process.env.CHROME_PATH,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--enable-unsafe-extension-debugging']});
const report={date:new Date().toISOString(),checks:[]};
try{
  let [background]=context.serviceWorkers();background??=await context.waitForEvent('serviceworker');
  const id=new URL(background.url()).hostname;
  const page=await context.newPage();
  await page.route('https://www.twitch.tv/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<title>Twitch · Demo stream</title><button>Play</button><script>document.querySelector("button").onclick=()=>{let a=new AudioContext();let o=a.createOscillator();let g=a.createGain();g.gain.value=.02;o.connect(g).connect(a.destination);o.start();}</script>'}));
  await page.goto('https://www.twitch.tv/mutethebeat-test');await page.click('button');
  const cdp=await context.browser().newBrowserCDPSession();
  const targets=await cdp.send('Target.getTargets',{filter:[{type:'tab'}]});
  await cdp.send('Extensions.triggerAction',{id,targetId:targets.targetInfos.find(t=>t.url===page.url()).targetId});
  await page.waitForTimeout(300);
  const popup=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url===`chrome-extension://${id}/popup.html`);
  assert(popup,'Action popup target exists');
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:popup.targetId,flatten:false});
  let next=0;const pending=new Map();
  cdp.on('Target.receivedMessageFromTarget',event=>{
    if(event.sessionId!==sessionId)return;
    const message=JSON.parse(event.message),task=pending.get(message.id);
    if(task){pending.delete(message.id);message.error?task.reject(Error(JSON.stringify(message.error))):task.resolve(message.result);}
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const msgId=++next;pending.set(msgId,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id:msgId,method,params})}).catch(reject);});
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
  };
  assert.equal(await evaluate('document.querySelector("#toggle").disabled'),false);
  await evaluate('document.querySelector("#toggle").click()');
  for(let i=0;i<90;i++){
    if(await evaluate('document.querySelector("#phase").textContent')==='Speech focus is on')break;
    await page.waitForTimeout(500);
  }
  assert.equal(await evaluate('document.querySelector("#phase").textContent'),'Speech focus is on');
  report.checks.push('Actual action popup Enable button starts capture');
  await evaluate('document.querySelector("#original").click()');await page.waitForTimeout(1000);
  assert.equal(await evaluate('document.querySelector("#phase").textContent'),'Playing original audio');
  assert.equal(await evaluate('document.querySelector("#original").getAttribute("aria-pressed")'),'true');
  await evaluate('document.querySelector("#reduction").value="65";document.querySelector("#reduction").dispatchEvent(new Event("input"));');
  await page.waitForTimeout(1000);
  assert.equal(await evaluate('document.querySelector("#reduction-value").textContent'),'65%');
  report.checks.push('Actual comparison and slider controls update and persist');
  const originalImage=await send('Page.captureScreenshot',{format:'png'});
  await fs.writeFile('artifacts/action-popup-original.png',Buffer.from(originalImage.data,'base64'));
  await evaluate('document.querySelector("#enhanced").click()');await page.waitForTimeout(1000);
  const image=await send('Page.captureScreenshot',{format:'png'});
  await fs.writeFile('artifacts/action-popup.png',Buffer.from(image.data,'base64'));
  await evaluate('document.querySelector("#toggle").click()');await page.waitForTimeout(1000);
  report.checks.push('Actual Disable button returns to idle');
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await fs.writeFile('reports/ui.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await context.close();}
