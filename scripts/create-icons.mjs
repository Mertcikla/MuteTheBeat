// Mechanical resize/padding of the generated master; no redraw of the mark.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url);
const sharp=require(process.env.SHARP_PATH||'sharp');
await fs.mkdir('public/icons',{recursive:true});
const source='branding/mutethebeat-master.png';
for(const size of [16,32,48,128]){
  const content=size===128?96:size;
  let icon=sharp(source).trim({threshold:20}).resize(content,content,{fit:'contain',background:'#00000000'});
  if(size===128)icon=icon.extend({top:16,bottom:16,left:16,right:16,background:'#00000000'});
  await icon.png().toFile(`public/icons/icon-${size}.png`);
}
await fs.copyFile('public/icons/icon-128.png','submission/store-icon-128.png');
