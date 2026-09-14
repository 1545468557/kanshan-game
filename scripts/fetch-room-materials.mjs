import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const download=async(url,dest)=>{await mkdir(path.dirname(dest),{recursive:true});const r=await fetch(url);if(!r.ok)throw new Error(`${r.status}: ${url}`);await writeFile(dest,new Uint8Array(await r.arrayBuffer()));};
for(const id of ['worn_plaster_wall','wood_peeling_paint_weathered','old_wooden_floor_02']){
  const data=await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  await Promise.all([['Diffuse','color'],['nor_gl','normal'],['Rough','roughness']].map(async([key,name])=>{
    const kind=key==='Rough'?Object.keys(data).find(k=>/^rough/i.test(k)):key;
    const map=data[kind]?.['2k']?.jpg;if(!map)throw new Error(`Missing ${id}/${kind}`);
    await download(map.url,path.join(project,'public/assets/materials',id,`${name}.jpg`));
  }));console.log(`Material ready: ${id}`);
}
const h=await (await fetch('https://api.polyhaven.com/files/old_room')).json();
await download(h.hdri['1k'].hdr.url,path.join(project,'public/assets/materials/old_room.hdr'));
const queue=['controls/OrbitControls.js','loaders/RGBELoader.js','postprocessing/EffectComposer.js','postprocessing/RenderPass.js','postprocessing/SSAOPass.js','postprocessing/OutputPass.js'];
const seen=new Set();
while(queue.length){const item=queue.shift();if(seen.has(item))continue;seen.add(item);const r=await fetch(`https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/${item}`);if(!r.ok)throw new Error(item);const code=await r.text();const dest=path.join(project,'public/vendor/three/examples/jsm',item);await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,code);for(const m of code.matchAll(/from\s+['"]([^'"]+)['"]/g)){if(m[1].startsWith('.'))queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(item),m[1])));}}
console.log(`Three addons ready: ${seen.size}`);
