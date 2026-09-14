import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import { createCharacter } from '../public/character-meshes.mjs';
import { PLAYER_START, PLAYER_RADIUS, apartmentObstacles, isWalkable, moveInApartment, cameraRelativeMove } from '../public/apartment-navigation.mjs';

const models = [
  {id:'sofa',min:[-1.33,0,-3.674],max:[1.17,1.268,-2.626]},
  {id:'chair',min:[1.557,0,-2.030],max:[2.203,1.04,-1.370]},
  {id:'table',min:[-2.091,0,-2.111],max:[-1.029,.68,-1.049]},
  {id:'cabinet',min:[-3.564,0,-.847],max:[-3.036,1.76,.747]}
];
const npcs = [{x:2.35,z:-.55,radius:.60},{x:-.15,z:-.20,radius:.45},{x:2.90,z:-2.05,radius:.40}];
const obstacles = apartmentObstacles(models,npcs);
obstacles.push({id:'drawer-clearance',minX:-3.56,maxX:-3.04,minZ:.7,maxZ:1.04});
assert(isWalkable(PLAYER_START,obstacles));
for(const point of [{x:0,z:-3.15},{x:-3.3,z:0},{x:-1.5,z:-1.5},...npcs,{x:4,z:0},{x:0,z:5},{x:NaN,z:0}]) assert(!isWalkable(point,obstacles));
assert.deepEqual(moveInApartment(PLAYER_START,{x:NaN,z:1},obstacles),PLAYER_START);
const thinWall = [{minX:1,maxX:1.05,minZ:-1,maxZ:1}];
const stop = moveInApartment({x:0,z:0},{x:3,z:0},thinWall);
assert(stop.x <= 1-PLAYER_RADIUS);
const slide = moveInApartment({x:.62,z:0},{x:.5,z:.5},thinWall);
assert(slide.x < .65 && slide.z > .49);
assert(Math.abs(Math.hypot(...Object.values(cameraRelativeMove(1,1,1)))-1)<1e-8);
assert.deepEqual(cameraRelativeMove(0,1,0),{x:0,z:-1});
assert(Math.abs(cameraRelativeMove(0,1,Math.PI/2).x+1)<1e-8);

// Flood-fill the actual small apartment, including its narrow bathroom door.
const grid=.1,queue=[[7,15]],seen=new Set(['7,15']),reachable=[];
for(let head=0;head<queue.length;head++){
  const [ix,iz]=queue[head],p={x:ix*grid,z:iz*grid};reachable.push(p);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const next=[ix+dx,iz+dz],key=next.join(',');
    if(seen.has(key)||!isWalkable({x:next[0]*grid,z:next[1]*grid},obstacles))continue;
    seen.add(key);queue.push(next);
  }
}
assert(reachable.some(p=>p.z < -3.7 && p.x < -2.5),'Bathroom must be enterable');
for(const [name,x,z] of [['drawer',-3.3,.76],['photo',-.18,-3.79],['toilet',-3.18,-5],['basin',-2.43,-4.82],['diary',-.04,-2.93],['door',2.86,-3.03],...npcs.map((p,i)=>['npc'+i,p.x,p.z])]){
  assert(reachable.some(p=>Math.hypot(p.x-x,p.z-z)<1.9),`${name} must have reachable interaction space`);
}
const character=createCharacter(T,'kanshan');character.root.scale.multiplyScalar(.76);character.root.updateMatrixWorld(true);
const bounds=new T.Box3().setFromObject(character.root);
assert(bounds.max.y-bounds.min.y>1.2 && bounds.max.y-bounds.min.y<1.4);
for(const seconds of [0,.1,1,5,20]){
  character.animate(seconds,true);character.root.updateMatrixWorld(true);
  character.root.traverse(o=>assert(o.matrixWorld.elements.every(Number.isFinite)));
}
const html=await readFile(new URL('../public/room.html',import.meta.url),'utf8');
const script=await readFile(new URL('../public/room-art.mjs',import.meta.url),'utf8');
for(const match of script.matchAll(/\$\('([^']+)'\)/g))assert(html.includes(`id="${match[1]}"`),`Missing #${match[1]}`);
assert(html.includes('kanshan-player.css'));
assert(script.includes("createKanshanPlayer({"));
console.log(`Apartment player: collision, sliding, no tunnelling, ${reachable.length} reachable floor cells, bathroom/NPC access, compact character and DOM references passed.`);
