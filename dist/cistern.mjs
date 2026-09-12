import * as T from './vendor/three/three.module.min.js';

// A removable ceramic lid, not a hinged door. No story evidence is generated.
export function createCistern(){
  const root=new T.Group();root.name='operable-cistern';
  const ceramic=new T.MeshPhysicalMaterial({color:'#d9d6c9',roughness:.33,clearcoat:.22,clearcoatRoughness:.4});
  const metal=new T.MeshStandardMaterial({color:'#8b8b7b',metalness:.7,roughness:.42});
  const rubber=new T.MeshStandardMaterial({color:'#343d37',roughness:.86});
  const pipe=new T.MeshStandardMaterial({color:'#c6bca3',roughness:.65});
  const ringPath=(path,w,d,r)=>{
    path.moveTo(-w/2+r,-d/2);path.lineTo(w/2-r,-d/2);path.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);
    path.lineTo(w/2,d/2-r);path.quadraticCurveTo(w/2,d/2,w/2-r,d/2);
    path.lineTo(-w/2+r,d/2);path.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);
    path.lineTo(-w/2,-d/2+r);path.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);return path;
  };
  function slab(w,d,h,r,material,parent=root,hole=false){
    const shape=ringPath(new T.Shape(),w,d,r);
    if(hole)shape.holes.push(ringPath(new T.Path(),w-.055,d-.055,.016));
    const geometry=new T.ExtrudeGeometry(shape,{depth:h,steps:1,bevelEnabled:true,bevelSegments:3,bevelSize:.003,bevelThickness:.003,curveSegments:10});
    geometry.rotateX(-Math.PI/2);
    const mesh=new T.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  const shell=slab(.44,.29,.475,.034,ceramic,root,true);shell.name='hollow-cistern-shell';shell.position.y=.025;
  slab(.44,.29,.025,.034,ceramic);
  const water=slab(.377,.225,.002,.014,new T.MeshPhysicalMaterial({color:'#6c8980',transparent:true,opacity:.52,roughness:.16,metalness:.08,depthWrite:false}));water.name='cistern-water';water.position.y=.28;water.castShadow=false;
  function cylinder(r,h,x,y,z,mat){const m=new T.Mesh(new T.CylinderGeometry(r,r,h,24),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;root.add(m);return m;}
  cylinder(.014,.39,-.135,.21,-.045,pipe).name='fill-valve';
  cylinder(.042,.045,-.135,.35,-.045,rubber);
  cylinder(.023,.33,.06,.19,.025,pipe).name='overflow-pipe';
  cylinder(.048,.035,.06,.07,.025,rubber).name='flush-valve';
  const rod=new T.Mesh(new T.CylinderGeometry(.004,.004,.16,10),metal);rod.position.set(-.03,.37,-.025);rod.rotation.z=Math.PI/2;root.add(rod);
  const float=new T.Mesh(new T.SphereGeometry(.038,24,16),rubber);float.position.set(.045,.36,-.025);root.add(float);
  const button=cylinder(.02,.03,.135,.425,.159,metal);button.rotation.x=Math.PI/2;
  const lever=new T.Mesh(new T.BoxGeometry(.071,.013,.018),metal);lever.position.set(.11,.425,.18);root.add(lever);
  // Mineral waterline on the inner wall; ordinary aging, not a plot clue.
  const waterline=ringPath(new T.Path(),.384,.234,.017).getPoints(48).map(p=>new T.Vector3(p.x,.30,-p.y));
  root.add(new T.LineLoop(new T.BufferGeometry().setFromPoints(waterline),new T.LineBasicMaterial({color:'#998b64',transparent:true,opacity:.6})));
  const lid=new T.Group();lid.name='removable-cistern-lid';root.add(lid);
  slab(.466,.318,.03,.039,ceramic,lid);
  slab(.374,.22,.009,.018,ceramic,lid).position.y=-.009;
  let progress=0,target=0;
  const closed=new T.Vector3(0,.509,0),lifted=new T.Vector3(0,.765,0),forward=new T.Vector3(0,.765,.35),resting=new T.Vector3(0,.09,.35);
  const ease=t=>t*t*(3-2*t);
  function applyPose(){
    if(progress<=.28)lid.position.lerpVectors(closed,lifted,ease(progress/.28));
    else if(progress<=.65)lid.position.lerpVectors(lifted,forward,ease((progress-.28)/.37));
    else lid.position.lerpVectors(forward,resting,ease((progress-.65)/.35));
    root.updateMatrixWorld(true);
  }
  const state=()=>({phase:progress===target?(target===1?'open':'closed'):(target===1?'opening':'closing'),progress,busy:progress!==target,lidPosition:lid.position.toArray()});
  function setOpen(open,{immediate=false}={}){if(progress!==target)return false;target=open?1:0;if(immediate)progress=target;applyPose();return true;}
  function update(dt){if(!Number.isFinite(dt)||dt<=0||progress===target)return;const step=Math.min(dt,.1)/1.65;progress=target>progress?Math.min(target,progress+step):Math.max(target,progress-step);applyPose();}
  applyPose();
  return {root,lid,shell,state,setOpen,update};
}
