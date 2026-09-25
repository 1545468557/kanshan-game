import * as T from './vendor/three/three.module.min.js';

// An inset drawer fitted to bookcaseClosed at 1.70 m high: the middle opening
// is 0.64 m wide, y=.74..1.16, with the front shelf edge at cabinet-local z=.21.
// The cavity is intentionally empty; its bottom, sides and back move together.
export function createDrawer({material=null,handleMaterial=null,color=null}={}){
  const root=new T.Group();root.name='operable-cabinet-drawer';
  const wood=material?.clone()||new T.MeshStandardMaterial({color:'#b49a7e',roughness:.9});
  if(color)wood.color.set(color);
  const inner=wood.clone();inner.color.lerp(new T.Color('#eadac2'),.16);inner.roughness=.94;
  const brass=handleMaterial?.clone()||new T.MeshStandardMaterial({color:'#816d4f',metalness:.72,roughness:.42});
  function part(parent,name,size,position,mat=wood){
    const mesh=new T.Mesh(new T.BoxGeometry(...size),mat);mesh.name=name;mesh.position.set(...position);
    mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  const cavity=new T.Group();cavity.name='drawer-cavity';root.add(cavity);
  for(const x of [-.309,.309])part(cavity,'drawer-frame-side',[.020,.418,.030],[x,0,.002]);
  for(const y of [-.201,.201])part(cavity,'drawer-frame-crossbar',[.598,.016,.030],[0,y,.002]);
  for(const x of [-.283,.283])part(cavity,'drawer-wood-runner',[.024,.013,.370],[x,-.1875,-.190],inner);
  const drawer=new T.Group();drawer.name='sliding-drawer';root.add(drawer);
  const front=part(drawer,'drawer-front',[.589,.378,.028],[0,0,0]);
  part(drawer,'drawer-bottom',[.574,.014,.364],[0,-.173,-.196],inner);
  for(const x of [-.280,.280])part(drawer,'drawer-box-side',[.014,.294,.364],[x,-.019,-.196],inner);
  part(drawer,'drawer-box-back',[.546,.294,.014],[0,-.019,-.371],inner);
  // The shallow handle projects from the fitted front; no dark filler panel
  // sits behind it, so opening reveals the real, empty wooden box.
  for(const x of [-.055,.055])part(drawer,'drawer-handle-mount',[.014,.016,.026],[x,.035,.025],brass);
  const handle=new T.Mesh(new T.CapsuleGeometry(.011,.110,4,10),brass);handle.rotation.z=Math.PI/2;handle.position.set(0,.035,.047);handle.name='drawer-handle';handle.castShadow=handle.receiveShadow=true;drawer.add(handle);
  let progress=0,target=0;
  const closed=new T.Vector3(0,0,0),open=new T.Vector3(0,0,.285),ease=t=>t*t*(3-2*t);
  function applyPose(){drawer.position.lerpVectors(closed,open,ease(progress));root.updateMatrixWorld(true);}
  const state=()=>({phase:progress===target?(target?'open':'closed'):(target?'opening':'closing'),busy:progress!==target,progress,drawerPosition:drawer.position.toArray()});
  function setOpen(value,{immediate=false}={}){if(progress!==target)return false;target=value?1:0;if(immediate)progress=target;applyPose();return true;}
  function update(dt){if(!Number.isFinite(dt)||dt<=0||progress===target)return;progress=target>progress?Math.min(target,progress+Math.min(dt,.1)/.8):Math.max(target,progress-Math.min(dt,.1)/.8);applyPose();}
  applyPose();return {root,drawer,front,cavity,state,setOpen,update};
}
