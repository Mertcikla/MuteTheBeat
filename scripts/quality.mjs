import fs from 'node:fs/promises';
import init, { df_create, df_process_frame, df_set_atten_lim } from '../public/vendor/df.js';
function readWav(buffer) {
  let offset = 12, rate, data;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset+4), size = buffer.readUInt32LE(offset+4);
    if (id === 'fmt ') {
      if (buffer.readUInt16LE(offset+8) !== 1 || buffer.readUInt16LE(offset+10) !== 1 || buffer.readUInt16LE(offset+22) !== 16) throw Error('Expected mono PCM16');
      rate = buffer.readUInt32LE(offset+12);
    }
    if (id === 'data') data = buffer.subarray(offset+8, offset+8+size);
    offset += 8 + size + (size % 2);
  }
  if (rate !== 48000 || !data) throw Error('Expected 48 kHz WAV');
  return Float32Array.from({length:data.length/2}, (_,i) => data.readInt16LE(i*2)/32768);
}
function wav(samples) {
  const b = Buffer.alloc(44 + samples.length*2);
  b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16);
  b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(48000,24); b.writeUInt32LE(96000,28);
  b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(samples.length*2,40);
  samples.forEach((v,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(.9999,v))*32767),44+i*2)); return b;
}
const rms = a => Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
function normalize(a, level) { const scale = level / Math.max(1e-9,rms(a)); return Float32Array.from(a,x=>x*scale); }
function sdr(y, s) {
  let ss=0, ys=0; for(let i=0;i<s.length;i++){ss+=s[i]*s[i];ys+=y[i]*s[i];}
  const scale=ys/ss; let residual=0; for(let i=0;i<s.length;i++)residual+=(y[i]-scale*s[i])**2;
  return 10*Math.log10((scale*scale*ss+1e-12)/(residual+1e-12));
}
// CC0 procedural accompaniment: changing chords, a bass pulse, and percussion.
function music(length) {
  const out=new Float32Array(length), chords=[[130.81,164.81,196],[110,130.81,164.81],[87.31,110,130.81],[98,123.47,146.83]];
  let seed=42;
  for(let i=0;i<length;i++){
    const t=i/48000, chord=chords[Math.floor(t/2)%4];
    let x=0; for(const f of chord)x+=Math.sin(2*Math.PI*f*t)*.18+Math.sin(4*Math.PI*f*t)*.05;
    const beat=t%.5;x+=.3*Math.sin(2*Math.PI*55*t)*Math.exp(-beat*20);
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    x+=((seed/4294967296)*2-1)*.15*Math.exp(-(t%.25)*90);out[i]=x;
  }
  return normalize(out,.06);
}
await init({module_or_path:await fs.readFile('public/vendor/df_bg.wasm')});
const model=await fs.readFile('public/vendor/DeepFilterNet3_onnx.tar.gz');
const second=readWav(await fs.readFile('artifacts/fixtures/second.wav'));
const cases=[];
for(const language of ['english','turkish']){
  const raw=readWav(await fs.readFile(`artifacts/fixtures/${language}.wav`));
  for(const kind of ['instrumental','quiet-speech','overlap','game-effects','speech-only']){
    const s=normalize(raw,kind==='quiet-speech'?.035:.085), m=music(s.length);
    if(kind==='speech-only')m.fill(0);
    if(kind==='overlap') {const voice=normalize(second,.04);for(let i=0;i<m.length;i++)m[i]+=voice[i%voice.length];}
    if(kind==='game-effects')for(let i=0;i<m.length;i++){const t=i/48000;m[i]+=.12*Math.sin(2*Math.PI*(500+300*(t%1))*t)*Math.exp(-(t%1)*18);}
    const mixed=Float32Array.from(s,(v,i)=>v+m[i]);
    const handle=df_create(model,20), processed=new Float32Array(Math.ceil((s.length+1440)/480)*480);
    for(let start=0;start<processed.length;start+=480){const frame=new Float32Array(480);frame.set(mixed.subarray(start,start+480));processed.set(df_process_frame(handle,frame),start);}
    const aligned=processed.slice(1440,1440+s.length);
    const input=sdr(mixed,s),output=sdr(aligned,s);
    cases.push({language,kind,seconds:s.length/48000,inputSiSdrDb:input,outputSiSdrDb:output,improvementDb:output-input,outputRms:rms(aligned),inputRms:rms(mixed)});
    if(kind==='instrumental'){
      await fs.writeFile(`artifacts/fixtures/${language}-original.wav`,wav(mixed));
      await fs.writeFile(`artifacts/fixtures/${language}-enhanced.wav`,wav(aligned));
    }
  }
}
const report={date:new Date().toISOString(),attenuationLimitDb:20,modelDelaySamples:1440,cases,
  limitations:['Synthetic Windows TTS and procedural music; not representative live stream recordings.','SI-SDR improvement measures target speech versus all residual distortion; it is not a separated-stem music SIR measurement.','Singing and human listening checks have not been evaluated.','Other speakers are expected to remain. Reference-speaker SI-SDR is diagnostic, not a promise of speaker identification.']};
await fs.writeFile('reports/quality.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
