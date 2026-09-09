// Optional public Twitch playback check. Uses a clean profile and no account.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const extension=path.resolve('dist');
const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,executablePath:process.env.CHROME_PATH,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--enable-unsafe-extension-debugging']});
const report={date:new Date().toISOString(),url:process.env.TWITCH_TEST_URL||'https://www.twitch.tv/monstercat',status:'unverified'};
try{
  let [background]=context.serviceWorkers();background??=await context.waitForEvent('serviceworker');
  const id=new URL(background.url()).hostname;
  const page=await context.newPage();
  await page.goto(report.url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(15000);
  report.title=await page.title();
  report.player=await page.evaluate(()=>{
    const v=document.querySelector('video');
    return v?{paused:v.paused,readyState:v.readyState,currentTime:v.currentTime,muted:v.muted}:null;
  });
  await page.screenshot({path:'artifacts/live-twitch.png'});
  if(!report.player || report.player.readyState<2 || report.player.paused){
    report.reason='Public Twitch playback was not running in the clean headless browser. No extension quality or live stability result inferred.';
    report.pageText=(await page.locator('body').innerText()).slice(0,2500);
  }else{
    // Twitch autoplay commonly starts muted. Unmute before treating this as
    // an audio test; a running muted video is not evidence of live processing.
    await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=false;v.volume=.5;await v.play();});
    await page.waitForTimeout(1000);
    report.unmutedPlayer=await page.evaluate(()=>{const v=document.querySelector('video');return {muted:v.muted,paused:v.paused,currentTime:v.currentTime,volume:v.volume};});
    if(report.unmutedPlayer.muted||report.unmutedPlayer.paused)throw Error('Twitch did not remain unmuted and playing.');
    const cdp=await context.browser().newBrowserCDPSession();
    const {targetInfos}=await cdp.send('Target.getTargets',{filter:[{type:'tab'}]});
    const target=targetInfos.find(t=>t.url===page.url());
    await cdp.send('Extensions.triggerAction',{id,targetId:target.targetId});
    const tabId=await background.evaluate(async()=> (await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0].id);
    const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
    await background.evaluate(id=>chrome.tabs.update(id,{active:true}),tabId);
    const send=command=>popup.evaluate(command=>chrome.runtime.sendMessage({target:'background',command}),command);
    report.start=await send({type:'start',tabId});
    if(!report.start.ok)throw Error(JSON.stringify(report.start));
    const seconds=Number(process.env.LIVE_SECONDS||60);
    report.observations=[];
    for(let elapsed=0;elapsed<seconds;elapsed+=5){
      await page.waitForTimeout(Math.min(5,seconds-elapsed)*1000);
      const status=await send({type:'status'});
      if(status.status.phase!=='active')throw Error(`Processing stopped after ${elapsed}s: ${JSON.stringify(status)}`);
      if(elapsed%60===0){
        const player=await page.evaluate(()=>{const v=document.querySelector('video');return v?{muted:v.muted,paused:v.paused,currentTime:v.currentTime,readyState:v.readyState}:null;});
        report.observations.push({elapsed:elapsed+5,player});
        console.log(`Live Twitch capture: ${elapsed+5}/${seconds}s`);
        if(!player||player.muted||player.paused)throw Error('Live playback stopped or became muted.');
      }
    }
    report.end=await send({type:'status'});
    report.seconds=seconds;
    report.status=report.end.status.phase==='active'?`${seconds}-second unmuted live playback passed`:'failed';
    await send({type:'stop'});
    report.limitations='No subjective listening, stem separation metric, or physical audio-latency measurement. Headless browser; system speaker output is suppressed by the test runner.';
  }
}catch(e){report.reason=String(e.stack??e);}
finally{await fs.writeFile('reports/live-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await context.close();}
