import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../public/vendor/three/three.module.min.js';
import {GLTFLoader} from '../public/vendor/three/examples/jsm/loaders/GLTFLoader.js';
import {createDrawer} from '../public/drawer.mjs';
import {MINIATURE_MODELS,MINIATURE_DRAWER} from '../public/miniature-layout.mjs';
const drawer=createDrawer();
const finish=()=>{for(let i=0;i<80;i++)drawer.update(1/60);};
assert.equal(drawer.state().phase,'closed');
assert.equal(drawer.setOpen(true),true);
assert.equal(drawer.setOpen(false),false,'cannot reverse while drawer is moving');
drawer.update(.1);assert.equal(drawer.state().phase,'opening');assert.ok(drawer.drawer.position.z>0);
finish();assert.equal(drawer.state().phase,'open');assert.ok(drawer.drawer.position.z>.25);
drawer.setOpen(false);finish();assert.equal(drawer.state().phase,'closed');
assert.deepEqual(drawer.drawer.position.toArray(),[0,0,0]);
drawer.setOpen(true,{immediate:true});assert.equal(drawer.state().phase,'open');
drawer.setOpen(false,{immediate:true});assert.equal(drawer.state().phase,'closed');
for(const dt of [NaN,Infinity,-1,0])drawer.update(dt);
drawer.root.traverse(object=>{if(object.geometry)for(const value of object.geometry.attributes.position.array)assert.ok(Number.isFinite(value));});

// Measure the real Kenney cabinet, rather than repeating the drawer dimensions.
// The fitted front must fill its middle shelf opening and sit near its front.
const cabinetSpec=MINIATURE_MODELS.find(spec=>spec.id==='cabinet');
const bytes=await readFile(new URL('../'+cabinetSpec.path,import.meta.url));
const cabinet=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
const original=new T.Box3().setFromObject(cabinet),size=original.getSize(new T.Vector3()),center=original.getCenter(new T.Vector3());
cabinet.position.set(-center.x,-original.min.y,-center.z);
const scaled=new T.Group();scaled.add(cabinet);scaled.scale.setScalar(cabinetSpec.height/size.y);scaled.updateMatrixWorld(true);
const levels=new Set();
scaled.traverse(object=>{
  if(!object.isMesh)return;
  for(const material of [object.material].flat())material.side=T.DoubleSide;
  const position=object.geometry.attributes.position;
  for(let i=0;i<position.count;i++)levels.add(+new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld).y.toFixed(5));
});
const drawerOrigin=new T.Vector3(...MINIATURE_DRAWER.position)
  .sub(new T.Vector3(cabinetSpec.x,cabinetSpec.y||0,cabinetSpec.z))
  .applyAxisAngle(new T.Vector3(0,1,0),-cabinetSpec.rot);
const lower=Math.max(...[...levels].filter(y=>y<drawerOrigin.y));
const upper=Math.min(...[...levels].filter(y=>y>drawerOrigin.y));
const cast=(origin,direction)=>new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction)).intersectObject(scaled,true)[0];
const left=cast([0,drawerOrigin.y,.2],[-1,0,0]).point.x;
const right=cast([0,drawerOrigin.y,.2],[1,0,0]).point.x;
const back=cast([0,drawerOrigin.y,0],[0,0,-1]).point.z;
const shelfFront=cast([0,lower-.005,.6],[0,0,-1]).point.z;
drawer.root.position.copy(drawerOrigin);
drawer.root.rotation.y=MINIATURE_DRAWER.rotation-cabinetSpec.rot;
drawer.root.updateMatrixWorld(true);
const frontBounds=new T.Box3().setFromObject(drawer.front);
const frameBounds=new T.Box3().setFromObject(drawer.cavity);
assert.ok(frontBounds.max.x-frontBounds.min.x>(right-left)*.90,'front fills the shelf width');
assert.ok(frontBounds.max.y-frontBounds.min.y>(upper-lower)*.88,'front fills the shelf height');
assert.ok(frameBounds.min.x>=left-.001&&frameBounds.max.x<=right+.001,'frame fits between cabinet posts');
assert.ok(frameBounds.min.y>=lower-.001&&frameBounds.max.y<=upper+.001,'frame fits between existing shelves');
assert.ok(Math.abs(frontBounds.max.z-shelfFront)<.012,'closed front is inset near the shelf edge');
assert.ok(new T.Box3().setFromObject(drawer.drawer).min.z>back+.01,'drawer clears the existing back board');
drawer.setOpen(true,{immediate:true});
assert.equal(drawer.drawer.position.y,0,'drawer runs horizontally without dropping');
const bottom=drawer.root.getObjectByName('drawer-bottom');
const bottomCenter=bottom.getWorldPosition(new T.Vector3());
const openingRay=new T.Raycaster(new T.Vector3(bottomCenter.x,upper+.3,bottomCenter.z),new T.Vector3(0,-1,0));
assert.equal(openingRay.intersectObject(drawer.drawer,true)[0].object,bottom,'open drawer is a real empty box with a visible bottom');

// The static cabinet collider and reserved pull-out area cover the full motion.
const placed=new T.Group();placed.add(scaled);placed.position.set(cabinetSpec.x,cabinetSpec.y||0,cabinetSpec.z);placed.rotation.y=cabinetSpec.rot;placed.updateMatrixWorld(true);
const cabinetBounds=new T.Box3().setFromObject(placed),clearance=MINIATURE_DRAWER.obstacle;
drawer.root.position.set(...MINIATURE_DRAWER.position);drawer.root.rotation.y=MINIATURE_DRAWER.rotation;
drawer.setOpen(false,{immediate:true});drawer.setOpen(true);
for(let i=0;i<=10;i++){
  drawer.update(.1);drawer.root.updateMatrixWorld(true);
  const b=new T.Box3().setFromObject(drawer.drawer);
  for(const x of [b.min.x,b.max.x])for(const z of [b.min.z,b.max.z]){
    const inCabinet=x>=cabinetBounds.min.x&&x<=cabinetBounds.max.x&&z>=cabinetBounds.min.z&&z<=cabinetBounds.max.z;
    const inClearance=x>=clearance.minX&&x<=clearance.maxX&&z>=clearance.minZ&&z<=clearance.maxZ;
    assert.ok(inCabinet||inClearance,'moving drawer stays inside collision coverage');
  }
}
console.log('Drawer: animation, empty box, real cabinet fit, flush front and collision coverage passed.');
