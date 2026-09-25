import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PLAYER_START, PLAYER_RADIUS, isWalkable, moveInApartment, cameraRelativeMove } from '../public/apartment-navigation.mjs';
import { MINIATURE_MODELS, MINIATURE_INSPECTION_POSITIONS, MINIATURE_PROP_POSITIONS, MINIATURE_DRAWER } from '../public/miniature-layout.mjs';
import { blueBloodCase } from '../public/blueblood-case.mjs';
import { checkMiniatureNavigation } from '../scripts/check-miniature-navigation.mjs';

// Load the actual exported furniture and shared game positions. Cached bounds
// or the former Poly Haven layout must not let a new furniture layout pass.
const layout=await checkMiniatureNavigation({}, {quiet:true});
assert(layout.ok,layout.failures.join('\n'));
const {modelBounds:models,npcs,obstacles,reachable}=layout;
assert.equal(models.length,MINIATURE_MODELS.length,'Every current furniture GLB must be checked');
assert.equal(new Set(models.map(model=>model.id)).size,models.length,'Furniture ids must be unique');
assert(isWalkable(PLAYER_START,obstacles));
for(const model of models){
  if(model.collidable&&model.min[1]<.15){
    assert(obstacles.some(obstacle=>obstacle.id===model.id),`${model.id} must block walking`);
    assert(!isWalkable({x:(model.min[0]+model.max[0])/2,z:(model.min[2]+model.max[2])/2},obstacles),`${model.id} cannot be walked through`);
  }else assert(!obstacles.some(obstacle=>obstacle.id===model.id),`${model.id} is decoration and must not block the floor`);
}
for(const point of [...npcs,{x:4,z:0},{x:0,z:5},{x:NaN,z:0}])assert(!isWalkable(point,obstacles));
const rug=MINIATURE_MODELS.find(model=>model.id==='reading-rug');
assert(isWalkable({x:rug.x,z:rug.z},obstacles),'The reading rug must remain walkable');
assert(obstacles.some(obstacle=>obstacle.id==='drawer-clearance'),'The new drawer opening keeps a clearance zone');
assert.deepEqual(obstacles.find(obstacle=>obstacle.id==='drawer-clearance'),MINIATURE_DRAWER.obstacle);
assert.deepEqual(moveInApartment(PLAYER_START,{x:NaN,z:1},obstacles),PLAYER_START);
const thinWall = [{minX:1,maxX:1.05,minZ:-1,maxZ:1}];
const stop = moveInApartment({x:0,z:0},{x:3,z:0},thinWall);
assert(stop.x <= 1-PLAYER_RADIUS);
const slide = moveInApartment({x:.62,z:0},{x:.5,z:.5},thinWall);
assert(slide.x < .65 && slide.z > .49);
assert(Math.abs(Math.hypot(...Object.values(cameraRelativeMove(1,1,1)))-1)<1e-8);
assert.deepEqual(cameraRelativeMove(0,1,0),{x:0,z:-1});
assert(Math.abs(cameraRelativeMove(0,1,Math.PI/2).x+1)<1e-8);

// The helper flood-fills using moveInApartment, not just free cell centers, so
// narrow passages must admit the actual player radius between sample points.
assert(layout.bathroomReachable,'Bathroom must remain enterable');
for(const item of layout.interactions)assert(item.reachable,`${item.id} must have a reachable interaction point`);
for(const [id,position] of Object.entries({...MINIATURE_PROP_POSITIONS,...MINIATURE_INSPECTION_POSITIONS})){
  assert.deepEqual([...layout.interactions.find(item=>item.id===id).position],[...position],`${id} must use its new world position`);
}
for(const prop of blueBloodCase.props)assert(layout.interactions.some(item=>item.id===prop.id),`Case prop ${prop.id} must remain inspectable`);
for(const person of blueBloodCase.npc)assert(layout.interactions.some(item=>item.id==='npc-'+person.id),`NPC ${person.id} must remain reachable`);
const html=await readFile(new URL('../public/room.html',import.meta.url),'utf8');
const script=await readFile(new URL('../public/room-art.mjs',import.meta.url),'utf8');
for(const match of script.matchAll(/\$\('([^']+)'\)/g))assert(html.includes(`id="${match[1]}"`),`Missing #${match[1]}`);
assert(html.includes('kanshan-player.css'));
assert(script.includes("createKanshanPlayer({"));
console.log(`Apartment player: ${models.length} real miniature GLBs, collision flags, drawer clearance, sliding, no tunnelling, ${reachable.length} reachable floor cells, all ${layout.interactions.length} interaction targets and DOM references passed.`);
