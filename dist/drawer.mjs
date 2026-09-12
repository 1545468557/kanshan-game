import * as T from './vendor/three/three.module.min.js';

// A small, ordinary drawer action. The cavity is intentionally empty: this
// module provides the physical interaction without inventing story evidence.
export function createDrawer({material=null,handleMaterial=null}={}){
  const root=new T.Group();root.name='operable-cabinet-drawer';
  const wood=material?.clone()||new T.MeshStandardMaterial({color:'#684b34',roughness:.9});
  const dark=new T.MeshStandardMaterial({color:'#17130f',roughness:1});
  const brass=handleMaterial?.clone()||new T.MeshStandardMaterial({color:'#816d4f',metalness:.72,roughness:.42});
  const cavity=new T.Mesh(new T.BoxGeometry(.43,.33,.12),dark);cavity.name='drawer-cavity';cavity.position.z=-.055;cavity.castShadow=cavity.receiveShadow=true;root.add(cavity);
  const drawer=new T.Group();drawer.name='sliding-drawer';root.add(drawer);
  const front=new T.Mesh(new T.BoxGeometry(.47,.37,.08),wood);front.name='drawer-front';front.castShadow=front.receiveShadow=true;drawer.add(front);
  const lip=new T.Mesh(new T.BoxGeometry(.40,.025,.095),wood);lip.position.y=-.155;lip.castShadow=lip.receiveShadow=true;drawer.add(lip);
  const handle=new T.Mesh(new T.CapsuleGeometry(.014,.105,5,12),brass);handle.rotation.z=Math.PI/2;handle.position.set(0,.015,.052);handle.name='drawer-handle';handle.castShadow=handle.receiveShadow=true;drawer.add(handle);
  let progress=0,target=0;
  const closed=new T.Vector3(0,0,.02),open=new T.Vector3(0,-.018,.27),ease=t=>t*t*(3-2*t);
  function applyPose(){drawer.position.lerpVectors(closed,open,ease(progress));root.updateMatrixWorld(true);}
  const state=()=>({phase:progress===target?(target?'open':'closed'):(target?'opening':'closing'),busy:progress!==target,progress,drawerPosition:drawer.position.toArray()});
  function setOpen(value,{immediate=false}={}){if(progress!==target)return false;target=value?1:0;if(immediate)progress=target;applyPose();return true;}
  function update(dt){if(!Number.isFinite(dt)||dt<=0||progress===target)return;progress=target>progress?Math.min(target,progress+Math.min(dt,.1)/.8):Math.max(target,progress-Math.min(dt,.1)/.8);applyPose();}
  applyPose();return {root,drawer,front,cavity,state,setOpen,update};
}
