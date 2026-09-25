import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import { GLTFLoader } from '../public/vendor/three/examples/jsm/loaders/GLTFLoader.js';
import { KANSHAN_ANIMATIONS } from '../public/kanshan-model.mjs';

const bytes=await readFile(new URL('../public/assets/characters/liukanshan/liukanshan.glb',import.meta.url));
assert.equal(bytes.readUInt32LE(0),0x46546c67,'Character asset must be a GLB');
assert.equal(bytes.readUInt32LE(4),2,'GLB version must be 2');
assert.equal(bytes.readUInt32LE(8),bytes.length,'GLB must not be truncated');
assert.equal(bytes.readUInt32LE(16),0x4e4f534a,'First GLB chunk must contain JSON');
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
assert.equal(json.asset.version,'2.0');
assert.deepEqual(json.animations.map(animation=>animation.name).sort(),[...KANSHAN_ANIMATIONS].sort());
for(const resource of [...(json.buffers||[]),...(json.images||[])]){
  assert(!resource.uri||resource.uri.startsWith('data:'),'GLB must embed its geometry and textures, without external files');
}
function finiteJSON(value,path='asset'){
  if(typeof value==='number')assert(Number.isFinite(value),`${path} must be finite`);
  else if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))finiteJSON(item,`${path}.${key}`);
}
finiteJSON(json);

// Use the game's real loader and Three.js skinning, without a WebGL renderer.
// Precise Box3 sampling calls SkinnedMesh.getVertexPosition, so these bounds
// include deformed vertices rather than the static exported accessor bounds.
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const scene=gltf.scene,meshes=[];
scene.traverse(object=>{if(object.isSkinnedMesh)meshes.push(object);});
assert(meshes.length>0,'Character must have skinned geometry');
for(const mesh of meshes){
  for(const [name,attribute] of Object.entries(mesh.geometry.attributes)){
    assert(Array.from(attribute.array).every(Number.isFinite),`${mesh.name}.${name} contains an invalid number`);
  }
  assert(mesh.skeleton.boneInverses.every(matrix=>matrix.elements.every(Number.isFinite)),'Inverse bind matrices must be finite');
  const indices=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight;
  assert(indices&&weights,'Every skinned mesh needs joint indices and weights');
  for(let vertex=0;vertex<weights.count;vertex++){
    let total=0;
    for(let channel=0;channel<4;channel++){
      const weight=weights.getComponent(vertex,channel),joint=indices.getComponent(vertex,channel);
      assert(weight>=0&&weight<=1,'Skin weights must be normalized');
      assert(Number.isInteger(joint)&&joint>=0&&joint<mesh.skeleton.bones.length,'Skin joint index must resolve');
      total+=weight;
    }
    assert(Math.abs(total-1)<.0001,`${mesh.name} vertex ${vertex} must have a full skin weight`);
  }
}
scene.updateMatrixWorld(true);
const rest=new T.Box3().setFromObject(scene,true),restSize=rest.getSize(new T.Vector3());
assert(restSize.y>=1.2&&restSize.y<=1.4,`Character must be about 1.30 m tall, got ${restSize.y}`);
assert(Math.abs(rest.min.y)<.003,`Rest pose must have its feet at y=0, got ${rest.min.y}`);
assert(restSize.x<.9&&restSize.z<1.2,'Rest pose must fit the apartment character envelope');

const root=scene.getObjectByName('Root');
assert(root?.isBone,'Character must retain its Root bone');
const fixed=[];
for(let object=root;object;object=object.parent){
  fixed.push({object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()});
}
const mixer=new T.AnimationMixer(scene),summaries=[];
for(const clip of gltf.animations){
  assert(Number.isFinite(clip.duration)&&clip.duration>0,`${clip.name} needs a positive duration`);
  for(const track of clip.tracks){
    assert(Array.from(track.times).every(Number.isFinite)&&Array.from(track.values).every(Number.isFinite),`${clip.name} ${track.name} must contain finite keyframes`);
    for(let i=1;i<track.times.length;i++)assert(track.times[i]>track.times[i-1],`${clip.name} ${track.name} key times must increase`);
  }
  mixer.stopAllAction();
  const action=mixer.clipAction(clip).reset().setLoop(T.LoopOnce,1);
  action.clampWhenFinished=true;action.play();
  const samples=new Set(Array.from({length:65},(_,i)=>clip.duration*i/64));
  for(const track of clip.tracks)for(const time of track.times)samples.add(time);
  const envelope=new T.Box3(),bones=[...new Set(meshes.flatMap(mesh=>mesh.skeleton.bones))];
  let firstPose=null,maxBoneChange=0,lowest={y:Infinity,time:0},highestFloor=-Infinity;
  for(const time of [...samples].sort((a,b)=>a-b)){
    mixer.setTime(time);scene.updateMatrixWorld(true);
    scene.traverse(object=>assert(object.matrixWorld.elements.every(Number.isFinite),`${clip.name} at ${time}s: ${object.name} transform must stay finite`));
    for(const stable of fixed){
      assert(stable.object.position.distanceTo(stable.position)<.000001,`${clip.name} must not translate ${stable.object.name}`);
      assert(stable.object.quaternion.angleTo(stable.quaternion)<.0001,`${clip.name} must not turn ${stable.object.name}`);
      assert(stable.object.scale.distanceTo(stable.scale)<.000001,`${clip.name} must not scale ${stable.object.name}`);
    }
    const pose=bones.flatMap(bone=>bone.matrixWorld.elements);
    if(!firstPose)firstPose=pose;
    else maxBoneChange=Math.max(maxBoneChange,...pose.map((value,i)=>Math.abs(value-firstPose[i])));
    const bounds=new T.Box3().setFromObject(scene,true),size=bounds.getSize(new T.Vector3());
    assert([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite),`${clip.name} skinned bounds must be finite`);
    assert(size.x<.9&&size.y>=1.1&&size.y<1.45&&size.z<1.2,`${clip.name} at ${time}s has an implausible deformed size: ${size.toArray()}`);
    envelope.union(bounds);
    if(bounds.min.y<lowest.y)lowest={y:bounds.min.y,time};
    highestFloor=Math.max(highestFloor,bounds.min.y);
  }
  assert(maxBoneChange>.001,`${clip.name} must actually animate the skeleton`);
  assert(lowest.y>=-.003,`${clip.name} penetrates the floor at ${lowest.time.toFixed(4)}s: ${(lowest.y*1000).toFixed(2)} mm (limit -3 mm)`);
  assert(highestFloor<.05,`${clip.name} unexpectedly floats more than 5 cm above the floor`);
  assert(Math.abs(envelope.getCenter(new T.Vector3()).x)<.08,'Animation must stay centered over the navigation root');
  summaries.push(`${clip.name}: ${samples.size} poses, floor ${(lowest.y*1000).toFixed(2)}…${(highestFloor*1000).toFixed(2)} mm`);
}
console.log(`Kanshan real GLB: ${(bytes.length/1024).toFixed(0)} KiB, ${restSize.y.toFixed(3)} m tall, embedded resources, valid skinning, stationary Root and animated bounds passed. ${summaries.join('; ')}.`);
