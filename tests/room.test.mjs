import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../public/vendor/three/three.module.min.js';
import {createCharacter} from '../public/character-meshes.mjs';
import {buildRoom} from '../public/room-scene.mjs';
import {blocked,moveWithCollision} from '../public/room-physics.mjs';

let checks=0;
const check=(name,fn)=>{fn();checks++;console.log(`PASS ${name}`);};
const room=buildRoom(THREE);
check('3D room contains finite mesh geometry',()=>{
  let count=0;room.root.updateMatrixWorld(true);
  room.root.traverse(o=>{if(o.isMesh){count++;for(const n of o.geometry.attributes.position.array)assert(Number.isFinite(n));}});
  assert(count>100);assert(room.cameraSolids.length>10);console.log(`  ${count} meshes; ${room.obstacles.length} obstacle envelopes`);
});
for(const kind of ['kanshan','bear','bird','penguin'])check(`${kind}: animated mesh stays finite`,()=>{
  const c=createCharacter(THREE,kind);const before=c.root.position.clone();
  for(const t of [0,.05,1,2,6,100,NaN]){c.animate(t,true);c.root.updateMatrixWorld(true);c.root.traverse(o=>{for(const n of o.matrixWorld.elements)assert(Number.isFinite(n));});}
  assert(c.root.position.equals(before));assert(c.height>1);const bounds=new THREE.Box3().setFromObject(c.root);assert(bounds.max.y<2.5);assert(bounds.min.y>-.15);
});
check('room boundaries and foyer doorway',()=>{
  assert(!blocked(0,6,[],.3));assert(blocked(2,6,[],.3));assert(blocked(2,4.6,[],.3));
  assert(blocked(0,7.25,[],.3));assert(blocked(6,0,[],.3));assert(!blocked(0,2.9,room.obstacles,.3));
});
check('large movement cannot tunnel through furniture',()=>{
  const p={x:0,z:0};moveWithCollision(p,4,0,[{minX:1,maxX:1.1,minZ:-1,maxZ:1}],.3);assert(p.x<=.71);
});
check('sliding along an obstacle preserves parallel movement',()=>{
  const p={x:.69,z:0};moveWithCollision(p,.5,.5,[{minX:1,maxX:2,minZ:-1,maxZ:1}],.3);assert(p.x<.71);assert(p.z>.49);
});
check('invalid movement cannot poison player position',()=>{
  const p={x:0,z:1};moveWithCollision(p,NaN,1,[]);assert.deepEqual(p,{x:0,z:1});assert(blocked(NaN,1,[]));
});
// Navigation flood-fill checks every interaction has reachable floor space.
const npcs=[{x:2.9,z:3.45},{x:-3.45,z:.65},{x:3.8,z:-.3}];
const obstacles=[...room.obstacles,...npcs.map(p=>({minX:p.x-.43,maxX:p.x+.43,minZ:p.z-.4,maxZ:p.z+.4}))];
const reachable=[],queue=[[0,15]],seen=new Set(['0,15']);
for(let head=0;head<queue.length;head++){
  const [ix,iz]=queue[head],x=ix*.2,z=iz*.2;reachable.push({x,z});
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=ix+dx,nz=iz+dz,key=`${nx},${nz}`;
    if(seen.has(key)||blocked(nx*.2,nz*.2,obstacles,.3))continue;seen.add(key);queue.push([nx,nz]);
  }
}
for(const target of [...npcs,{x:.5,z:-3.57},{x:3.26,z:1.35},{x:5.38,z:.1},{x:0,z:7.2}])check(`reachable interaction at ${target.x}, ${target.z}`,()=>assert(reachable.some(p=>Math.hypot(p.x-target.x,p.z-target.z)<1.1)));
const html=await readFile(new URL('../public/room-gameplay.html',import.meta.url),'utf8');
const script=await readFile(new URL('../public/room.mjs',import.meta.url),'utf8');
check('every queried UI id exists',()=>{
  for(const match of script.matchAll(/\$\('#([^']+)'\)/g))assert(html.includes(`id="${match[1]}"`),`Missing #${match[1]}`);
});
check('model/network secrets are not part of the room module',()=>{
  assert(!/fetch\(|API_KEY|APP_KEY|Bearer /.test(script));assert(script.includes('尚未接入'));
});
console.log(`\n${checks} checks passed. GPU rendering and device playtesting are not covered by these tests.`);
