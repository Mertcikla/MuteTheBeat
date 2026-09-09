import { test } from 'node:test';
import assert from 'node:assert/strict';
let Processor;
globalThis.AudioWorkletProcessor = class { constructor() { this.events=[]; this.port={postMessage:m=>this.events.push(m)}; } };
globalThis.registerProcessor = (_, cls) => { Processor=cls; };
await import('../public/audio-worklet.js');
const make = (overrides={}) => new Processor({processorOptions:{frameLength:480,modelDelay:1440,volume:100,reduction:50,original:false,...overrides}});
function attach(processor, reply=true) {
  const history=new Float32Array(48000);
  const port={start(){},postMessage(message){
    if (!reply) return;
    history.set(message.samples,message.start);
    const samples=new Float32Array(480);
    for(let i=0;i<480;i++)samples[i]=history[message.start+i-1440]??0;
    port.onmessage({data:{start:message.start,samples}});
  }};
  processor.port.onmessage({data:{type:'port',port}});
}
function render(processor, length=8192, pulse=128) {
  const result=[];
  for(let time=0;time<length;time+=128){
    const input=new Float32Array(128);if(pulse>=time&&pulse<time+128)input[pulse-time]=.5;
    const output=[new Float32Array(128),new Float32Array(128)];
    processor.process([[input]], [output]);
    assert.deepEqual(output[0],output[1]);result.push(...output[0]);
  }
  return result;
}
test('processed and original impulses have exactly the same 70 ms delay',()=>{
  const wet=make(),dry=make({original:true});attach(wet);attach(dry);
  const a=render(wet),b=render(dry);
  assert.deepEqual(a,b);assert.equal(a.indexOf(.5),128+3360);
  assert.equal(wet.failed,false);
});
test('a stalled worker trips bounded backlog and falls back to delayed original',()=>{
  const p=make();attach(p,false);const audio=render(p,8192,4096);
  assert.equal(p.failed,true);assert(p.pending<=8);
  assert.equal(p.events.filter(e=>e.type==='overload').length,1);
  assert.equal(audio[4096+3360],.5);
});
test('late frames cannot overwrite the current playback timeline',()=>{
  const p=make();attach(p,false);render(p,4096,-1);
  p.workerPort.onmessage({data:{start:0,samples:new Float32Array(480).fill(.8)}});
  assert.equal(p.wet.get(1920),undefined);
});
test('comparison crossfades gradually and output stays finite without an input',()=>{
  const p=make();p.port.onmessage({data:{type:'settings',original:true,reduction:50,volume:100}});
  const out=[[new Float32Array(128),new Float32Array(128)]];
  p.process([[]],out);assert(p.mix<1&&p.mix>0);
  assert(out[0][0].every(Number.isFinite));
});
