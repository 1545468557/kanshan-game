// Offline layout check. Usage:
// node scripts/check-miniature-navigation.mjs layout.json --map output/layout.svg
// Config: { models:[{id,path,width|height,x,z,rot?,y?,collidable?}],
//   interactions:[{id,position:[x,y,z],radius?}], npcs:[{id,x,z,radius?}],
//   extraObstacles:[{id,minX,maxX,minZ,maxZ}], grid?:0.1 }
// Models may instead provide actual browser-reported {id,min:[...],max:[...]}.
// Interaction entries override room-art.mjs by id; omit npcs to use its layout.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import * as T from '../public/vendor/three/three.module.min.js';
import { GLTFLoader } from '../public/vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { blueBloodCase } from '../public/blueblood-case.mjs';
import { PLAYER_START, PLAYER_RADIUS, apartmentObstacles, isWalkable, moveInApartment } from '../public/apartment-navigation.mjs';
import { MINIATURE_MODELS, MINIATURE_PROP_POSITIONS, MINIATURE_INSPECTION_POSITIONS, MINIATURE_DRAWER } from '../public/miniature-layout.mjs';

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function checkMiniatureNavigation(config={}, {jsonPath=null,svgPath=null,quiet=false}={}) {
const roomSource=await readFile(resolve(projectRoot,'public/room-art.mjs'),'utf8');
function literal(name,open,close){
  const escapedOpen=open==='['?'\\[':'\\{',escapedClose=close===']'?'\\]':'\\}';
  const match=roomSource.match(new RegExp(`const ${name}\\s*=\\s*(${escapedOpen}[\\s\\S]*?\\n${escapedClose});`));
  assert(match,`Cannot read room-art.mjs ${name}; update the layout checker to its new data shape`);
  return runInNewContext(`(${match[1]})`,{Math},{timeout:1000});
}
const baseInteractions=literal('inspectData','[',']');
for(const item of baseInteractions){if(MINIATURE_INSPECTION_POSITIONS[item.id])item.position=[...MINIATURE_INSPECTION_POSITIONS[item.id]];}
const propPositions=/const propPositions\s*=\s*MINIATURE_PROP_POSITIONS\b/.test(roomSource)?MINIATURE_PROP_POSITIONS:literal('propPositions','{','}');
for(const prop of blueBloodCase.props){
  if(baseInteractions.some(item=>item.id===prop.id))continue;
  assert(propPositions[prop.id],`Case prop ${prop.id} has no spatial position`);
  baseInteractions.push({id:prop.id,position:propPositions[prop.id],radius:prop.id==='diary'?.34:.25});
}
let npcs=config.npcs;
if(!npcs){
  const match=roomSource.match(/for\(const \[kind,position,rotation\] of (\[\[.*?\]\])\)\{/);
  assert(match,'NPC layout no longer uses an inline array; supply config.npcs');
  npcs=runInNewContext(`(${match[1]})`,{Math},{timeout:1000}).map((entry,index)=>({id:'npc-'+blueBloodCase.npc[index].id,x:entry[1][0],z:entry[1][2],radius:[.60,.45,.40][index]}));
}
npcs=npcs.map(npc=>({...npc,id:npc.id.startsWith('npc-')?npc.id:'npc-'+npc.id}));
for(const npc of npcs)baseInteractions.push({id:npc.id,position:[npc.x,1.10,npc.z],radius:.48});
const interactions=new Map(baseInteractions.map(item=>[item.id,item]));
for(const item of config.interactions||[])interactions.set(item.id,{...interactions.get(item.id),...item});
for(const prop of blueBloodCase.props)assert(interactions.has(prop.id),`Missing case prop ${prop.id}`);
for(const person of blueBloodCase.npc)assert(interactions.has('npc-'+person.id),`Missing NPC ${person.id}`);

// Geometry-only parsing avoids decoding Kenney's color palette texture in Node.
// Keep the real meshes, transforms and binary positions; neutralize materials.
async function geometryScene(path){
  const bytes=await readFile(resolve(projectRoot,path));
  assert(bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2,`${path} must be a GLB 2.0 file`);
  assert.equal(bytes.readUInt32LE(8),bytes.length,`${path} is truncated`);
  let json,bin;
  for(let offset=12;offset<bytes.length;){
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4),chunk=bytes.subarray(offset+8,offset+8+length);
    if(type===0x4e4f534a)json=JSON.parse(chunk.toString('utf8'));
    if(type===0x004e4942)bin=chunk;
    offset+=8+length;
  }
  assert(json&&bin,`${path} must contain embedded geometry`);
  assert((json.buffers||[]).every(buffer=>!buffer.uri),`${path} uses external geometry buffers`);
  json.materials=(json.materials||[]).map(material=>({name:material.name,doubleSided:true}));
  const encoded=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(encoded.length/4)*4,0x20);encoded.copy(padded);
  const rebuilt=Buffer.alloc(12+8+padded.length+8+bin.length);
  rebuilt.writeUInt32LE(0x46546c67,0);rebuilt.writeUInt32LE(2,4);rebuilt.writeUInt32LE(rebuilt.length,8);
  rebuilt.writeUInt32LE(padded.length,12);rebuilt.writeUInt32LE(0x4e4f534a,16);padded.copy(rebuilt,20);
  const binaryOffset=20+padded.length;rebuilt.writeUInt32LE(bin.length,binaryOffset);rebuilt.writeUInt32LE(0x004e4942,binaryOffset+4);bin.copy(rebuilt,binaryOffset+8);
  return (await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset,rebuilt.byteOffset+rebuilt.byteLength),'')).scene;
}
const models=config.models??MINIATURE_MODELS;
assert(Array.isArray(models)&&models.length,'Supply the new furniture model specs or actual model bounds');
const modelBounds=[];
for(const spec of models){
  let bounds;
  if(spec.min&&spec.max)bounds={id:spec.id,min:spec.min,max:spec.max};
  else{
    assert(spec.path,`${spec.id} needs path or min/max bounds`);
    const model=await geometryScene(spec.path);model.updateMatrixWorld(true);
    // Match room-art.mjs's Box3 policy, including conservative bounds after
    // rotations; a smaller per-vertex bound could falsely open a tight passage.
    const original=new T.Box3().setFromObject(model),size=original.getSize(new T.Vector3()),center=original.getCenter(new T.Vector3());
    const scale=spec.width?spec.width/size.x:spec.height?spec.height/size.y:spec.scale??1;
    assert(Number.isFinite(scale)&&scale>0,`${spec.id} has invalid scale`);
    model.position.set(-center.x,-original.min.y,-center.z);
    const scaled=new T.Group();scaled.scale.setScalar(scale);scaled.add(model);
    const placed=new T.Group();placed.add(scaled);placed.position.set(spec.x,spec.y||0,spec.z);placed.rotation.y=spec.rot||0;placed.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(placed);bounds={id:spec.id,min:box.min.toArray(),max:box.max.toArray()};
  }
  assert([...bounds.min,...bounds.max].every(Number.isFinite),`${spec.id} has invalid bounds`);
  modelBounds.push({...bounds,collidable:spec.collidable!==false});
}
const obstacles=apartmentObstacles(modelBounds,npcs);
obstacles.push(...(config.extraObstacles??[MINIATURE_DRAWER.obstacle]));
const start=config.start||PLAYER_START,grid=config.grid??.1;
assert(grid>=.025&&grid<=.2,'Grid spacing must be between 0.025 and 0.2 metres');
assert(isWalkable(start,obstacles),`Player start ${JSON.stringify(start)} is blocked`);
const queue=[[0,0]],seen=new Set(['0,0']),reachable=[];
for(let head=0;head<queue.length;head++){
  const [ix,iz]=queue[head],point={x:start.x+ix*grid,z:start.z+iz*grid};reachable.push(point);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const next=[ix+dx,iz+dz],key=next.join(',');if(seen.has(key))continue;
    const destination={x:start.x+next[0]*grid,z:start.z+next[1]*grid};
    if(!isWalkable(destination,obstacles))continue;
    const reached=moveInApartment(point,{x:dx*grid,z:dz*grid},obstacles);
    if(Math.hypot(reached.x-destination.x,reached.z-destination.z)>1e-7)continue;
    seen.add(key);queue.push(next);
  }
}
const results=[...interactions.values()].map(item=>{
  assert(item.position?.length===3&&item.position.every(Number.isFinite),`${item.id} needs a finite position`);
  assert(Number.isFinite(item.radius)&&item.radius>0,`${item.id} needs an interaction radius`);
  const limit=1.65+Math.min(item.radius,.45);
  let nearest=null,distance=Infinity,count=0;
  for(const point of reachable){const d=Math.hypot(point.x-item.position[0],point.z-item.position[2]);if(d<distance){distance=d;nearest=point;}if(d<=limit)count++;}
  return {id:item.id,position:item.position,distance:Number(distance.toFixed(3)),limit,reachable:distance<=limit,nearbyCells:count,nearest};
});
const bathroomReachable=reachable.some(point=>point.z< -3.7&&point.x< -2.5);
const failures=results.filter(item=>!item.reachable).map(item=>`${item.id}: nearest ${item.distance} m exceeds ${item.limit} m`);
if(!bathroomReachable)failures.push('Bathroom cannot be entered from the player start');
const report={ok:failures.length===0,grid,playerRadius:PLAYER_RADIUS,start,reachableCells:reachable.length,bathroomReachable,modelBounds,npcs,obstacles,interactions:results,failures,note:'Navigation and interaction distance only. Architecture ray visibility and camera clipping require a browser check.'};
if(jsonPath){await mkdir(dirname(jsonPath),{recursive:true});await writeFile(jsonPath,JSON.stringify(report,null,2)+'\n');}
if(svgPath){
  const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
  const scale=75,x=value=>65+(value+4)*scale,y=value=>65+(value+5.6)*scale;
  const cells=reachable.map(point=>`<rect x="${x(point.x-grid/2)}" y="${y(point.z-grid/2)}" width="${grid*scale}" height="${grid*scale}" fill="#d9ede2"/>`).join('');
  const blocks=obstacles.map(block=>`<rect x="${x(block.minX)}" y="${y(block.minZ)}" width="${(block.maxX-block.minX)*scale}" height="${(block.maxZ-block.minZ)*scale}" fill="#796e60" stroke="#fff" stroke-width=".6"><title>${escape(block.id)}</title></rect>`).join('');
  const labels=results.map(item=>`<g><circle cx="${x(item.position[0])}" cy="${y(item.position[2])}" r="4" fill="${item.reachable?'#22645e':'#c94232'}"/><text x="${x(item.position[0])+6}" y="${y(item.position[2])-5}" font-size="10" fill="#173b37">${escape(item.id)}</text><title>Closest accessible point: ${item.distance} m</title></g>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="760" height="880" viewBox="0 0 760 880"><rect width="760" height="880" fill="#faf7ef"/><text x="35" y="28" font-family="sans-serif" font-size="18">Miniature apartment navigation · ${report.ok?'PASS':'FAIL'}</text><text x="35" y="47" font-family="sans-serif" font-size="11">Player radius ${PLAYER_RADIUS} m · grid ${grid} m · green = reachable floor · labels = interaction targets</text>${cells}${blocks}${labels}<circle cx="${x(start.x)}" cy="${y(start.z)}" r="7" fill="#da9d3a"/><text x="${x(start.x)+10}" y="${y(start.z)+4}" font-size="12">Start</text><text x="35" y="857" font-size="11">Distance check only: architecture visibility and camera clipping still require browser verification.</text></svg>`;
  await mkdir(dirname(svgPath),{recursive:true});await writeFile(svgPath,svg);
}
if(!quiet){
  console.log(`${report.ok?'PASS':'FAIL'}: ${reachable.length} reachable floor cells; bathroom ${bathroomReachable?'reachable':'blocked'}; ${results.filter(item=>item.reachable).length}/${results.length} interactions in range.`);
  for(const model of modelBounds)console.log(`${model.id}: min [${model.min.map(value=>value.toFixed(3))}] max [${model.max.map(value=>value.toFixed(3))}]${model.collidable?'':' (non-colliding decoration)'}`);
  for(const failure of failures)console.error(failure);
  console.log(report.note);
}
return {...report,reachable};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),configPath=args[0]?.startsWith('--')?null:args[0];
  if(args.includes('--help')){
    console.log('Usage: node scripts/check-miniature-navigation.mjs [layout.json] [--map output/layout.svg] [--json output/layout-report.json]');
    console.log('Without layout.json, use the shared miniature-layout.mjs and current room NPCs. GLB geometry is read directly; architecture line of sight still requires a browser check.');
  }else{
    const option=name=>{const index=args.indexOf(name);if(index<0)return null;assert(args[index+1]&&!args[index+1].startsWith('--'),`${name} needs a path`);return resolve(projectRoot,args[index+1]);};
    const config=configPath?JSON.parse(await readFile(resolve(projectRoot,configPath),'utf8')):{};
    const report=await checkMiniatureNavigation(config,{jsonPath:option('--json'),svgPath:option('--map')});
    process.exitCode=report.ok?0:1;
  }
}
