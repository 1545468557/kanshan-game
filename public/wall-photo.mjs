import * as T from './vendor/three/three.module.min.js';

export function photoViewForViewport(width){
  return width<700
    ?{position:[.24,1.58,1.0],target:[.34,1.10,-3.73],minDistance:2.8,maxDistance:5}
    :{position:[.05,2.65,-1.68],target:[.20,2.18,-3.73],minDistance:.8,maxDistance:2.8};
}

// An ordinary movable prop. Neither the image nor the wall mark is story evidence.
export function createWallPhoto({texture=null,wallMaterial=null,frameMaterial=null}={}){
  const root=new T.Group();root.name='operable-wall-photo';
  const frame=new T.Group();frame.name='removable-photo-frame';root.add(frame);
  const timber=frameMaterial?.clone()||new T.MeshStandardMaterial({color:'#463326',roughness:.86});
  const backing=new T.MeshStandardMaterial({color:'#51483a',roughness:.96});
  function box(w,h,d,x,y,z,mat,parent=frame){
    const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);
    mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  box(.82,1.094,.025,0,0,.020,backing).name='photo-backing';
  for(const x of [-.388,.388])box(.044,1.094,.048,x,0,.038,timber);
  for(const y of [-.525,.525])box(.732,.044,.048,0,y,.038,timber);
  const geometry=new T.PlaneGeometry(.732,1.006),uv=geometry.attributes.uv;
  // Exclude the generated flat border; the surrounding wooden rim is geometry.
  for(let i=0;i<uv.count;i++)uv.setXY(i,.055+uv.getX(i)*.89,.043+uv.getY(i)*.914);
  const print=new T.Mesh(geometry,new T.MeshStandardMaterial({map:texture,color:'#dfd4bd',roughness:.92}));
  print.name='aged-corridor-print';print.position.z=.040;frame.add(print);

  const protectedPlaster=wallMaterial?.clone()||new T.MeshStandardMaterial({color:'#b4ac91',roughness:1});
  protectedPlaster.color.multiplyScalar(1.19);
  const markGeometry=new T.PlaneGeometry(.794,1.067),markUV=markGeometry.attributes.uv;
  for(let i=0;i<markUV.count;i++)markUV.setXY(i,(markUV.getX(i)*.794-.397+1.59)/4.1,(markUV.getY(i)*1.067-.5335+2.18)/4.1);
  const mark=new T.Mesh(markGeometry,protectedPlaster);mark.name='protected-wall-plaster';mark.position.z=.002;mark.receiveShadow=true;root.add(mark);
  const metal=new T.MeshStandardMaterial({color:'#665746',roughness:.7,metalness:.5});
  const nail=new T.Mesh(new T.CylinderGeometry(.011,.008,.034,12),metal);
  nail.rotation.x=Math.PI/2;nail.position.set(0,.455,.018);nail.name='wall-hanging-nail';root.add(nail);
  const wire=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(-.28,.31,0),new T.Vector3(0,.455,0),new T.Vector3(.28,.31,0)]),new T.LineBasicMaterial({color:'#62594b'}));
  wire.name='frame-hanging-wire';frame.add(wire);

  let progress=0,target=0;
  const mounted=new T.Vector3(),lifted=new T.Vector3(0,.075,.02),clear=new T.Vector3(0,.075,.20),held=new T.Vector3(1.0,-.20,.28);
  const ease=t=>t*t*(3-2*t);
  function applyPose(){
    if(progress<=.24)frame.position.lerpVectors(mounted,lifted,ease(progress/.24));
    else if(progress<=.46)frame.position.lerpVectors(lifted,clear,ease((progress-.24)/.22));
    else frame.position.lerpVectors(clear,held,ease((progress-.46)/.54));
    const turn=ease(Math.max(0,(progress-.46)/.54));frame.rotation.set(0,-.13*turn,-.05*turn);
    root.updateMatrixWorld(true);
  }
  const state=()=>({phase:progress===target?(target===1?'open':'closed'):(target===1?'opening':'closing'),busy:progress!==target,progress,framePosition:frame.position.toArray()});
  function setOpen(open,{immediate=false}={}){if(progress!==target)return false;target=open?1:0;if(immediate)progress=target;applyPose();return true;}
  function update(dt){if(!Number.isFinite(dt)||dt<=0||progress===target)return;const step=Math.min(dt,.1)/1.45;progress=target>progress?Math.min(target,progress+step):Math.max(target,progress-step);applyPose();}
  applyPose();return {root,frame,mark,nail,print,state,setOpen,update};
}
