import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import {createWallPhoto,photoViewForViewport} from '../public/wall-photo.mjs';
const photo=createWallPhoto();
const finish=()=>{for(let i=0;i<160;i++)photo.update(1/60);};
const ray=new T.Raycaster(new T.Vector3(0,0,2),new T.Vector3(0,0,-1));
ray.params.Line.threshold=.002;
const front=()=>{photo.root.updateMatrixWorld(true);return ray.intersectObject(photo.root,true)[0]?.object.name;};
assert.equal(photo.state().phase,'closed');
assert.equal(front(),'aged-corridor-print','mounted frame conceals wall mark');
const wallPosition=photo.mark.position.toArray();
for(let cycle=0;cycle<8;cycle++){
  assert.equal(photo.setOpen(true),true);photo.update(.12);
  assert.equal(photo.state().phase,'opening');
  assert.equal(photo.setOpen(false),false,'rapid reversal is ignored while moving');
  assert.ok(photo.frame.position.y>0,'first motion lifts frame off nail');
  finish();assert.equal(photo.state().phase,'open');
  assert.equal(front(),'protected-wall-plaster','wall is exposed by actual geometry movement');
  assert.ok(new T.Box3().setFromObject(photo.frame).min.x>.397,'moved frame clears entire wall mark');
  assert.deepEqual(photo.mark.position.toArray(),wallPosition,'wall mark stays fixed');
  photo.setOpen(false);finish();assert.equal(photo.state().phase,'closed');
  assert.deepEqual(photo.frame.position.toArray(),[0,0,0]);
  assert.ok(Math.abs(photo.frame.rotation.y)<1e-12);assert.equal(front(),'aged-corridor-print');
}
photo.setOpen(true,{immediate:true});assert.equal(photo.state().busy,false);assert.equal(photo.state().phase,'open');
photo.setOpen(false,{immediate:true});assert.equal(photo.state().phase,'closed');
for(const dt of [NaN,Infinity,-1,0])photo.update(dt);
photo.root.traverse(object=>{if(object.geometry){for(const value of object.geometry.attributes.position.array)assert.ok(Number.isFinite(value));}});
photo.root.position.set(-.18,2.18,-3.832);
for(const [width,height] of [[390,844],[1440,900]]){
  const view=photoViewForViewport(width),camera=new T.PerspectiveCamera(55,width/height,.07,50);
  camera.position.set(...view.position);camera.lookAt(new T.Vector3(...view.target));camera.updateMatrixWorld(true);
  for(const open of [false,true]){
    photo.setOpen(open,{immediate:true});
    const bounds=new T.Box3().setFromObject(photo.frame);
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      const screen=new T.Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(screen.x)<1&&Math.abs(screen.y)<1,`frame stays in ${width}px camera view`);
    }
  }
}
console.log('Wall photo: 8 removal/return cycles, real occlusion, fixed marks, repeated-input lock, reduced motion and finite geometry passed.');
