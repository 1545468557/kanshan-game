import assert from 'node:assert/strict';
import * as T from '../dist/vendor/three/three.module.min.js';
import {createCistern} from '../dist/cistern.mjs';

const tank=createCistern(),closed=tank.lid.position.clone();
assert.equal(tank.state().phase,'closed');
assert.equal(tank.setOpen(true),true);
assert.equal(tank.setOpen(false),false,'repeated input cannot interrupt a moving ceramic lid');
tank.update(.1);assert.equal(tank.state().phase,'opening');
assert(tank.lid.position.y>closed.y,'the lid first lifts above the tank');
for(let n=0;n<120;n++)tank.update(1/60);
assert.equal(tank.state().phase,'open');
assert(tank.lid.position.z>.3,'the lid is set down in front, away from the opening');
const ray=new T.Raycaster(new T.Vector3(0,2,0),new T.Vector3(0,-1,0));
const hit=ray.intersectObject(tank.root,true)[0];
assert(hit&&hit.point.y<.4,'looking through the open top reaches the inside, not a solid box');
for(let cycle=0;cycle<8;cycle++){
  tank.setOpen(false);for(let i=0;i<120;i++)tank.update(1/60);
  assert.equal(tank.state().phase,'closed');assert.deepEqual(tank.lid.position.toArray(),closed.toArray());
  tank.setOpen(true);for(let i=0;i<120;i++)tank.update(1/60);
}
tank.setOpen(false,{immediate:true});assert.equal(tank.state().phase,'closed');
const before=tank.state();tank.update(NaN);tank.update(-1);assert.deepEqual(tank.state(),before);
tank.root.traverse(o=>{if(o.geometry){for(const n of o.geometry.attributes.position.array)assert(Number.isFinite(n));}});
console.log('PASS: hollow tank, lift/park/replace, input lock, 8 repeat cycles, reduced motion and finite geometry.');
