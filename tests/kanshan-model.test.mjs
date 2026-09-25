import assert from 'node:assert/strict';
import * as T from '../public/vendor/three/three.module.min.js';
import { createKanshanModel, loadKanshanModel, KANSHAN_MODEL_URL } from '../public/kanshan-model.mjs';

function fixture() {
  const scene=new T.Group(),bone=new T.Bone();bone.name='Hips';scene.add(bone);
  const mesh=new T.Mesh(new T.BoxGeometry(.6,1.3,.5),new T.MeshStandardMaterial());
  mesh.position.y=.65;bone.add(mesh);
  const animations=['Idle','Walk','FastWalk'].map((name,index)=>new T.AnimationClip(name,1,[
    new T.VectorKeyframeTrack('Hips.position',[0,.5,1],[0,0,0,0,.01*(index+1),0,0,0,0])
  ]));
  return {scene,animations};
}

const gltf=fixture(),character=createKanshanModel(gltf);
assert.equal(character.state().asset,KANSHAN_MODEL_URL);
assert.equal(character.state().animation,'Idle');
assert.notEqual(character.root,gltf.scene,'Navigation root is separate from the animated scene');
character.root.position.set(2,-.002,3);character.root.rotation.y=1.2;
character.update(.1);
assert(Math.abs(character.state().animationTime-.1)<1e-8,'Mixer advances by delta, not wall time');
character.update(.1,{moving:true,speed:1.55});
assert.equal(character.state().animation,'Walk');
assert(Math.abs(character.state().animationTime-.1)<1e-8);
character.update(.1,{moving:true,speed:2.35});
assert.equal(character.state().animation,'FastWalk');
for(let i=0;i<60;i++)character.update(1/60,{moving:true,speed:2.35});
assert.deepEqual(character.root.position.toArray(),[2,-.002,3],'Animation cannot move the navigation root');
assert.equal(character.root.rotation.y,1.2,'Animation cannot override heading');
character.update(.1,{moving:false,speed:0});
assert.equal(character.state().animation,'Idle');
character.update(.1,{moving:true,speed:.775});
assert(Math.abs(character.state().animationTime-.05)<1e-8,'Partial movement slows the walk cycle');
for(let i=0;i<20;i++)character.update(1/60,{moving:i%2===0,speed:2.35});
character.root.updateMatrixWorld(true);
character.root.traverse(object=>assert(object.matrixWorld.elements.every(Number.isFinite),'Rapid transitions remain finite'));
assert.throws(()=>createKanshanModel({scene:gltf.scene,animations:[]}),/缺少动画/);
assert.throws(()=>createKanshanModel({animations:[]}),/缺少三维场景/);

let requested;
const loaded=await loadKanshanModel({loader:{async loadAsync(url){requested=url;return fixture();}}});
assert.equal(requested,KANSHAN_MODEL_URL);assert.equal(loaded.state().asset,KANSHAN_MODEL_URL);
const networkError=new Error('404');
await assert.rejects(loadKanshanModel({loader:{async loadAsync(){throw networkError;}}}),error=>{
  assert.match(error.message,/刘看山模型加载失败/);assert.equal(error.cause,networkError);return true;
});
await assert.rejects(loadKanshanModel({loader:{async loadAsync(){return {scene:new T.Group(),animations:[]};}}}),/刘看山模型加载失败/);
console.log('Kanshan GLB adapter: required clips, delta animation, movement speeds, transitions, isolated navigation root and explicit loading failures passed.');
