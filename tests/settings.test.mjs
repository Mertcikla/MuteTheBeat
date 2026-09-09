import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
const source=ts.transpileModule(await fs.readFile('src/shared.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {normalizeSettings,isTwitch}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('settings reject nonfinite values and clamp numeric bounds',()=>{
  assert.deepEqual(normalizeSettings({reduction:NaN,volume:Infinity,original:'yes'}),{reduction:50,volume:100,original:false});
  assert.deepEqual(normalizeSettings({reduction:-5,volume:900,original:true}),{reduction:0,volume:150,original:true});
});
test('only exact HTTPS Twitch origins are accepted',()=>{
  assert(isTwitch('https://www.twitch.tv/channel'));assert(isTwitch('https://twitch.tv/channel'));
  for(const url of ['http://twitch.tv','https://twitch.tv.evil.test','https://evil.test/twitch.tv','file:///twitch.tv',undefined]) assert(!isTwitch(url));
});
